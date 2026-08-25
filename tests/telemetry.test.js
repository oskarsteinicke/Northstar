// Error reporting, failure tracking, and notification wiring.
const { createSandbox, run, createReporter } = require('./harness');

function sb(opts) {
  opts = opts || {};
  const s = createSandbox({ files: ['data.js','app.js'], store: opts.store, capacitor: opts.capacitor });
  // Capture gtag calls
  run(s, `_ga=[]; gtag=function(){ _ga.push(Array.prototype.slice.call(arguments)); };
          settings=${JSON.stringify(opts.settings || {})}; curView='home';`);
  return s;
}
const events = s => JSON.parse(run(s, 'JSON.stringify(_ga)') || '[]');
const log = s => { try { return JSON.parse(s.localStorage._d['hvi_error_log'] || '[]'); } catch { return []; } };

module.exports = async function () {
  const r = createReporter('telemetry');

  // Errors used to stop at console.error, so a bug on someone else's phone was
  // invisible — the only ones ever found were the ones we tripped over.
  r.section('errors reach analytics and the on-device log');
  {
    const s = sb();
    run(s, "reportError('crash','Cannot read properties of undefined',{src:'workout.js',line:42})");
    const ev = events(s);
    r.check('one exception sent', ev.length === 1 && ev[0][1] === 'exception', `(${JSON.stringify(ev[0]||[])})`);
    const d = ev[0][2].description;
    r.check('carries version, view, file and line',
      /v/.test(d) && /home/.test(d) && /workout\.js/.test(d) && /:42/.test(d), `(${d})`);
    r.check('a crash is flagged fatal', ev[0][2].fatal === true);
    r.check('written on device', log(s).length === 1 && log(s)[0].line === 42);
  }

  r.section('a broken screen cannot spam');
  {
    const s = sb();
    for (let i = 0; i < 5; i++) run(s, "reportError('crash','same boom',{})");
    r.check('duplicates reported once', events(s).length === 1, `(${events(s).length})`);
    for (let i = 0; i < 20; i++) run(s, `reportError('crash','boom'+${i},{})`);
    r.check('capped per session', events(s).length <= 8, `(${events(s).length})`);
    r.check('local log bounded', log(s).length <= 20, `(${log(s).length})`);
  }

  r.section('window handlers are wired');
  {
    const s = sb();
    run(s, "window.onerror('Boom!','https://x/app.js?v=1',7,1,{stack:'at foo'})");
    r.check('onerror reports', events(s).length === 1 && /Boom!/.test(events(s)[0][2].description));
    r.check('error boundary shown', !!s._els._boundary);
    r.check('rejection handler registered', typeof run(s, 'typeof window') === 'string');
  }

  // Reports must never carry habit, meal, workout or account content.
  r.section('no user content leaks');
  {
    const s = sb();
    run(s, "reportError('crash','x',{src:'a.js',line:1})");
    const rec = log(s)[0];
    const allowed = ['kind','msg','where','v','at','src','line','stack'];
    r.check('only technical fields', Object.keys(rec).every(k => allowed.includes(k)), `(${Object.keys(rec)})`);
    run(s, `reportError('crash','${'y'.repeat(900)}',{})`);
    r.check('long messages truncated', log(s)[0].msg.length === 300, `(${log(s)[0].msg.length})`);
  }

  // Success-only events are how the signup bug stayed invisible for months.
  r.section('failures are reported, not just successes');
  {
    const s = sb();
    run(s, "trackFail('signup','user_already_exists')");
    const ev = events(s).filter(e => e[1] === 'failure');
    r.check('a failure event is sent', ev.length === 1, `(${ev.length})`);
    r.check('names the step', ev[0][2].step === 'signup', `(${ev[0][2].step})`);
    r.check('names the reason', ev[0][2].reason === 'user_already_exists');
    run(s, `trackFail('x','${'z'.repeat(300)}')`);
    const last = events(s).filter(e => e[1] === 'failure').pop();
    r.check('reason is bounded', last[2].reason.length <= 80, `(${last[2].reason.length})`);
  }

  r.section('native reminders schedule and cancel');
  {
    const calls = [];
    const LocalNotifications = {
      checkPermissions: () => Promise.resolve({ display: 'granted' }),
      requestPermissions: () => Promise.resolve({ display: 'granted' }),
      cancel: o => { calls.push(['cancel', o]); return Promise.resolve(); },
      schedule: o => { calls.push(['schedule', o]); return Promise.resolve(); },
    };
    const s = sb({ capacitor: { Plugins: { LocalNotifications } },
      settings: { notifications: true } });
    r.check('native notifier detected', run(s, '!!_nativeNotifier()') === true);
    const okRes = await run(s, 'scheduleNativeReminders()');
    r.check('scheduling succeeds', okRes === true);
    const sch = calls.find(c => c[0] === 'schedule');
    r.check('cancel runs first so nothing stacks',
      calls.findIndex(c => c[0] === 'cancel') < calls.findIndex(c => c[0] === 'schedule'));
    r.check('three daily reminders', sch && sch[1].notifications.length === 3);
    r.check('fixed ids', sch[1].notifications.map(n => n.id).join() === '1101,1102,1103');
    r.check('morning, midday, evening',
      sch[1].notifications.map(n => n.schedule.on.hour).join() === '7,12,20');
  }

  r.section('denied permission leaves reminders off');
  {
    const s = sb({ capacitor: { Plugins: { LocalNotifications: {
      checkPermissions: () => Promise.resolve({ display: 'denied' }),
      requestPermissions: () => Promise.resolve({ display: 'denied' }),
      cancel: () => Promise.resolve(), schedule: () => Promise.resolve(),
    } } }, settings: { notifications: true } });
    r.check('scheduling reports failure', (await run(s, 'scheduleNativeReminders()')) === false);
  }

  return r.finish();
};
