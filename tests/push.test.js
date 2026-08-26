// Web push: VAPID signing, per-timezone slots, dedupe and pruning.
const fs = require('fs'), vm = require('vm'), path = require('path');
const { webcrypto } = require('crypto');
const { APP, createSandbox, run, createReporter } = require('./harness');

// A throwaway keypair generated for these tests alone. The suite only needs a
// valid P-256 pair to prove the JWT is signed and verifiable; it has no reason
// to know the production key, and this file previously carried the real one
// into a public repo.
const PRIV = '{"kty":"EC","crv":"P-256","x":"vFR0_pibm0RbXr7-zMy0O8hM1svGcO3WZzI8kMBLFaY","y":"S-jZRXgwWwhp8dUKGJNSrTOfGxf4CJtBmvLpX9wgNGk","d":"t8qLICcu3bLx_f86jPmyG_sZNkIYaUIjTHQzJmpAZVM"}';
const PUB  = 'BLxUdP6Ym5tEW16-_szMtDvITNbLxnDt1mcyPJDASxWmS-jZRXgwWwhp8dUKGJNSrTOfGxf4CJtBmvLpX9wgNGk';

function kv(seed) {
  const d = Object.assign({}, seed);
  return { _d: d,
    get: k => Promise.resolve(k in d ? d[k] : null),
    put: (k, v) => { d[k] = v; return Promise.resolve(); },
    delete: k => { delete d[k]; return Promise.resolve(); },
    list: ({ prefix }) => Promise.resolve({
      keys: Object.keys(d).filter(k => k.startsWith(prefix || '')).map(name => ({ name })),
      list_complete: true }),
  };
}
function loadWorker(fetchImpl) {
  const calls = [];
  const sb = { console, JSON, Math, Date, Object, Array, String, Number, Promise, Error,
    URL, URLSearchParams, Set, Map, TextEncoder, TextDecoder, parseInt, parseFloat, isNaN, isFinite,
    crypto: webcrypto,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    Response: class { constructor(b, i) { this.body = b; this.status = (i && i.status) || 200; } },
    fetch: (url, opts) => { calls.push({ url: String(url), opts: opts || {} }); return fetchImpl(String(url), opts || {}); } };
  sb.globalThis = sb; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(APP, 'worker/worker.js'), 'utf8')
    .replace(/export\s+default\s*\{/, 'globalThis.__worker = {'), sb, { filename: 'worker.js' });
  return { sb, calls };
}
const accepted = () => Promise.resolve({ ok: true, status: 201 });
const T = Date.UTC(2026, 6, 30, 12, 0, 0);   // fixed noon UTC
const withFrozenNow = async fn => { const real = Date.now; Date.now = () => T; try { return await fn(); } finally { Date.now = real; } };

