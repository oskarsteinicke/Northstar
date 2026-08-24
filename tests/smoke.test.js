// Every app script parses, evaluates, and still exposes what other files call.
// Cheap insurance against a rename or a syntax slip taking the app down.
const { createSandbox, run, createReporter } = require('./harness');

module.exports = function () {
  const r = createReporter('smoke');
  const FILES = ['data.js','app.js','workout.js','diet.js','profile.js','connect.js',
                 'premium.js','bodymap.js','social.js','coach.js','integrations.js'];

  r.section('every file loads cleanly');
  const sb = createSandbox({ files: FILES });
  for (const f of FILES) {
    const warn = sb._warnings.find(w => w.startsWith(f + ':'));
    r.check(f, !warn, `(${warn || ''})`);
  }

  r.section('cross-file functions still exist');
  const need = [
    'authSignUp','authSignIn','submitAuth','renderAuth','reportError','trackFail',
    'wipeLocalData','deleteAccount','enableWebPush','disableWebPush','pushSupported',
    'pushNeedsInstall','setNotifications','requestNotifications','scheduleNativeReminders',
    'trainedOnDay','renderWorkoutProgress','_wpBodyMapSVG','_wpRelStrength','_macrosForFood',
    '_saveParsedEdit','_renderParsedItems','openDeleteAccount','getErrorLog','notifyError',
    'renderOnboarding','obNext','obFinish','obSkip','_handlePendingJoin',
  ];
  for (const fn of need) {
    const t = run(sb, `typeof ${fn}`);
    r.check(fn, t === 'function', `(${t})`);
  }

  r.section('renders without throwing');
  r.check('sign-in screen', run(sb, "(function(){try{_authMode='signin';renderAuth();return true}catch(e){return false}})()") === true);
  r.check('sign-up screen', run(sb, "(function(){try{_authMode='signup';renderAuth();return true}catch(e){return false}})()") === true);

  return r.finish();
};
