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

  return r.finish();
};
