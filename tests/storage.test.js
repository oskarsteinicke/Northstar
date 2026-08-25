// Routine check-offs keyed by stable id, and storage-quota failures surfacing.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js'];
const T = new Date().toLocaleDateString('en-CA');
const dk = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

function sb(store) {
  const s = createSandbox({ files: FILES, store });
  run(s, `
    settings={}; curView='habits'; go=function(){};
    // Deliberately do NOT stub track(): the real one must reach gtag, or this
    // suite would silently pass while analytics received nothing.
    renderHabits=function(){}; tapHabit=function(){}; confirm=function(){ return true; };
    _ga=[]; gtag=function(){ _ga.push(Array.prototype.slice.call(arguments)); };
    _toasts=[]; _showToast=function(m){ _toasts.push(m); };
    habits=[]; log={};
    routines=JSON.parse(localStorage.getItem('hvi_routines')||'{}');
    routineLog=JSON.parse(localStorage.getItem('hvi_routine_log')||'{}');
    _migrateRoutineKeys();
  `);
  return s;
}
const ROUTINES = { morning: [{ name: 'Meditate' }, { name: 'Cold shower' }, { name: 'Journal' }], night: [] };

module.exports = function () {
  const r = createReporter('storage');

  // Ticks used to be keyed by list position, so deleting or reordering an item
  // silently re-attributed every past day's ticks to whatever moved into it.
  r.section('routine history survives a delete');
  {
    const s = sb({
      hvi_routines: JSON.stringify(ROUTINES),
      hvi_routine_log: JSON.stringify({
        [dk(2)]: { morning_0: true, morning_2: true },   // Meditate + Journal
        [dk(1)]: { morning_1: true },                    // Cold shower
      }),
    });
    r.check('items gained stable ids', run(s, 'routines.morning.every(function(i){return !!i.id})') === true);
    const ids = JSON.parse(run(s, 'JSON.stringify(routines.morning.map(function(i){return i.id}))'));

    // Delete the FIRST item; the other two must keep their history
    run(s, "deleteRoutineItem('morning', 0)");
    const logAfter = JSON.parse(s.localStorage._d['hvi_routine_log']);
    r.check('the deleted item\'s ticks are gone',
      !JSON.stringify(logAfter).includes(ids[0]), '(orphaned ticks left behind)');
    r.check('Journal keeps its past tick', !!logAfter[dk(2)][`morning_${ids[2]}`],
      `(${JSON.stringify(logAfter[dk(2)])})`);
    r.check('Cold shower keeps its past tick', !!logAfter[dk(1)][`morning_${ids[1]}`],
      `(${JSON.stringify(logAfter[dk(1)])})`);
    r.check('two items remain', run(s, 'routines.morning.length') === 2);
  }

  r.section('reordering does not move anyone\'s ticks');
  {
    const s = sb({
      hvi_routines: JSON.stringify(ROUTINES),
      hvi_routine_log: JSON.stringify({ [dk(1)]: {} }),
    });
    const ids = JSON.parse(run(s, 'JSON.stringify(routines.morning.map(function(i){return i.id}))'));
    run(s, "toggleRoutineItem('morning', 0)");           // tick Meditate today
    r.check('ticked', run(s, "isRoutineItemDone('morning',0)") === true);

    run(s, "moveRoutineItem('morning', 0, 1)");           // Meditate moves to slot 1
    r.check('the tick follows the item, not the slot',
      run(s, "isRoutineItemDone('morning',1)") === true, '(tick stayed with the position)');
    r.check('the item now in slot 0 is untouched',
      run(s, "isRoutineItemDone('morning',0)") === false);
    const stored = JSON.parse(s.localStorage._d['hvi_routine_log']);
    r.check('stored against the id', !!stored[T][`morning_${ids[0]}`], `(${JSON.stringify(stored[T])})`);
  }

  r.section('old positional logs migrate once');
  {
    const s = sb({
      hvi_routines: JSON.stringify(ROUTINES),
      hvi_routine_log: JSON.stringify({ [dk(1)]: { morning_1: true, night_0: true } }),
    });
    const log = JSON.parse(s.localStorage._d['hvi_routine_log']);
    const keys = Object.keys(log[dk(1)]);
    r.check('no positional keys remain', !keys.some(k => /_\d+$/.test(k)), `(${keys})`);
    const ids = JSON.parse(run(s, 'JSON.stringify(routines.morning.map(function(i){return i.id}))'));
    r.check('the tick maps to the right item', !!log[dk(1)][`morning_${ids[1]}`], `(${keys})`);
    r.check('a tick for a vanished item is dropped', !keys.some(k => k.startsWith('night_')), `(${keys})`);
    run(s, '_migrateRoutineKeys()');
    const again = Object.keys(JSON.parse(s.localStorage._d['hvi_routine_log'])[dk(1)]);
    r.check('running it again changes nothing', again.join() === keys.join(), `(${again})`);
  }

  // Silent quota failure is the worst kind: a whole day's tracking disappears
  // on reload with nothing to explain it.
  r.section('a full disk is reported, not swallowed');
  {
    const s = sb({});
    run(s, `localStorage.setItem = function(){ var e=new Error('full'); e.name='QuotaExceededError'; throw e; };`);
    const okRes = run(s, "LS.set('hvi_test', {a:1})");
    r.check('the write reports failure', okRes === false, `(${okRes})`);
    r.check('the user is told', run(s, '_toasts.length') === 1 && /Storage is full/.test(run(s, '_toasts[0]')),
      `(${run(s, 'JSON.stringify(_toasts)')})`);
    r.check('it names the fix', /progress photos/i.test(run(s, '_toasts[0]')));
    const fails = JSON.parse(run(s, 'JSON.stringify(_ga)')).filter(e => e[1] === 'failure');
    r.check('reported to analytics', fails.some(e => e[2].reason === 'quota_exceeded'), `(${JSON.stringify(fails)})`);

    run(s, "LS.set('hvi_test2', {b:2}); LS.set('hvi_test3', {c:3});");
    r.check('warned once, not on every write', run(s, '_toasts.length') === 1, `(${run(s,'_toasts.length')})`);
  }

  r.section('normal writes are unaffected');
  {
    const s = sb({});
    r.check('a good write reports success', run(s, "LS.set('hvi_ok', {x:1})") === true);
    r.check('and round-trips', run(s, "JSON.stringify(LS.get('hvi_ok'))") === '{"x":1}');
    r.check('no spurious warning', run(s, '_toasts.length') === 0);
  }

  return r.finish();
};
