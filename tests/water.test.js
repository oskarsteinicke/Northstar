// Water tracking.
//
// Deliberately small: one row on the Diet screen, no view of its own, no
// reminders. The things worth testing are the unit handling and that the log
// stays clean, because both are quietly destructive when wrong.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js', 'diet.js'];

function sb(store, units) {
  const s = createSandbox({ files: FILES, store: store || {} });
  run(s, `settings=${JSON.stringify({ units: units || 'metric' })};
          curView='home'; track=function(){}; go=function(){};
          habits=[]; mealLog={}; weightLog={};
          dietMeta={dailyGoals:{calories:2600,protein:180,carbs:260,fat:80}};
          tdeeProfile=${store && store._noProfile ? 'null' : "{age:22,sex:'male',weight_kg:80,height_cm:183,activity:'active',goal:'maintain'}"};`);
  return s;
}
const water = s => run(s, 'getWaterMl()');
const stored = s => JSON.parse(run(s, `localStorage.getItem('hvi_water_log')`) || '{}');

module.exports = function () {
  const r = createReporter('water');

  r.section('adding and removing');
  {
    const s = sb();
    r.check('starts empty', water(s) === 0);
    run(s, 'addWater(1)');
    r.check('one glass is 250ml', water(s) === 250, `(${water(s)})`);
    run(s, 'addWater(1); addWater(1)');
    r.check('three glasses', water(s) === 750);
    run(s, 'addWater(-1)');
    r.check('removing works', water(s) === 500);
  }

  // A negative total is meaningless and would render a backwards bar.
  r.section('it cannot go below zero');
  {
    const s = sb();
    run(s, 'addWater(-1); addWater(-1)');
    r.check('still zero', water(s) === 0, `(${water(s)})`);
    r.check('and writes no entry for the day', Object.keys(stored(s)).length === 0,
      '(zero-value days accumulating in the log)');
  }

  r.section('emptying a day removes it rather than storing a zero');
  {
    const s = sb();
    run(s, 'addWater(1)');
    r.check('a day is recorded', Object.keys(stored(s)).length === 1);
    run(s, 'addWater(-1)');
    r.check('and cleared again', Object.keys(stored(s)).length === 0,
      '(the log fills with empty days)');
  }

  // The weight log learned this the hard way: storing whatever was on screen
  // meant switching units silently changed the value instead of converting it.
  r.section('storage is millilitres whatever the display unit');
  {
    const metric = sb({}, 'metric');
    run(metric, 'addWater(1)');
    const imperial = sb({}, 'imperial');
    run(imperial, 'addWater(1)');
    r.check('a metric glass is 250ml', water(metric) === 250);
    r.check('a US cup is 237ml', water(imperial) === 237, `(${water(imperial)})`);

    // Same stored volume, read back under either setting.
    const swap = sb({ hvi_water_log: JSON.stringify({ [run(sb(), 'today()')]: 1000 }) }, 'imperial');
    r.check('an existing total is not rescaled by the unit setting',
      water(swap) === 1000, '(unit switch changed the value)');
  }

  // Slicing the trailing "s" off "glasses" gave "glasse", which is what a screen
  // reader announced on the buttons.
  r.section('the buttons are labelled in real words');
  {
    const m = sb();
    const mh = run(m, 'waterRowHTML()');
    r.check('metric singular', /aria-label="Add one glass"/.test(mh),
      `(${(mh.match(/aria-label="Add one [^"]*"/) || [])[0]})`);
    r.check('and for removing', /aria-label="Remove one glass"/.test(mh));
    const i = sb({}, 'imperial');
    r.check('imperial singular', /aria-label="Add one cup"/.test(run(i, 'waterRowHTML()')));
  }

  r.section('the label follows the unit');
  {
    const m = sb(); run(m, 'addWater(1); addWater(1); addWater(1); addWater(1)');
    const mh = run(m, 'waterRowHTML()');
    r.check('metric says glasses', /glasses/.test(mh));
    r.check('and shows litres', /1\.0 L/.test(mh), `(${(mh.match(/[\d.]+ L/) || [])[0]})`);

    const i = sb({}, 'imperial'); run(i, 'addWater(1); addWater(1)');
    const ih = run(i, 'waterRowHTML()');
    r.check('imperial says cups', /cups/.test(ih));
    r.check('and shows ounces', /oz/.test(ih), `(${(ih.match(/\d+ oz/) || [])[0]})`);
  }

  r.section('the goal comes from bodyweight');
  {
    const s = sb();
    r.check('80kg gives 2800ml', run(s, 'waterGoalMl()') === 2800, `(${run(s, 'waterGoalMl()')})`);
    run(s, 'tdeeProfile.weight_kg = 60;');
    r.check('60kg gives 2100ml', run(s, 'waterGoalMl()') === 2100);
  }

  r.section('no profile still gives a usable goal');
  {
    const s = sb({ _noProfile: true });
    r.check('falls back to 2500ml', run(s, 'waterGoalMl()') === 2500, `(${run(s, 'waterGoalMl()')})`);
    r.check('and renders', /Water/.test(run(s, 'waterRowHTML()')));
  }

  r.section('the row shows progress honestly');
  {
    const s = sb();
    r.check('nothing logged reads zero', /0 \/ 12/.test(run(s, 'waterRowHTML()')),
      `(${(run(s, 'waterRowHTML()').match(/\d+ \/ \d+/) || [])[0]})`);
    // Tapping the number of glasses the row displays must actually complete it.
    run(s, 'for (let i=0;i<12;i++) addWater(1);');
    const full = run(s, 'waterRowHTML()');
    r.check('hitting the goal marks it done', /d-water-fill done/.test(full),
      '(no indication the goal was reached)');
    r.check('the bar never exceeds full', !/width:1[0-9][0-9]\.?[0-9]*%/.test(full.replace('width:100%','')),
      '(bar overflows past 100%)');
  }

  // Date-keyed, so it has to merge across devices rather than one clobbering
  // the other, and it has to sync at all.
  r.section('it takes part in sync');
  {
    const s = sb();
    r.check('is a synced key', run(s, `SYNC_KEYS.indexOf('hvi_water_log')`) !== -1,
      '(water never leaves the device)');
    r.check('and is merged, not overwritten',
      run(s, `MERGE_KEYS.indexOf('hvi_water_log')`) !== -1,
      '(one device wipes another day of logging)');
  }

  // The quick log closes itself and can be opened from any screen, so unlike
  // every other entry in it this one does the thing rather than navigating to
  // it — and therefore needs to say that it happened.
  r.section('logging water from the quick menu');
  {
    const s2 = sb();
    run(s2, `_toasts=[]; showToast=function(m){ _toasts.push(m); };`);
    r.check('the menu shows progress before you tap',
      /Water · 0 of 12/.test(run(s2, '_quickWaterLabel()')), `(${run(s2, '_quickWaterLabel()')})`);

    run(s2, 'quickLogWater()');
    r.check('a glass is added', water(s2) === 250);
    r.check('and it says so', run(s2, '_toasts[0]') === '1 of 12 glasses',
      `(${run(s2, '_toasts[0]')})`);
    r.check('the label updates', /Water · 1 of 12/.test(run(s2, '_quickWaterLabel()')));

    run(s2, 'for (let i=0;i<11;i++) quickLogWater();');   // 12 total
    r.check('hitting the goal is called out',
      /goal hit/.test(run(s2, '_toasts[_toasts.length-1]')),
      `(${run(s2, '_toasts[_toasts.length-1]')})`);
  }

  r.section('the quick menu survives diet.js not being loaded');
  {
    // app.js loads before diet.js, and the menu is reachable from every screen.
    const bare = createSandbox({ files: ['data.js', 'app.js'] });
    run(bare, `settings={}; curView='home'; track=function(){}; go=function(){}; habits=[];`);
    r.check('it falls back to a plain label',
      run(bare, '_quickWaterLabel()') === 'Log Water', `(${run(bare, '_quickWaterLabel()')})`);
    run(bare, 'quickLogWater()');
    r.check('and tapping it does not throw', true);
  }

  return r.finish();
};
