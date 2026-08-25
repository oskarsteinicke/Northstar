// Habit streaks, completion history, and local date keys.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js'];
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

function sb(store) {
  const s = createSandbox({ files: FILES, store });
  run(s, `
    settings={}; curView='habits';
    track=function(){}; go=function(v){ _nav.push(v); };
    playSound=function(){}; awardXP=function(){}; launchConfetti=function(){};
    haptic=function(){}; checkDailyQuests=function(){}; maybeAwardStreakShield=function(){};
    renderHabits=function(){}; updateHabitUI=function(){}; checkAchievements=function(){};
    habits=JSON.parse(localStorage.getItem('hvi_habits')||'[]');
    log=JSON.parse(localStorage.getItem('hvi_log')||'{}');
    meta=JSON.parse(localStorage.getItem('hvi_meta')||'{}');
    workoutMeta={}; gamification={xp:0};
  `);
  return s;
}
const H = [{ id: 'h1', name: 'Read', schedule: 'daily' }];

module.exports = function () {
  const r = createReporter('habits');

  // The only writer of habit history sat below a sanitise pass that cleared
  // completedToday first, so it could never fire and the history stayed empty.
  r.section('completing a habit records it in history');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_meta: JSON.stringify({ lastOpenedDate: dk(0) }),
    });
    run(s, "tapHabit('h1','')");
    const hist = JSON.parse(s.localStorage._d['hvi_habit_history'] || '{}');
    r.check('today is recorded', (hist.h1 || []).includes(dk(0)), `(${JSON.stringify(hist)})`);
    r.check('streak started', JSON.parse(s.localStorage._d['hvi_log']).h1.streak === 1);

    run(s, "tapHabit('h1','')");   // un-tick
    const hist2 = JSON.parse(s.localStorage._d['hvi_habit_history'] || '{}');
    r.check('un-ticking removes it again', !(hist2.h1 || []).includes(dk(0)), `(${JSON.stringify(hist2)})`);
  }

  r.section('history survives the daily rollover');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 5, lastCompletedDate: dk(1), completedToday: true } }),
      hvi_meta: JSON.stringify({ lastOpenedDate: dk(1) }),
    });
    run(s, 'checkReset()');
    const hist = JSON.parse(s.localStorage._d['hvi_habit_history'] || '{}');
    r.check('yesterday backfilled', (hist.h1 || []).includes(dk(1)), `(${JSON.stringify(hist)})`);
    r.check('streak kept (completed yesterday)', JSON.parse(s.localStorage._d['hvi_log']).h1.streak === 5);
    r.check('completedToday cleared', JSON.parse(s.localStorage._d['hvi_log']).h1.completedToday === false);

    run(s, 'checkReset()');   // idempotent
    const again = JSON.parse(s.localStorage._d['hvi_habit_history']).h1;
    r.check('no duplicate entries', again.filter(x => x === dk(1)).length === 1, `(${again})`);
  }

  r.section('a missed day breaks the streak');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 9, lastCompletedDate: dk(3), completedToday: false } }),
      hvi_meta: JSON.stringify({ lastOpenedDate: dk(1) }),
    });
    run(s, 'checkReset()');
    r.check('streak reset', JSON.parse(s.localStorage._d['hvi_log']).h1.streak === 0);
  }

  // toISOString() is UTC. West of Greenwich it rolls to tomorrow in the
  // evening, so keys stopped matching the locally-written data.
  r.section('date keys are local, not UTC');
  {
    const s = sb({ hvi_habits: JSON.stringify(H), hvi_log: '{}', hvi_meta: '{}' });
    r.check('dateKey matches today()', run(s, 'dateKey(new Date()) === today()') === true,
      `(${run(s, 'dateKey(new Date())')} vs ${run(s, 'today()')})`);
    r.check('handles a Date for a past day',
      run(s, `dateKey(new Date(Date.now() - 86400000)) === yesterday()`) === true);
    // 23:00 local must stay on today's date whatever the offset
    r.check('late evening stays on the same local day', run(s, `(function(){
      var d=new Date(); d.setHours(23,0,0,0);
      return dateKey(d) === d.toLocaleDateString('en-CA');
    })()`) === true);
  }

  r.section('weekly schedules count completions');
  {
    const weekly = [{ id: 'h2', name: 'Gym', schedule: 'weekly', perWeek: 3 }];
    const now = new Date();
    // Completions earlier this week, written with local keys
    const start = new Date(now); start.setDate(now.getDate() - now.getDay());
    const done = [];
    for (let i = 0; i < 2 && (() => { const d = new Date(start); d.setDate(start.getDate() + i); return d < now; })(); i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      if (d.toLocaleDateString('en-CA') !== now.toLocaleDateString('en-CA')) done.push(d.toLocaleDateString('en-CA'));
    }
    const s = sb({
      hvi_habits: JSON.stringify(weekly),
      hvi_log: JSON.stringify({ h2: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_meta: '{}',
      hvi_habit_history: JSON.stringify({ h2: done }),
    });
    const due = run(s, `isHabitDueToday(habits[0])`);
    r.check('still due below the weekly target', due === true, `(done ${done.length}/3, due=${due})`);

    // At the target it should stop being due
    const s2 = sb({
      hvi_habits: JSON.stringify([{ id: 'h2', name: 'Gym', schedule: 'weekly', perWeek: 1 }]),
      hvi_log: JSON.stringify({ h2: { streak: 0, lastCompletedDate: dk(0), completedToday: true } }),
      hvi_meta: '{}', hvi_habit_history: '{}',
    });
    r.check("today's completion counts toward the target",
      run(s2, 'isHabitDueToday(habits[0])') === false, '(today ignored — the UTC key never matched)');
  }


  // Reported: a streak survived a week of not logging. checkReset() zeroed it
  // correctly, then cloudPull()'s "keep higher streak" merge restored the stale
  // number from the cloud, so the streak was effectively immortal.
  r.section('a cloud pull cannot revive a broken streak');
  {
    const stale = { h1: { streak: 9, lastCompletedDate: dk(5), completedToday: false } };
    const s = createSandbox({
      files: FILES,
      store: {
        hvi_habits: JSON.stringify(H),
        hvi_log: JSON.stringify(stale),
        hvi_meta: JSON.stringify({ lastOpenedDate: dk(5) }),
        hvi_session: JSON.stringify({ access_token: 't', refresh_token: 'r', user: { id: 'U1' } }),
      },
      fetch: url => url.includes('/rest/v1/hvi_data')
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ data: { hvi_log: stale } }]) })
        : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
    });
    run(s, `settings={}; curView='home'; track=function(){}; go=function(){};
      playSound=function(){}; awardXP=function(){}; haptic=function(){};
      maybeAwardStreakShield=function(){}; renderHabits=function(){};
      setSyncStatus=function(){}; _syncToast=function(){};
      habits=JSON.parse(localStorage.getItem('hvi_habits'));
      log=JSON.parse(localStorage.getItem('hvi_log'));
      meta=JSON.parse(localStorage.getItem('hvi_meta')); workoutMeta={};`);
    run(s, 'checkReset()');
    const afterReset = JSON.parse(s.localStorage._d['hvi_log']).h1.streak;
    r.check('the rollover breaks it', afterReset === 0, `(${afterReset})`);
    return run(s, 'cloudPull()').then(() => {
      const after = JSON.parse(s.localStorage._d['hvi_log']).h1.streak;
      r.check('the pull does not bring it back', after === 0, `(${after} — stale streak restored)`);
      return rest(r);
    });
  }
}

