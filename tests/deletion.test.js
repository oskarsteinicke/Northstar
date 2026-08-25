// Account deletion: the worker's authorisation boundary and ordering, plus the
// client flow. Irreversible, so the failure modes matter more than the happy path.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { APP, createSandbox, run, createReporter } = require('./harness');

// ── worker sandbox ────────────────────────────────────────────────────────
function loadWorker(fetchImpl) {
  const calls = [];
  const sb = {
    console, JSON, Math, Date, Object, Array, String, Number, Promise, Error,
    URL, URLSearchParams, Set, Map, TextEncoder, TextDecoder,
    parseInt, parseFloat, isNaN, isFinite,
    crypto: require('crypto').webcrypto,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    Response: class { constructor(b, i) { this.body = b; this.status = (i && i.status) || 200; } },
    fetch: (url, opts) => {
      calls.push({ url: String(url), method: (opts && opts.method) || 'GET', opts: opts || {} });
      return fetchImpl(String(url), opts || {});
    },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  const src = fs.readFileSync(path.join(APP, 'worker/worker.js'), 'utf8')
    .replace(/export\s+default\s*\{/, 'globalThis.__worker = {');
  vm.runInContext(src, sb, { filename: 'worker.js' });
  return { sb, calls };
}
const ENV = { SUPABASE_SERVICE_KEY: 'svc', STRIPE_SECRET_KEY: 'sk_test' };
const ok = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj), text: () => Promise.resolve('') });
const err = status => Promise.resolve({ ok: false, status, json: () => Promise.resolve({}), text: () => Promise.resolve('e') });
const req = token => ({ headers: { get: k => (k === 'Authorization' ? (token ? `Bearer ${token}` : '') : null) } });

async function callDelete(fetchImpl, token) {
  const { sb, calls } = loadWorker(fetchImpl);
  const res = await vm.runInContext('handleAccountDelete', sb)(req(token), ENV, 'https://get-arete.com');
  let body = {}; try { body = JSON.parse(res.body); } catch {}
  return { status: res.status, body, calls };
}
const happy = url => url.includes('/auth/v1/user') ? ok({ id: 'U1', user_metadata: {} }) : ok({});

// ── client sandbox ────────────────────────────────────────────────────────
function client(opts) {
  const s = createSandbox({
    files: ['data.js', 'app.js', 'profile.js'],
    fetch: opts.fetch,
    store: Object.assign({
      hvi_session: JSON.stringify({ access_token: 'tok', user: { id: 'U1' } }),
      hvi_habits: '[{"id":"h1"}]', hvi_workout_log: '{"d":1}',
      hvi_error_log: '[]', hvi_guest: '1', unrelated_key: 'keep-me',
    }, opts.store),
  });
  if (opts.online === false) s.navigator.onLine = false;
  run(s, `settings={}; curView='stats'; track=function(){};`);
  return s;
}

