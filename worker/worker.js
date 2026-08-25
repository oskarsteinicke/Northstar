// Cloudflare Worker — Arete API Proxy (Gemini + OAuth + Health + Stripe)
// Deploy: npx wrangler deploy
// Secrets needed:
//   GEMINI_KEY            — Google Gemini API key
//   GROQ_KEY              — Groq API key (free tier, fallback for diet AI)
//   HEALTH_TOKEN          — Bearer token for Apple Health Shortcut
//   GOOGLE_CLIENT_ID      — Google OAuth client ID
//   GOOGLE_SECRET         — Google OAuth client secret
//   STRAVA_CLIENT_ID      — Strava OAuth client ID
//   STRAVA_SECRET         — Strava OAuth client secret
//   FITBIT_CLIENT_ID      — Fitbit OAuth client ID
//   FITBIT_SECRET         — Fitbit OAuth client secret
//   WHOOP_CLIENT_ID       — Whoop OAuth client ID
//   WHOOP_SECRET          — Whoop OAuth client secret
//   STRIPE_SECRET_KEY     — Stripe secret key (sk_live_… or sk_test_…)
//   STRIPE_WEBHOOK_SECRET — Stripe webhook signing secret (whsec_…)
//   STRIPE_PRICE_MONTHLY  — Stripe price ID for $7.99/mo Premium
//   STRIPE_PRICE_YEARLY   — Stripe price ID for $59/yr Premium
//   SUPABASE_SERVICE_KEY  — Supabase service_role key (updates user plan metadata)
//   N8N_WELCOME_WEBHOOK_URL — n8n webhook URL POSTed to on each new signup

//   VAPID_PRIVATE_JWK     — Web push signing key (JWK). Set via: wrangler secret put VAPID_PRIVATE_JWK
//   VAPID_PUBLIC_KEY      — Web push public key, must match VAPID_PUBLIC_KEY in app.js

//   HEALTH_KV             — KV namespace for Apple Health data and push subscriptions

const ALLOWED_ORIGINS = [
  'https://get-arete.com',
  'https://www.get-arete.com',
  'https://oskarsteinicke.github.io',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:5500'
];

const MODEL = 'gemini-2.5-flash';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function cors(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) }
  });
}

// OAuth service configs
function getOAuthConfig(service, env) {
  const configs = {
    googlefit: {
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_SECRET
    },
    strava: {
      tokenUrl: 'https://www.strava.com/oauth/token',
      clientId: env.STRAVA_CLIENT_ID,
      clientSecret: env.STRAVA_SECRET
    },
    fitbit: {
      tokenUrl: 'https://api.fitbit.com/oauth2/token',
      clientId: env.FITBIT_CLIENT_ID,
      clientSecret: env.FITBIT_SECRET
    },
    whoop: {
      tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
      clientId: env.WHOOP_CLIENT_ID,
      clientSecret: env.WHOOP_SECRET
    }
  };
  return configs[service] || null;
}

async function handleOAuthExchange(body, env, origin) {
  const { service, code, redirect_uri } = body;
  const cfg = getOAuthConfig(service, env);
  if (!cfg) return jsonResponse({ error: 'Unknown service' }, 400, origin);
  if (!cfg.clientId || !cfg.clientSecret) return jsonResponse({ error: `${service} not configured` }, 400, origin);

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret
  });

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  // Fitbit requires Basic auth header
  if (service === 'fitbit') {
    headers['Authorization'] = 'Basic ' + btoa(cfg.clientId + ':' + cfg.clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, { method: 'POST', headers, body: params.toString() });
  const data = await res.json();

  if (!res.ok) return jsonResponse({ error: data.error_description || data.error || 'Token exchange failed' }, res.status, origin);

  // Normalize response
  const result = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    token_type: data.token_type || 'Bearer'
  };

  // Strava includes athlete info
  if (data.athlete) result.athlete = { id: data.athlete.id, firstname: data.athlete.firstname };

  return jsonResponse(result, 200, origin);
}

async function handleOAuthRefresh(body, env, origin) {
  const { service, refresh_token } = body;
  const cfg = getOAuthConfig(service, env);
  if (!cfg) return jsonResponse({ error: 'Unknown service' }, 400, origin);
  if (!cfg.clientId || !cfg.clientSecret) return jsonResponse({ error: `${service} not configured` }, 400, origin);

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret
  });

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (service === 'fitbit') {
    headers['Authorization'] = 'Basic ' + btoa(cfg.clientId + ':' + cfg.clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, { method: 'POST', headers, body: params.toString() });
  const data = await res.json();

  if (!res.ok) return jsonResponse({ error: data.error_description || data.error || 'Refresh failed' }, res.status, origin);

  return jsonResponse({
    access_token: data.access_token,
    refresh_token: data.refresh_token || refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000
  }, 200, origin);
}