module.exports = async function () {
  const r = createReporter('push');

  r.section('the VAPID header is a real ES256 JWT');
  {
    const { sb } = loadWorker(accepted);
    const hdr = await vm.runInContext('vapidAuth', sb)('https://web.push.apple.com/x',
      { VAPID_PRIVATE_JWK: PRIV, VAPID_PUBLIC_KEY: PUB });
    r.check('vapid scheme', /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/.test(hdr));
    const [h, p, s] = hdr.match(/t=([^,]+)/)[1].split('.');
    const dec = b => JSON.parse(Buffer.from(b.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString());
    r.check('ES256', dec(h).alg === 'ES256');
    r.check('audience is the push origin', dec(p).aud === 'https://web.push.apple.com', `(${dec(p).aud})`);
    r.check('has a contact', /^mailto:/.test(dec(p).sub));
    r.check('expires within 24h', dec(p).exp < Math.floor(Date.now()/1000) + 86400);
    // The signature must verify against the public key the client ships
    const raw = Buffer.from(PUB.replace(/-/g,'+').replace(/_/g,'/'), 'base64');
    const key = await webcrypto.subtle.importKey('raw', raw, { name:'ECDSA', namedCurve:'P-256' }, false, ['verify']);
    const good = await webcrypto.subtle.verify({ name:'ECDSA', hash:'SHA-256' }, key,
      Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'), 'base64'), Buffer.from(`${h}.${p}`));
    r.check('signature verifies against the public key', good === true);
  }

  r.section('slot windows');
  {
    const { sb } = loadWorker(accepted);
    const due = iso => vm.runInContext('slotDueAt', sb)(new Date(iso));
    r.check('07:30 exactly', due('2026-07-30T07:30:00Z') === '07:30');
    r.check('07:59 still inside', due('2026-07-30T07:59:00Z') === '07:30');
    r.check('07:29 not yet', due('2026-07-30T07:29:00Z') === null);
    r.check('midday', due('2026-07-30T12:45:00Z') === '12:30');
    r.check('evening', due('2026-07-30T20:30:00Z') === '20:30');
    r.check('3am has no slot', due('2026-07-30T03:00:00Z') === null);
  }

  // The window was 30 minutes and the cron runs every 30 minutes, so each slot
  // had exactly one chance to land. A single skipped run lost the reminder for
  // the whole day, while the code claimed the next run would retry it.
  r.section('a missed run can still catch up');
  {
    const { sb } = loadWorker(accepted);
    const due = iso => vm.runInContext('slotDueAt', sb)(new Date(iso));
    r.check('08:00 still catches the 07:30 slot', due('2026-07-30T08:00:00Z') === '07:30',
      '(one missed cron run loses the day)');
    r.check('two hours late still counts', due('2026-07-30T09:30:00Z') === '07:30');
    r.check('but it gives up eventually', due('2026-07-30T10:31:00Z') === null);
    // Catch-up must never run into the following slot.
    r.check('never bleeds into the next slot', due('2026-07-30T12:30:00Z') === '12:30');
    r.check('and the last slot does not wrap past midnight', due('2026-07-30T23:31:00Z') === null);
  }

  r.section('catching up still cannot double-send');
  {
    const store = kv({ 'push:a': JSON.stringify({
      endpoint: 'https://push.example/a', tzOffset: -270, sent: { '07:30': '2026-07-30' } }) });
    const { sb, calls } = loadWorker(accepted);
    // 90 minutes past the slot: inside the new window, already delivered.
    const late = Date.UTC(2026, 6, 30, 13, 30, 0);
    const real = Date.now; Date.now = () => late;
    try {
      await vm.runInContext('runReminders', sb)(
        { HEALTH_KV: store, VAPID_PRIVATE_JWK: PRIV, VAPID_PUBLIC_KEY: PUB });
    } finally { Date.now = real; }
    r.check('a delivered slot is not resent during catch-up',
      calls.filter(c => c.url.includes('push.example')).length === 0, '(duplicate reminder)');
  }

  // This is the bug that made every reminder silently vanish: the keys were
  // never bound, so the guard returned on every tick with nothing to show.
  r.section('missing config is reported, not swallowed');
  {
    const store = kv({ 'push:a': JSON.stringify({
      endpoint: 'https://push.example/a', tzOffset: -270, sent: {} }) });
    const { sb, calls } = loadWorker(accepted);
    await withFrozenNow(() => vm.runInContext('runReminders', sb)({ HEALTH_KV: store }));
    r.check('nothing is sent without keys',
      calls.filter(c => c.url.includes('push.example')).length === 0);
    const diag = JSON.parse(store._d['diag:last_reminder_run'] || '{}');
    r.check('the run leaves a breadcrumb', !!diag.at, '(failure invisible again)');
    r.check('naming what is missing', (diag.missing || []).includes('VAPID_PRIVATE_JWK'),
      `(${JSON.stringify(diag.missing)})`);
    r.check('the breadcrumb is not mistaken for a subscriber',
      !Object.keys(store._d).some(k => k.startsWith('push:') && k.includes('diag')));
  }

  r.section('a healthy run records what it did');
  {
    const store = kv({ 'push:a': JSON.stringify({
      endpoint: 'https://push.example/a', tzOffset: -270, sent: {} }) });
    const { sb } = loadWorker(accepted);
    await withFrozenNow(() => vm.runInContext('runReminders', sb)(
      { HEALTH_KV: store, VAPID_PRIVATE_JWK: PRIV, VAPID_PUBLIC_KEY: PUB }));
    const diag = JSON.parse(store._d['diag:last_reminder_run'] || '{}');
    r.check('ok', diag.ok === true);
    r.check('counts the send', diag.sent === 1, `(sent=${diag.sent})`);
  }

  // A single unreadable record used to throw out of the loop and silently end
  // the run, so every subscriber listed after it got nothing.
  r.section('one broken subscriber does not stop the rest');
  {
    const store = kv({
      'push:a': JSON.stringify({ endpoint: 'https://push.example/a', tzOffset: -270, sent: {} }),
      'push:b': JSON.stringify({ endpoint: 'https://push.example/b', tzOffset: -270, sent: {} }),
    });
    const boom = new Set(['https://push.example/a']);
    const { sb, calls } = loadWorker(u =>
      boom.has(u) ? Promise.reject(new Error('network went away')) : accepted());
    await withFrozenNow(() => vm.runInContext('runReminders', sb)(
      { HEALTH_KV: store, VAPID_PRIVATE_JWK: PRIV, VAPID_PUBLIC_KEY: PUB }));
    r.check('the healthy subscriber still gets theirs',
      calls.some(c => c.url.endsWith('/b')), '(one failure ended the run)');
    r.check('the failure is counted',
      JSON.parse(store._d['diag:last_reminder_run']).failed === 1);
    r.check('and the failed one is not marked sent',
      !JSON.parse(store._d['push:a']).sent['07:30']);
  }

  r.section('delivery follows each subscriber\'s local time');
  {
    const store = kv({
      'push:a': JSON.stringify({ endpoint: 'https://push.example/a', tzOffset: -270, sent: {} }),
      'push:b': JSON.stringify({ endpoint: 'https://push.example/b', tzOffset: 0,    sent: {} }),
    });
    const { sb, calls } = loadWorker(accepted);
    await withFrozenNow(() => vm.runInContext('runReminders', sb)(
      { HEALTH_KV: store, VAPID_PRIVATE_JWK: PRIV, VAPID_PUBLIC_KEY: PUB }));
    const sent = calls.filter(c => c.url.startsWith('https://push.example'));
    r.check('only the subscriber at local 07:30', sent.length === 1 && sent[0].url.endsWith('/a'),
      `(${sent.map(s => s.url).join(', ')})`);
    r.check('sent with no payload', !sent[0].opts.body);
    r.check('carries the VAPID header', /^vapid t=/.test(sent[0].opts.headers.Authorization || ''));
    r.check('delivery recorded', JSON.parse(store._d['push:a']).sent['07:30'] === '2026-07-30');
  }

  r.section('a slot fires once per local day');
  {
    const store = kv({ 'push:a': JSON.stringify({
      endpoint: 'https://push.example/a', tzOffset: -270, sent: { '07:30': '2026-07-30' } }) });
    const { sb, calls } = loadWorker(accepted);
    await withFrozenNow(() => vm.runInContext('runReminders', sb)(
      { HEALTH_KV: store, VAPID_PRIVATE_JWK: PRIV, VAPID_PUBLIC_KEY: PUB }));
    r.check('already sent today is skipped', calls.filter(c => c.url.includes('push.example')).length === 0);

    const store2 = kv({ 'push:a': JSON.stringify({
      endpoint: 'https://push.example/a', tzOffset: -270, sent: { '07:30': '2026-07-29' } }) });
    const w2 = loadWorker(accepted);
    await withFrozenNow(() => vm.runInContext('runReminders', w2.sb)(
      { HEALTH_KV: store2, VAPID_PRIVATE_JWK: PRIV, VAPID_PUBLIC_KEY: PUB }));
    r.check('a new day sends again', w2.calls.filter(c => c.url.includes('push.example')).length === 1);
  }

  r.section('dead subscriptions are pruned, transient errors are not');
  {
    const gone = kv({ 'push:g': JSON.stringify({ endpoint: 'https://push.example/g', tzOffset: -270, sent: {} }) });
    const w1 = loadWorker(() => Promise.resolve({ ok: false, status: 410 }));
    await withFrozenNow(() => vm.runInContext('runReminders', w1.sb)(
      { HEALTH_KV: gone, VAPID_PRIVATE_JWK: PRIV, VAPID_PUBLIC_KEY: PUB }));
    r.check('410 removes it', !('push:g' in gone._d));

    // After a VAPID rotation the push service rejects every subscription made
    // under the old key with 403. Retrying those forever would mean the user
    // never re-subscribes and never gets another reminder.
    const stale = kv({ 'push:s': JSON.stringify({ endpoint: 'https://push.example/s', tzOffset: -270, sent: {} }) });
    const w3 = loadWorker(() => Promise.resolve({ ok: false, status: 403 }));
    await withFrozenNow(() => vm.runInContext('runReminders', w3.sb)(
      { HEALTH_KV: stale, VAPID_PRIVATE_JWK: PRIV, VAPID_PUBLIC_KEY: PUB }));
    r.check('403 after a key rotation removes it', !('push:s' in stale._d),
      '(client would never re-subscribe)');

    const flaky = kv({ 'push:x': JSON.stringify({ endpoint: 'https://push.example/x', tzOffset: -270, sent: {} }) });
    const w2 = loadWorker(() => Promise.resolve({ ok: false, status: 500 }));
    await withFrozenNow(() => vm.runInContext('runReminders', w2.sb)(
      { HEALTH_KV: flaky, VAPID_PRIVATE_JWK: PRIV, VAPID_PUBLIC_KEY: PUB }));
    r.check('a 500 keeps it for next time', 'push:x' in flaky._d);
    r.check('and is not marked sent', !JSON.parse(flaky._d['push:x']).sent['07:30']);
  }

  r.section('subscribe and unsubscribe');
  {
    const store = kv({});
    const { sb } = loadWorker(accepted);
    const env = { HEALTH_KV: store };
    let res = await vm.runInContext('handlePushSubscribe', sb)(
      { endpoint: 'https://push.example/a', keys: {}, tzOffset: -270 }, env, 'https://get-arete.com');
    r.check('stored', res.status === 200 && Object.keys(store._d).length === 1);

    const k = Object.keys(store._d)[0];
    store._d[k] = JSON.stringify(Object.assign(JSON.parse(store._d[k]), { sent: { '07:30': '2026-07-30' } }));
    await vm.runInContext('handlePushSubscribe', sb)(
      { endpoint: 'https://push.example/a', keys: {}, tzOffset: -240 }, env, 'https://get-arete.com');
    r.check('re-subscribing replaces rather than duplicates', Object.keys(store._d).length === 1);
    const rec = JSON.parse(Object.values(store._d)[0]);
    r.check('offset refreshed for DST', rec.tzOffset === -240, `(${rec.tzOffset})`);
    r.check('dedupe history survives', rec.sent['07:30'] === '2026-07-30');

    const bad = await vm.runInContext('handlePushSubscribe', sb)({ endpoint: 'http://insecure/x' }, env, 'https://get-arete.com');
    r.check('rejects a non-https endpoint', bad.status === 400);

    res = await vm.runInContext('handlePushUnsubscribe', sb)({ endpoint: 'https://push.example/a' }, env, 'https://get-arete.com');
    r.check('unsubscribe removes it', res.status === 200 && Object.keys(store._d).length === 0);
  }

  r.section('nothing runs without keys configured');
  {
    const store = kv({ 'push:a': JSON.stringify({ endpoint: 'https://push.example/a', tzOffset: -270, sent: {} }) });
    const { sb, calls } = loadWorker(accepted);
    await withFrozenNow(() => vm.runInContext('runReminders', sb)({ HEALTH_KV: store }));
    r.check('no pushes attempted', calls.length === 0);
    r.check('subscription untouched', 'push:a' in store._d);
  }

  r.section('the client subscribes and unsubscribes');
  {
    const s = createSandbox({ files: ['data.js', 'app.js'],
      fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) }) });
    run(s, `settings={}; curView='home'; track=function(){};`);
    r.check('web build has no native notifier', run(s, '_nativeNotifier()') === null);
    r.check('push support is detected from the platform', typeof run(s, 'pushSupported()') === 'boolean');
    r.check('iPhone in Safari is told to install first', run(s, `(function(){
      var ua=navigator.userAgent; navigator.userAgent='iPhone';
      var need=pushNeedsInstall(); navigator.userAgent=ua; return need;
    })()`) === true);
  }

  return r.finish();
};
