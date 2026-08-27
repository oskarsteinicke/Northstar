// go() and the lazily-loaded screens.
//
// social.js, coach.js and bodymap.js are appended at requestIdleCallback, so on
// a cold load there is a window where the app is interactive and they have not
// arrived. Anything go() does during that window has to survive their absence.
const fs = require('fs'), path = require('path');
const { APP, createSandbox, run, createReporter } = require('./harness');

// Exactly what index.html loads with a blocking <script src>. The three lazy
// ones are deliberately absent.
const EAGER = ['data.js', 'app.js', 'connect.js', 'premium.js', 'workout.js',
               'diet.js', 'integrations.js', 'profile.js'];
const LAZY_FILES = ['social.js', 'coach.js', 'bodymap.js'];

function boot(files) {
  const s = createSandbox({ files, store: { hvi_onboarded: 'true' } });
  // The state init() would have established before the first go().
  run(s, `settings={}; curView='home'; habits=[]; log={}; journal={};
          workoutLog={}; workoutMeta={}; mealLog={}; weightLog={};
          meta={lastOpenedDate:'',quoteIndex:0,totalPerfectDays:0};
          sleepLog={}; prs={}; gamification={xp:0,level:1}; achievements={};
          routines={}; routineLog={}; challenges={}; goals=[]; habitLinks={};
          tdeeProfile=null; customPrograms={}; qTimer=null;
          dietMeta={dailyGoals:{calories:2200,protein:160,carbs:220,fat:70}};
          track=function(){}; closeQuickLog=function(){};
          history={pushState:function(){}};`);
  return s;
}

module.exports = function () {
  const r = createReporter('routing');

  // An object literal resolves every identifier the moment it is built. Listing
  // a lazily-loaded screen in it threw ReferenceError on the first navigation
  // of a cold session, before any view could render — so the whole screen was
  // replaced by the error boundary, not just the one section that was late.
  r.section('navigating before the lazy scripts arrive');
  {
    const s = boot(EAGER);
    run(s, `go('home', {}, false)`);
    const errs = s._warnings.filter(w => /is not defined/.test(w));
    r.check('home renders with social.js still in flight', errs.length === 0,
      `(${errs[0] || ''})`);
    r.check('and something was actually painted',
      (run(s, `document.getElementById('view').innerHTML`) || '').length > 0);
  }

  r.section('a lazy screen waits instead of throwing');
  {
    const s = boot(EAGER);
    run(s, `go('library', {}, false)`);
    const errs = s._warnings.filter(w => /is not defined/.test(w));
    r.check('no ReferenceError', errs.length === 0, `(${errs[0] || ''})`);
    const html = run(s, `document.getElementById('view').innerHTML`) || '';
    r.check('shows a loading state', /Loading/.test(html), `(${html.slice(0, 60)})`);
    r.check('and does not silently bounce to home', !/pillar|habit-card/.test(html));
  }

  r.section('once the script lands the screen renders');
  {
    const s = boot(EAGER.concat(LAZY_FILES));
    // In a browser, `window` IS the global object, so a top-level `function
    // renderLibrary` in social.js becomes window.renderLibrary — which is what
    // go() looks up. The harness keeps `window` as a separate object, so the
    // stub has to be attached there explicitly. The check below verifies the
    // assumption this relies on actually holds in the real files.
    run(s, `window._libraryCalled=false;
            window.renderLibrary=function(){ window._libraryCalled=true; };`);
    run(s, `go('library', {}, false)`);
    r.check('renderLibrary is reached', run(s, 'window._libraryCalled') === true);
  }

  // go() resolves lazy screens as window[name]. That only works because each is
  // a top-level function declaration in its file — those become properties of
  // the global object. Nested in a block or assigned to a `const`, they would
  // not, and the screen would hang on "Loading" forever.
  r.section('every lazy screen is reachable off the global object');
  {
    const src = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
    const map = src.slice(src.indexOf('const LAZY_VIEWS = {'));
    const names = [...map.slice(0, map.indexOf('};')).matchAll(/'(render[A-Za-z0-9_]*)'/g)].map(m => m[1]);
    r.check('the map names some screens', names.length > 0);
    for (const fn of names) {
      const declared = LAZY_FILES.some(f =>
        new RegExp(`^(?:async\\s+)?function\\s+${fn}\\b`, 'm')
          .test(fs.readFileSync(path.join(APP, f), 'utf8')));
      r.check(`${fn} is a top-level declaration`, declared,
        '(would never appear on window, so the screen would hang)');
    }
  }

  // The regression guard. Whichever way the map is written, no screen owned by
  // a lazily-loaded file may be named as a bare identifier inside go().
  r.section('no lazy screen is referenced directly in go()');
  {
    const src = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
    const body = src.slice(src.indexOf('function go(view'));
    const rendersLiteral = body.slice(body.indexOf('const renders = {'),
                                      body.indexOf('};', body.indexOf('const renders = {')));

    // Every render* function each lazy file defines.
    const lazyOwned = new Set();
    for (const f of LAZY_FILES) {
      const t = fs.readFileSync(path.join(APP, f), 'utf8');
      for (const m of t.matchAll(/^(?:async\s+)?function\s+(render[A-Za-z0-9_]*)/gm)) {
        lazyOwned.add(m[1]);
      }
    }
    r.check('the lazy files do define screens', lazyOwned.size > 0,
      '(scan found none — the guard below would pass vacuously)');

    const leaked = [...lazyOwned].filter(fn =>
      new RegExp(`(^|[^\\w.'"\`])${fn}\\b`).test(rendersLiteral));
    r.check('none of them appear in the renders map', leaked.length === 0,
      `(${leaked.join(', ')} would throw before any screen could render)`);
  }

  return r.finish();
};
