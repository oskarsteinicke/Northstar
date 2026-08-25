// Web push: VAPID signing, per-timezone slots, dedupe and pruning.
const fs = require('fs'), vm = require('vm'), path = require('path');
const { webcrypto } = require('crypto');
const { APP, createSandbox, run, createReporter } = require('./harness');

const PRIV = '{"kty":"EC","crv":"P-256","x":"GfaT2Qwz9ilbPhETgFbAHqDQYVBW1DMkzldzGXAc6U8","y":"EVggoJ-Q9ni5L51r3NehpNAEHmZlC5rXppwYuk2llnM","d":"gGiajDYA7UBJ84tm_0yqONggxszBdQde1ZcF6j0Yn-w"}';
const PUB  = 'BBn2k9kMM_YpWz4RE4BWwB6g0GFQVtQzJM5XcxlwHOlPEVggoJ-Q9ni5L51r3NehpNAEHmZlC5rXppwYuk2llnM';

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
    r.check('08:00 has passed', due('2026-07-30T08:00:00Z') === null);
    r.check('07:29 not yet', due('2026-07-30T07:29:00Z') === null);
    r.check('midday', due('2026-07-30T12:45:00Z') === '12:30');
    r.check('evening', due('2026-07-30T20:30:00Z') === '20:30');
    r.check('3am has no slot', due('2026-07-30T03:00:00Z') === null);
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