async function handleHealth(request, env, origin) {
  if (!env.HEALTH_TOKEN) return jsonResponse({ error: 'Health not configured' }, 500, origin);
  if (!env.HEALTH_KV) return jsonResponse({ error: 'KV not bound' }, 500, origin);

  const auth = (request.headers.get('Authorization') || '').replace('Bearer ', '');
  if (auth !== env.HEALTH_TOKEN) return jsonResponse({ error: 'Unauthorized' }, 401, origin);

  if (request.method === 'POST') {
    const body = await request.json();
    const date = body.date;
    if (!date) return jsonResponse({ error: 'Missing date' }, 400, origin);
    await env.HEALTH_KV.put(`health:${date}`, JSON.stringify(body), { expirationTtl: 30 * 86400 });
    return jsonResponse({ ok: true, date }, 200, origin);
  }

  if (request.method === 'GET') {
    const days = parseInt(new URL(request.url).searchParams.get('days') || '7');
    const results = {};
    const now = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const val = await env.HEALTH_KV.get(`health:${key}`);
      if (val) results[key] = JSON.parse(val);
    }
    return jsonResponse(results, 200, origin);
  }

  return jsonResponse({ error: 'Method not allowed' }, 405, origin);
}

// ── STRIPE ──────────────────────────────────────────────────────────────────
const STRIPE_API = 'https://api.stripe.com/v1';
const SUPABASE_URL = 'https://socflncohsenjptgkkax.supabase.co';

async function stripeRequest(path, params, env) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  return res.json();
}

// Update Supabase user metadata (requires service_role key). Merges fields.
async function updateUserMeta(userId, meta, env) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_metadata: meta }),
  });
  return res.ok;
}

// ── AI ABUSE GUARD ────────────────────────────────────────────────────────
// The AI proxy has to stay open: Arete works without an account, so guests use
// the coach and the food scanner. That also means anyone who learns this URL
// can spend the Gemini key — CORS does not stop a non-browser client. Limit by
// IP instead of authenticating.
//
// KV is eventually consistent so the count is approximate, which is fine: the
// job is to stop a script hammering the endpoint, not to be exact. Fails open,
// because a storage hiccup must never take the coach down for real users.
const AI_LIMIT_PER_HOUR = 40;

async function aiRateLimited(request, env) {
  if (!env.HEALTH_KV) return false;
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!ip) return false;
  const bucket = Math.floor(Date.now() / 3600000);
  const key = `rl:ai:${bucket}:${ip}`;
  try {
    const n = parseInt(await env.HEALTH_KV.get(key) || '0', 10) || 0;
    if (n >= AI_LIMIT_PER_HOUR) return true;
    await env.HEALTH_KV.put(key, String(n + 1), { expirationTtl: 7200 });
  } catch { return false; }
  return false;
}

// ── WEB PUSH ──────────────────────────────────────────────────────────────
// Reminders for the installed web app. Pushes carry no payload, so only VAPID
// auth is needed and the RFC 8291 encryption step is skipped entirely; the
// service worker writes the wording locally. Nothing about a person's habits
// or meals passes through Apple's or Google's push service.
//
// Subscriptions live in HEALTH_KV under a `push:` prefix, reusing the existing
// namespace so no new binding has to be provisioned.
const PUSH_SLOTS = ['07:30', '12:30', '20:30'];

function b64urlFromBytes(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Stable, filename-safe key for an endpoint URL
async function pushKeyFor(endpoint) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return 'push:' + b64urlFromBytes(digest).slice(0, 32);
}

