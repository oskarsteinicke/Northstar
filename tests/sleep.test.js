// Sleep: hours are derived from bedtime and wake, and the daily prompt.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js'];

// The shim's getElementById invents an element for any id and querySelector
// invents one for any selector, so "is a modal on screen?" cannot be asked
// without a real presence model. Give the overlay ids one: only what was
// actually appended to body counts as open. Everything else still auto-vivifies,
// which is what the inputs inside the modal need.
const PRESENCE = `
  _open = {};
  const _get = document.getElementById.bind(document);
  const _overlay = id => /^(sleep-prompt|weekly-recap-modal|premium-modal|ob-overlay)$/.test(id);
  document.getElementById = function (id) { return _overlay(id) ? (_open[id] || null) : _get(id); };
  document.querySelector = function () { return null; };
  document.body.appendChild = function (el) {
    if (el && el.id) { _open[el.id] = el; el.remove = function () { delete _open[el.id]; }; }
  };
  _emits = [];
  window.Arete = { emit: function (n, d) { _emits.push(n); }, on: function () {} };
`;

function sb(store) {
  const s = createSandbox({ files: FILES, store: Object.assign({ hvi_onboarded: 'true' }, store || {}) });
  run(s, `settings={}; curView='home'; track=function(){}; go=function(){};
          habits=[]; sleepLog=JSON.parse(localStorage.getItem('hvi_sleep_log')||'{}');
          reportError=function(){};`);
  run(s, PRESENCE);
  return s;
}
const t = s => run(s, 'today()');
const isOpen = s => run(s, `!!document.getElementById('sleep-prompt')`);
const emits = s => run(s, `_emits.join(',')`);

