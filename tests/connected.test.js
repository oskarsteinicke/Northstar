// Cross-section reactions: readiness driving training advice, and one section's
// input completing a habit owned by another.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','workout.js','diet.js','connect.js','social.js'];
const T = new Date().toLocaleDateString('en-CA');
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

function sb(store) {
  const s = createSandbox({ files: FILES, store });
  run(s, `
    settings={units:'metric'}; curView='workout';
    track=function(){}; go=function(v){ _nav.push(v); };
    playSound=function(){}; haptic=function(){}; awardXP=function(){};
    launchConfetti=function(){}; checkDailyQuests=function(){}; checkAchievements=function(){};
    renderHabits=function(){}; updateHabitUI=function(){}; _connectToast=function(m){ _tracked.push(['toast',m]); };
    habits=JSON.parse(localStorage.getItem('hvi_habits')||'[]');
    log=JSON.parse(localStorage.getItem('hvi_log')||'{}');
    sleepLog=JSON.parse(localStorage.getItem('hvi_sleep_log')||'{}');
    journal=JSON.parse(localStorage.getItem('hvi_journal3')||'{}');
    workoutLog=JSON.parse(localStorage.getItem('hvi_workout_log')||'{}');
    mealLog={}; weightLog={}; prs={}; gamification={xp:0}; meta={};
    workoutMeta={activeProgram:'ppl',currentDayIndex:0};
    dietMeta={dailyGoals:{calories:2500,protein:180,carbs:280,fat:80},goalType:'maintain'};
  `);
  return s;
}
const H = [{ id: 'h1', name: 'Sleep 7h', schedule: 'daily' }];

