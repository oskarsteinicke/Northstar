// Workout session integrity and the Progress view's numbers.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','workout.js','diet.js','connect.js','bodymap.js'];
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const T = dk(0);

function sb(store) {
  const s = createSandbox({ files: FILES, store });
  run(s, `
    settings={units:'metric'}; curView='workoutActive';
    track=function(){}; go=function(v){ _nav.push(v); curView=v; };
    playSound=function(){}; haptic=function(){}; awardXP=function(){};
    checkDailyQuests=function(){}; launchConfetti=function(){}; showMilestone=function(){};
    trackWeeklyWorkout=function(){}; startWorkoutTimer=function(){}; stopWorkoutTimer=function(){};
    startRestTimer=function(){}; _showToast=function(){};
    workoutLog=JSON.parse(localStorage.getItem('hvi_workout_log')||'{}');
    workoutMeta=JSON.parse(localStorage.getItem('hvi_workout_meta')||'{}');
    weightLog=JSON.parse(localStorage.getItem('hvi_weight_log')||'{}');
    prs=JSON.parse(localStorage.getItem('hvi_prs')||'{}');
    tdeeProfile=JSON.parse(localStorage.getItem('hvi_tdee_profile')||'null');
  `);
  return s;
}
const completed = s => {
  const wl = JSON.parse(s.localStorage._d['hvi_workout_log'])[T];
  if (!wl) return 0;
  return (wl.exercises||[]).reduce((n,e) => n + (e.sets||[]).filter(x=>x.completed).length, 0);
};

