// Workout and diet loops: the numbers users read, and correcting a log.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','workout.js','diet.js','connect.js','profile.js'];
const dayKey = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

function sb(store) {
  const s = createSandbox({ files: FILES, store });
  run(s, `
    settings={units:'metric'}; curView='workout';
    track=function(){}; go=function(v){ _nav.push(v); };
    workoutLog=JSON.parse(localStorage.getItem('hvi_workout_log')||'{}');
    workoutMeta=JSON.parse(localStorage.getItem('hvi_workout_meta')||'{}');
    mealLog=JSON.parse(localStorage.getItem('hvi_meal_log')||'{}');
    dietMeta=JSON.parse(localStorage.getItem('hvi_diet_meta')||'{"dailyGoals":{"calories":2500,"protein":180,"carbs":280,"fat":80}}');
    prs={}; confirm=function(){ return true; };
  `);
  return s;
}

module.exports = function () {
  const r = createReporter('tracking');

  // One working set (100x5 = 500) plus a warmup (60x10 = 600). Anything that
  // counts the warmup reports 1100 instead of 500.
  const session = {
    programId: 'ppl', dayIndex: 0, touched: true,
    exercises: [{ exerciseId: 'bench_press', sets: [
      { weight: 60,  reps: 10, completed: true, warmup: true },
      { weight: 100, reps: 5,  completed: true },
    ]}],
  };

  r.section('history: the chart agrees with the list beneath it');
  {
    const s = sb({
      hvi_workout_log: JSON.stringify({ [dayKey(1)]: session }),
      hvi_workout_meta: JSON.stringify({ activeProgram: 'ppl', currentDayIndex: 0 }),
    });
    run(s, 'renderWorkoutHistory()');
    const html = s._els['view'].innerHTML;
    r.check('list shows working-set volume only', /500 kg vol/.test(html),
      `(${(html.match(/[\d,]+ kg vol/) || ['none'])[0]})`);
    // The chart labels bars with their volume; the warmup must not appear there
    r.check('chart does not count the warmup', !/>1,?100</.test(html), '(chart counted warmup sets)');
    r.check('one working set counted', /1 sets/.test(html), `(${(html.match(/\d+ sets/) || ['none'])[0]})`);
  }

  r.section('exercise sparkline ignores warmups');
  {
    const heavy = JSON.parse(JSON.stringify(session));
    const s = sb({ hvi_workout_log: JSON.stringify({
      [dayKey(3)]: heavy,
      [dayKey(1)]: { programId:'ppl', dayIndex:0, touched:true, exercises:[
        { exerciseId:'bench_press', sets:[{ weight:105, reps:5, completed:true }] }]},
    })});
    // Warmup volume (600) exceeds the working set (500); if counted it becomes
    // the peak and the trend reads backwards.
    const svg = run(s, "buildExerciseSparkline('bench_press')") || '';
    r.check('sparkline renders', svg.includes('<svg') || svg === '', '(unexpected shape)');
    const series = run(s, `(function(){
      var out=[];var dates=Object.keys(workoutLog).sort();
      dates.forEach(function(d){
        var ex=(workoutLog[d].exercises||[]).find(function(e){return e.exerciseId==='bench_press'});
        if(!ex)return;
        var best=Math.max(0,...(ex.sets||[]).filter(function(s){return s.completed&&!s.warmup})
          .map(function(s){return (s.weight||0)*(s.reps||0)}));
        out.push(best);
      });
      return JSON.stringify(out);
    })()`);
    r.check('working-set peak is 500 not 600', JSON.parse(series || '[]')[0] === 500,
      `(${series})`);
  }

  r.section('imported activities keep their name');
  {
    const s = sb({ hvi_workout_log: JSON.stringify({
      [dayKey(1)]: { dayName: 'Morning Run', exercises: [], source: 'strava', duration: 1800 },
    })});
    run(s, 'renderWorkoutHistory()');
    const html = s._els['view'].innerHTML;
    r.check('shows the activity name', /Morning Run/.test(html), '(fell back to generic "Workout")');
    r.check('does not crash on an entry with no program', !/undefined/.test(html));
  }

  r.section('deleting a meal removes the right one');
  {
    const t = new Date().toLocaleDateString('en-CA');
    const meals = [
      { id: 'm1', name: 'Breakfast', items: [{ name:'Oats', calories:300, protein:10, carbs:54, fat:5 }] },
      { id: 'm2', name: 'Lunch',     items: [{ name:'Chicken', calories:500, protein:50, carbs:10, fat:12 }] },
      { id: 'm3', name: 'Dinner',    items: [{ name:'Steak', calories:700, protein:60, carbs:0, fat:45 }] },
    ];
    const s = sb({ hvi_meal_log: JSON.stringify({ [t]: { meals } }) });

    // Storage gained a meal that the in-memory copy hasn't seen yet — the exact
    // drift that made index-based deletion remove the wrong row.
    run(s, `(function(){
      var fresh=JSON.parse(localStorage.getItem('hvi_meal_log'));
      fresh['${t}'].meals.unshift({id:'m0',name:'Pre-workout',items:[{name:'Banana',calories:105,protein:1,carbs:27,fat:0}]});
      localStorage.setItem('hvi_meal_log',JSON.stringify(fresh));
    })()`);

    run(s, "deleteMeal(1,'m2')");   // index 1 is now stale; the id is not
    const after = JSON.parse(s.localStorage._d['hvi_meal_log'])[t].meals.map(m => m.id);
    r.check('deleted the meal that was tapped', !after.includes('m2'), `(left: ${after})`);
    r.check('kept the others', after.join() === 'm0,m1,m3', `(left: ${after})`);
    r.check('did not resurrect the newer meal', after.includes('m0'), '(stale write clobbered storage)');
  }

  r.section('deleting still works for meals logged before ids existed');
  {
    const t = new Date().toLocaleDateString('en-CA');
    const s = sb({ hvi_meal_log: JSON.stringify({ [t]: { meals: [
      { name: 'Old Breakfast', items: [{ name:'Toast', calories:200, protein:6, carbs:30, fat:4 }] },
      { name: 'Old Lunch',     items: [{ name:'Soup',  calories:300, protein:9, carbs:35, fat:8 }] },
    ]}})});
    run(s, "deleteMeal(0,'')");
    const names = JSON.parse(s.localStorage._d['hvi_meal_log'])[t].meals.map(m => m.name);
    r.check('index fallback removes the right meal', names.join() === 'Old Lunch', `(left: ${names})`);
  }

  r.section('deleting an already-removed meal is harmless');
  {
    const t = new Date().toLocaleDateString('en-CA');
    const s = sb({ hvi_meal_log: JSON.stringify({ [t]: { meals: [
      { id: 'm1', name: 'Breakfast', items: [] },
    ]}})});
    run(s, "deleteMeal(0,'gone')");
    const left = JSON.parse(s.localStorage._d['hvi_meal_log'])[t].meals.map(m => m.id);
    r.check('nothing else deleted', left.join() === 'm1', `(left: ${left})`);
  }

  return r.finish();
};