// Signed VAPID header proving the push comes from us. ECDSA P-256 signatures
// from Web Crypto are already raw r||s, which is exactly the JWS ES256 form.
async function vapidAuth(endpoint, env) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const enc = new TextEncoder();
  const header = b64urlFromBytes(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64urlFromBytes(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:oskarsteinicke@gmail.com',
  })));
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${payload}`));
  return `vapid t=${header}.${payload}.${b64urlFromBytes(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

async function handlePushSubscribe(body, env, origin) {
  const { endpoint, keys, tzOffset } = body || {};
  if (!endpoint || typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint)) {
    return jsonResponse({ error: 'Invalid endpoint' }, 400, origin);
  }
  if (!env.HEALTH_KV) return jsonResponse({ error: 'Storage not bound' }, 500, origin);
  const k = await pushKeyFor(endpoint);
  const prev = await env.HEALTH_KV.get(k);
  let sent = {};
  try { sent = prev ? (JSON.parse(prev).sent || {}) : {}; } catch {}
  await env.HEALTH_KV.put(k, JSON.stringify({
    endpoint,
    keys: keys || {},
    // Minutes east of UTC. Re-sent on every launch, so DST and travel correct
    // themselves without the server tracking timezone rules.
    tzOffset: Number.isFinite(+tzOffset) ? Math.max(-840, Math.min(840, +tzOffset)) : 0,
    sent,                       // slot -> local date already delivered
    updatedAt: new Date().toISOString(),
  }));
  return jsonResponse({ ok: true }, 200, origin);
}

async function handlePushUnsubscribe(body, env, origin) {
  const { endpoint } = body || {};
  if (!endpoint) return jsonResponse({ error: 'Missing endpoint' }, 400, origin);
  if (!env.HEALTH_KV) return jsonResponse({ error: 'Storage not bound' }, 500, origin);
  await env.HEALTH_KV.delete(await pushKeyFor(endpoint));
  return jsonResponse({ ok: true }, 200, origin);
}

// Which slot, if any, the given local time currently falls in. The cron runs
// on the hour and half hour, so a slot is live for the 30 minutes after it.
function slotDueAt(localDate) {
  const hh = localDate.getUTCHours(), mm = localDate.getUTCMinutes();
  for (const slot of PUSH_SLOTS) {
    const [sh, sm] = slot.split(':').map(Number);
    const delta = (hh * 60 + mm) - (sh * 60 + sm);
    if (delta >= 0 && delta < 30) return slot;
  }
  return null;
}

async function sendPush(endpoint, env) {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': await vapidAuth(endpoint, env),
      'TTL': '3600',
      'Content-Length': '0',
    },
  });
}

