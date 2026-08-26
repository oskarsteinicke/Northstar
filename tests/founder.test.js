// Founder access: the first 50 accounts are granted premium permanently by the
// server. The client never decides who qualifies — it asks and records.
const { createSandbox, run, createReporter } = require('./harness');

const FILES = ['data.js', 'app.js', 'premium.js'];
const UID = 'user-abc-123';

// A signed-in sandbox whose /founder/claim call answers with `reply`.
function sb(reply, store) {
  const calls = [];
  const s = createSandbox({
    files: FILES,
    store: Object.assign({
      hvi_paywall_migrated: '1',       // past migration: not grandfathered
      hvi_session: JSON.stringify({
        access_token: 'tok', refresh_token: 'rt', user: { id: UID, user_metadata: {} },
      }),
    }, store || {}),
    fetch: (url, opts) => {
      calls.push({ url: String(url), opts: opts || {} });
      const body = typeof reply === 'function' ? reply(String(url)) : reply;
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      });
    },
  });
  run(s, `settings={}; curView='home'; track=function(){}; go=function(){};
          habits=[]; setSyncStatus=function(){};`);
  s._calls = calls;
  return s;
}

const claims = s => s._calls.filter(c => c.url.includes('/founder/claim'));

module.exports = async function () {
  const r = createReporter('founder');

  r.section('a founder is granted premium');
  {
    const s = sb({ ok: true, founder: true, n: 7, limit: 50 });
    r.check('starts on the free plan', run(s, 'isPremium()') === false);

    await run(s, 'claimFounderAccess()');

    r.check('the claim was sent', claims(s).length === 1);
    r.check('and carries the bearer token',
      (claims(s)[0].opts.headers || {}).Authorization === 'Bearer tok');
    r.check('premium is on', run(s, 'isPremium()') === true, '(grant did not stick)');
    r.check('marked as a founder', run(s, 'isFounder()') === true);
    r.check('the number is kept', run(s, 'founderNumber()') === 7);
  }

  // Founders carry plan:'premium' in exactly the fields a paying subscriber
  // uses. Without an explicit test they read as subscribers and get offered a
  // billing portal for a Stripe customer that was never created.
  r.section('a founder is not treated as a paying subscriber');
  {
    const s = sb({ ok: true, founder: true, n: 3, limit: 50 });
    await run(s, 'claimFounderAccess()');
    r.check('not a paid subscriber', run(s, 'isPaidSubscriber()') === false,
      '(would open a billing portal with no customer)');
    const card = run(s, 'renderPremiumSettingsCard()');
    r.check('the card says Founder', /Founder/.test(card));
    r.check('and offers no subscription management', !/Manage subscription/.test(card),
      '(dead button: no Stripe customer exists)');
    r.check('and shows which account they were', /#3/.test(card));
  }

  r.section('past the limit, nothing is granted');
  {
    const s = sb({ ok: true, founder: false, n: 51, limit: 50 });
    await run(s, 'claimFounderAccess()');
    r.check('still on the free plan', run(s, 'isPremium()') === false, '(granted past the cap)');
    r.check('not a founder', run(s, 'isFounder()') === false);
    const card = run(s, 'renderPremiumSettingsCard()');
    r.check('the upsell is still shown', /Go Premium/.test(card));
  }

  // The claim runs on every launch, so a repeat must be free. The server is
  // idempotent per user id, but the client should not be asking at all.
  r.section('the claim is asked once per account');
  {
    const s = sb({ ok: true, founder: true, n: 4, limit: 50 });
    await run(s, 'claimFounderAccess()');
    await run(s, 'claimFounderAccess()');
    await run(s, 'claimFounderAccess()');
    r.check('only one request', claims(s).length === 1, `(sent ${claims(s).length})`);

    // A different account on the same device must get its own answer.
    run(s, `localStorage.setItem('hvi_session', JSON.stringify({
      access_token:'tok2', refresh_token:'rt2', user:{ id:'someone-else', user_metadata:{} } }));`);
    await run(s, 'claimFounderAccess()');
    r.check('a second account still asks', claims(s).length === 2,
      '(one account\'s answer reused for another)');
  }

  r.section('signed out, nothing happens');
  {
    const s = sb({ ok: true, founder: true, n: 1, limit: 50 }, { hvi_session: '' });
    const out = await run(s, 'claimFounderAccess()');
    r.check('no request is made', claims(s).length === 0);
    r.check('and it returns nothing', out === null);
  }

  r.section('a failing server changes nothing');
  {
    const s = sb({ error: 'Not configured' });
    const out = await run(s, 'claimFounderAccess()');
    r.check('no premium is granted', run(s, 'isPremium()') === false);
    r.check('returns nothing', out === null);
    // Not recording the answer means the next launch retries, which is what
    // should happen when the Worker was simply down.
    r.check('the failure is not cached',
      run(s, `localStorage.getItem('hvi_founder_checked')`) !== UID);
  }

  return r.finish();
};
