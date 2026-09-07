// Share and invite prompts.
//
// Every sharing mechanic in the app was a button nobody found, so none of them
// ever fired. These surface the same machinery at the moments worth offering
// it. The constraint that matters is restraint: each prompt is offered once,
// ever, and never on top of another overlay.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js'];

// Only what was appended to body counts as on screen; the shim invents an
// element for any id otherwise, so presence cannot be asked without this.
const PRESENCE = `
  _open = {};
  const _get = document.getElementById.bind(document);
  const _overlay = id => /^(milestone-prompt|sleep-prompt|weekly-recap-modal|premium-modal|ob-overlay)$/.test(id);
  document.getElementById = function (id) { return _overlay(id) ? (_open[id] || null) : _get(id); };
  document.body.appendChild = function (el) {
    if (el && el.id) { _open[el.id] = el; el.remove = function () { delete _open[el.id]; }; }
  };
  shareDailyCard = function () { window._shared = true; };
`;

function sb(streak, store) {
  const habits = [{ id: 'h1', name: 'Read', category: 'mind' }];
  const log = { h1: { streak, lastCompletedDate: '2026-01-01', completedToday: true } };
  const s = createSandbox({
    files: FILES,
    store: Object.assign({ hvi_onboarded: 'true' }, store || {}),
  });
  run(s, `settings={}; curView='home'; track=function(){}; go=function(){};
          reportError=function(){};
          habits=${JSON.stringify(habits)}; log=${JSON.stringify(log)};`);
  run(s, PRESENCE);
  return s;
}
const open = s => run(s, `!!document.getElementById('milestone-prompt')`);
const body = s => run(s, `(document.getElementById('milestone-prompt')||{}).innerHTML`) || '';

module.exports = function () {
  const r = createReporter('milestones');

  r.section('a streak milestone is offered');
  {
    const s = sb(7);
    run(s, 'checkMilestones()');
    r.check('the prompt appears at 7 days', open(s) === true, '(milestone never surfaced)');
    r.check('it names the milestone', /7 days/.test(body(s)));
    r.check('and offers to share', /Share it/.test(body(s)));
  }

  r.section('short of a milestone, nothing happens');
  {
    const s = sb(4);
    run(s, 'checkMilestones()');
    r.check('day 4 is not a milestone', open(s) === false, '(prompting on ordinary days)');
  }

  // The whole risk of this feature is nagging. A milestone already offered must
  // never come back, however many times the habit is tapped.
  r.section('each milestone is offered exactly once');
  {
    const s = sb(7);
    run(s, 'checkMilestones()');
    run(s, 'dismissMilestonePrompt()');
    run(s, 'checkMilestones()');
    r.check('it does not return', open(s) === false, '(same milestone offered twice)');

    run(s, `log.h1.streak = 30; checkMilestones();`);
    r.check('but the next one does', open(s) === true);
    r.check('naming the new milestone', /30 days/.test(body(s)));
  }

  r.section('passing several at once offers only the highest');
  {
    const s = sb(120);
    run(s, 'checkMilestones()');
    r.check('offers 100, not 7', /100 days/.test(body(s)), `(${body(s).slice(0, 40)})`);
  }

  r.section('it never stacks on another overlay');
  {
    const s = sb(7);
    run(s, `const m=document.createElement('div'); m.id='sleep-prompt';
            document.body.appendChild(m); checkMilestones();`);
    r.check('nothing shown over the sleep prompt', open(s) === false, '(two modals at once)');
    // Crucially the milestone must not be burned while it could not be shown.
    run(s, `document.getElementById('sleep-prompt').remove(); checkMilestones();`);
    r.check('and the milestone was not spent', open(s) === true,
      '(milestone lost because another modal was up)');
  }

  r.section('it can be switched off');
  {
    const s = sb(30);
    run(s, 'settings.milestonePrompts=false; checkMilestones();');
    r.check('silent when off', open(s) === false, '(no way to turn it off)');
  }

  r.section('before onboarding, nothing');
  {
    const s = createSandbox({ files: FILES, store: {} });
    run(s, `settings={}; curView='home'; track=function(){}; go=function(){};
            reportError=function(){};
            habits=[{id:'h1'}]; log={h1:{streak:30}};`);
    run(s, PRESENCE);
    run(s, 'checkMilestones()');
    r.check('silent', open(s) === false);
  }

  // ── invite ──────────────────────────────────────────────────────────────
  const signedIn = { hvi_session: JSON.stringify({ access_token: 't', user: { id: 'u1' } }) };

  r.section('a leaderboard with nobody on it is worth mentioning');
  {
    const s = sb(5, signedIn);
    run(s, 'checkInvitePrompt()');
    r.check('offered', open(s) === true, '(invite never surfaced)');
    r.check('it says what is missing', /Nobody to beat/.test(body(s)));
  }

  r.section('a leaderboard that already has people is left alone');
  {
    const s = sb(5, Object.assign({
      hvi_lb_summary: JSON.stringify({ groups: 1, maxMembers: 4 }) }, signedIn));
    run(s, 'checkInvitePrompt()');
    r.check('not offered', open(s) === false, '(nagging someone with a full group)');
  }

  r.section('a solo group still counts as alone');
  {
    const s = sb(5, Object.assign({
      hvi_lb_summary: JSON.stringify({ groups: 1, maxMembers: 1 }) }, signedIn));
    run(s, 'checkInvitePrompt()');
    r.check('offered', open(s) === true, '(a group of one is just a list)');
  }

  r.section('the invite waits for some momentum');
  {
    const s = sb(1, signedIn);
    run(s, 'checkInvitePrompt()');
    r.check('not on day one', open(s) === false, '(nothing to compare yet)');
  }

  r.section('a guest is not asked to invite');
  {
    const s = sb(5);
    run(s, 'checkInvitePrompt()');
    r.check('needs an account first', open(s) === false);
  }

  r.section('the invite is offered once');
  {
    const s = sb(5, signedIn);
    run(s, 'checkInvitePrompt(); dismissMilestonePrompt(); checkInvitePrompt();');
    r.check('never twice', open(s) === false, '(repeat invite nag)');
  }

  return r.finish();
};
