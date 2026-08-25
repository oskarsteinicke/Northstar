// TDEE targets, challenge progress, and goal-state consistency.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','workout.js','diet.js','connect.js','social.js'];
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const T = dk(0);

function sb(store) {
  const s = createSandbox({ files: FILES, store });
  run(s, `
    settings={units:'metric'}; curView='diet';
    track=function(){}; go=function(v){_nav.push(v)};
    habits=JSON.parse(localStorage.getItem('hvi_habits')||'[]');
    log=JSON.parse(localStorage.getItem('hvi_log')||'{}');
    journal=JSON.parse(localStorage.getItem('hvi_journal3')||'{}');
    workoutLog=JSON.parse(localStorage.getItem('hvi_workout_log')||'{}');
    mealLog=JSON.parse(localStorage.getItem('hvi_meal_log')||'{}');
    dietMeta=JSON.parse(localStorage.getItem('hvi_diet_meta')||'{"dailyGoals":{"calories":2500,"protein":180,"carbs":280,"fat":80},"goalType":"maintain"}');
    challenges=JSON.parse(localStorage.getItem('hvi_challenges')||'[]');
    weightLog={}; gamification={xp:0}; meta={};
  `);
  return s;
}

module.exports = function () {
  const r = createReporter('features');

  // Applying a TDEE result set the macro targets but left goalType alone, so a
  // mild cut showed MAINTAIN on the Diet screen and the adaptive
  // recommendation pushed the calories back up to maintenance.
  r.section('applying a TDEE result also sets the goal');
  {
    const s = sb({});
    r.check('starts on maintain', run(s, 'dietMeta.goalType') === 'maintain');
    run(s, "applyTDEEGoals(2200, 190, 190, 73, 'cut_mild')");
    r.check('macros applied', run(s, 'dietMeta.dailyGoals.calories') === 2200);
    r.check('a mild cut records as a cut', run(s, 'dietMeta.goalType') === 'cut',
      `(${run(s, 'dietMeta.goalType')} — screen would contradict the target)`);

    run(s, "applyTDEEGoals(3000, 188, 375, 83, 'bulk_lean')");
    r.check('a lean bulk records as a bulk', run(s, 'dietMeta.goalType') === 'bulk',
      `(${run(s, 'dietMeta.goalType')})`);

    run(s, "applyTDEEGoals(2500, 188, 250, 83, 'maintain')");
    r.check('maintain stays maintain', run(s, 'dietMeta.goalType') === 'maintain');

    const before = run(s, 'dietMeta.goalType');
    run(s, "applyTDEEGoals(2500, 188, 250, 83)");   // legacy call with no goal
    r.check('a missing goal leaves it unchanged', run(s, 'dietMeta.goalType') === before);
  }

  r.section('the adaptive target only sees goals it understands');
  {
    const s = sb({});
    const cut = run(s, "computeAdaptiveTarget(2500,'cut',{}) && computeAdaptiveTarget(2500,'cut',{}).calories");
    const bulk = run(s, "computeAdaptiveTarget(2500,'bulk',{}) && computeAdaptiveTarget(2500,'bulk',{}).calories");
    const keep = run(s, "computeAdaptiveTarget(2500,'maintain',{}) && computeAdaptiveTarget(2500,'maintain',{}).calories");
    r.check('a cut lowers the target', cut < keep, `(cut ${cut} vs maintain ${keep})`);
    r.check('a bulk raises it', bulk > keep, `(bulk ${bulk})`);
    r.check('goalType only ever holds the three it maps',
      ['cut','maintain','bulk'].includes(run(s, 'dietMeta.goalType')));
  }

  // Every habit was tested against "did ANY habit have history that day", so a
  // single completion made the whole day count as perfect.
  r.section('a perfect day needs every habit, not one');
  {
    const three = [{ id:'h1' }, { id:'h2' }, { id:'h3' }];
    const partial = sb({
      hvi_habits: JSON.stringify(three),
      hvi_log: '{}',
      // Only h1 completed on each of the two days
      hvi_habit_history: JSON.stringify({ h1: [dk(1), dk(2)] }),
      hvi_challenges: '[]',
    });
    const ch = { id:'c1', metric:'perfect_days', goal:2, duration:3,
                 startDate: dk(2), endDate: dk(0) };
    const p = JSON.parse(run(partial, `JSON.stringify(_challengeProgress(${JSON.stringify(ch)}))`) || '{}');
    r.check('one habit done is not a perfect day', p.count === 0,
      `(counted ${p.count} perfect day(s) from a single habit)`);

    const full = sb({
      hvi_habits: JSON.stringify(three),
      hvi_log: '{}',
      hvi_habit_history: JSON.stringify({ h1:[dk(1),dk(2)], h2:[dk(1),dk(2)], h3:[dk(1),dk(2)] }),
      hvi_challenges: '[]',
    });
    const q = JSON.parse(run(full, `JSON.stringify(_challengeProgress(${JSON.stringify(ch)}))`) || '{}');
    r.check('all habits done counts', q.count === 2, `(${q.count})`);
    r.check('and completes the challenge', q.done === true);
    r.check('progress is capped at 100%', q.pct <= 1);
  }

  r.section('other challenge metrics count real activity');
  {
    const s = sb({
      hvi_habits: '[]',
      hvi_workout_log: JSON.stringify({
        [dk(1)]: { exercises: [{ exerciseId:'bench_press', sets:[{ weight:60, reps:5, completed:true }] }] },
        [dk(2)]: { exercises: [{ exerciseId:'bench_press', sets:[{ weight:60, reps:5, completed:false }] }] },
      }),
      hvi_journal3: JSON.stringify({ [dk(1)]: { win: 'shipped' }, [dk(2)]: { win: '' } }),
      hvi_challenges: '[]',
    });
    const w = JSON.parse(run(s, `JSON.stringify(_challengeProgress(${JSON.stringify(
      { metric:'workouts', goal:5, duration:3, startDate: dk(2), endDate: dk(0) })}))`) || '{}');
    r.check('an opened-but-empty workout does not count', w.count === 1, `(${w.count})`);
    const j = JSON.parse(run(s, `JSON.stringify(_challengeProgress(${JSON.stringify(
      { metric:'journal_days', goal:5, duration:3, startDate: dk(2), endDate: dk(0) })}))`) || '{}');
    r.check('an empty journal entry does not count', j.count === 1, `(${j.count})`);
  }

  r.section('TDEE arithmetic');
  {
    const s = sb({});
    // Mifflin-St Jeor for an 80kg, 180cm, 25y male: 10*80 + 6.25*180 - 5*25 + 5
    const bmr = 10*80 + 6.25*180 - 5*25 + 5;
    r.check('reference BMR is 1805', bmr === 1805, `(${bmr})`);
    r.check('macro splits each total 100%', run(s, `(function(){
      var sp={cut:[0.35,0.35,0.30],cut_mild:[0.35,0.35,0.30],maintain:[0.30,0.40,0.30],
              bulk_lean:[0.30,0.45,0.25],bulk:[0.25,0.50,0.25]};
      for (var k in sp){ var t=sp[k][0]+sp[k][1]+sp[k][2]; if (Math.abs(t-1)>0.001) return false; }
      return true; })()`) === true);
  }

  return r.finish();
};