async function runReminders(env) {
  if (!env.HEALTH_KV || !env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY) return;
  const now = Date.now();
  let cursor;
  do {
    const page = await env.HEALTH_KV.list({ prefix: 'push:', cursor });
    for (const entry of page.keys) {
      const raw = await env.HEALTH_KV.get(entry.name);
      if (!raw) continue;
      let sub;
      try { sub = JSON.parse(raw); } catch { continue; }
      if (!sub.endpoint) continue;

      const local = new Date(now + (sub.tzOffset || 0) * 60000);
      const slot = slotDueAt(local);
      if (!slot) continue;
      const localDay = local.toISOString().slice(0, 10);
      if (sub.sent && sub.sent[slot] === localDay) continue;  // already sent today

      try {
        const res = await sendPush(sub.endpoint, env);
        // The push service reports a dead subscription; stop paying for it
        if (res.status === 404 || res.status === 410) {
          await env.HEALTH_KV.delete(entry.name);
          continue;
        }
        if (res.ok || res.status === 201) {
          sub.sent = sub.sent || {};
          sub.sent[slot] = localDay;
          await env.HEALTH_KV.put(entry.name, JSON.stringify(sub));
        }
      } catch (e) { /* transient: the next run retries */ }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
}

// ── ACCOUNT DELETION ──────────────────────────────────────────────────────
// Apple requires in-app account deletion for any app that offers sign-up
// (App Store guideline 5.1.1(v)), and GDPR erasure needs it regardless.
// Removing an auth user needs the service_role key, which must never reach the
// client, so it happens here.
//
// Identity is taken from the caller's own access token, never from the request
// body — the token is exchanged for a user id at Supabase, and only that id is
// ever deleted. A stolen or forged token simply fails that exchange.
async function handleAccountDelete(request, env, origin) {
  if (!env.SUPABASE_SERVICE_KEY) {
    return jsonResponse({ error: 'Not configured' }, 500, origin);
  }
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return jsonResponse({ error: 'Missing token' }, 401, origin);

  // Resolve the token to a user. This is the authorisation check.
  const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': env.SUPABASE_SERVICE_KEY },
  });
  if (!meRes.ok) return jsonResponse({ error: 'Invalid session' }, 401, origin);
  const me = await meRes.json();
  const userId = me && me.id;
  if (!userId) return jsonResponse({ error: 'Invalid session' }, 401, origin);

  const admin = {
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'apikey': env.SUPABASE_SERVICE_KEY,
    'Content-Type': 'application/json',
  };
  const failed = [];

  // Cancel any live subscription FIRST. Only the customer id is stored, so the
  // subscriptions have to be looked up from it. This deliberately fails closed:
  // deleting the login while a subscription still bills would leave someone
  // paying with no way to sign in and stop it.
  try {
    const customer = me.user_metadata && me.user_metadata.stripe_customer;
    if (customer && env.STRIPE_SECRET_KEY) {
      const listRes = await fetch(
        `${STRIPE_API}/subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=20`,
        { headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` } });
      const list = await listRes.json();
      if (!listRes.ok) throw new Error('list failed');
      const live = (list.data || []).filter(s =>
        s.status === 'active' || s.status === 'trialing' || s.status === 'past_due');
      for (const s of live) {
        const c = await fetch(`${STRIPE_API}/subscriptions/${s.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` },
        });
        if (!c.ok) throw new Error('cancel failed');
      }
    }
  } catch (e) {
    return jsonResponse({
      error: 'Could not cancel your subscription, so nothing was deleted. Please try again, or cancel your subscription first.',
    }, 502, origin);
  }

  // Synced app data, then leaderboard membership, then the account itself.
  // Data first: if anything fails we stop rather than orphan rows behind a
  // deleted login that nobody can authenticate as to retry.
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/hvi_data?user_id=eq.${userId}`,
      { method: 'DELETE', headers: admin });
    if (!r.ok) failed.push('data');
  } catch (e) { failed.push('data'); }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_members?user_id=eq.${userId}`,
      { method: 'DELETE', headers: admin });
    if (!r.ok) failed.push('leaderboard');
  } catch (e) { failed.push('leaderboard'); }

  if (failed.length) {
    return jsonResponse({ error: 'Could not remove all data', failed }, 500, origin);
  }

  const del = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
    { method: 'DELETE', headers: admin });
  if (!del.ok) {
    const detail = await del.text().catch(() => '');
    return jsonResponse({ error: 'Could not delete account', detail: detail.slice(0, 200) }, 500, origin);
  }

  return jsonResponse({ ok: true }, 200, origin);
}

// Create Stripe Checkout session (single Premium tier, monthly or yearly)
async function handleCheckout(body, env, origin) {
  const { user_id, email, billing } = body;
  if (!user_id || !email) return jsonResponse({ error: 'Missing user_id or email' }, 400, origin);
  if (!env.STRIPE_SECRET_KEY) return jsonResponse({ error: 'Stripe not configured' }, 500, origin);

  const priceId = billing === 'monthly' ? env.STRIPE_PRICE_MONTHLY : env.STRIPE_PRICE_YEARLY;
  if (!priceId) return jsonResponse({ error: `Price not configured for billing: ${billing}` }, 500, origin);

  const session = await stripeRequest('/checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: 'https://get-arete.com/?upgrade=success',
    cancel_url: 'https://get-arete.com/?upgrade=cancel',
    customer_email: email,
    'metadata[user_id]': user_id,
    'metadata[plan]': 'premium',
    'subscription_data[metadata][user_id]': user_id,
    'subscription_data[metadata][plan]': 'premium',
  }, env);

  if (session.error) return jsonResponse({ error: session.error.message }, 400, origin);
  return jsonResponse({ url: session.url }, 200, origin);
}

// Create Stripe Customer Portal session (manage / cancel subscription)
async function handlePortal(body, env, origin) {
  const { customer_id } = body;
  if (!customer_id) return jsonResponse({ error: 'Missing customer_id' }, 400, origin);
  const session = await stripeRequest('/billing_portal/sessions', {
    customer: customer_id,
    return_url: 'https://get-arete.com/',
  }, env);
  if (session.error) return jsonResponse({ error: session.error.message }, 400, origin);
  return jsonResponse({ url: session.url }, 200, origin);
}

// Verify Stripe webhook signature (HMAC-SHA256)
async function verifyStripeSignature(payload, sigHeader, secret) {
  const parts = {};
  for (const item of (sigHeader || '').split(',')) {
    const [k, v] = item.split('=');
    parts[k] = v;
  }
  const timestamp = parts['t'], sig = parts['v1'];
  if (!timestamp || !sig) return false;
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  return expected === sig;
}

async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.SUPABASE_SERVICE_KEY) {
    return new Response('Webhook not configured', { status: 500 });
  }
  const payload = await request.text();
  const sig = request.headers.get('stripe-signature');
  if (!(await verifyStripeSignature(payload, sig, env.STRIPE_WEBHOOK_SECRET))) {
    return new Response('Invalid signature', { status: 401 });
  }
  const event = JSON.parse(payload);

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object;
      const userId = s.metadata?.user_id;
      if (userId) await updateUserMeta(userId, { plan: 'premium', stripe_customer: s.customer || null }, env);
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (userId && (sub.status === 'active' || sub.status === 'trialing')) {
        await updateUserMeta(userId, { plan: 'premium', stripe_customer: sub.customer || null }, env);
      } else if (userId && (sub.status === 'canceled' || sub.status === 'unpaid')) {
        await updateUserMeta(userId, { plan: 'free' }, env);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (userId) await updateUserMeta(userId, { plan: 'free' }, env);
      break;
    }
  }
  return new Response('ok', { status: 200 });
}

// Forward a new signup to the n8n welcome webhook. Server-side so the URL stays
// secret. Always returns 200 to the client; a webhook failure never breaks signup.
async function handleWelcome(body, env, origin) {
  const { name, email } = body || {};
  if (!env.N8N_WELCOME_WEBHOOK_URL) {
    return jsonResponse({ ok: false, skipped: 'webhook not configured' }, 200, origin);
  }
  try {
    const res = await fetch(env.N8N_WELCOME_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || '', email: email || '' }),
    });
    return jsonResponse({ ok: res.ok }, 200, origin);
  } catch (e) {
    console.warn('[welcome] webhook failed:', e);
    return jsonResponse({ ok: false }, 200, origin);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { ...cors(origin), 'Access-Control-Max-Age': '86400' } });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health endpoints accept GET and POST
    if (path === '/health') {
      return handleHealth(request, env, origin);
    }

    // Stripe webhook (from Stripe servers — no CORS, raw body)
    if (path === '/stripe/webhook') {
      return handleStripeWebhook(request, env);
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // Account deletion — authorised by the caller's own bearer token
      if (path === '/account/delete') {
        return handleAccountDelete(request, env, origin);
      }

      // Web push reminder subscriptions
      if (path === '/push/subscribe') {
        return handlePushSubscribe(await request.json(), env, origin);
      }
      if (path === '/push/unsubscribe') {
        return handlePushUnsubscribe(await request.json(), env, origin);
      }

      // Stripe checkout session
      if (path === '/stripe/checkout') {
        return handleCheckout(await request.json(), env, origin);
      }

      // Stripe customer portal
      if (path === '/stripe/portal') {
        return handlePortal(await request.json(), env, origin);
      }

      // Post-signup welcome webhook (forwards to n8n; never fails the client)
      if (path === '/welcome') {
        return handleWelcome(await request.json().catch(() => ({})), env, origin);
      }

      // OAuth token exchange
      if (path === '/oauth/exchange') {
        const body = await request.json();
        return handleOAuthExchange(body, env, origin);
      }

      // OAuth token refresh
      if (path === '/oauth/refresh') {
        const body = await request.json();
        return handleOAuthRefresh(body, env, origin);
      }

      // Groq proxy
      if (path === '/groq') {
        if (!env.GROQ_KEY) return jsonResponse({ error: 'Groq not configured' }, 500, origin);
        if (await aiRateLimited(request, env)) {
          return jsonResponse({ error: 'Too many AI requests. Please wait a few minutes.' }, 429, origin);
        }
        const body = await request.text();
        const res = await fetch(GROQ_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.GROQ_KEY}`
          },
          body
        });
        const data = await res.text();
        return new Response(data, {
          status: res.status,
          headers: { 'Content-Type': 'application/json', ...cors(origin) }
        });
      }

      // Default: Gemini proxy (root path)
      if (await aiRateLimited(request, env)) {
        return jsonResponse({ error: 'Too many AI requests. Please wait a few minutes.' }, 429, origin);
      }
      const body = await request.text();
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
      );

      const data = await res.text();
      return new Response(data, {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...cors(origin) }
      });

    } catch (e) {
      return jsonResponse({ error: e.message }, 500, origin);
    }
  },

  // Cron trigger: fires on the hour and half hour, sending any reminder whose
  // local slot has just come round for that subscriber.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env));
  },
};