module.exports = async function () {
  const r = createReporter('deletion');

  // Identity comes from the caller's own token, never the request body.
  r.section('a caller can only delete themselves');
  {
    const { status, calls } = await callDelete(happy, 'tokenU1');
    r.check('succeeds with a valid token', status === 200, `(${status})`);
    const del = calls.find(c => c.method === 'DELETE' && c.url.includes('/auth/v1/admin/users/'));
    r.check('deletes the id from the token exchange', !!del && del.url.endsWith('/U1'), `(${del && del.url})`);
    r.check('no other user touched', calls.filter(c => c.method === 'DELETE').every(c => c.url.includes('U1')));
    const me = calls.find(c => c.url.includes('/auth/v1/user'));
    r.check('the caller token is what is exchanged', (me.opts.headers.Authorization || '') === 'Bearer tokenU1');
  }

  r.section('unauthenticated callers are refused');
  {
    const none = await callDelete(happy, '');
    r.check('no token -> 401', none.status === 401, `(${none.status})`);
    r.check('nothing deleted', !none.calls.some(c => c.method === 'DELETE'));
    const forged = await callDelete(url => url.includes('/auth/v1/user') ? err(401) : ok({}), 'forged');
    r.check('bad token -> 401', forged.status === 401, `(${forged.status})`);
    r.check('nothing deleted for a forged token', !forged.calls.some(c => c.method === 'DELETE'));
  }

  r.section('data goes before the login');
  {
    const { calls } = await callDelete(happy, 'tokenU1');
    const at = u => calls.findIndex(c => c.method === 'DELETE' && c.url.includes(u));
    const data = at('hvi_data'), lb = at('leaderboard_members'), user = at('/admin/users/');
    r.check('synced data deleted', data >= 0);
    r.check('leaderboard membership deleted', lb >= 0);
    r.check('the login goes last', user > data && user > lb, `(data ${data}, lb ${lb}, user ${user})`);
  }

  // Better to leave an account reachable than orphan its rows behind a deleted
  // login nobody can authenticate as to retry.
  r.section('a failed wipe aborts before deleting the login');
  {
    const res = await callDelete(url =>
      url.includes('/auth/v1/user') ? ok({ id: 'U1', user_metadata: {} })
      : url.includes('hvi_data') ? err(500) : ok({}), 'tokenU1');
    r.check('reports an error', res.status === 500, `(${res.status})`);
    r.check('login left intact', !res.calls.some(c => c.method === 'DELETE' && c.url.includes('/admin/users/')));
  }

  // Deleting the login while billing continues would leave someone paying with
  // no way to sign in and stop it, so this fails closed.
  r.section('subscriptions are cancelled first, and fail closed');
  {
    const withSub = url =>
      url.includes('/auth/v1/user') ? ok({ id: 'U1', user_metadata: { stripe_customer: 'cus_1' } })
      : url.includes('/subscriptions?customer=') ? ok({ data: [
          { id: 'sub_live', status: 'active' }, { id: 'sub_old', status: 'canceled' }] })
      : ok({});
    const res = await callDelete(withSub, 'tokenU1');
    r.check('deletion succeeds', res.status === 200, `(${res.status})`);
    const cancel = res.calls.find(c => c.method === 'DELETE' && c.url.includes('/subscriptions/'));
    r.check('the live subscription is cancelled', !!cancel && cancel.url.includes('sub_live'));
    r.check('an already-cancelled one is left alone', !res.calls.some(c => c.url.includes('sub_old') && c.method === 'DELETE'));
    const ci = res.calls.findIndex(c => c.method === 'DELETE' && c.url.includes('/subscriptions/'));
    const ui = res.calls.findIndex(c => c.method === 'DELETE' && c.url.includes('/admin/users/'));
    r.check('cancelled before the account is removed', ci < ui, `(cancel ${ci}, user ${ui})`);

    const fail = await callDelete(url =>
      url.includes('/auth/v1/user') ? ok({ id: 'U1', user_metadata: { stripe_customer: 'cus_1' } })
      : url.includes('/subscriptions?customer=') ? ok({ data: [{ id: 'sub_live', status: 'active' }] })
      : url.includes('/subscriptions/sub_live') ? err(500) : ok({}), 'tokenU1');
    r.check('a failed cancellation blocks deletion', fail.status === 502, `(${fail.status})`);
    r.check('the account is untouched', !fail.calls.some(c => c.method === 'DELETE' && c.url.includes('/admin/users/')));
    r.check('the error says what to do', /subscription/i.test(fail.body.error || ''));
  }

  r.section('no subscription means Stripe is never contacted');
  {
    const res = await callDelete(happy, 'tokenU1');
    r.check('no Stripe calls', !res.calls.some(c => c.url.includes('stripe.com')));
  }

  // The device is only wiped once the server confirms, so a failure can never
  // sign someone out of an account that still exists.
  r.section('the client wipes only after the server confirms');
  {
    const s = client({ fetch: url => url.includes('/account/delete')
      ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) })
      : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }) });
    const res = await run(s, 'deleteAccount()');
    r.check('reports success', res && res.ok === true, `(${JSON.stringify(res)})`);
    const call = s._fetches.find(f => f.url.includes('/account/delete'));
    r.check('posts with a bearer token', !!call && call.opts.method === 'POST' && /Bearer /.test(call.opts.headers.Authorization || ''));
    run(s, 'wipeLocalData()');
    const left = Object.keys(s.localStorage._d).filter(k => k.startsWith('hvi_'));
    r.check('every hvi_ key removed', left.length === 0, `(left: ${left})`);
    r.check('other keys untouched', s.localStorage._d.unrelated_key === 'keep-me');
  }

  r.section('a failed deletion leaves the device intact');
  {
    const bad = url => url.includes('/account/delete')
      ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Could not remove all data' }) })
      : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    const s = client({ fetch: bad });
    const res = await run(s, 'deleteAccount()');
    r.check('returns an error', !!(res && res.error));
    r.check('local data still there', !!s.localStorage._d.hvi_habits);
    r.check('still signed in', !!s.localStorage._d.hvi_session);

    const off = client({ fetch: bad, online: false });
    const r2 = await run(off, 'deleteAccount()');
    r.check('offline refused up front', /offline/i.test((r2 && r2.error) || ''), `(${r2 && r2.error})`);
    r.check('no request attempted', !off._fetches.some(f => f.url.includes('/account/delete')));

    const exp = client({ fetch: url => url.includes('/account/delete')
      ? Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) })
      : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }) });
    const r3 = await run(exp, 'deleteAccount()');
    r.check('expired session is recoverable', /sign in again/i.test((r3 && r3.error) || ''), `(${r3 && r3.error})`);
    r.check('nothing wiped', !!exp.localStorage._d.hvi_session);
  }

  r.section('the confirmation gate');
  {
    const s = client({ fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) }) });
    run(s, 'openDeleteAccount()');
    const html = s._els['del-acct-modal'].innerHTML;
    r.check('lists what is removed', /Progress photos/.test(html));
    r.check('warns it cannot be undone', /cannot be undone/i.test(html));
    r.check('confirm starts disabled', /id="del-acct-go" disabled/.test(html));
    run(s, "document.getElementById('del-acct-input').value='delete me';_delAcctCheck()");
    r.check('wrong text keeps it disabled', s._els['del-acct-go'].disabled === true);
    run(s, "document.getElementById('del-acct-input').value='delete';_delAcctCheck()");
    r.check('typing DELETE enables it', s._els['del-acct-go'].disabled === false);
    run(s, "document.getElementById('del-acct-input').value='nope'");
    await run(s, '_delAcctConfirm()');
    r.check('confirm re-checks the text', !s._fetches.some(f => f.url.includes('/account/delete')));
  }

  return r.finish();
};
