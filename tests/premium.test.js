// Entitlements and the free-tier limits they are supposed to enforce.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js','app.js','premium.js'];
const DAY = 86400000;

function sb(store) {
  const s = createSandbox({ files: FILES, store });
  run(s, `settings={}; curView='home'; track=function(){}; go=function(){};
          habits=JSON.parse(localStorage.getItem('hvi_habits')||'[]');`);
  return s;
}
const freeStore = extra => Object.assign({
  hvi_paywall_migrated: '1',   // past the one-time migration: not grandfathered
}, extra || {});

module.exports = function () {
  const r = createReporter('premium');

  // canAddHabit() read window.habits, but `habits` is a top-level `let` and so
  // never lands on window. The count was always 0 and the limit never applied.
  r.section('the free habit limit is enforced');
  {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: 'h' + i, name: 'H' + i }));
    const s = sb(freeStore({ hvi_habits: JSON.stringify(many) }));
    r.check('user is on the free plan', run(s, 'isPremium()') === false);
    r.check('blocked at 20 habits', run(s, 'canAddHabit()') === false, '(limit not enforced)');

    run(s, `habits = habits.slice(0, ${'2'});`);
    r.check('allowed under the limit', run(s, 'canAddHabit()') === true);

    run(s, `habits = habits.slice(0, 0);`);
    r.check('allowed with none', run(s, 'canAddHabit()') === true);
  }

  r.section('premium ignores the limit');
  {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: 'h' + i }));
    const s = sb(freeStore({ hvi_habits: JSON.stringify(many), hvi_plan: 'premium' }));
    r.check('premium detected', run(s, 'isPremium()') === true);
    r.check('no habit cap', run(s, 'canAddHabit()') === true);
  }

  r.section('trial window');
  {
    const fresh = sb(freeStore({ hvi_trial_start: String(Date.now() - 2 * DAY) }));
    r.check('active inside the trial', run(fresh, 'isTrialActive()') === true);
    r.check('trial grants premium', run(fresh, 'isPremium()') === true);
    r.check('days left is sensible', run(fresh, 'trialDaysLeft()') > 0);

    const expired = sb(freeStore({ hvi_trial_start: String(Date.now() - 99 * DAY) }));
    r.check('expired trial is not active', run(expired, 'isTrialActive()') === false);
    r.check('expired trial drops to free', run(expired, 'isPremium()') === false);
    r.check('days left is zero', run(expired, 'trialDaysLeft()') === 0);

    const none = sb(freeStore({}));
    r.check('no trial recorded means no trial', run(none, 'isTrialActive()') === false);
  }

  r.section('grandfathered users keep access');
  {
    const s = sb(freeStore({ hvi_grandfathered: 'true' }));
    r.check('treated as premium', run(s, 'isPremium()') === true);
    r.check('but not a paying subscriber', run(s, 'isPaidSubscriber()') === false,
      '(would offer them a billing portal they have no subscription in)');
  }

  r.section('paid status is distinguished from free access');
  {
    const paid = sb(freeStore({ hvi_plan: 'premium' }));
    r.check('local plan counts as paid', run(paid, 'isPaidSubscriber()') === true);
    const trial = sb(freeStore({ hvi_trial_start: String(Date.now() - DAY) }));
    r.check('a trial is not a subscription', run(trial, 'isPaidSubscriber()') === false);
  }

  r.section('gating a feature opens the paywall');
  {
    const s = sb(freeStore({}));
    run(s, `_paywallShown=0; showUpgradeModal=function(){ _paywallShown++; };`);
    const allowed = run(s, "requirePremium('coach')");
    r.check('free user is refused', allowed === false);
    r.check('paywall was shown', run(s, '_paywallShown') === 1);

    const p = sb(freeStore({ hvi_plan: 'premium' }));
    run(p, `_paywallShown=0; showUpgradeModal=function(){ _paywallShown++; };`);
    r.check('premium user passes', run(p, "requirePremium('coach')") === true);
    r.check('no paywall for premium', run(p, '_paywallShown') === 0);
  }

  // hvi_plan is a cache, not a grant. No client-side check can stop someone
  // typing it into devtools — what this stops is the forged flag surviving.
  r.section('a local premium flag the server does not back is cleared');
  {
    const sess = extra => JSON.stringify({ access_token: 't', refresh_token: 'r',
      user: Object.assign({ id: 'u1', user_metadata: {} }, extra || {}) });

    const forged = sb(freeStore({ hvi_plan: 'premium', hvi_session: sess() }));
    r.check('the forged flag reads as premium first', run(forged, 'isPremium()') === true);
    r.check('reconciling clears it', run(forged, 'reconcilePlan()') === true);
    r.check('and premium is gone', run(forged, 'isPremium()') === false,
      '(bypass survives a relaunch)');
  }

  r.section('a real subscriber is left alone');
  {
    const paid = sb(freeStore({ hvi_plan: 'premium', hvi_session: JSON.stringify({
      access_token: 't', user: { id: 'u1', user_metadata: { plan: 'premium' } } }) }));
    r.check('nothing to reconcile', run(paid, 'reconcilePlan()') === false);
    r.check('still premium', run(paid, 'isPremium()') === true, '(cleared a paying customer)');
  }

  r.section('a founder is left alone');
  {
    const f = sb(freeStore({ hvi_plan: 'premium', hvi_founder: '1',
      hvi_session: JSON.stringify({ access_token: 't',
        user: { id: 'u1', user_metadata: { founder: true } } }) }));
    r.check('not cleared', run(f, 'reconcilePlan()') === false);
    r.check('still premium', run(f, 'isPremium()') === true, '(cleared free access)');
  }

  // The checkout return marks the flag before the Stripe webhook lands.
  // Clearing it straight away would undo a purchase the user just made.
  r.section('a purchase whose webhook has not landed is honoured');
  {
    const fresh = sb(freeStore({ hvi_plan: 'premium',
      hvi_plan_since: String(Date.now() - 60000),
      hvi_session: JSON.stringify({ access_token: 't', user: { id: 'u1', user_metadata: {} } }) }));
    r.check('a minute old is kept', run(fresh, 'reconcilePlan()') === false,
      '(a real purchase would be revoked)');

    const stale = sb(freeStore({ hvi_plan: 'premium',
      hvi_plan_since: String(Date.now() - 40 * 3600 * 1000),
      hvi_session: JSON.stringify({ access_token: 't', user: { id: 'u1', user_metadata: {} } }) }));
    r.check('but not two days later', run(stale, 'reconcilePlan()') === true);
  }

  r.section('a signed-out user is not touched');
  {
    const guest = sb(freeStore({ hvi_plan: 'premium' }));
    r.check('nothing to check against', run(guest, 'reconcilePlan()') === false);
    r.check('offline use keeps working', run(guest, 'isPremium()') === true,
      '(guest locked out with no way to verify)');
  }

  return r.finish();
};
