// Meal editing, macro re-estimation on rename, and unit conversion.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','diet.js'];
const ITEMS = `[{name:'Greek Yoghurt',calories:180,protein:18,carbs:12,fat:6},
                {name:'Banana',calories:105,protein:1,carbs:27,fat:0}]`;

function sb(ai, settings) {
  const s = createSandbox({ files: FILES, store: {
    hvi_settings: JSON.stringify(settings || { units: 'metric' }) } });
  run(s, `settings=JSON.parse(localStorage.getItem('hvi_settings'));
          curView='dietAddMeal'; track=function(){}; go=function(v){_nav.push(v)};
          mealLog={}; dietMeta={dailyGoals:{calories:2500,protein:180,carbs:280,fat:80}};
          curMealItems=[]; _aiCalls=0;
          _aiFetch=function(){ _aiCalls++; return ${ai || 'Promise.reject(new Error("offline"))'}; };`);
  return s;
}
// Materialise the edit inputs the way the real render does
function openEditor(s, i) {
  run(s, `_editParsedItem(${i})`);
  run(s, `(function(){var it=_parsedMealItems[${i}];
    document.getElementById('pei-name-${i}').value=it.name;
    document.getElementById('pei-cal-${i}').value=String(it.calories);
    document.getElementById('pei-p-${i}').value=String(it.protein);
    document.getElementById('pei-c-${i}').value=String(it.carbs);
    document.getElementById('pei-f-${i}').value=String(it.fat);})()`);
}
const seed = s => {
  run(s, `_parsedMealItems=${ITEMS}; _renderParsedItems(document.getElementById('describe-output'));`);
  openEditor(s, 0);
};
const RYE = `Promise.resolve('[{"name":"Rye bread (2 slices)","calories":160,"protein":6,"carbs":30,"fat":2}]')`;