module.exports = function () {
  const r = createReporter('sleep');

  r.section('duration is computed from the two times');
  {
    const s = sb();
    const d = (b, w) => run(s, `sleepDuration('${b}','${w}')`);
    r.check('a night inside one day', d('01:00', '08:00') === 7);
    // The normal case: bedtime is yesterday, wake is today. Subtracting gives
    // a negative number unless midnight is handled.
    r.check('23:00 to 07:00 is 8h', d('23:00', '07:00') === 8, `(got ${d('23:00','07:00')})`);
    r.check('22:30 to 06:15 is 7.75h', d('22:30', '06:15') === 7.8, `(got ${d('22:30','06:15')})`);
    r.check('half hours survive', d('23:30', '07:00') === 7.5);
    r.check('an afternoon nap', d('13:00', '15:30') === 2.5);
    r.check('identical times are zero, not a full day', d('23:00', '23:00') === 0);
  }

  r.section('bad input is refused, not guessed');
  {
    const s = sb();
    const d = (b, w) => run(s, `sleepDuration(${JSON.stringify(b)},${JSON.stringify(w)})`);
    r.check('missing wake', d('23:00', '') === null);
    r.check('missing bedtime', d('', '07:00') === null);
    r.check('both missing', d(null, null) === null);
    r.check('not a time', d('bed', '07:00') === null);
    r.check('impossible hour', d('25:00', '07:00') === null);
    r.check('impossible minute', d('23:70', '07:00') === null);
  }

  r.section('the sleep screen writes hours from the times');
  {
    const s = sb();
    const key = t(s);
    run(s, `sleepLog['${key}']={bedtime:'23:00',wake:'06:30'};`);
    r.check('hours are derived', run(s, `recalcSleepHours('${key}')`) === 7.5);
    r.check('and stored on the entry', run(s, `sleepLog['${key}'].hours`) === 7.5);
  }

  // Apple Health and Google Fit write hours with no bedtime or wake. Deriving
  // unconditionally would overwrite a real synced night with zero.
  r.section('a synced night is not overwritten');
  {
    const s = sb();
    const key = t(s);
    run(s, `sleepLog['${key}']={hours:6.9};`);
    r.check('nothing to derive from', run(s, `recalcSleepHours('${key}')`) === null);
    r.check('the synced hours survive', run(s, `sleepLog['${key}'].hours`) === 6.9,
      '(a synced night was zeroed)');

    run(s, `sleepLog['${key}']={hours:6.9,bedtime:'23:00'};`);
    r.check('one time is still not enough', run(s, `recalcSleepHours('${key}')`) === null);
    r.check('hours still intact', run(s, `sleepLog['${key}'].hours`) === 6.9);
  }

  r.section('the prompt asks once a day');
  {
    const s = sb();
    run(s, 'showSleepPrompt()');
    r.check('it opens', isOpen(s) === true);
    r.check('today is marked asked',
      run(s, `localStorage.getItem('hvi_sleep_prompt_day')`) === t(s));

    run(s, 'dismissSleepPrompt()');
    r.check('skipping closes it', isOpen(s) === false);
    run(s, 'checkSleepPrompt()');
    r.check('and it does not come back the same day',
      isOpen(s) === false, '(asked twice in one day)');
  }

  r.section('the prompt stays away when it should');
  {
    const already = sb();
    const key = t(already);
    run(already, `sleepLog['${key}']={hours:7.5}; checkSleepPrompt();`);
    r.check('silent when already logged', isOpen(already) === false);

    const off = sb();
    run(off, 'settings.sleepPrompt=false; checkSleepPrompt();');
    r.check('silent when switched off', isOpen(off) === false, '(no way to turn it off)');

    const fresh = createSandbox({ files: FILES, store: {} });
    run(fresh, `settings={}; curView='home'; track=function(){}; go=function(){};
                habits=[]; sleepLog={}; reportError=function(){};`);
    run(fresh, PRESENCE);
    run(fresh, 'checkSleepPrompt()');
    r.check('silent before onboarding is done', isOpen(fresh) === false,
      '(prompt over the onboarding flow)');

    // Mondays fire the weekly recap on the same launch. Stacking a second
    // modal on top of it would cover a screen the user has not read yet.
    const busy = sb();
    run(busy, `const m=document.createElement('div'); m.id='weekly-recap-modal';
               document.body.appendChild(m); checkSleepPrompt();`);
    r.check('waits behind the weekly recap', isOpen(busy) === false, '(stacked on the recap)');
    r.check('and has not burned the day',
      run(busy, `localStorage.getItem('hvi_sleep_prompt_day')`) !== t(busy),
      '(day marked asked while it never showed)');
  }

  r.section('saving from the prompt');
  {
    const s = sb();
    const key = t(s);
    run(s, 'showSleepPrompt()');
    run(s, `document.getElementById('sp-bed').value='22:45';
            document.getElementById('sp-wake').value='06:45';
            saveSleepPrompt();`);
    r.check('hours are stored', run(s, `sleepLog['${key}'].hours`) === 8);
    r.check('both times are kept', run(s, `sleepLog['${key}'].bedtime`) === '22:45');
    r.check('it persists', JSON.parse(run(s, `localStorage.getItem('hvi_sleep_log')`))[key].hours === 8);
    r.check('the modal closes', isOpen(s) === false);
  }

  // connect.js listens for this to auto-complete a linked sleep habit at 7h+.
  r.section('logging sleep announces itself');
  {
    const s = sb();
    run(s, 'showSleepPrompt()');
    run(s, `document.getElementById('sp-bed').value='23:00';
            document.getElementById('sp-wake').value='07:00';
            saveSleepPrompt();`);
    r.check('sleep:logged is emitted', emits(s).includes('sleep:logged'),
      '(linked habits would never auto-complete)');
  }

  r.section('the total reads as time, not a decimal');
  {
    const s = sb();
    r.check('whole hours', run(s, 'formatSleep(8)') === '8h');
    r.check('and parts', run(s, 'formatSleep(7.5)') === '7h 30m');
    r.check('nothing logged', run(s, 'formatSleep(0)') === '—');
    r.check('undefined is not NaN', run(s, 'formatSleep(undefined)') === '—');
  }

  return r.finish();
};