module.exports = function () {
  const r = createReporter('workout');

  // Reopening mid-session used to rebuild the day from scratch whenever the
  // program/day pointer had drifted — wiping every set already logged.
  r.section('an in-progress session survives a reopen');
  {
    const s = sb({
      hvi_workout_log: JSON.stringify({ [T]: {
        programId: 'ppl', dayIndex: 2, touched: true,
        exercises: [
          { exerciseId: 'bench_press', sets: [
            { weight: 80, reps: 8, completed: true },
            { weight: 80, reps: 8, completed: true },
            { weight: 85, reps: 6, completed: true },
          ]},
          { exerciseId: 'squat', sets: [{ weight: 100, reps: 5, completed: false }] },
        ],
      }}),
      // pointer drifted back to day 0, e.g. a stale cloud copy won the pull
      hvi_workout_meta: JSON.stringify({ activeProgram: 'ppl', currentDayIndex: 0 }),
    });
    r.check('three sets logged', completed(s) === 3, `(${completed(s)})`);
    run(s, 'renderWorkoutActive()');
    r.check('all three survive', completed(s) === 3, `(${completed(s)} — DATA LOST)`);
    const meta = JSON.parse(s.localStorage._d['hvi_workout_meta']);
    r.check('the screen follows the live session', meta.currentDayIndex === 2, `(day ${meta.currentDayIndex})`);
  }

  r.section('sessions from before the touched flag also survive');
  {
    const s = sb({
      hvi_workout_log: JSON.stringify({ [T]: {
        programId: 'ppl', dayIndex: 2,          // no `touched`
        exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 80, reps: 8, completed: true }] }],
      }}),
      hvi_workout_meta: JSON.stringify({ activeProgram: 'ppl', currentDayIndex: 0 }),
    });
    run(s, 'renderWorkoutActive()');
    r.check('recognised by its completed sets', completed(s) === 1, `(${completed(s)})`);
  }

  r.section('an untouched day still rebuilds for the current program');
  {
    const s = sb({
      hvi_workout_log: JSON.stringify({ [T]: {
        programId: 'ppl', dayIndex: 2,
        exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 0, reps: 10, completed: false }] }],
      }}),
      hvi_workout_meta: JSON.stringify({ activeProgram: 'ppl', currentDayIndex: 0 }),
    });
    run(s, 'renderWorkoutActive()');
    const wl = JSON.parse(s.localStorage._d['hvi_workout_log'])[T];
    r.check('rebuilt for day 0', wl.dayIndex === 0, `(day ${wl.dayIndex})`);
  }

  r.section('a day only counts as trained once something is logged');
  {
    const s = sb({ hvi_workout_log: JSON.stringify({
      [T]:     { programId:'ppl', dayIndex:0, exercises:[{ exerciseId:'bench_press', sets:[{weight:60,reps:5,completed:false}] }] },
      [dk(1)]: { programId:'ppl', dayIndex:0, exercises:[{ exerciseId:'bench_press', sets:[{weight:60,reps:5,completed:true}] }] },
      [dk(2)]: { dayName:'Run', exercises:[], source:'strava' },
    })});
    r.check('an opened-but-empty day is not trained', run(s, `trainedOnDay('${T}')`) === false);
    r.check('a logged day is trained', run(s, `trainedOnDay('${dk(1)}')`) === true);
    r.check('an imported activity counts', run(s, `trainedOnDay('${dk(2)}')`) === true);
  }

  // Epley, so a 5x100 session compares fairly with 8x85.
  r.section('estimated 1RM');
  {
    const s = sb({});
    r.check('100kg x 5 -> 117', Math.round(run(s,'_e1rm(100,5)')) === 117, `(${Math.round(run(s,'_e1rm(100,5)'))})`);
    r.check('a single rep is the weight', run(s,'_e1rm(140,1)') === 140);
    r.check('no weight means nothing', run(s,'_e1rm(0,10)') === 0);
  }

  r.section('strength is scored against an average lifter');
  {
    const s = sb({
      hvi_workout_log: JSON.stringify({ [dk(2)]: { programId:'ppl', dayIndex:0, touched:true, exercises:[
        { exerciseId:'bench_press',  sets:[{ weight:80,  reps:1, completed:true }] },  // 1.00x
        { exerciseId:'barbell_curl', sets:[{ weight:28,  reps:1, completed:true }] },  // 0.35x
        { exerciseId:'squat',        sets:[{ weight:130, reps:1, completed:true }] },  // 1.63x
      ]}}),
      hvi_weight_log: JSON.stringify({ [dk(1)]: 80 }),
      hvi_tdee_profile: JSON.stringify({ sex:'male', weight_kg:80 }),
    });
    const rel = JSON.parse(run(s,'JSON.stringify(_wpRelStrength())') || '{}');
    r.check('chest at bodyweight is about average', Math.abs(rel.chest.pct - 100) <= 1, `(${rel.chest && rel.chest.pct}%)`);
    r.check('a 28kg curl scores like an 80kg bench', rel.biceps.pct === rel.chest.pct,
      `(${rel.biceps.pct}% vs ${rel.chest.pct}%)`);
    r.check('quads above average', Math.abs(rel.quads.pct - 125) <= 1, `(${rel.quads.pct}%)`);
    r.check('bodyweight read from the log', run(s,'_wpBodyweight()') === 80);
  }

  r.section('muscle labels map to regions');
  {
    const s = sb({});
    const R = l => JSON.parse(run(s, `JSON.stringify(_wpRegionsFor(${JSON.stringify(l)}))`) || '[]');
    r.check('"Quads/Glutes" credits both', R('Quads/Glutes').sort().join() === 'glutes,quads');
    r.check('"Chest/Tri" credits both', R('Chest/Tri').sort().join() === 'chest,triceps');
    r.check('"Cardio" credits nothing', R('Cardio').length === 0);
    r.check('an unknown label is safe', R('Zzz').length === 0);
    const labels = [...new Set((require('fs').readFileSync(require('path').join(__dirname,'..','data.js'),'utf8')
      .match(/muscle:\s*'[^']*'/g) || []).map(x => x.replace(/muscle:\s*'/,'').replace(/'$/,'')))];
    const unmapped = labels.filter(l => R(l).length === 0);
    r.check('every data.js label resolves except cardio-ish',
      unmapped.every(l => /cardio|explosive/i.test(l)), `(${unmapped.join(', ')})`);
  }

  r.section('the body map renders');
  {
    const s = sb({});
    const svg = run(s, '_wpBodyMapSVG({chest:10,quads:4}, 10)') || '';
    r.check('emits an svg', svg.startsWith('<svg'));
    r.check('front and back', /FRONT/.test(svg) && /BACK/.test(svg));
    r.check('no NaN or undefined', !/NaN|undefined/.test(svg));
    r.check('uses the real artwork', (svg.match(/<path/g) || []).length >= 100,
      `(${(svg.match(/<path/g) || []).length} paths)`);
  }

  return r.finish();
};
