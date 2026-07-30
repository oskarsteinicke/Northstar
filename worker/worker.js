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
// KV binding needed:
//   HEALTH_KV             — KV namespace for Apple Health data

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
  }
};
