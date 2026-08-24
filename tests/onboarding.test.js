// First-run flow: the onboarding answers, and invite links reaching new users.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','workout.js','diet.js','connect.js','profile.js'];

function obSandbox(store) {
  const sb = createSandbox({ files: FILES, store });
  run(sb, `
    settings={}; curView='home';
    track=function(n,p){ _tracked.push([n,p||{}]); };
    go=function(v){ _nav.push(v); curView=v; };
    launchConfetti=function(){}; showFeatureTour=function(){ _nav.push('TOUR'); };
    meta = meta || {}; workoutMeta = workoutMeta || {}; dietMeta = dietMeta || {};
  `);
  return sb;
}
// Walk the flow the way a person does
function walk(sb, { path, program, nutrition }) {
  run(sb, 'renderOnboarding(0)');
  run(sb, "_obName='Ada'; obNext(1)");
  run(sb, "_obGender='female'; obNext(2)");
  run(sb, `_obPath='${path}'; obNext(3)`);
  run(sb, `_obProgram='${program}'; obNext(4)`);
  if (nutrition) run(sb, `_obGoalType='${nutrition}'`);
  run(sb, 'obNext(5)');
}
const wait = ms => new Promise(r => setTimeout(r, ms));

module.exports = async function () {
  const r = createReporter('onboarding');

  // Step 3 (path) and step 5 (nutrition goal) used to share _obGoalType, so
  // step 5 overwrote the path answer and rendered with nothing selected.
  r.section('step 3 no longer wipes step 5');
  {
    const sb = obSandbox({});
    run(sb, 'renderOnboarding(0)');
    run(sb, "_obName='Ada'; obNext(1)");
    run(sb, 'obNext(2)');
    run(sb, "_obPath='fitness'; obNext(3)");
    run(sb, 'obNext(4)');
    run(sb, 'renderOnboarding(5)');
    r.check('a nutrition goal is still highlighted',
      /ob-nut-btn active/.test(sb._els['ob-overlay'].innerHTML), '(none selected after picking a path)');
    r.check('goal defaults to maintain', run(sb, '_obGoalType') === 'maintain');
    r.check('path survives separately', run(sb, '_obPath') === 'fitness');
  }

  r.section('answers are kept');
  {
    const sb = obSandbox({});
    walk(sb, { path: 'habits', program: 'ul', nutrition: 'cut' });
    r.check('path persisted', JSON.parse(sb.localStorage._d['hvi_meta'] || '{}').path === 'habits');
    r.check('program persisted', JSON.parse(sb.localStorage._d['hvi_workout_meta']).activeProgram === 'ul');
    r.check('nutrition persisted', JSON.parse(sb.localStorage._d['hvi_diet_meta']).goalType === 'cut');
    const ev = sb._tracked.find(t => t[0] === 'onboarding_complete');
    r.check('completion reports all three',
      ev && ev[1].path === 'habits' && ev[1].program === 'ul' && ev[1].nutrition === 'cut',
      `(${JSON.stringify(ev && ev[1])})`);
  }

  // An invite used to be handled while the onboarding overlay was up, so it
  // navigated underneath it and was replaced by home the moment setup ended.
  r.section('an invite link reaches a brand new user');
  {
    const sb = obSandbox({ hvi_pending_join: 'ABC123' });
    run(sb, `_handlePendingJoin=function(){ _nav.push('leaderboard'); };`);
    await run(sb, 'init()');
    r.check('onboarding shown', !!sb._els['ob-overlay'].innerHTML);
    r.check('invite not handled under the overlay', !sb._nav.includes('leaderboard'), `(nav: ${sb._nav})`);
    walk(sb, { path: 'all', program: 'ppl', nutrition: 'maintain' });
    r.check('invite handled after onboarding', sb._nav.includes('leaderboard'), `(nav: ${sb._nav})`);
    r.check('invite wins over home', sb._nav[sb._nav.length - 1] === 'leaderboard');
    await wait(1400);
    r.check('tour suppressed for invitees', !sb._nav.includes('TOUR'), `(nav: ${sb._nav})`);
  }

  r.section('a normal new user is unaffected');
  {
    const sb = obSandbox({});
    await run(sb, 'init()');
    r.check('onboarding shown', !!sb._els['ob-overlay'].innerHTML);
    walk(sb, { path: 'all', program: 'ppl', nutrition: 'maintain' });
    r.check('lands on home', sb._nav.includes('home'));
    r.check('marked onboarded', sb.localStorage._d['hvi_onboarded'] === 'true');
    await wait(1400);
    r.check('tour still runs', sb._nav.includes('TOUR'), `(nav: ${sb._nav})`);
  }

  r.section('an existing user with an invite is handled at launch');
  {
    const sb = obSandbox({ hvi_onboarded: 'true', hvi_pending_join: 'ABC123' });
    run(sb, `_handlePendingJoin=function(){ _nav.push('leaderboard'); };`);
    await run(sb, 'init()');
    r.check('invite handled immediately', sb._nav.includes('leaderboard'), `(nav: ${sb._nav})`);
  }

  r.section('setup can be skipped');
  {
    const sb = obSandbox({});
    run(sb, 'renderOnboarding(1)');
    r.check('skip offered', /obSkip\(\)/.test(sb._els['ob-overlay'].innerHTML));
    run(sb, 'obSkip()');
    r.check('marked onboarded', sb.localStorage._d['hvi_onboarded'] === 'true');
    r.check('lands on home', sb._nav.includes('home'));

    const sb2 = obSandbox({ hvi_pending_join: 'ABC123' });
    run(sb2, `_handlePendingJoin=function(){ _nav.push('leaderboard'); };`);
    run(sb2, 'obSkip()');
    r.check('skipping honours an invite', sb2._nav.includes('leaderboard'));
  }

  return r.finish();
};