module.exports = async function () {
  const r = createReporter('diet');

  // Photo results and text results render into different containers on the same
  // screen. The edit handlers re-rendered into whichever was hard-coded, so
  // tapping a photo item rebuilt the list in the section further down the page.
  r.section('editing acts on the section you tapped');
  {
    const s = sb();
    run(s, `_parsedMealItems=${ITEMS}; _renderParsedItems(document.getElementById('photo-output'));`);
    run(s, '_editParsedItem(0)');
    r.check('editor opens in the photo section',
      /dm-row-editing/.test(s._els['photo-output'].innerHTML) && /pei-cal-0/.test(s._els['photo-output'].innerHTML));
    r.check('does not leak into the describe section', s._els['describe-output'].innerHTML === '');

    run(s, '_parsedMealItems.splice(0,1); _renderParsedItems();');
    r.check('removing updates the photo section',
      !/Greek Yoghurt/.test(s._els['photo-output'].innerHTML) && /Banana/.test(s._els['photo-output'].innerHTML));
  }

  r.section('switching sections clears the stale one');
  {
    const s = sb();
    run(s, `_parsedMealItems=${ITEMS}; _renderParsedItems(document.getElementById('photo-output'));`);
    run(s, `_parsedMealItems=[{name:'Oats',calories:300,protein:10,carbs:54,fat:5}];
            _renderParsedItems(document.getElementById('describe-output'));`);
    r.check('new result shown', /Oats/.test(s._els['describe-output'].innerHTML));
    r.check('stale result cleared', s._els['photo-output'].innerHTML === '');
  }

  // Renaming used to keep the old macros, so swapping white bread for rye
  // changed the label and nothing else.
  r.section('renaming re-estimates the macros');
  {
    const s = sb(RYE); seed(s);
    run(s, `document.getElementById('pei-name-0').value='Rye bread'`);
    await run(s, '_saveParsedEdit(0)');
    const it = JSON.parse(run(s, 'JSON.stringify(_parsedMealItems[0])'));
    r.check('macros updated', it.calories === 160 && it.carbs === 30, `(${it.calories} cal)`);
    r.check('adopts the portion-qualified name', it.name === 'Rye bread (2 slices)', `(${it.name})`);
    r.check('the estimator was called', run(s, '_aiCalls') === 1);
  }

  r.section('typed numbers win over the estimate');
  {
    const s = sb(RYE); seed(s);
    run(s, `document.getElementById('pei-name-0').value='Rye bread';
            document.getElementById('pei-cal-0').value='999'`);
    await run(s, '_saveParsedEdit(0)');
    const it = JSON.parse(run(s, 'JSON.stringify(_parsedMealItems[0])'));
    r.check('explicit calories kept', it.calories === 999, `(${it.calories})`);
    r.check('name still applied', it.name === 'Rye bread');
    r.check('no estimate requested', run(s, '_aiCalls') === 0);
  }

  r.section('saving without changes changes nothing');
  {
    const s = sb(RYE); seed(s);
    await run(s, '_saveParsedEdit(0)');
    const it = JSON.parse(run(s, 'JSON.stringify(_parsedMealItems[0])'));
    r.check('item untouched', it.name === 'Greek Yoghurt' && it.calories === 180);
    r.check('no estimate requested', run(s, '_aiCalls') === 0);
  }

  r.section('a multi-food name collapses into one row');
  {
    const s = sb(`Promise.resolve('[{"name":"Rye bread","calories":160,"protein":6,"carbs":30,"fat":2},{"name":"Butter","calories":70,"protein":0,"carbs":0,"fat":8}]')`);
    seed(s);
    run(s, `document.getElementById('pei-name-0').value='rye bread with butter'`);
    await run(s, '_saveParsedEdit(0)');
    const items = JSON.parse(run(s, 'JSON.stringify(_parsedMealItems)'));
    r.check('the edited row stays a single row', items[0].name === 'rye bread with butter'
      && items[0].calories === 230 && items[0].fat === 10, `(${items[0].calories} cal)`);
    r.check('the other item is untouched', items.length === 2 && items[1].name === 'Banana',
      `(${items.map(i => i.name).join(', ')})`);
  }

  r.section('a failed estimate keeps the old macros');
  {
    const s = sb(); seed(s);   // estimator rejects
    run(s, `document.getElementById('pei-name-0').value='qqzzxw'`);
    await run(s, '_saveParsedEdit(0)');
    const it = JSON.parse(run(s, 'JSON.stringify(_parsedMealItems[0])'));
    r.check('name applied', it.name === 'qqzzxw');
    r.check('previous macros preserved', it.calories === 180, `(${it.calories})`);
    r.check('the user is told', /Couldn.t estimate/.test(s._els['describe-output'].innerHTML));
  }

  // A missing input must never be read as zero — that is silent data loss.
  r.section('a missing field means no change, not zero');
  {
    const s = sb(RYE);
    run(s, `_parsedMealItems=${ITEMS}; _renderParsedItems(document.getElementById('describe-output')); _editParsedItem(0);`);
    // The shim auto-creates elements, so absence has to be simulated: in a real
    // browser an unrendered row returns null from getElementById.
    run(s, `document.getElementById = (function(orig){
      return function(id){ return /^pei-/.test(id) ? null : orig(id); };
    })(document.getElementById.bind(document));`);
    await run(s, '_saveParsedEdit(0)');
    const it = JSON.parse(run(s, 'JSON.stringify(_parsedMealItems[0])'));
    r.check('macros intact', it.calories === 180 && it.protein === 18, `(${it.calories} cal, ${it.protein}P)`);
  }

  r.section('imported weights convert to the user\'s unit');
  {
    const metric = createSandbox({ files: ['data.js','app.js','integrations.js'],
      store: { hvi_settings: JSON.stringify({ units: 'metric' }) } });
    run(metric, `settings=JSON.parse(localStorage.getItem('hvi_settings'));`);
    r.check('metric keeps kilograms', run(metric, '_kgToDisplayWeight(80)') === 80);

    const imperial = createSandbox({ files: ['data.js','app.js','integrations.js'],
      store: { hvi_settings: JSON.stringify({ units: 'imperial' }) } });
    run(imperial, `settings=JSON.parse(localStorage.getItem('hvi_settings'));`);
    const lbs = run(imperial, '_kgToDisplayWeight(80)');
    r.check('imperial converts to pounds', Math.abs(lbs - 176.4) < 0.2, `(${lbs})`);
    r.check('invalid input rejected', run(imperial, '_kgToDisplayWeight(undefined)') === null);
  }

  return r.finish();
};
