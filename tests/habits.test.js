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

  return r.finish();
};
