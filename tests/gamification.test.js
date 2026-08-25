// XP, levels, achievements, quests and the daily score.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','workout.js','diet.js','connect.js','profile.js'];
const T = new Date().toLocaleDateString('en-CA');
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

function sb(store) {
  const s = createSandbox({ files: FILES, store });
  run(s, `
    settings={units:'metric'}; curView='home';
    track=function(n,p){ _tracked.push([n,p||{}]); };
    go=function(v){ _nav.push(v); };
    playSound=function(){}; haptic=function(){}; showXPToast=function(){};
    showAchievementToast=function(a){ _tracked.push(['toast',a]); };
    launchConfetti=function(){}; renderHome=function(){};
    habits=JSON.parse(localStorage.getItem('hvi_habits')||'[]');
    log=JSON.parse(localStorage.getItem('hvi_log')||'{}');
    meta=JSON.parse(localStorage.getItem('hvi_meta')||'{}');
    journal=JSON.parse(localStorage.getItem('hvi_journal3')||'{}');
    workoutLog=JSON.parse(localStorage.getItem('hvi_workout_log')||'{}');
    mealLog=JSON.parse(localStorage.getItem('hvi_meal_log')||'{}');
    sleepLog=JSON.parse(localStorage.getItem('hvi_sleep_log')||'{}');
    weightLog={}; prs=JSON.parse(localStorage.getItem('hvi_prs')||'{}');
    achievements=JSON.parse(localStorage.getItem('hvi_achievements')||'[]');
    gamification=JSON.parse(localStorage.getItem('hvi_gamification')||'{"xp":0}');
    dietMeta={dailyGoals:{calories:2500,protein:180,carbs:280,fat:80}};
    workoutMeta={activeProgram:'ppl',currentDayIndex:0};
  `);
  return s;
}