function rest(r) {
  // Only "was it due yesterday" was checked before, so a multi-day gap left the
  // streak intact whenever the final day happened not to be a due day.
  r.section('a gap of several days breaks the streak');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 12, lastCompletedDate: dk(7), completedToday: false } }),
      hvi_meta: JSON.stringify({ lastOpenedDate: dk(7) }),
    });
    run(s, 'validateStreaks()');
    r.check('a week away ends it', JSON.parse(s.localStorage._d['hvi_log']).h1.streak === 0,
      `(${JSON.parse(s.localStorage._d['hvi_log']).h1.streak})`);
  }

  r.section('an unbroken streak is left alone');
  {
    const today = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 4, lastCompletedDate: dk(0), completedToday: true } }),
      hvi_meta: '{}' });
    run(today, 'validateStreaks()');
    r.check('completed today survives', JSON.parse(today.localStorage._d['hvi_log'] || '{}').h1?.streak === 4
      || run(today, 'log.h1.streak') === 4);

    const yest = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 4, lastCompletedDate: dk(1), completedToday: false } }),
      hvi_meta: '{}' });
    run(yest, 'validateStreaks()');
    r.check('completed yesterday survives', run(yest, 'log.h1.streak') === 4, `(${run(yest,'log.h1.streak')})`);
  }

  r.section('scheduled habits only break on days they were due');
  {
    // Due Mondays only. Missing a Tuesday must not end the streak.
    const monOnly = [{ id: 'h1', name: 'Long run', schedule: 'specific', days: [1] }];
    const lastMon = (() => { const d = new Date();
      while (d.getDay() !== 1) d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA'); })();
    const s = sb({
      hvi_habits: JSON.stringify(monOnly),
      hvi_log: JSON.stringify({ h1: { streak: 3, lastCompletedDate: lastMon, completedToday: false } }),
      hvi_meta: '{}' });
    run(s, 'validateStreaks()');
    const kept = run(s, 'log.h1.streak');
    const daysSince = Math.round((new Date(new Date().toDateString()) - new Date(lastMon + 'T12:00')) / 86400000);
    r.check('non-due days do not break it', daysSince < 7 ? kept === 3 : kept === 0,
      `(streak ${kept}, ${daysSince}d since the last Monday)`);
  }

  r.section('validation is idempotent');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 6, lastCompletedDate: dk(4), completedToday: false } }),
      hvi_meta: '{}' });
    run(s, 'validateStreaks(); validateStreaks(); validateStreaks();');
    r.check('still zero, no side effects', run(s, 'log.h1.streak') === 0);
  }


  // Weekly habits count weeks, not days: a missed Tuesday is fine, a week that
  // never hit the target is not.
  r.section('weekly habits break after a missed week');
  {
    const weekly = [{ id: 'h2', name: 'Gym', schedule: 'weekly', perWeek: 3 }];
    // Week boundaries match the rest of the app: Sunday start
    const curStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d; })();
    const dayIn = (weeksBack, offset) => {
      const d = new Date(curStart);
      d.setDate(d.getDate() - weeksBack * 7 + offset);
      return d.toLocaleDateString('en-CA');
    };
    const lastCompleted = dayIn(1, 1);

    // Hit the target last week -> the streak stands
    const hit = sb({
      hvi_habits: JSON.stringify(weekly),
      hvi_log: JSON.stringify({ h2: { streak: 5, lastCompletedDate: lastCompleted, completedToday: false } }),
      hvi_meta: '{}',
      hvi_habit_history: JSON.stringify({ h2: [dayIn(2, 1), dayIn(1, 1), dayIn(1, 3), dayIn(1, 5)] }),
    });
    run(hit, 'validateStreaks()');
    r.check('target met last week keeps the streak', run(hit, 'log.h2.streak') === 5,
      `(${run(hit, 'log.h2.streak')})`);

    // Only one session last week against a target of three -> broken
    const missed = sb({
      hvi_habits: JSON.stringify(weekly),
      hvi_log: JSON.stringify({ h2: { streak: 5, lastCompletedDate: lastCompleted, completedToday: false } }),
      hvi_meta: '{}',
      hvi_habit_history: JSON.stringify({ h2: [dayIn(2, 1), dayIn(1, 1)] }),
    });
    run(missed, 'validateStreaks()');
    r.check('falling short of the target breaks it', run(missed, 'log.h2.streak') === 0,
      `(${run(missed, 'log.h2.streak')})`);

    // Nothing at all last week -> broken
    const none = sb({
      hvi_habits: JSON.stringify(weekly),
      hvi_log: JSON.stringify({ h2: { streak: 5, lastCompletedDate: dayIn(3, 1), completedToday: false } }),
      hvi_meta: '{}',
      hvi_habit_history: JSON.stringify({ h2: [dayIn(3, 1), dayIn(3, 2), dayIn(3, 4)] }),
    });
    run(none, 'validateStreaks()');
    r.check('a blank week breaks it', run(none, 'log.h2.streak') === 0, `(${run(none, 'log.h2.streak')})`);
  }

  r.section('a brand new weekly habit is not punished');
  {
    const weekly = [{ id: 'h2', name: 'Gym', schedule: 'weekly', perWeek: 3 }];
    const curStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d; })();
    const thisWeek = (() => { const d = new Date(curStart); return d.toLocaleDateString('en-CA'); })();
    const s = sb({
      hvi_habits: JSON.stringify(weekly),
      // Created and completed this week only: there is no elapsed week to judge
      hvi_log: JSON.stringify({ h2: { streak: 1, lastCompletedDate: thisWeek, completedToday: false } }),
      hvi_meta: '{}',
      hvi_habit_history: JSON.stringify({ h2: [thisWeek] }),
    });
    run(s, 'validateStreaks()');
    r.check('no prior week means no break', run(s, 'log.h2.streak') === 1, `(${run(s, 'log.h2.streak')})`);
  }

  r.section('daily habits are unaffected by the weekly rule');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 4, lastCompletedDate: dk(1), completedToday: false } }),
      hvi_meta: '{}', hvi_habit_history: '{}' });
    run(s, 'validateStreaks()');
    r.check('completed yesterday still survives', run(s, 'log.h1.streak') === 4, `(${run(s, 'log.h1.streak')})`);
  }

  return r.finish();
};