module.exports = function () {
  const r = createReporter('connected');

  // Readiness was computed from sleep, load, habits and nutrition but only ever
  // shown on the home screen — the workout screen never saw it.
  r.section('readiness becomes advice for today\'s session');
  {
    const rested = sb({
      hvi_habits: '[]', hvi_log: '{}',
      hvi_sleep_log: JSON.stringify({ [T]: { hours: 8.5, quality: 5 } }),
    });
    const good = JSON.parse(run(rested, 'JSON.stringify(trainingAdvice())') || 'null');
    r.check('advice is produced once there is a signal', !!good, '(none)');
    r.check('a rested day says go heavy', /heavy|as planned/i.test(good.headline), `(${good.headline})`);

    const wrecked = sb({
      hvi_habits: '[]', hvi_log: '{}',
      hvi_sleep_log: JSON.stringify({ [T]: { hours: 3, quality: 1 } }),
    });
    const bad = JSON.parse(run(wrecked, 'JSON.stringify(trainingAdvice())') || 'null');
    r.check('a bad night lowers the score', bad.score < good.score, `(${bad.score} vs ${good.score})`);
    r.check('and changes the instruction', bad.headline !== good.headline, `(${bad.headline})`);
    r.check('it names the limiting factor', /sleep/i.test(bad.detail), `(${bad.detail})`);
    r.check('it renders on the workout screen', /w-advice/.test(run(wrecked, 'trainingAdviceHTML()') || ''));
  }

  r.section('no advice without any signal');
  {
    const blank = sb({ hvi_habits: '[]', hvi_log: '{}', hvi_sleep_log: '{}' });
    r.check('a brand new user sees nothing', run(blank, 'trainingAdvice()') === null);
    r.check('and no markup is emitted', run(blank, 'trainingAdviceHTML()') === '');
  }

  r.section('logging sleep ticks a habit that belongs to the habits section');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_habit_links: JSON.stringify({ h1: 'sleep' }),
      hvi_sleep_log: JSON.stringify({ [T]: { hours: 8 } }),
    });
    run(s, "window.Arete.emit('sleep:logged', { hours: 8 })");
    r.check('the linked habit completed itself', run(s, 'log.h1.completedToday') === true);
    r.check('and the user was told', run(s, '_tracked.some(function(t){return t[0]==="toast"})') === true);

    // Not enough sleep shouldn't tick it
    const short = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_habit_links: JSON.stringify({ h1: 'sleep' }),
      hvi_sleep_log: JSON.stringify({ [T]: { hours: 5 } }),
    });
    run(short, "window.Arete.emit('sleep:logged', { hours: 5 })");
    r.check('under the threshold does not tick', run(short, 'log.h1.completedToday') === false);
  }

  r.section('journalling ticks a linked habit');
  {
    const s = sb({
      hvi_habits: JSON.stringify([{ id: 'h1', name: 'Reflect' }]),
      hvi_log: JSON.stringify({ h1: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_habit_links: JSON.stringify({ h1: 'journal' }),
      hvi_journal3: JSON.stringify({ [T]: { win: 'shipped the audit' } }),
    });
    run(s, "window.Arete.emit('journal:saved', {})");
    r.check('completed from a journal entry', run(s, 'log.h1.completedToday') === true);

    const empty = sb({
      hvi_habits: JSON.stringify([{ id: 'h1', name: 'Reflect' }]),
      hvi_log: JSON.stringify({ h1: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_habit_links: JSON.stringify({ h1: 'journal' }),
      hvi_journal3: JSON.stringify({ [T]: { win: '' } }),
    });
    run(empty, "window.Arete.emit('journal:saved', {})");
    r.check('a blank entry does not count', run(empty, 'log.h1.completedToday') === false);
  }

  r.section('a habit only auto-completes for its own trigger');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 0, lastCompletedDate: '', completedToday: false } }),
      hvi_habit_links: JSON.stringify({ h1: 'sleep' }),
      hvi_sleep_log: JSON.stringify({ [T]: { hours: 8 } }),
    });
    run(s, "window.Arete.emit('workout:completed', {})");
    r.check('a workout does not tick a sleep habit', run(s, 'log.h1.completedToday') === false);
    run(s, "window.Arete.emit('sleep:logged', {})");
    r.check('its own trigger does', run(s, 'log.h1.completedToday') === true);
  }

  r.section('auto-completion is idempotent');
  {
    const s = sb({
      hvi_habits: JSON.stringify(H),
      hvi_log: JSON.stringify({ h1: { streak: 2, lastCompletedDate: dk(1), completedToday: false } }),
      hvi_habit_links: JSON.stringify({ h1: 'sleep' }),
      hvi_sleep_log: JSON.stringify({ [T]: { hours: 8 } }),
    });
    run(s, "window.Arete.emit('sleep:logged', {})");
    const after = run(s, 'log.h1.streak');
    run(s, "window.Arete.emit('sleep:logged', {}); window.Arete.emit('sleep:logged', {});");
    r.check('the streak advances once', run(s, 'log.h1.streak') === after, `(${after} -> ${run(s,'log.h1.streak')})`);
  }


  // BMR is driven by bodyweight, so targets set months ago stop matching the
  // person using them.
  r.section('bodyweight drift offers new targets');
  {
    const profile = { age: 25, sex: 'male', weight_kg: 90, height_cm: 180,
                      activity: 'moderate', goal: 'cut' };
    const drifted = sb({
      hvi_habits: '[]', hvi_log: '{}',
      hvi_tdee_profile: JSON.stringify(profile),
      hvi_weight_log: JSON.stringify({ [dk(1)]: 82 }),   // 8kg down
    });
    run(drifted, `tdeeProfile=JSON.parse(localStorage.getItem('hvi_tdee_profile'));
                  weightLog=JSON.parse(localStorage.getItem('hvi_weight_log'));
                  dietMeta={dailyGoals:{calories:2400,protein:210,carbs:210,fat:80},goalType:'cut'};`);
    const d = JSON.parse(run(drifted, 'JSON.stringify(bodyweightDrift())') || 'null');
    r.check('drift detected', !!d, '(none)');
    r.check('reports the direction', d.deltaKg < 0, `(${d.deltaKg})`);
    r.check('a lighter person needs fewer calories', d.next.target < d.current,
      `(${d.next.target} vs ${d.current})`);
    r.check('it is offered, not applied', run(drifted, 'dietMeta.dailyGoals.calories') === 2400);
    r.check('the prompt renders', /dw-drift/.test(run(drifted, 'bodyweightDriftHTML()') || ''));

    run(drifted, 'applyBodyweightDrift()');
    r.check('applying updates the targets', run(drifted, 'dietMeta.dailyGoals.calories') === d.next.target,
      `(${run(drifted, 'dietMeta.dailyGoals.calories')})`);
    r.check('macros move with it', run(drifted, 'dietMeta.dailyGoals.protein') === d.next.protein);
    r.check('the profile is brought in step', Math.abs(run(drifted, 'tdeeProfile.weight_kg') - 82) < 0.2,
      `(${run(drifted, 'tdeeProfile.weight_kg')})`);
    r.check('so the prompt does not reappear', run(drifted, 'bodyweightDrift()') === null);
  }

  r.section('small changes are left alone');
  {
    const s2 = sb({
      hvi_habits: '[]', hvi_log: '{}',
      hvi_tdee_profile: JSON.stringify({ age:25, sex:'male', weight_kg:80, height_cm:180,
                                         activity:'moderate', goal:'maintain' }),
      hvi_weight_log: JSON.stringify({ [dk(1)]: 81 }),   // 1kg, ordinary fluctuation
    });
    run(s2, `tdeeProfile=JSON.parse(localStorage.getItem('hvi_tdee_profile'));
             weightLog=JSON.parse(localStorage.getItem('hvi_weight_log'));
             dietMeta={dailyGoals:{calories:2700,protein:200,carbs:270,fat:90},goalType:'maintain'};`);
    r.check('a 1kg swing does not nag', run(s2, 'bodyweightDrift()') === null);
    r.check('and renders nothing', run(s2, 'bodyweightDriftHTML()') === '');
  }

  r.section('drift needs a profile to compare against');
  {
    const s3 = sb({ hvi_habits: '[]', hvi_log: '{}',
      hvi_weight_log: JSON.stringify({ [dk(1)]: 82 }) });
    run(s3, `tdeeProfile=null; weightLog=JSON.parse(localStorage.getItem('hvi_weight_log'));
             dietMeta={dailyGoals:{calories:2500}};`);
    r.check('no profile means no prompt', run(s3, 'bodyweightDrift()') === null);
  }

  r.section('the shared formula is used by both paths');
  {
    const s4 = sb({ hvi_habits: '[]', hvi_log: '{}' });
    const t = JSON.parse(run(s4, `JSON.stringify(computeTDEETargets({
      weightKg: 80, heightCm: 180, age: 25, sex: 'male', activity: 'moderate', goal: 'maintain' }))`) || 'null');
    r.check('reference BMR is 1805', t.bmr === 1805, `(${t.bmr})`);
    r.check('TDEE applies the activity multiplier', t.tdee === Math.round(1805 * 1.55), `(${t.tdee})`);
    r.check('maintain adds no offset', t.target === t.tdee);
    r.check('macros roughly reconstruct the target',
      Math.abs((t.protein*4 + t.carbs*4 + t.fat*9) - t.target) < 12,
      `(${t.protein*4 + t.carbs*4 + t.fat*9} vs ${t.target})`);
    r.check('rubbish input returns nothing', run(s4, "computeTDEETargets({weightKg:0})") === null);
  }

  return r.finish();
};