module.exports = function () {
  const r = createReporter('gamification');

  r.section('levels follow the XP curve');
  {
    const s = sb({});
    r.check('0 XP is level 1', run(s, 'getLevel(0)') === 1);
    r.check('99 XP still level 1', run(s, 'getLevel(99)') === 1);
    r.check('100 XP is level 2', run(s, 'getLevel(100)') === 2);
    r.check('400 XP is level 3', run(s, 'getLevel(400)') === 3);
    r.check('negative XP cannot produce NaN', run(s, 'getLevel(-50)') === 1,
      `(${run(s, 'getLevel(-50)')})`);
    r.check('rubbish XP is safe', run(s, 'getLevel("abc")') === 1 && run(s, 'getLevel(undefined)') === 1);
    const p = JSON.parse(run(s, 'JSON.stringify(xpToNextLevel(150))'));
    r.check('progress is within the band', p.progress === 50 && p.needed === 300, `(${p.progress}/${p.needed})`);
    r.check('progress fraction sane', p.pct > 0 && p.pct < 1);
  }

  r.section('XP accumulates and splits by pillar');
  {
    const s = sb({});
    run(s, "awardXP(60,'body'); awardXP(40,'mind');");
    const g = JSON.parse(s.localStorage._d['hvi_gamification']);
    r.check('total XP', g.xp === 100, `(${g.xp})`);
    r.check('pillar XP tracked', g.pillarXP.body === 60 && g.pillarXP.mind === 40);
    r.check('level rose to 2', run(s, 'getLevel(gamification.xp)') === 2);
  }

  r.section('achievements unlock once');
  {
    const s = sb({
      hvi_habits: JSON.stringify([{ id: 'h1', name: 'Read' }]),
      hvi_log: JSON.stringify({ h1: { streak: 7, lastCompletedDate: T, completedToday: true } }),
    });
    run(s, 'checkAchievements()');
    const first = JSON.parse(s.localStorage._d['hvi_achievements'] || '[]');
    r.check('streak achievements unlocked', first.includes('streak_3') && first.includes('streak_7'), `(${first})`);
    run(s, 'checkAchievements(); checkAchievements();');
    const again = JSON.parse(s.localStorage._d['hvi_achievements']);
    r.check('no duplicates on repeat checks', again.length === first.length, `(${first.length} -> ${again.length})`);
    r.check('an unearned one stays locked', !again.includes('streak_30'));
  }

  // Which three quests appear is seeded by the date, so pin the pool rather
  // than depending on today's rotation.
  r.section('daily quests pay out once per day');
  {
    const s = sb({
      hvi_habits: JSON.stringify([{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }]),
      hvi_log: JSON.stringify({
        h1: { completedToday: true, streak: 1 },
        h2: { completedToday: true, streak: 1 },
        h3: { completedToday: true, streak: 1 } }),
    });
    run(s, `getDailyQuests = function(){ return [
      { id:'q_test', icon:'x', label:'Test quest', xp: 25, check: function(){ return true; } } ]; };`);
    run(s, 'checkDailyQuests()');
    const xp1 = run(s, 'gamification.xp');
    r.check('a quest paid out', xp1 === 25, `(${xp1} XP)`);
    run(s, 'checkDailyQuests(); checkDailyQuests();');
    r.check('re-running pays nothing more', run(s, 'gamification.xp') === xp1, `(${run(s,'gamification.xp')})`);
    const doneToday = JSON.parse(run(s, `JSON.stringify(gamification.questsCompleted['${T}']||[])`));
    r.check('recorded against today', doneToday.length > 0);
  }

  // Opening the workout tab auto-creates an empty entry for the day. Treating
  // that as a workout handed out score, told the coach a session happened, and
  // marked the share card complete.
  r.section('an opened-but-empty workout is not a workout');
  {
    const empty = sb({ hvi_workout_log: JSON.stringify({ [T]: {
      programId: 'ppl', dayIndex: 0,
      exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 60, reps: 5, completed: false }] }],
    }})});
    r.check('trainedOnDay says no', run(empty, `trainedOnDay('${T}')`) === false);
    r.check('daily score gives no workout points', run(empty, 'computeDailyScore()') === 0,
      `(${run(empty, 'computeDailyScore()')} — points for opening the tab)`);

    const real = sb({ hvi_workout_log: JSON.stringify({ [T]: {
      programId: 'ppl', dayIndex: 0,
      exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 60, reps: 5, completed: true }] }],
    }})});
    r.check('a logged workout scores', run(real, 'computeDailyScore()') === 30,
      `(${run(real, 'computeDailyScore()')})`);

    const imported = sb({ hvi_workout_log: JSON.stringify({ [T]: {
      dayName: 'Morning Run', exercises: [], source: 'strava' } }) });
    r.check('an imported activity counts too', run(imported, 'computeDailyScore()') === 30,
      `(${run(imported, 'computeDailyScore()')})`);
  }

  r.section('the daily score adds up');
  {
    const s = sb({
      hvi_habits: JSON.stringify([{ id: 'h1' }, { id: 'h2' }]),
      hvi_log: JSON.stringify({ h1: { completedToday: true }, h2: { completedToday: true } }),
      hvi_journal3: JSON.stringify({ [T]: { win: 'shipped it' } }),
      hvi_workout_log: JSON.stringify({ [T]: { programId:'ppl', dayIndex:0,
        exercises:[{ exerciseId:'bench_press', sets:[{ weight:60, reps:5, completed:true }] }] } }),
      hvi_meal_log: JSON.stringify({ [T]: { meals: [{ id:'m1', name:'Lunch',
        items:[{ name:'Food', calories:2500, protein:180, carbs:280, fat:80 }] }] } }),
    });
    const score = run(s, 'computeDailyScore()');
    r.check('habits 40 + workout 30 + journal 15 + nutrition 15 = 100', score === 100, `(${score})`);
  }

  r.section('character stage tracks level');
  {
    const s = sb({});
    r.check('level 1 is stage 1', run(s, 'avatarStage(1)') === 1);
    r.check('level 20 is the final stage', run(s, 'avatarStage(20)') === 6);
    r.check('stages never regress', run(s, `(function(){
      var prev=0; for (var l=1; l<=30; l++){ var st=avatarStage(l); if (st<prev) return false; prev=st; }
      return true; })()`) === true);
    r.check('titles are defined across levels', run(s, `(function(){
      for (var l=1; l<=30; l++) if (!getLevelTitle(l)) return false; return true; })()`) === true);
  }

  return r.finish();
};
