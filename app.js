// ══════════════════════════════════════════════════════════════════════════
// Arete — Application Logic
// ══════════════════════════════════════════════════════════════════════════

// ── ANALYTICS HELPER ──────────────────────────────────────────────────────
function track(event, params) {
  if (typeof gtag === 'function') gtag('event', event, params || {});
}

// Every event above fires only on success, so a broken step showed up as
// "fewer signups" with no reason attached — which is exactly how a signup bug
// stayed invisible for months. Failures get their own event, carrying a short
// reason code and never any user content.
function trackFail(step, reason) {
  try {
    track('failure', {
      step: String(step || 'unknown').slice(0, 40),
      reason: String(reason || 'unknown').slice(0, 80),
    });
  } catch {}
}
// Capture UTM params on first visit
(function() {
  const p = new URLSearchParams(location.search);
  const src = p.get('utm_source');
  if (src) {
    const utm = { source: src, medium: p.get('utm_medium') || '', campaign: p.get('utm_campaign') || '' };
    localStorage.setItem('hvi_utm', JSON.stringify(utm));
    if (typeof gtag === 'function') {
      gtag('set', 'user_properties', { traffic_source: src, traffic_medium: utm.medium, traffic_campaign: utm.campaign });
    }
    // Clean URL without reloading
    if (history.replaceState) history.replaceState(null, '', location.pathname);
  }
})();

// ── STATE ─────────────────────────────────────────────────────────────────
let habits, log, journal, meta;
let workoutLog, workoutMeta, mealLog, dietMeta;
let curView = 'home', curPillar = null, qTimer = null, jDebounce = null;
let curMealItems = [], curMealType = 'Breakfast';
let curRecipeId = null, libTab = 'books';
let curHabitCat = 'mindset';
let builderProg = null, builderDayIdx = 0, builderSearch = '';
let weightLog;
let tdeeProfile;
let wgerCache = {};
let wgerSearchCache = {};
let prs;
let browserContext = null;
let pendingExercise = null;
let browserState = { category: null, equipment: null, search: '', results: [], nextUrl: null, loading: false, expanded: null };
let _habitEditMode = false;
let _habitsTab = 'habits';
let _routineEditMode = false;
let _parsedMealItems = [];   // staging area for describe-meal results
let browserSearchDebounce = null;
let builderSearchDebounce = null;
let builderSearchResults = [];
let builderSearchLoading = false;
let gamification, achievements;
let settings;
let routines, routineLog;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = '';
let calView = 'monthly'; // 'monthly' | 'weekly' | 'daily'
let calTasks = {};
let sleepLog;
let restTimer = null, restTimerEnd = 0, restTimerDur = 90;

// ── Unit helpers ──────────────────────────────────────────────────────────
const LB_PER_KG = 2.20462;
function isImperial() { return (settings || {}).units === 'imperial'; }
function wtUnit() { return isImperial() ? 'lbs' : 'kg'; }

// Stored weights are kept in whatever unit is on display, so any maths that
// needs real kilograms (calories per kg, protein per kg) must convert first.
function toKg(v) { const n = parseFloat(v) || 0; return isImperial() ? n / LB_PER_KG : n; }

// Switching units has to convert what's already stored. Without this a 100 kg
// squat silently became a 100 lb squat — the label changed, the number didn't.
function setUnits(u) {
  const next = u === 'imperial' ? 'imperial' : 'metric';
  if (next === (isImperial() ? 'imperial' : 'metric')) return;
  _convertStoredWeights(next === 'imperial' ? LB_PER_KG : 1 / LB_PER_KG);
  settings.units = next;
  LS.set('hvi_settings', settings);
}

// Rescales every stored weight: the bodyweight log, every logged set, and
// every personal record. tdeeProfile.weight_kg is deliberately excluded —
// it is always held in kilograms and converted at the point of use.
function _convertStoredWeights(f) {
  const conv = v => Math.round((parseFloat(v) || 0) * f * 10) / 10;

  let touched = false;
  Object.keys(weightLog || {}).forEach(d => {
    if (parseFloat(weightLog[d]) > 0) { weightLog[d] = conv(weightLog[d]); touched = true; }
  });
  if (touched) LS.set('hvi_weight_log', weightLog);

  touched = false;
  Object.keys(workoutLog || {}).forEach(d => {
    ((workoutLog[d] || {}).exercises || []).forEach(ex => {
      (ex.sets || []).forEach(s => {
        if (parseFloat(s.weight) > 0) { s.weight = conv(s.weight); touched = true; }
      });
    });
  });
  if (touched) LS.set('hvi_workout_log', workoutLog);

  touched = false;
  Object.keys(prs || {}).forEach(k => {
    if (prs[k] && parseFloat(prs[k].weight) > 0) { prs[k].weight = conv(prs[k].weight); touched = true; }
  });
  if (touched) LS.set('hvi_prs', prs);
}

// ── SUPABASE AUTH + CLOUD SYNC ────────────────────────────────────────────
const SUPABASE_URL = 'https://socflncohsenjptgkkax.supabase.co';
const SUPABASE_KEY = 'sb_publishable_J2qJ8iTfCESrML5Hm6NGbQ_mz9uPeug';
const SYNC_KEYS = ['hvi_habits','hvi_log','hvi_journal3','hvi_meta','hvi_workout_log','hvi_workout_meta','hvi_meal_log','hvi_diet_meta','hvi_weight_log','hvi_prs','hvi_gamification','hvi_achievements','hvi_tdee_profile','hvi_custom_programs','hvi_onboarded','hvi_sleep_log','hvi_settings','hvi_habit_history','hvi_meal_favorites','hvi_progress_photos','hvi_routines','hvi_routine_log','hvi_integrations','hvi_challenges','hvi_habit_links','hvi_why','hvi_goals'];
// Keys that are date-keyed objects — these get merged instead of overwritten
const MERGE_KEYS = ['hvi_workout_log','hvi_meal_log','hvi_journal3','hvi_weight_log','hvi_sleep_log','hvi_habit_history'];

// ── AUTH HELPERS ──────────────────────────────────────────────────────────
async function authResetPassword(email) {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ email })
    });
    return r.ok ? { ok: true } : { ok: false };
  } catch { return { ok: false }; }
}

function getSession() {
  try { return JSON.parse(localStorage.getItem('hvi_session')); } catch { return null; }
}
function getAccessToken() {
  return getSession()?.access_token || null;
}
function getCurrentUserId() {
  return getSession()?.user?.id || null;
}

// Fire the post-signup welcome webhook via the Cloudflare Worker. Fully
// non-blocking: never awaited, never throws, never blocks signup. The actual
// n8n URL lives only as a Worker secret (N8N_WELCOME_WEBHOOK_URL), never here.
function sendWelcomeWebhook(name, email) {
  try {
    fetch('https://arete-ai.oskarsteinicke.workers.dev/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || '', email: email || '' }),
    }).catch(() => {});
  } catch {}
}

async function authSignUp(email, password, name) {
  // GoTrue REST equivalent of supabase-js options.data: `data` → user_metadata
  const body = { email, password };
  if (name) body.data = { name, full_name: name };
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  // GoTrue reports failures as { code, error_code, msg } — there is no `error`
  // property. Callers used to test for one, so every failed signup looked like
  // a success and fell through to a confusing sign-in error. Normalise here.
  if (!res.ok || (!data.access_token && !data.user)) {
    return {
      ok: false,
      code: data.error_code || '',
      error: data.msg || data.error_description || data.message || 'Sign up failed.',
    };
  }
  return { ok: true, data };
}

async function authSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.access_token) {
    localStorage.setItem('hvi_session', JSON.stringify(data));
    return { ok: true, data };
  }
  return { ok: false, error: data.error_description || data.msg || 'Sign in failed' };
}

async function authRefresh() {
  const session = getSession();
  if (!session?.refresh_token) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const data = await res.json();
    if (data.access_token) { localStorage.setItem('hvi_session', JSON.stringify(data)); return true; }
  } catch {}
  return false;
}

async function authSignOut() {
  const token = getAccessToken();
  // Push data to cloud BEFORE signing out so nothing is lost
  if (token) {
    try { await cloudPush(); } catch {}
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
      });
    } catch {}
  }
  localStorage.removeItem('hvi_session');
  SYNC_KEYS.forEach(k => localStorage.removeItem(k));
  location.reload();
}

// ── ACCOUNT DELETION ──────────────────────────────────────────────────────
const _ACCOUNT_WORKER = 'https://arete-ai.oskarsteinicke.workers.dev';

// Everything Arete owns on this device. Broader than SYNC_KEYS on purpose:
// sign-out keeps local extras, deletion should not.
function wipeLocalData() {
  try {
    // Collect first: removing while iterating shifts the indices and would
    // silently skip half the keys.
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('hvi_') === 0) doomed.push(k);
    }
    doomed.forEach(k => localStorage.removeItem(k));
  } catch {}
}

// Server deletes the account; the client only wipes once that succeeds, so a
// failure can never leave someone signed out of an account that still exists.
async function deleteAccount() {
  const uid = getCurrentUserId();
  if (!uid || !getAccessToken()) return { error: 'You are not signed in.' };
  if (!navigator.onLine) return { error: 'You appear to be offline. Reconnect and try again.' };
  try {
    await _ensureFreshToken();
    const res = await fetch(`${_ACCOUNT_WORKER}/account/delete`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getAccessToken()}` },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return { error: 'Your session expired. Sign in again, then retry.' };
    if (!res.ok || !data.ok) {
      reportError('account-delete', data.error || ('HTTP ' + res.status));
      return { error: data.error || 'Deletion failed. Nothing was removed — please try again.' };
    }
    track('account_deleted');
    return { ok: true };
  } catch (e) {
    reportError('account-delete', e);
    return { error: 'Network error. Nothing was deleted — please try again.' };
  }
}

// ── SYNC HELPERS ──────────────────────────────────────────────────────────
let _syncDebounce = null;

function setSyncStatus(state) {
  let el = document.getElementById('sync-dot');
  if (!el) { el = document.createElement('div'); el.id = 'sync-dot'; el.title = 'Cloud sync'; document.body.appendChild(el); }
  if (!navigator.onLine && state === 'offline') state = 'away';
  el.className = 'sync-' + state;
  if (state === 'ok') el.title = 'Synced ' + new Date().toLocaleTimeString();
  else if (state === 'away') el.title = 'Offline — changes saved locally';
  else if (state === 'offline') el.title = 'Sync pending — will retry';
  else if (state === 'pending') el.title = 'Syncing…';
}

function _syncToast(msg) {
  // Log only — no visible popup. Sync state is shown by the subtle sync dot.
  console.log('[sync]', msg);
}

function authHeaders(extra = {}) {
  const token = getAccessToken();
  return { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}

// Proactively refresh token if it expires within 5 minutes
async function _ensureFreshToken() {
  const session = getSession();
  if (!session?.access_token) return;
  try {
    // Decode JWT expiry (payload is base64url, second segment)
    const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const expiresAt = payload.exp * 1000;
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      console.log('[sync] token expiring soon, refreshing...');
      await authRefresh();
    }
  } catch {}
}

async function cloudPush() {
  const uid = getCurrentUserId();
  if (!uid) return;
  if (!navigator.onLine) { setSyncStatus('away'); return; }
  // Ensure token is fresh before any request
  await _ensureFreshToken();
  // Pull first so we merge before overwriting cloud
  try {
    const pullRes = await fetch(`${SUPABASE_URL}/rest/v1/hvi_data?user_id=eq.${uid}&select=data`, { headers: authHeaders() });
    if (pullRes.ok) {
      const rows = await pullRes.json();
      if (rows.length) {
        const cloud = rows[0].data || {};
        // Merge date-keyed objects (workouts, meals, journal, etc.)
        MERGE_KEYS.forEach(k => {
          if (cloud[k]) {
            try {
              const local = JSON.parse(localStorage.getItem(k) || '{}');
              const merged = { ...cloud[k], ...local };
              localStorage.setItem(k, JSON.stringify(merged));
            } catch {}
          }
        });
        // Merge habit log — local wins for completedToday, cloud wins for higher streaks
        if (cloud.hvi_log) {
          try {
            const local = JSON.parse(localStorage.getItem('hvi_log') || '{}');
            const cloudLog = cloud.hvi_log;
            const _today = new Date().toLocaleDateString('en-CA');
            // Start with LOCAL as base (preserves checkReset clearing completedToday)
            const merged = { ...local };
            Object.keys(cloudLog).forEach(hid => {
              if (!merged[hid]) {
                // Cloud-only habit: bring it in but clear stale completedToday
                merged[hid] = { ...cloudLog[hid] };
                if (merged[hid].completedToday && merged[hid].lastCompletedDate !== _today) {
                  merged[hid].completedToday = false;
                }
                return;
              }
              // Cloud says completed today AND it's actually today — restore it
              if (cloudLog[hid].completedToday && cloudLog[hid].lastCompletedDate === _today && !local[hid].completedToday) {
                merged[hid] = cloudLog[hid];
                return;
              }
              // Local says completed — keep local
              if (local[hid].completedToday) return;
              // Neither completed today — take higher streak but keep local completedToday (false)
              if ((cloudLog[hid].streak || 0) > (local[hid].streak || 0)) {
                merged[hid] = { ...cloudLog[hid], completedToday: false };
              }
            });
            localStorage.setItem('hvi_log', JSON.stringify(merged));
          } catch {}
        }
        // Merge gamification — never downgrade XP
        if (cloud.hvi_gamification) {
          try {
            const local = JSON.parse(localStorage.getItem('hvi_gamification') || '{}');
            const cloudG = cloud.hvi_gamification;
            const merged = { ...cloudG, ...local };
            merged.xp = Math.max(local.xp || 0, cloudG.xp || 0);
            const pxp = {};
            const allP = new Set([...Object.keys(local.pillarXP || {}), ...Object.keys(cloudG.pillarXP || {})]);
            allP.forEach(p => { pxp[p] = Math.max((local.pillarXP || {})[p] || 0, (cloudG.pillarXP || {})[p] || 0); });
            merged.pillarXP = pxp;
            localStorage.setItem('hvi_gamification', JSON.stringify(merged));
          } catch {}
        }
      }
    }
  } catch {}
  const data = {};
  SYNC_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) { try { data[k] = JSON.parse(v); } catch {} } });
  setSyncStatus('pending');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hvi_data`, {
      method: 'POST',
      headers: authHeaders({ 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify({ user_id: uid, data, updated_at: new Date().toISOString() })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[sync] push failed:', res.status, errText);
      _syncToast('⚠️ Sync failed: ' + res.status);
      if (res.status === 401) { const ok = await authRefresh(); if (ok) return cloudPush(); }
      setSyncStatus('offline');
    } else {
      console.log('[sync] push OK, keys:', Object.keys(data).length);
      _syncToast('✓ Synced to cloud');
      setSyncStatus('ok');
      // Silently push stats to leaderboard groups in background
      if (typeof lbSyncStats === 'function') setTimeout(() => lbSyncStats().catch(() => {}), 500);
    }
  } catch(e) { console.warn('[sync] push error:', e); setSyncStatus('offline'); _scheduleRetry(); }
}

let _retryTimer = null, _retryDelay = 5000;
function _scheduleRetry() {
  if (_retryTimer) return;
  _retryTimer = setTimeout(async () => {
    _retryTimer = null;
    if (!navigator.onLine || !getAccessToken()) return;
    await cloudPush();
    if (document.getElementById('sync-dot')?.className === 'sync-ok') _retryDelay = 5000;
    else { _retryDelay = Math.min(_retryDelay * 2, 60000); _scheduleRetry(); }
  }, _retryDelay);
}

// True when today's workout entry has anything the user logged into it.
// Reads localStorage directly — cloudPull runs before in-memory state reloads.
function _hasLoggedWorkoutToday() {
  try {
    const all = JSON.parse(localStorage.getItem('hvi_workout_log') || '{}');
    const wl = all[new Date().toLocaleDateString('en-CA')];
    if (!wl) return false;
    if (wl.touched || wl.notes) return true;
    return (wl.exercises || []).some(e => (e.sets || []).some(s => s.completed || s.warmup));
  } catch { return false; }
}

async function cloudPull() {
  const uid = getCurrentUserId();
  if (!uid) return false;
  await _ensureFreshToken();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hvi_data?user_id=eq.${uid}&select=data`, {
      headers: authHeaders()
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      trackFail('sync_pull', 'http_' + res.status);
      console.warn('[sync] pull failed:', res.status, errText);
      _syncToast('⚠️ Pull failed: ' + res.status);
      if (res.status === 401) { const ok = await authRefresh(); if (ok) return cloudPull(); }
      return false;
    }
    const rows = await res.json();
    console.log('[sync] pull got', rows.length, 'rows');
    if (!rows.length) { _syncToast('☁️ No cloud data yet'); return false; }
    const cloud = rows[0].data || {};
    console.log('[sync] cloud keys:', Object.keys(cloud).join(', '));
    _syncToast('✓ Pulled ' + Object.keys(cloud).length + ' keys from cloud');
    SYNC_KEYS.forEach(k => {
      if (cloud[k] === undefined) return;
      if (MERGE_KEYS.includes(k)) {
        try {
          const local = JSON.parse(localStorage.getItem(k) || '{}');
          // Local wins — cloud fills in missing keys only
          const merged = { ...cloud[k], ...local };
          localStorage.setItem(k, JSON.stringify(merged));
        } catch { localStorage.setItem(k, JSON.stringify(cloud[k])); }
      } else if (k === 'hvi_log') {
        // Merge habit log: local completedToday always wins, cloud fills gaps
        try {
          const local = JSON.parse(localStorage.getItem(k) || '{}');
          const cloudLog = cloud[k] || {};
          const _today = new Date().toLocaleDateString('en-CA');
          const merged = {};
          // Start with all habits from both sides
          const allIds = new Set([...Object.keys(cloudLog), ...Object.keys(local)]);
          allIds.forEach(hid => {
            const l = local[hid];
            const c = cloudLog[hid];
            if (!c) { merged[hid] = l; return; }
            if (!l) {
              // Cloud only: accept but strip stale completedToday
              merged[hid] = { ...c };
              if (c.completedToday && c.lastCompletedDate !== _today) merged[hid].completedToday = false;
              return;
            }
            // Both exist: local completedToday wins if true
            if (l.completedToday) { merged[hid] = l; return; }
            // Cloud completedToday only valid if from today
            if (c.completedToday && c.lastCompletedDate === _today) { merged[hid] = c; return; }
            // Neither has valid completedToday: keep higher streak
            if ((l.streak || 0) >= (c.streak || 0)) { merged[hid] = l; }
            else { merged[hid] = { ...c, completedToday: false }; }
          });
          localStorage.setItem(k, JSON.stringify(merged));
        } catch { localStorage.setItem(k, JSON.stringify(cloud[k])); }
      } else if (k === 'hvi_workout_meta') {
        // Never move the program/day pointer out from under a workout that's
        // already been logged into today: the active screen would see the
        // entry as belonging to a different day and rebuild it, wiping every
        // set tracked so far. Otherwise the more recent side wins.
        try {
          const local = JSON.parse(localStorage.getItem(k) || '{}');
          const cloudM = cloud[k] || {};
          const localWins = _hasLoggedWorkoutToday() ||
            (local.lastWorkoutDate || '') >= (cloudM.lastWorkoutDate || '');
          const merged = localWins ? { ...cloudM, ...local } : { ...local, ...cloudM };
          localStorage.setItem(k, JSON.stringify(merged));
        } catch { localStorage.setItem(k, JSON.stringify(cloud[k])); }
      } else if (k === 'hvi_gamification') {
        // Never downgrade XP — keep whichever has more progress
        try {
          const local = JSON.parse(localStorage.getItem(k) || '{}');
          const cloudG = cloud[k] || {};
          const merged = { ...cloudG, ...local };
          merged.xp = Math.max(local.xp || 0, cloudG.xp || 0);
          // Keep highest pillar XP too
          const pxp = {};
          const allPillars = new Set([...Object.keys(local.pillarXP || {}), ...Object.keys(cloudG.pillarXP || {})]);
          allPillars.forEach(p => { pxp[p] = Math.max((local.pillarXP || {})[p] || 0, (cloudG.pillarXP || {})[p] || 0); });
          merged.pillarXP = pxp;
          localStorage.setItem(k, JSON.stringify(merged));
        } catch { localStorage.setItem(k, JSON.stringify(cloud[k])); }
      } else {
        localStorage.setItem(k, JSON.stringify(cloud[k]));
      }
    });
    return true;
  } catch(e) { console.warn('[sync] pull error:', e); return false; }
}

function schedulePush() {
  clearTimeout(_syncDebounce);
  _syncDebounce = setTimeout(cloudPush, 2500);
}

// Fire-and-forget push using sendBeacon (survives tab close / mobile sleep)
function _beaconPush() {
  const uid = getCurrentUserId();
  const token = getAccessToken();
  if (!uid || !token) return;
  const data = {};
  SYNC_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) { try { data[k] = JSON.parse(v); } catch {} } });
  const body = JSON.stringify({ user_id: uid, data, updated_at: new Date().toISOString() });
  // sendBeacon is the only reliable way to push data when a mobile tab goes to sleep
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    // sendBeacon doesn't support custom headers, so we use the REST endpoint with apikey in query
    // Instead, try a keepalive fetch which DOES support headers
    try {
      fetch(`${SUPABASE_URL}/rest/v1/hvi_data`, {
        method: 'POST',
        headers: authHeaders({ 'Prefer': 'resolution=merge-duplicates' }),
        body,
        keepalive: true
      }).catch(() => {});
    } catch {
      // Last resort: skip auth header, won't work but at least we tried
    }
  }
}

async function forceSync() {
  const logEl = document.getElementById('sync-log');
  const btn = document.getElementById('force-sync-btn');
  const _log = (msg) => { console.log(msg); if (logEl) logEl.textContent += msg + '\n'; };
  if (btn) btn.disabled = true;
  if (logEl) logEl.textContent = '';
  _log('[sync] Starting force sync...');
  _log('[sync] User ID: ' + (getCurrentUserId() || 'NONE'));
  _log('[sync] Token: ' + (getAccessToken() ? getAccessToken().substring(0, 20) + '...' : 'NONE'));
  await _ensureFreshToken();
  _log('[sync] Token after refresh check: ' + (getAccessToken() ? 'OK' : 'NONE'));
  // Pull
  _log('[sync] Pulling from cloud...');
  const pulled = await cloudPull();
  _log('[sync] Pull result: ' + (pulled ? 'got data' : 'no data / failed'));
  // Push
  _log('[sync] Pushing to cloud...');
  await cloudPush();
  _log('[sync] Push done. Check sync dot color.');
  // Reload in-memory state
  habits = LS.get('hvi_habits', habits);
  log = LS.get('hvi_log', log);
  journal = LS.get('hvi_journal3', journal);
  workoutLog = LS.get('hvi_workout_log', workoutLog);
  workoutMeta = LS.get('hvi_workout_meta', workoutMeta);
  mealLog = LS.get('hvi_meal_log', mealLog);
  dietMeta = LS.get('hvi_diet_meta', dietMeta);
  _log('[sync] Done! Reloading view...');
  if (btn) btn.disabled = false;
  go(curView, {}, false);
}

// ── AUTH UI ───────────────────────────────────────────────────────────────
let _authMode = 'signin'; // 'signin' | 'signup'
// Message to show on the next auth render, e.g. after bouncing a duplicate
// signup over to sign-in. Cleared once shown.
let _authNotice = null;
let _authPrefillEmail = '';

function injectAuthStyles() {
  if (document.getElementById('auth-styles')) return;
  const s = document.createElement('style');
  s.id = 'auth-styles';
  s.textContent = `
    #auth-overlay{position:fixed;inset:0;background:var(--bg);z-index:3000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 28px}
    .auth-logo{margin-bottom:40px;text-align:center;display:flex;flex-direction:column;align-items:center}
    .auth-title{font-family:var(--display);font-size:30px;color:var(--text);text-align:center;margin-bottom:8px;line-height:1.2;letter-spacing:0.5px}
    .auth-sub{font-size:13px;color:var(--text-dim);text-align:center;margin-bottom:36px;line-height:1.6}
    .auth-input{width:100%;padding:16px 18px;border:1px solid rgba(255,255,255,0.1);border-radius:12px;background:var(--surface);color:var(--text);font-size:15px;margin-bottom:12px;outline:none;transition:border .2s;box-sizing:border-box}
    .auth-input:focus{border-color:var(--accent)}
    .auth-btn{width:100%;padding:18px;border:none;border-radius:14px;background:var(--accent);color:#fff;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;margin-top:8px;transition:transform .15s,opacity .15s}
    .auth-btn:active{transform:scale(0.98)}
    .auth-btn:disabled{opacity:0.5;cursor:not-allowed}
    .auth-switch{margin-top:24px;font-size:13px;color:var(--text-dim);text-align:center}
    .auth-switch span{color:var(--accent-b);cursor:pointer;font-weight:600}
    .auth-error{color:#d46f6f;font-size:13px;text-align:center;margin-top:8px;min-height:20px}
    .auth-divider{display:flex;align-items:center;gap:12px;margin:20px 0;width:100%}
    .auth-divider-line{flex:1;height:1px;background:rgba(255,255,255,0.08)}
    .auth-divider-text{font-size:11px;color:var(--text-muted);letter-spacing:1px}
  `;
  document.head.appendChild(s);
}

function renderAuth() {
  injectAuthStyles();
  let overlay = document.getElementById('auth-overlay');
  if (!overlay) { overlay = document.createElement('div'); overlay.id = 'auth-overlay'; document.body.appendChild(overlay); }

  const isSignIn = _authMode === 'signin';
  overlay.innerHTML = `
    <div class="auth-logo">
      <img src="icon-192.png" alt="Arete" style="width:72px;height:72px;border-radius:16px">
      <div style="font-size:13px;letter-spacing:.25em;color:var(--accent-b);margin-top:8px;font-weight:600">ARETE</div>
    </div>
    <div class="auth-title">${isSignIn ? 'Welcome back.' : 'Begin the path to excellence.'}</div>
    <div class="auth-sub">${isSignIn ? 'Sign in to continue your pursuit of arete.' : 'Create your account and pursue daily excellence.'}</div>
    <div style="width:100%;max-width:360px">
      ${!isSignIn ? `<input class="auth-input" type="text" id="auth-name" placeholder="First name" autocomplete="given-name" value="${esc(userName())}" onkeydown="if(event.key==='Enter')submitAuth()">` : ''}
      <input class="auth-input" type="email" id="auth-email" placeholder="Email address" autocomplete="email" value="${esc(_authPrefillEmail)}">
      <input class="auth-input" type="password" id="auth-password" placeholder="Password" autocomplete="${isSignIn ? 'current-password' : 'new-password'}" onkeydown="if(event.key==='Enter')submitAuth()">
      ${!isSignIn ? `<input class="auth-input" type="password" id="auth-confirm" placeholder="Confirm password" onkeydown="if(event.key==='Enter')submitAuth()">` : ''}
      <div class="auth-error" id="auth-error"${_authNotice && _authNotice.ok ? ' style="color:#6fd48e"' : ''}>${_authNotice ? esc(_authNotice.text) : ''}</div>
      <button class="auth-btn" id="auth-btn" onclick="submitAuth()">${isSignIn ? 'SIGN IN' : 'CREATE ACCOUNT'}</button>
      <div class="auth-switch">
        ${isSignIn ? `Don't have an account? <span onclick="_authMode='signup';renderAuth()">Sign up</span>` : `Already have an account? <span onclick="_authMode='signin';renderAuth()">Sign in</span>`}
      </div>
      ${isSignIn ? `<div class="auth-switch" style="margin-top:10px"><span onclick="handleForgotPassword()" style="color:var(--text-dim);font-weight:400">Forgot password?</span></div>` : ''}
      ${(LS.get('hvi_habits', null) || localStorage.getItem('hvi_onboarded')) ? `<div class="auth-switch" style="margin-top:16px"><span onclick="closeAuth()" style="color:var(--text-dim);font-weight:400">Maybe later — keep using the app</span></div>` : ''}
    </div>`;
  // One-shot: don't let a notice linger across later renders
  _authNotice = null;
  _authPrefillEmail = '';
}

function closeAuth() { document.getElementById('auth-overlay')?.remove(); }
function showSignup() { _authMode = 'signup'; renderAuth(); }
function showAuth() { _authMode = 'signin'; renderAuth(); }
function isGuest() { return !getAccessToken(); }

async function submitAuth() {
  const email = document.getElementById('auth-email')?.value?.trim();
  const password = document.getElementById('auth-password')?.value;
  const confirm = document.getElementById('auth-confirm')?.value;
  const errEl = document.getElementById('auth-error');
  const btn = document.getElementById('auth-btn');

  if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; return; }
  if (_authMode === 'signup' && password !== confirm) { errEl.textContent = 'Passwords do not match.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }

  btn.disabled = true; btn.textContent = _authMode === 'signin' ? 'SIGNING IN...' : 'CREATING ACCOUNT...';
  errEl.textContent = '';

  if (_authMode === 'signup') {
    const firstName = document.getElementById('auth-name')?.value?.trim();
    if (!firstName) { errEl.textContent = 'Please enter your first name.'; btn.disabled = false; btn.textContent = 'CREATE ACCOUNT'; return; }
    const res = await authSignUp(email, password, firstName);
    if (!res.ok) {
      // Already registered is the common case, and the useful answer is to send
      // them to sign in with their email kept, not to show a raw API string.
      trackFail('signup', res.code || res.error);
      if (res.code === 'user_already_exists' || /already registered/i.test(res.error)) {
        _authMode = 'signin';
        _authNotice = { text: 'You already have an account — sign in below.', ok: true };
        _authPrefillEmail = email;
        renderAuth();
        return;
      }
      errEl.textContent = res.error;
      btn.disabled = false; btn.textContent = 'CREATE ACCOUNT';
      return;
    }
    localStorage.setItem('hvi_user_name', firstName);
    track('sign_up', { method: 'email' });
    // Fire welcome webhook (server-side via Worker; non-blocking, never breaks signup)
    sendWelcomeWebhook(firstName, email);
    // Auto sign in after signup
    _authMode = 'signin';
  }

  const result = await authSignIn(email, password);
  if (!result.ok) {
    const msg = result.error || '';
    const low = msg.toLowerCase();
    trackFail('signin', low.includes('invalid login credentials') ? 'invalid_credentials' : msg);
    if (low.includes('not confirmed')) {
      errEl.style.color = '#6fd48e';
      errEl.textContent = 'Account created! Check your inbox to confirm your email, then sign in.';
    } else if (low.includes('invalid login credentials')) {
      // The API can't say which is wrong, but "invalid credentials" reads like
      // a system fault to most people. Name both possibilities instead.
      errEl.textContent = 'That email and password don\'t match. Check them, use "Forgot password?", or tap Sign up if you\'re new.';
    } else {
      errEl.textContent = msg || 'Sign in failed.';
    }
    btn.disabled = false; btn.textContent = 'SIGN IN'; return;
  }

  // Signed in — remove overlay and boot app normally
  track('login', { method: 'email' });
  document.getElementById('auth-overlay')?.remove();
  init();
}

async function handleForgotPassword() {
  const email = document.getElementById('auth-email')?.value?.trim();
  const errEl = document.getElementById('auth-error');
  if (!email) { errEl.style.color = 'var(--fat)'; errEl.textContent = 'Enter your email above first.'; return; }
  errEl.style.color = 'var(--text-dim)'; errEl.textContent = 'Sending…';
  const res = await authResetPassword(email);
  if (res.ok) { errEl.style.color = '#6fd48e'; errEl.textContent = 'Check your inbox for a reset link.'; }
  else { errEl.style.color = 'var(--fat)'; errEl.textContent = 'Could not send reset email. Try again.'; }
}

// ── STORAGE ───────────────────────────────────────────────────────────────
const LS = {
  get: (k, fb) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); schedulePush(); } catch {} },
};

// Collision-proof id generator (timestamp + random suffix). Avoids two items
// created in the same millisecond sharing an id.
function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

// ── DATE ──────────────────────────────────────────────────────────────────
const today = () => new Date().toLocaleDateString('en-CA');
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA'); };
const dayName = () => new Date().toLocaleDateString('en-US', { weekday: 'long' });
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const userName = () => localStorage.getItem('hvi_user_name') || '';
const fmtDate = s => { const [y,m,d] = s.split('-'); return new Date(+y,+m-1,+d).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }); };

// ── UTILS ─────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function ring(r, pct, sw = 3, color = 'var(--accent)') {
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(Math.max(pct, 0), 1));
  const sz = (r + sw) * 2;
  const cx = r + sw;
  return `<svg viewBox="0 0 ${sz} ${sz}">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${sw + 1}"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" stroke-linecap="round"
      style="--ring-c:${c.toFixed(2)};--ring-off:${off.toFixed(2)}"/>
  </svg>`;
}

// ── ICON SYSTEM ─────────────────────────────────────────────────────────────
// One consistent line-icon set (Feather/Lucide style) to replace emoji across
// the app. Workout/diet/habit reuse the exact nav paths so the tab bar and the
// rest of the UI agree. inherits color via stroke="currentColor".
const _ICONS = {
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  check: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  target2: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  swords: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  scale: '<path d="M12 3v18"/><path d="M5 21h14"/><path d="m3 7 4-2 4 2-4 8H3z" /><path d="m13 7 4-2 4 2-4 8h-4z"/>',
  brain: '<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44A2.5 2.5 0 0 1 4 17.5a2.5 2.5 0 0 1-1.1-4.62A2.5 2.5 0 0 1 4 8.5a2.5 2.5 0 0 1 3-2.42A2.5 2.5 0 0 1 9.5 2z"/>',
  utensils: '<path d="M3 2v7a3 3 0 0 0 6 0V2"/><path d="M6 9v13"/><path d="M18 2v20"/><path d="M18 9c1.66 0 3-1.34 3-3V2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  battery: '<rect x="1" y="6" width="18" height="12" rx="2" ry="2"/><line x1="23" y1="13" x2="23" y2="11"/>',
  meat: '<path d="M13.5 5.5a4.5 4.5 0 0 1 6.36 6.36l-7.07 7.07a4.5 4.5 0 0 1-6.36-6.36z"/><circle cx="8" cy="16" r="2.5"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  footprints: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/>',
  trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
};
function icon(name, size = 18) {
  return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${_ICONS[name] || ''}</svg>`;
}

// ── CHARACTER AVATARS ───────────────────────────────────────────────────────
// Illustrated stage art (PNG). Stage thresholds match LEVEL_TITLES exactly.
const _AVATAR_V = '1'; // bump to bust caches when art changes
function avatarStage(lvl) {
  return lvl >= 20 ? 6 : lvl >= 12 ? 5 : lvl >= 8 ? 4 : lvl >= 5 ? 3 : lvl >= 3 ? 2 : 1;
}
function avatarImg(lvl) {
  const s = avatarStage(lvl);
  return `<img class="avatar-img" src="avatar-${s}.png?v=${_AVATAR_V}" alt="Character stage ${s}" draggable="false">`;
}

// ── SKELETON LOADING ──────────────────────────────────────────────────────
function showSkeleton(type = 'home') {
  const view = document.getElementById('view');
  if (!view) return;
  const skels = {
    home: `<div class="skel-bar skeleton" style="width:40%;margin-top:48px"></div>
      <div class="skel-bar skeleton" style="width:70%;height:36px;margin-top:4px"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:24px 16px">
        <div class="skel-card skeleton"></div><div class="skel-card skeleton"></div>
        <div class="skel-card skeleton"></div><div class="skel-card skeleton"></div>
      </div>`,
    list: Array.from({length:6}, () => `<div class="skel-row skeleton"></div>`).join(''),
  };
  view.innerHTML = skels[type] || skels.home;
}

// ── UNDO TOAST ───────────────────────────────────────────────────────────
let _undoTimer = null;
function showUndo(msg, undoFn) {
  clearTimeout(_undoTimer);
  document.getElementById('undo-toast-el')?.remove();
  const el = document.createElement('div');
  el.id = 'undo-toast-el';
  el.className = 'undo-toast';
  el.innerHTML = `<div class="undo-toast-text">${msg}</div><button class="undo-toast-btn" id="undo-btn">UNDO</button>`;
  document.body.appendChild(el);
  document.getElementById('undo-btn').onclick = () => { undoFn(); el.remove(); clearTimeout(_undoTimer); };
  _undoTimer = setTimeout(() => el.remove(), 5000);
}

// ── QUICK-LOG FAB ────────────────────────────────────────────────────────
let _fabOpen = false;
function toggleQuickLog() {
  _fabOpen = !_fabOpen;
  const fab = document.getElementById('quick-log-fab');
  if (fab) fab.classList.toggle('open', _fabOpen);
  const existing = document.getElementById('quick-log-menu');
  if (existing) { existing.remove(); _fabOpen = false; fab?.classList.remove('open'); return; }
  if (!_fabOpen) return;
  const menu = document.createElement('div');
  menu.id = 'quick-log-menu';
  menu.className = 'quick-log-menu';
  menu.innerHTML = `
    <div class="quick-log-item" onclick="closeQuickLog();go('dietAddMeal')">${icon('utensils')} Log Meal</div>
    <div class="quick-log-item" onclick="closeQuickLog();go('workoutActive')">${icon('activity')} Start Workout</div>
    <div class="quick-log-item" onclick="closeQuickLog();go('library')">${icon('edit')} Journal</div>
    <div class="quick-log-item" onclick="closeQuickLog();go('sleep')">${icon('moon')} Log Sleep</div>`;
  document.body.appendChild(menu);
}
function closeQuickLog() {
  _fabOpen = false;
  document.getElementById('quick-log-menu')?.remove();
  document.getElementById('quick-log-fab')?.classList.remove('open');
}

// ── EVENING REMINDER ─────────────────────────────────────────────────────
function getEveningReminder() {
  const hour = new Date().getHours();
  if (hour < 20 || hour >= 24) return '';
  if (LS.get('hvi_evening_dismissed_' + today(), false)) return '';
  const {done, total} = totalPct();
  const left = total - done;
  if (left <= 0) return '';
  return `<div class="evening-banner ani">
    <div style="font-size:24px">🌙</div>
    <div class="evening-banner-text"><strong>${left} habit${left>1?'s':''} left today</strong> — still time to show up.</div>
    <button class="evening-banner-close" onclick="LS.set('hvi_evening_dismissed_${today()}',true);this.closest('.evening-banner').remove()">✕</button>
  </div>`;
}

// ── PULL TO REFRESH ──────────────────────────────────────────────────────
function initPullToRefresh() {
  const view = document.getElementById('view');
  if (!view) return;
  let startY = 0, pulling = false;
  view.addEventListener('touchstart', e => {
    if (view.scrollTop <= 0) { startY = e.touches[0].clientY; pulling = true; }
  }, { passive: true });
  view.addEventListener('touchmove', e => {
    if (!pulling) return;
    const diff = e.touches[0].clientY - startY;
    if (diff > 80 && view.scrollTop <= 0) {
      pulling = false;
      const ind = document.createElement('div');
      ind.className = 'ptr-indicator';
      ind.textContent = 'Syncing…';
      view.prepend(ind);
      cloudPull().then(() => {
        ind.textContent = 'Updated ✓';
        setTimeout(() => { ind.remove(); go(curView, {}, false); }, 800);
      });
    }
  }, { passive: true });
  view.addEventListener('touchend', () => { pulling = false; }, { passive: true });
}

// ── OFFLINE INDICATOR ────────────────────────────────────────────────────
function _updateOnlineStatus() {
  let el = document.getElementById('offline-banner');
  if (!navigator.onLine) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'offline-banner';
      el.className = 'offline-banner';
      el.innerHTML = '📡 You\'re offline — changes will sync when you reconnect.';
      document.body.prepend(el);
    }
  } else if (el) {
    el.textContent = '✓ Back online';
    setTimeout(() => el.remove(), 1500);
  }
}
window.addEventListener('online', () => { _updateOnlineStatus(); if (getAccessToken()) { _retryDelay = 5000; cloudPush(); } });
window.addEventListener('offline', _updateOnlineStatus);

// ── NOTIFICATIONS ───────────────────────────────────────────────────────
// Web notifications only fire while the page is open, which is the opposite of
// what a habit reminder needs. Inside the native shell we schedule real
// on-device notifications that repeat daily whether or not the app is running;
// on the web we keep the old best-effort behaviour.
function _nativeNotifier() {
  try {
    const C = window.Capacitor;
    return (C && C.Plugins && C.Plugins.LocalNotifications) || null;
  } catch { return null; }
}

// Fixed ids so re-arming replaces rather than stacks duplicates
const REMINDER_SLOTS = [
  { id: 1101, hour: 7,  minute: 30, title: 'Good morning ☀️',
    body: 'New day, new chance to show up. Set the tone early.' },
  { id: 1102, hour: 12, minute: 30, title: 'Log your meals 🥗',
    body: 'A few seconds of tracking keeps your targets honest.' },
  { id: 1103, hour: 20, minute: 30, title: 'Finish the day strong 🔥',
    body: 'Any habits still open? Don\'t let a streak break tonight.' },
];

async function scheduleNativeReminders() {
  const N = _nativeNotifier();
  if (!N) return false;
  try {
    let perm = await N.checkPermissions();
    if (perm.display !== 'granted') {
      perm = await N.requestPermissions();
      if (perm.display !== 'granted') return false;
    }
    // Always clear ours first so an upgrade or a settings change can't stack
    await N.cancel({ notifications: REMINDER_SLOTS.map(s => ({ id: s.id })) }).catch(() => {});
    if (!settings.notifications) return true; // permitted, but user turned them off
    await N.schedule({
      notifications: REMINDER_SLOTS.map(s => ({
        id: s.id, title: s.title, body: s.body,
        schedule: { on: { hour: s.hour, minute: s.minute }, allowWhileIdle: true },
      })),
    });
    return true;
  } catch (e) { reportError('notify-schedule', e); return false; }
}

async function cancelNativeReminders() {
  const N = _nativeNotifier();
  if (!N) return;
  try { await N.cancel({ notifications: REMINDER_SLOTS.map(s => ({ id: s.id })) }); }
  catch (e) { reportError('notify-cancel', e); }
}

// ── WEB PUSH ──────────────────────────────────────────────────────────────
// The polling fallback can only fire while the tab is alive, so an installed
// PWA uses real Web Push instead: the worker sends on a schedule and the
// service worker shows the notification even when Arete is closed. iOS has
// supported this since 16.4, but only for a Home Screen install.
const VAPID_PUBLIC_KEY = 'BBn2k9kMM_YpWz4RE4BWwB6g0GFQVtQzJM5XcxlwHOlPEVggoJ-Q9ni5L51r3NehpNAEHmZlC5rXppwYuk2llnM';

function _b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function pushSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
    typeof PushManager !== 'undefined' && 'Notification' in window;
}

function isStandalone() {
  try {
    return !!(navigator.standalone ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
  } catch { return false; }
}

// On iPhone, Safari only grants push to a Home Screen install
function pushNeedsInstall() {
  return /iP(hone|ad|od)/.test(navigator.userAgent || '') && !isStandalone();
}

async function _syncPushSubscription(sub) {
  try {
    const j = sub.toJSON();
    const res = await fetch(`${_ACCOUNT_WORKER}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: j.endpoint,
        keys: j.keys || {},
        // Sent on every launch so the schedule follows travel and DST
        tzOffset: -new Date().getTimezoneOffset(),
      }),
    });
    return res.ok;
  } catch { return false; }
}

async function enableWebPush() {
  if (!pushSupported()) return { error: 'This browser cannot deliver background reminders.' };
  if (pushNeedsInstall()) {
    return { error: 'On iPhone, add Arete to your Home Screen first (Share → Add to Home Screen), then turn reminders on from there.' };
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { error: 'Notifications were not allowed.' };
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _b64ToBytes(VAPID_PUBLIC_KEY),
      });
    }
    if (!(await _syncPushSubscription(sub))) {
      return { error: 'Could not reach the reminder service. Check your connection and try again.' };
    }
    return { ok: true };
  } catch (e) {
    reportError('push-enable', e);
    return { error: 'Could not enable reminders.' };
  }
}

async function disableWebPush() {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    // Tell the server first: if unsubscribing succeeds but the call fails we
    // would keep being sent pushes for an endpoint that no longer exists.
    await fetch(`${_ACCOUNT_WORKER}/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  } catch (e) { reportError('push-disable', e); }
}

// Refresh on launch so a changed timezone or a rotated endpoint is picked up
async function refreshPushSubscription() {
  if (!settings.notifications || !pushSupported() || _nativeNotifier()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) _syncPushSubscription(sub);
  } catch {}
}

function setNotifications(on) {
  settings.notifications = !!on;
  LS.set('hvi_settings', settings);
  const done = () => { if (typeof renderStats === 'function') renderStats(); };
  if (_nativeNotifier()) {
    (on ? scheduleNativeReminders() : cancelNativeReminders()).then(done);
    return;
  }
  if (pushSupported()) {
    (on ? enableWebPush() : disableWebPush()).then(res => {
      // Turning on can fail (permission refused, no Home Screen install)
      if (on && res && res.error) {
        settings.notifications = false;
        LS.set('hvi_settings', settings);
        _notifyError = res.error;
      } else {
        _notifyError = '';
      }
      done();
    });
    return;
  }
  done();
}

// Surfaced under the Reminders toggle so a refusal explains itself
let _notifyError = '';
function notifyError() { return _notifyError; }

function requestNotifications() {
  // Native shell: ask through the plugin and arm the real schedule
  if (_nativeNotifier()) {
    settings.notifications = true;
    LS.set('hvi_settings', settings);
    scheduleNativeReminders().then(ok => {
      settings.notifications = !!ok;
      LS.set('hvi_settings', settings);
      if (typeof renderStats === 'function') renderStats();
    });
    return;
  }
  // Installed web app: real background push
  if (pushSupported()) { setNotifications(true); return; }
  // Last resort: the in-page fallback, which only fires while Arete is open
  if (!('Notification' in window)) return;
  Notification.requestPermission().then(p => {
    settings.notifications = p === 'granted';
    LS.set('hvi_settings', settings);
    if (p === 'granted') _scheduleReminder();
    if (typeof renderStats === 'function') renderStats();
  });
}
function _scheduleReminder() {
  // Native builds use scheduleNativeReminders(); this polling fallback is only
  // meaningful on the web, where it can fire while the tab is alive.
  if (_nativeNotifier()) return;
  if (!('Notification' in window)) return;
  if (!settings.notifications || Notification.permission !== 'granted') return;
  const now = new Date();
  const hour = now.getHours();
  const key = 'hvi_notif_';

  // Morning motivation (7-8am)
  if (hour >= 7 && hour < 8 && !LS.get(key + 'am_' + today(), false)) {
    const morningMsgs = [
      'New day, new chance to show up. What will you conquer today?',
      'The obstacle is the way. Time to begin.',
      'Small daily improvements lead to remarkable results.',
      'Your future self is watching. Make them proud.',
    ];
    const msg = morningMsgs[Math.floor(Math.random() * morningMsgs.length)];
    new Notification('Good morning ☀️', { body: msg, icon: '/icon-192.png' });
    LS.set(key + 'am_' + today(), true);
  }

  // Lunch nutrition nudge (12-1pm) — only if no meals logged yet
  if (hour >= 12 && hour < 13 && !LS.get(key + 'lunch_' + today(), false)) {
    const dm = getDayMacros();
    if (dm.cal === 0) {
      new Notification('Log your meals 🥗', { body: 'No meals logged yet today. A few seconds to track keeps you on target.', icon: '/icon-192.png' });
      LS.set(key + 'lunch_' + today(), true);
    }
  }

  // Evening nudge (8-9pm) — only if habits remain
  if (hour >= 20 && hour < 21 && !LS.get(key + 'pm_' + today(), false)) {
    const {done, total} = totalPct();
    const left = total - done;
    if (left > 0) {
      // Check for streaks at risk first — more urgent
      const atRisk = getStreaksAtRisk();
      if (atRisk.length > 0) {
        const top = atRisk.sort((a,b) => b.streak - a.streak)[0];
        new Notification('Streak at risk 🔥', { body: `${top.name} (${top.streak} day streak) — don't let it break.`, icon: '/icon-192.png' });
      } else {
        new Notification('Arete', { body: `${left} habit${left>1?'s':''} left today — still time to show up.`, icon: '/icon-192.png' });
      }
      LS.set(key + 'pm_' + today(), true);
    }
  }

  // Re-check every 30 minutes
  setTimeout(_scheduleReminder, 30 * 60 * 1000);
}

// ── MILESTONE CELEBRATIONS ──────────────────────────────────────────────
function showMilestone({ icon, title, subtitle, message, xp }) {
  launchConfetti(2);
  haptic([50, 30, 50, 30, 80]);
  playSound('levelup');
  const el = document.createElement('div');
  el.className = 'milestone-overlay';
  el.innerHTML = `
    <div class="milestone-card">
      <div class="milestone-icon">${icon}</div>
      <div class="milestone-title">${title}</div>
      ${subtitle ? `<div class="milestone-sub">${esc(subtitle)}</div>` : ''}
      <div class="milestone-msg">${message}</div>
      ${xp ? `<div class="milestone-xp">+${xp} XP</div>` : ''}
      <button class="milestone-btn" onclick="this.closest('.milestone-overlay').remove()">Continue</button>
    </div>`;
  document.body.appendChild(el);
  // Auto-dismiss after 8 seconds
  setTimeout(() => el.remove(), 8000);
}

// ── SOUND EFFECTS ────────────────────────────────────────────────────────
const _audioCtx = typeof AudioContext !== 'undefined' ? new AudioContext() : null;
function playSound(type) {
  if (!_audioCtx || (settings || {}).sounds === false) return;
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  const osc = _audioCtx.createOscillator();
  const gain = _audioCtx.createGain();
  osc.connect(gain); gain.connect(_audioCtx.destination);
  gain.gain.value = 0.08;
  if (type === 'check') {
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.15);
    osc.start(); osc.stop(_audioCtx.currentTime + 0.15);
  } else if (type === 'levelup') {
    osc.frequency.value = 523; osc.type = 'sine';
    osc.frequency.setValueAtTime(523, _audioCtx.currentTime);
    osc.frequency.setValueAtTime(659, _audioCtx.currentTime + 0.1);
    osc.frequency.setValueAtTime(784, _audioCtx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.1, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.4);
    osc.start(); osc.stop(_audioCtx.currentTime + 0.4);
  } else if (type === 'complete') {
    osc.frequency.value = 660; osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, _audioCtx.currentTime);
    osc.frequency.setValueAtTime(880, _audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.1, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.2);
    osc.start(); osc.stop(_audioCtx.currentTime + 0.2);
  }
}

// ── ALL PROGRAMS (built-in + custom) ──────────────────────────────────────
function allPrograms() { return [...WORKOUT_PROGRAMS, ...LS.get('hvi_custom_programs', [])]; }
function findProgram(id) { return allPrograms().find(p => p.id === id); }

// ── NAV PARENT MAP ────────────────────────────────────────────────────────
const NAV_PARENT = {
  pillar: 'home',
  habitCreate: 'habits',
  workoutPicker: 'workout', workoutActive: 'workout', workoutHistory: 'workout', workoutBuilder: 'workout', exerciseBrowser: 'workout', prHistory: 'workout', workoutProgress: 'workout',
  dietAddMeal: 'diet', dietRecipes: 'diet', dietRecipeDetail: 'diet', dietGoals: 'diet', dietTrend: 'diet', dietTDEE: 'diet',
  calendar: 'stats', progressPhotos: 'stats', challenges: 'home', leaderboard: 'home', character: 'home', goals: 'stats',
};

// ── INIT ──────────────────────────────────────────────────────────────────
async function init() {
  injectAuthStyles();
  // Guest mode: the app is fully local-first, so anyone can use it immediately.
  // Cloud sync only runs once they've created an account.
  if (getAccessToken()) {
    try { localStorage.removeItem('hvi_guest'); } catch {}
    setSyncStatus('pending');
    await cloudPull();
  } else {
    try { if (!localStorage.getItem('hvi_guest')) localStorage.setItem('hvi_guest', '1'); } catch {}
  }
  const stored = LS.get('hvi_habits', null);
  habits = stored || DEFAULT_HABITS;
  if (!stored) LS.set('hvi_habits', habits);

  log = LS.get('hvi_log', {});
  habits.forEach(h => { if (!log[h.id]) log[h.id] = { streak: 0, lastCompletedDate: '', completedToday: false }; });

  journal = LS.get('hvi_journal3', {});
  meta = LS.get('hvi_meta', { lastOpenedDate: '', quoteIndex: 0, totalPerfectDays: 0 });
  workoutLog = LS.get('hvi_workout_log', {});
  workoutMeta = LS.get('hvi_workout_meta', { activeProgram: 'ppl', currentDayIndex: 0, lastWorkoutDate: '' });
  mealLog = LS.get('hvi_meal_log', {});
  dietMeta = LS.get('hvi_diet_meta', { dailyGoals: { calories: 2500, protein: 180, carbs: 280, fat: 80 } });
  weightLog = LS.get('hvi_weight_log', {});
  if (!dietMeta.goalType) dietMeta.goalType = 'maintain';
  tdeeProfile = LS.get('hvi_tdee_profile', null);
  prs = LS.get('hvi_prs', {});
  wgerCache = LS.get('hvi_wger_cache', {});
  gamification = LS.get('hvi_gamification', { xp: 0, pillarXP: {}, journalXPDate: '', weeklyStats: { weekKey: '', workoutDays: [], journalDays: [], proteinDays: [] } });
  achievements = LS.get('hvi_achievements', []);
  settings = LS.get('hvi_settings', { units: 'metric' });
  calTasks = LS.get('hvi_cal_tasks', {});
  sleepLog = LS.get('hvi_sleep_log', {});
  routines = LS.get('hvi_routines', {
    morning: [
      { name: 'Make bed' },
      { name: 'Hydrate (big glass of water)', habitId: 'h07' },
      { name: 'Stretch / mobility (5 min)' },
      { name: 'Cold shower', habitId: 'h04' },
      { name: 'Meditate (10 min)', habitId: 'h01' },
      { name: 'Review today\'s goals', habitId: 'h02' }
    ],
    night: [
      { name: 'Screen off 30 min before bed' },
      { name: 'Journal / reflect on the day' },
      { name: 'Prepare tomorrow\'s clothes' },
      { name: 'Gratitude (3 things)' },
      { name: 'Lights out by 22:30', habitId: 'h08' }
    ]
  });
  // Migrate old string-based routines to object format
  ['morning', 'night'].forEach(p => {
    routines[p] = (routines[p] || []).map(item => typeof item === 'string' ? { name: item } : item);
  });
  routineLog = LS.get('hvi_routine_log', {});

  // ── Identify user in GA4 ───────────────────────────────────────────────
  const _sid = getSession();
  if (_sid?.user?.id && typeof gtag === 'function') {
    gtag('config', 'G-4NQYVJR5S2', { user_id: _sid.user.id });
    gtag('set', 'user_properties', {
      user_name: userName() || undefined,
      user_email: _sid.user.email || undefined,
      sign_up_date: _sid.user.created_at?.slice(0, 10) || undefined,
      last_active: new Date().toISOString().slice(0, 10)
    });
  }

  applyTheme();
  injectAdaptiveStyles();
  injectExerciseBrowserStyles();
  injectGamificationStyles();
  injectOnboardingStyles();
  checkReset();
  // Initial sync status
  setSyncStatus('ok');
  // Sync on load: pull cloud data, merge, push, then reload in-memory state
  cloudPush().then(() => {
    habits = LS.get('hvi_habits', habits);
    log = LS.get('hvi_log', log);
    habits.forEach(h => { if (!log[h.id]) log[h.id] = { streak: 0, lastCompletedDate: '', completedToday: false }; });
    // Re-sanitize after sync reload — clear any stale completedToday
    checkReset();
    journal = LS.get('hvi_journal3', journal);
    meta = LS.get('hvi_meta', meta);
    workoutLog = LS.get('hvi_workout_log', workoutLog);
    workoutMeta = LS.get('hvi_workout_meta', workoutMeta);
    mealLog = LS.get('hvi_meal_log', mealLog);
    dietMeta = LS.get('hvi_diet_meta', dietMeta);
    weightLog = LS.get('hvi_weight_log', weightLog);
    sleepLog = LS.get('hvi_sleep_log', sleepLog);
    prs = LS.get('hvi_prs', prs);
    gamification = LS.get('hvi_gamification', gamification);
    achievements = LS.get('hvi_achievements', achievements);
    settings = LS.get('hvi_settings', settings);
    go(curView, {}, false);
  }).catch(() => {});

  // Re-sync when user returns to the app (tab becomes visible again)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && getAccessToken()) {
      // Re-run checkReset in case the day changed while app was backgrounded
      checkReset();
      setSyncStatus('pending');
      const pulled = await cloudPull();
      if (pulled) {
        // Reload all in-memory state from localStorage with fresh cloud data
        habits = LS.get('hvi_habits', habits);
        log = LS.get('hvi_log', log);
        habits.forEach(h => { if (!log[h.id]) log[h.id] = { streak: 0, lastCompletedDate: '', completedToday: false }; });
        journal = LS.get('hvi_journal3', journal);
        meta = LS.get('hvi_meta', meta);
        workoutLog = LS.get('hvi_workout_log', workoutLog);
        workoutMeta = LS.get('hvi_workout_meta', workoutMeta);
        mealLog = LS.get('hvi_meal_log', mealLog);
        dietMeta = LS.get('hvi_diet_meta', dietMeta);
        weightLog = LS.get('hvi_weight_log', weightLog);
        sleepLog = LS.get('hvi_sleep_log', sleepLog);
        prs = LS.get('hvi_prs', prs);
        gamification = LS.get('hvi_gamification', gamification);
        achievements = LS.get('hvi_achievements', achievements);
        settings = LS.get('hvi_settings', settings);
        // Push merged state back so cloud has everything from both devices
        cloudPush();
        // Re-render current view
        go(curView, {}, false);
      }
      setSyncStatus('ok');
    } else if (document.visibilityState === 'hidden' && getAccessToken()) {
      // Push to cloud BEFORE the tab goes to sleep (critical on mobile)
      clearTimeout(_syncDebounce);
      _beaconPush();
    }
  });

  // Push to cloud when the page is being closed / navigated away
  window.addEventListener('beforeunload', () => {
    if (getAccessToken()) { clearTimeout(_syncDebounce); _beaconPush(); }
  });

  // Also push when the PWA is being frozen (iOS/Android)
  if ('onfreeze' in document) {
    document.addEventListener('freeze', () => {
      if (getAccessToken()) { clearTimeout(_syncDebounce); _beaconPush(); }
    });
  }

  // Quick-log FAB removed — actions accessible from nav tabs and home cards
  initPullToRefresh();
  _updateOnlineStatus();
  _scheduleReminder();
  // Re-arm native reminders on every launch: a reinstall, an OS update or a
  // schedule change can drop them, and re-arming is idempotent.
  if (_nativeNotifier() && settings.notifications) scheduleNativeReminders();
  refreshPushSubscription();

  if (!LS.get('hvi_onboarded', false)) {
    // Don't handle an invite link yet: it would navigate underneath the
    // onboarding overlay and be replaced by home the moment onboarding ends.
    // obFinish() picks it up instead.
    renderOnboarding(0);
    return;
  } else {
    (() => {
      const validViews = ['home','pillar','habits','habitCreate','stats','progressPhotos','workout','workoutPicker','workoutActive','workoutHistory','workoutProgress','workoutBuilder','exerciseBrowser','diet','dietAddMeal','dietRecipes','dietRecipeDetail','dietGoals','dietTrend','dietTDEE','library','calendar','sleep','challenges','goals','character','leaderboard'];
      const hash = location.hash.replace(/^#/, '');
      const view = validViews.includes(hash) ? hash : 'home';
      go(view, {}, false);
      // Show weekly recap on Monday (or Sunday afternoon)
      setTimeout(() => checkWeeklyRecap(), 600);
    })();
  }
  // Handle a leaderboard invite link (?join=CODE)
  _handlePendingJoin();
}

// Someone opened a shared invite link. Auto-join the group if signed in; if a
// guest, keep the code and route them to the leaderboard's join CTA. Retries
// while social.js (which owns the join fn) finishes lazy-loading.
function _handlePendingJoin(_tries) {
  let code = null;
  try { code = localStorage.getItem('hvi_pending_join'); } catch {}
  if (!code) return;
  if (!getAccessToken()) {
    // Guest: send them to the leaderboard, which shows an invite-aware CTA.
    // Wait for social.js (owns renderLeaderboard) to finish lazy-loading.
    if (typeof renderLeaderboard !== 'function') {
      if ((_tries || 0) < 12) return void setTimeout(() => _handlePendingJoin((_tries || 0) + 1), 500);
      return;
    }
    if (curView !== 'leaderboard') go('leaderboard');
    return;
  }
  if (typeof _lbJoinGroupByCode !== 'function') {
    if ((_tries || 0) < 12) return void setTimeout(() => _handlePendingJoin((_tries || 0) + 1), 500);
    return;
  }
  _lbJoinGroupByCode(code).then(res => {
    try { localStorage.removeItem('hvi_pending_join'); } catch {}
    if (res && res.group) {
      _lbView = 'group'; _lbActiveGroup = res.group.id;
      go('leaderboard');
      if (typeof _showToast === 'function') _showToast('Joined ' + res.group.name + ' 🏆');
    } else if (res && res.error) {
      if (typeof _showToast === 'function') _showToast(res.error);
    }
  }).catch(() => {});
}

function checkReset() {
  const t = today();
  // Always sanitize: clear any completedToday where lastCompletedDate isn't actually today
  // This catches stale data restored by cloud sync after a previous checkReset
  let sanitized = false;
  habits.forEach(h => {
    const e = log[h.id];
    if (e && e.completedToday && e.lastCompletedDate !== t) {
      e.completedToday = false;
      sanitized = true;
    }
  });
  if (sanitized) LS.set('hvi_log', log);
  if (meta.lastOpenedDate === t) return;
  const allDone = habits.every(h => log[h.id]?.completedToday);
  if (allDone && meta.lastOpenedDate) meta.totalPerfectDays = (meta.totalPerfectDays || 0) + 1;
  habits.forEach(h => {
    const e = log[h.id];
    if (e) {
      // Record completion in history for weekly scheduling
      if (e.completedToday && meta.lastOpenedDate) {
        const hist = LS.get('hvi_habit_history') || {};
        if (!hist[h.id]) hist[h.id] = [];
        hist[h.id].push(meta.lastOpenedDate);
        if (hist[h.id].length > 60) hist[h.id] = hist[h.id].slice(-60);
        LS.set('hvi_habit_history', hist);
      }
      e.completedToday = false;
      // Only break streak if habit was due yesterday
      if (e.streak > 0 && e.lastCompletedDate !== yesterday()) {
        const wasDueYesterday = !h.schedule || h.schedule === 'daily' ||
          (h.schedule === 'specific' && (h.days || [0,1,2,3,4,5,6]).includes(new Date(yesterday()).getDay()));
        if (wasDueYesterday) e.streak = 0;
      }
    }
  });

  // Advance workout day only if a workout was completed yesterday
  if (workoutMeta.lastWorkoutDate === yesterday()) {
    const prog = findProgram(workoutMeta.activeProgram);
    if (prog) workoutMeta.currentDayIndex = (workoutMeta.currentDayIndex + 1) % prog.days.length;
    LS.set('hvi_workout_meta', workoutMeta);
  }

  meta.lastOpenedDate = t;
  LS.set('hvi_log', log);
  LS.set('hvi_meta', meta);
  maybeAwardStreakShield();
}

// ── NAVIGATION ────────────────────────────────────────────────────────────
function go(view, params = {}, pushState = true) {
  // Paywall: gate premium sections for free (post-trial) users
  if (typeof isPremium === 'function' && !isPremium()) {
    const _parent = NAV_PARENT[view] || view;
    if (_parent === 'workout') { showUpgradeModal('workout'); return; }
    if (_parent === 'diet') { showUpgradeModal('diet'); return; }
  }
  clearInterval(qTimer);
  closeQuickLog();
  curView = view;
  curPillar = params.pillar || null;
  curRecipeId = params.recipeId || null;
  track('page_view', { page_title: view });

  if (pushState) {
    const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
    history.pushState({ view, params }, '', '#' + (view === 'home' ? '' : view));
  }

  const navKey = NAV_PARENT[view] || view;
  document.querySelectorAll('.ni').forEach(el => el.classList.toggle('active', el.dataset.n === navKey));
  const viewEl = document.getElementById('view');
  viewEl.scrollTop = 0;
  viewEl.classList.remove('view-slide-in');
  void viewEl.offsetWidth;
  viewEl.classList.add('view-slide-in');

  const renders = {
    home: renderHome, pillar: renderPillar, habits: renderHabits, habitCreate: renderHabitCreate, stats: renderStats,
    workout: renderWorkout, workoutPicker: renderWorkoutPicker, workoutActive: renderWorkoutActive, workoutHistory: renderWorkoutHistory, workoutBuilder: renderWorkoutBuilder, exerciseBrowser: renderExerciseBrowser, prHistory: renderPRHistory, workoutProgress: renderWorkoutProgress,
    diet: renderDiet, dietAddMeal: renderDietAddMeal, dietRecipes: renderDietRecipes, dietRecipeDetail: renderDietRecipeDetail, dietGoals: renderDietGoals, dietTrend: renderDietTrend, dietTDEE: renderDietTDEE,
    library: renderLibrary,
    sleep: renderSleep, progressPhotos: renderProgressPhotos, challenges: renderChallenges, leaderboard: renderLeaderboard, character: renderCharacter, goals: renderGoals,
    calendar: () => { window._statsSubView = 'calendar'; renderStats(); },
  };
  (renders[view] || renderHome)();
}

window.addEventListener('popstate', e => {
  if (e.state && e.state.view) go(e.state.view, e.state.params || {}, false);
});

// ── HABIT HELPERS ─────────────────────────────────────────────────────────
function pillarHabits(pid) { const p = PILLARS.find(x => x.id === pid); return habits.filter(h => p.cats.includes(h.category)); }
function isHabitDueToday(h) {
  if (!h.schedule || h.schedule === 'daily') return true;
  const dow = new Date().getDay(); // 0=Sun
  if (h.schedule === 'specific') return (h.days || [0,1,2,3,4,5,6]).includes(dow);
  if (h.schedule === 'weekly') {
    // Due if completed < perWeek this calendar week
    const perWeek = h.perWeek || 7;
    const now = new Date(), start = new Date(now); start.setDate(now.getDate() - now.getDay());
    let count = 0;
    for (let d = new Date(start); d <= now; d.setDate(d.getDate()+1)) {
      const key = d.toISOString().slice(0,10);
      if (key === today() && log[h.id]?.completedToday) count++;
      else if (key !== today()) { /* check history */ const hist = LS.get('hvi_habit_history') || {}; if (hist[h.id]?.includes(key)) count++; }
    }
    return count < perWeek;
  }
  return true;
}
function pillarPct(pid) { const ph = pillarHabits(pid).filter(isHabitDueToday); if (!ph.length) return {done:0,total:0,pct:0}; const d = ph.filter(h => log[h.id]?.completedToday).length; return {done:d,total:ph.length,pct:d/ph.length}; }
function totalPct() { const d = habits.filter(h => log[h.id]?.completedToday).length; return {done:d,total:habits.length,pct:habits.length?d/habits.length:0}; }

// A day only counts as trained if at least one set was completed (or the entry
// came from an external source like Strava). Opening the workout screen
// auto-creates an empty log entry, which must never count as training.
function trainedOnDay(dateKey) {
  const w = (workoutLog || {})[dateKey];
  return !!(w && (w.source || (w.exercises || []).some(e => (e.sets || []).some(s => s.completed))));
}
function workoutDoneToday() { return trainedOnDay(today()); }

function habitRowHTML(h, suffix = '', editMode = false) {
  const e = log[h.id] || {}, s = e.streak || 0;
  const due = isHabitDueToday(h);
  const streakTxt = s > 0 ? `${s >= 3 ? '\uD83D\uDD25 ' : ''}${s} day streak` : 'Start your streak';
  const _lk = (typeof getHabitLink === 'function' && getHabitLink(h.id)) ? ' <span class="hi-auto" title="Auto-completes from another module">\u26A1</span>' : '';
  if (!due && !editMode) {
    return `<div class="hi rest-day" id="hi${suffix}-${h.id}" style="opacity:0.4;pointer-events:none">
      <div class="hi-info"><div class="hi-name">${esc(h.name)}</div><div class="hi-streak">Rest day</div></div>
      <div class="hi-check" aria-hidden="true">\u2014</div></div>`;
  }
  if (editMode) {
    const idx = habits.indexOf(h);
    return `<div class="hi" id="hi${suffix}-${h.id}" style="opacity:0.85">
      <div class="hi-info"><div class="hi-name">${esc(h.name)}${_lk}</div><div class="hi-streak" id="hs${suffix}-${h.id}">${streakTxt}</div></div>
      <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
        <button class="habit-move-btn" onclick="event.stopPropagation();moveHabit('${h.id}',-1)" ${idx===0?'disabled':''}>▲</button>
        <button class="habit-move-btn" onclick="event.stopPropagation();moveHabit('${h.id}',1)" ${idx===habits.length-1?'disabled':''}>▼</button>
        <button class="habit-edit-btn" onclick="event.stopPropagation();openEditHabit('${h.id}')">✎</button>
        <button class="habit-del-btn" onclick="event.stopPropagation();deleteHabit('${h.id}')">&times;</button>
      </div></div>`;
  }
  return `<div class="hi${e.completedToday?' done':''}" id="hi${suffix}-${h.id}" onclick="tapHabit('${h.id}','${suffix}')" role="checkbox" aria-checked="${!!e.completedToday}" aria-label="${esc(h.name)} \u2014 ${streakTxt}" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();tapHabit('${h.id}','${suffix}')}">
    <div class="hi-info"><div class="hi-name">${esc(h.name)}${_lk}</div><div class="hi-streak${s>=3?' hot':''}" id="hs${suffix}-${h.id}">${streakTxt}</div></div>
    <div class="hi-check" id="hc${suffix}-${h.id}" aria-hidden="true">\u2713</div></div>`;
}

function tapHabit(id, suffix) {
  const e = log[id], t = today(), y = yesterday();
  const wasFirst = !habits.some(h => h.id !== id && log[h.id]?.completedToday);
  if (!e.completedToday) { e.streak = e.lastCompletedDate === y ? e.streak + 1 : 1; e.lastCompletedDate = t; e.completedToday = true; }
  else { e.completedToday = false; }
  LS.set('hvi_log', log);
  const habit = habits.find(h => h.id === id);
  const pillarId = habit ? PILLARS.find(p => p.cats.includes(habit.category))?.id : null;
  if (e.completedToday) {
    playSound('check');
    track('habit_complete', { habit_name: habit?.name, streak: e.streak || 0 });
    const s = e.streak || 0;
    const bonus = s >= 30 ? 10 : s >= 14 ? 7 : s >= 7 ? 5 : 0;
    awardXP(10 + bonus, pillarId || undefined);
    if (wasFirst) {
      launchConfetti(0.5);
      // First EVER habit completion — welcome celebration + ask for notifications
      const totalCompletions = Object.values(log).filter(l => l.lastCompletedDate).length;
      if (totalCompletions <= 1 && !settings.notifications && 'Notification' in window && Notification.permission === 'default') {
        setTimeout(() => {
          const el = document.createElement('div');
          el.className = 'streak-toast';
          el.style.cssText = 'bottom:100px;animation-duration:5s';
          el.innerHTML = '🎉 First habit done! You\'re on your way.';
          document.body.appendChild(el);
          setTimeout(() => el.remove(), 4500);
          // Ask for notifications after the celebration settles
          setTimeout(() => requestNotifications(), 3000);
        }, 800);
      }
    }
    // Streak milestone celebrations
    if ([7, 14, 30, 60, 100, 365].includes(s)) {
      showMilestone({
        icon: s >= 100 ? '👑' : s >= 30 ? '⚡' : '🔥',
        title: `${s}-Day Streak!`,
        subtitle: habit.name,
        message: s >= 365 ? 'A full year. Legendary discipline.'
          : s >= 100 ? 'Triple digits. You are relentless.'
          : s >= 60 ? 'Two months strong. This is who you are now.'
          : s >= 30 ? 'One month of consistency. Most people never get here.'
          : s >= 14 ? 'Two weeks in. The habit is taking root.'
          : 'One full week. The hardest part is behind you.',
        xp: s >= 100 ? 200 : s >= 30 ? 100 : 50,
      });
      awardXP(s >= 100 ? 200 : s >= 30 ? 100 : 50, pillarId || undefined);
    } else {
      haptic(10);
    }
    checkDailyQuests();
  } else {
    // Deduct XP when unchecking — prevents farming
    awardXP(-10, pillarId || undefined);
  }
  const row = document.getElementById(`hi${suffix}-${id}`), chk = document.getElementById(`hc${suffix}-${id}`), stk = document.getElementById(`hs${suffix}-${id}`);
  if (!row) return;
  const s = e.streak || 0;
  row.classList.toggle('done', !!e.completedToday);
  row.setAttribute('aria-checked', !!e.completedToday);
  if (stk) { stk.textContent = s > 0 ? `${s>=3?'\uD83D\uDD25 ':''}${s} day streak` : 'Start your streak'; stk.className = `hi-streak${s>=3?' hot':''}`; }
  if (chk) { chk.classList.remove('pop'); void chk.offsetWidth; chk.classList.add('pop'); }
  if (curView === 'pillar') refreshPillarRing();
}

function refreshPillarRing() {
  const {done,total,pct} = pillarPct(curPillar);
  const r = document.querySelector('.pd-ring');
  if (r) r.innerHTML = ring(32,pct,3.5) + `<div class="pd-pct">${Math.round(pct*100)}%</div>`;
  const l = document.querySelector('.pd-lbl');
  if (l) l.textContent = `Habits \u00B7 ${done}/${total}`;
}

// ══════════════════════════════════════════════════════════════════════════
// RENDER: HOME
// ══════════════════════════════════════════════════════════════════════════
function renderWeekInReview() {
  ensureWeeklyStats();
  const ws = gamification.weeklyStats;
  const best = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const weekAvgCal = computeWeeklyAvgCalories(mealLog);

  // Get this week's date range
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const mon = new Date(now);
  mon.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekRange = `${fmt(mon)} – ${fmt(sun)}`;

  // Count habits done this week (from habit history)
  const hist = LS.get('hvi_habit_history', {});
  let weekHabitDays = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    if (key > today()) break;
    const anyDone = Object.values(hist).some(arr => arr.includes(key));
    if (anyDone) weekHabitDays++;
  }

  // Sleep average this week
  let sleepTotal = 0, sleepCount = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    if (key > today()) break;
    const s = sleepLog[key];
    if (s && s.hours) { sleepTotal += s.hours; sleepCount++; }
  }
  const avgSleep = sleepCount ? (sleepTotal / sleepCount).toFixed(1) : null;

  // Weight change this week
  const weekWeights = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    if (weightLog[key]) weekWeights.push(weightLog[key]);
  }
  const weightDelta = weekWeights.length >= 2 ? (weekWeights[weekWeights.length - 1] - weekWeights[0]).toFixed(1) : null;

  // Steps average
  const _sLog = JSON.parse(localStorage.getItem('hvi_steps_log') || '{}');
  let stepsTotal = 0, stepsCount = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    if (key > today()) break;
    if (_sLog[key]) { stepsTotal += _sLog[key]; stepsCount++; }
  }
  const avgSteps = stepsCount ? Math.round(stepsTotal / stepsCount) : null;

  const stats = [
    { icon: '🏋️', val: ws.workoutDays.length, lbl: 'workouts' },
    { icon: '🔥', val: best + 'd', lbl: 'best streak' },
    { icon: '✅', val: weekHabitDays + '/7', lbl: 'active days' },
    { icon: '🍽️', val: weekAvgCal !== null ? weekAvgCal.toLocaleString() : '—', lbl: 'avg cal' },
    ...(avgSleep ? [{ icon: '😴', val: avgSleep + 'h', lbl: 'avg sleep' }] : []),
    ...(avgSteps ? [{ icon: '👟', val: avgSteps.toLocaleString(), lbl: 'avg steps' }] : []),
    ...(weightDelta !== null ? [{ icon: '⚖️', val: (weightDelta > 0 ? '+' : '') + weightDelta + 'kg', lbl: 'weight' }] : []),
  ];

  const statsHTML = stats.map(s => `
    <div class="wir-stat">
      <div class="wir-stat-val">${s.val}</div>
      <div class="wir-stat-lbl">${s.icon} ${s.lbl}</div>
    </div>`).join('');

  return `
    <div class="hm-sec ani" style="margin-top:20px">
      <div class="hm-sec-title">Week in Review</div>
      <div style="font-size:11px;color:var(--text-muted);letter-spacing:0.5px">${weekRange}</div>
    </div>
    <div class="wir-grid ani">${statsHTML}</div>
    <div style="text-align:center;padding:4px 0 0" class="ani">
      <button class="wir-share-btn" onclick="showWeeklyRecap()">View Full Recap</button>
    </div>`;
}

// ── STREAK-AT-RISK DETECTION ─────────────────────────────────────────────
function getStreaksAtRisk() {
  const hour = new Date().getHours();
  if (hour < 18) return []; // only warn in the evening
  return habits.filter(h => {
    const e = log[h.id];
    if (!e || e.completedToday) return false;
    if (e.streak >= 3 && isHabitDueToday(h)) return true;
    return false;
  }).map(h => ({ name: h.name, streak: log[h.id].streak }));
}

// ── WELCOME BACK DETECTION ──────────────────────────────────────────────
function getWelcomeBack() {
  const lastDate = meta.lastOpenedDate;
  if (!lastDate || lastDate === today()) return null;
  const diff = Math.floor((new Date(today() + 'T12:00') - new Date(lastDate + 'T12:00')) / 86400000);
  if (diff < 2) return null;
  return diff;
}

function renderHome() {
  const {done, total, pct} = totalPct();
  const homeLvl = getLevel(gamification.xp || 0);
  const { lvl, progress, needed } = xpToNextLevel(gamification.xp || 0);
  const xpPct = needed > 0 ? (progress / needed * 100).toFixed(1) : 100;
  const score = computeDailyScore();
  const scoreColor = score >= 80 ? 'var(--accent-b)' : score >= 50 ? 'var(--carb)' : 'var(--fat)';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // Overall streak — consecutive days with at least 1 habit done
  const _overallStreak = (() => {
    let streak = 0, d = new Date();
    // Check today first
    if (habits.some(h => log[h.id]?.completedToday)) streak++;
    else return 0;
    // Check backwards
    for (let i = 1; i < 365; i++) {
      d.setDate(d.getDate() - 1);
      const key = d.toISOString().slice(0, 10);
      const hist = LS.get('hvi_habit_history', {});
      const anyDone = Object.values(hist).some(arr => arr.includes(key));
      if (anyDone) streak++; else break;
    }
    return streak;
  })();

  // Pillar strip
  const pillarStrip = PILLARS.map(p => {
    const pr = pillarPct(p.id);
    const ms = Math.max(0, ...pillarHabits(p.id).map(h => log[h.id]?.streak || 0));
    const active = pr.done > 0 ? ' hm-pc-active' : '';
    return `<div class="hm-pc${active}" onclick="go('pillar',{pillar:'${p.id}'})">
      <div class="hm-pc-ring">${ring(23, pr.pct, 2.5)}<div class="hm-pc-icon">${p.icon}</div></div>
      <div class="hm-pc-name">${p.name}</div>
      ${ms > 0 ? `<div class="hm-pc-streak">${ms}d</div>` : ''}
    </div>`;
  }).join('');

  // Workout card
  const wProg = findProgram(workoutMeta.activeProgram) || WORKOUT_PROGRAMS[0];
  const wDay = wProg.days[workoutMeta.currentDayIndex % wProg.days.length];
  const wLogged = workoutDoneToday();
  const wEntry = workoutLog[today()];
  const wExternal = wEntry?.source;
  const wExtraBadges = wExternal ? [
    wEntry.distance ? `📏 ${wEntry.distance}` : '',
    wEntry.avgHr ? `💓 ${wEntry.avgHr} bpm` : '',
    wEntry.calories ? `🔥 ${wEntry.calories} cal` : '',
    wEntry.duration ? `⏱ ${wEntry.duration}m` : ''
  ].filter(Boolean).join('  ') : '';

  // Sleep data
  const slp = sleepLog[today()] || {};
  const slpHours = slp.hours || 0;
  const slpQuality = slp.quality || 0;

  // Steps & energy
  const _stepsLog = JSON.parse(localStorage.getItem('hvi_steps_log') || '{}');
  const _energyLog = JSON.parse(localStorage.getItem('hvi_energy_log') || '{}');
  const todaySteps = _stepsLog[today()] || 0;
  const todayEnergy = _energyLog[today()] || 0;

  // Time since last workout
  const _lastWD = workoutMeta.lastWorkoutDate;
  const _daysSince = _lastWD ? Math.floor((new Date(today() + 'T12:00') - new Date(_lastWD + 'T12:00')) / 86400000) : null;
  const _sinceText = _daysSince === null ? '' : _daysSince === 0 ? 'Today' : _daysSince === 1 ? 'Yesterday' : _daysSince + 'd ago';

  // Streak shields
  const _shields = getStreakShields();

  // Nutrition card (training-adjusted target)
  const dm = getDayMacros();
  const _mt = (typeof getTodaysMacroTargets === 'function') ? getTodaysMacroTargets() : null;
  const dGoal = (_mt && _mt.calories) ? _mt.calories : dietMeta.dailyGoals.calories;
  const dPct = dGoal ? Math.min(dm.cal / dGoal, 1) : 0;
  const _mtNote = (_mt && _mt.adjusted) ? (_mt.type === 'hard' ? icon('flame', 13) + ' Heavy day' : _mt.type === 'rest' ? icon('moon', 13) + ' Rest day' : icon('activity', 13) + ' Training day') : '';

  // Quests
  const _questDone = new Set((gamification.questsCompleted || {})[today()] || []);
  const quests = getDailyQuests();
  const questHTML = quests.map(q => {
    const qDone = _questDone.has(q.id);
    return `<div class="hm-quest${qDone ? ' hm-quest-done' : ''}">
      <div class="hm-quest-ico">${q.icon}</div>
      <div class="hm-quest-body">
        <div class="hm-quest-lbl">${q.label}</div>
        <div class="hm-quest-xp">+${q.xp} XP</div>
      </div>
      <div class="hm-quest-done-row">
        <div class="hm-quest-cb${qDone ? ' hm-quest-cb-done' : ''}">${qDone ? '✓' : ''}</div>
      </div>
    </div>`;
  }).join('');

  // Challenges
  const challenges = getWeeklyChallenges();
  const chalHTML = challenges.map(c => {
    const cDone = c.current >= c.goal;
    const cPct = Math.min(1, c.current / c.goal);
    return `<div class="hm-chal">
      <div class="hm-chal-head">
        <span class="hm-chal-lbl">${c.icon} ${c.label}</span>
        <span class="hm-chal-ct" style="${cDone ? 'color:var(--accent-b)' : ''}">${c.current}/${c.goal}${cDone ? ' ✓' : ''}</span>
      </div>
      <div class="hm-chal-track"><div class="hm-chal-fill" style="width:${(cPct*100).toFixed(0)}%;${cDone ? 'background:var(--accent-b)' : ''}"></div></div>
    </div>`;
  }).join('');

  document.getElementById('view').innerHTML = `
    <div class="hm-hero ani">
      <div class="hm-hero-card hm-hero-card--center" onclick="go('character')" role="button" tabindex="0" aria-label="Open your character" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();go('character')}">
        <div class="hm-hero-glow"></div>
        <div class="hm-hero-date">${dateStr}</div>
        <div class="avatar-frame hm-hero-portrait">${avatarImg(homeLvl)}</div>
        <div class="hm-hero-name">${greeting()}${userName() ? ', ' + userName() : ''}.</div>
        <div class="hm-hero-lvl">Lv.${homeLvl} · ${getLevelTitle(homeLvl)}</div>
      </div>
    </div>

    ${typeof whyCardHTML === 'function' ? whyCardHTML() : ''}
    ${typeof todayBriefingHTML === 'function' ? todayBriefingHTML() : ''}
    ${typeof coachInsightCardHTML === 'function' ? coachInsightCardHTML() : ''}

    <div class="hm-pillars ani">${pillarStrip}</div>

    ${_overallStreak >= 2 ? `<div class="hm-streak-banner ani">
      <div class="hm-streak-fire">🔥</div>
      <div class="hm-streak-num">${_overallStreak}</div>
      <div class="hm-streak-lbl">day streak</div>
    </div>` : ''}

    ${(() => {
      const wb = getWelcomeBack();
      if (!wb) return '';
      const msgs = [
        'The best time to start again is now.',
        'Every master was once a beginner who came back.',
        'Consistency beats perfection. You showed up today.',
        'The gap doesn\'t matter. The return does.',
      ];
      return `<div class="hm-wb-banner ani">
        <div class="hm-wb-icon">👋</div>
        <div class="hm-wb-body">
          <div class="hm-wb-title">Welcome back</div>
          <div class="hm-wb-text">${msgs[Math.floor(Math.random() * msgs.length)]}</div>
        </div>
      </div>`;
    })()}

    ${(() => {
      const atRisk = getStreaksAtRisk();
      if (!atRisk.length) return '';
      const top = atRisk.sort((a,b) => b.streak - a.streak).slice(0, 3);
      return `<div class="hm-risk-banner ani" onclick="go('habits')">
        <div class="hm-risk-icon">⚠️</div>
        <div class="hm-risk-body">
          <div class="hm-risk-title">Streaks at risk</div>
          <div class="hm-risk-text">${top.map(h => `${esc(h.name)} (${h.streak}d)`).join(', ')}</div>
        </div>
      </div>`;
    })()}

    <div class="hm-sec ani">
      <div class="hm-sec-title">Quests &amp; Trials</div>
    </div>
    <div class="hm-quest-list ani" id="quest-section">${questHTML}</div>
    ${challenges.length ? `<div class="hm-chal-list ani" style="margin-top:8px">${chalHTML}</div>` : ''}

    <!-- Daily quote -->
    <div class="hm-quote ani" style="margin-top:16px">
      <div class="hm-quote-text">"${esc(QUOTES[meta.quoteIndex % QUOTES.length].text)}"</div>
      <div class="hm-quote-auth">— ${esc(QUOTES[meta.quoteIndex % QUOTES.length].author)}</div>
    </div>

    ${done > 0 ? `<button class="hm-share-btn ani" onclick="shareDailyCard()">📤 Share Today's Progress</button>` : ''}

    ${(() => {
      // Show active challenges on home screen
      if (typeof _getChallenges !== 'function') return '';
      const active = _getChallenges().filter(c => c.endDate >= today());
      if (!active.length) {
        // No active challenges — show invite/challenge prompt
        const dismissedAt = parseInt(localStorage.getItem('hvi_invite_dismissed') || '0');
        const daysSinceDismiss = (Date.now() - dismissedAt) / 86400000;
        if (_overallStreak >= 3 && daysSinceDismiss > 7) {
          return `<div class="hm-feedback-banner ani" style="display:flex;align-items:center;gap:12px;padding:14px 16px;margin:0 16px 12px;background:linear-gradient(135deg,rgba(196,169,108,.12),rgba(196,169,108,.04));border:1px solid rgba(196,169,108,.2);border-radius:14px;cursor:pointer" onclick="go('challenges')">
            <div style="font-size:24px;flex-shrink:0">⚔️</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:14px;color:var(--text)">Challenge a friend</div>
              <div style="font-size:12px;color:var(--text-dim);margin-top:2px">Compete on streaks, workouts, or journaling</div>
            </div>
            <button onclick="event.stopPropagation();localStorage.setItem('hvi_invite_dismissed',Date.now().toString());this.closest('.hm-feedback-banner').remove()" style="background:none;border:none;color:var(--text-dim);font-size:18px;padding:4px;cursor:pointer">✕</button>
          </div>`;
        }
        return '';
      }
      // Show top active challenge
      const ch = active[0];
      const prog = _challengeProgress(ch);
      const left = _daysLeft(ch);
      return `<div class="hm-feedback-banner ani" style="padding:14px 16px;margin:0 16px 12px;background:linear-gradient(135deg,rgba(196,169,108,.08),rgba(196,169,108,.02));border:1px solid rgba(196,169,108,.15);border-radius:14px;cursor:pointer" onclick="go('challenges')">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:20px">${ch.icon}</span>
          <span style="font-weight:600;font-size:14px;color:var(--text)">${esc(ch.name)}</span>
          <span style="margin-left:auto;font-size:11px;color:var(--text-dim)">${prog.done ? '✓ Done' : left + 'd left'}</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${(prog.pct*100).toFixed(0)}%;background:${prog.done ? 'var(--accent-b)' : 'var(--accent)'};border-radius:3px;transition:width .3s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:var(--text-dim)">
          <span>${prog.count}/${ch.goal}</span>
          ${active.length > 1 ? `<span>+${active.length - 1} more</span>` : ''}
        </div>
      </div>`;
    })()}

    ${getEveningReminder()}
  `;
}


// ══════════════════════════════════════════════════════════════════════════
// RENDER: PILLAR
// ══════════════════════════════════════════════════════════════════════════
function renderPillar() {
  const p = PILLARS.find(x => x.id === curPillar), ph = pillarHabits(curPillar);
  const {done,total,pct} = pillarPct(curPillar);
  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('home')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="pd-head ani"><div class="pd-ring">${ring(32,pct,3.5)}<div class="pd-pct">${Math.round(pct*100)}%</div></div>
      <div class="pd-info"><div class="pd-name">${p.name}</div><div class="pd-sep"></div><div class="pd-desc">${p.desc}</div></div></div>
    <div class="sec-lbl pd-lbl">Habits \u00B7 ${done}/${total}</div>
    <div class="ani">${ph.map(h => habitRowHTML(h,'p')).join('')}</div>`;
  requestAnimationFrame(initSwipeGestures);
}

// ══════════════════════════════════════════════════════════════════════════
// RENDER: ALL HABITS
// ══════════════════════════════════════════════════════════════════════════
function renderHabits() {
  const toggle = `<div class="hab-toggle">
    <button class="hab-toggle-btn${_habitsTab==='habits'?' active':''}" onclick="_habitsTab='habits';renderHabits()">Habits</button>
    <button class="hab-toggle-btn${_habitsTab==='routines'?' active':''}" onclick="tryRoutinesTab()">Routines</button>
  </div>`;

  if (_habitsTab === 'routines') { renderRoutines(toggle); return; }

  const groups = PILLARS.map(p => {
    const ph = pillarHabits(p.id);
    if (!ph.length) return '';
    const rows = ph.map(h => habitRowHTML(h, 'a', _habitEditMode)).join('');
    return `<div class="sec-lbl" style="padding-top:20px">${p.name}</div>${rows}`;
  }).join('');
  document.getElementById('view').innerHTML = `
    ${toggle}
    <div class="ah-head ani" style="display:flex;align-items:flex-start;justify-content:space-between">
      <div><div class="ah-title">All Habits</div><div class="ah-sub">We are what we repeatedly do.</div></div>
      <div style="display:flex;gap:8px;padding-top:8px">
        ${!_habitEditMode ? `<button class="w-action-btn" style="margin:0;padding:8px 18px;font-size:11px;width:auto" onclick="_habitEditMode=true;renderHabits()">Edit</button>` : `<button class="w-action-btn" style="margin:0;padding:8px 18px;font-size:11px;width:auto;background:rgba(154,130,86,0.15);border-color:var(--accent)" onclick="_habitEditMode=false;renderHabits()">Done</button>`}
        ${!_habitEditMode ? `<button class="w-action-btn" style="margin:0;padding:8px 14px;font-size:16px;width:auto;line-height:1" onclick="tryAddHabit()">+</button>` : ''}
      </div>
    </div>
    <div class="ani">${groups}</div>
    <div class="sec-lbl" style="padding-top:20px">90-Day Activity</div>
    ${buildHeatmapHTML()}`;
  if (!_habitEditMode) requestAnimationFrame(initSwipeGestures);
}

// ══════════════════════════════════════════════════════════════════════════
// RENDER: ROUTINES
// ══════════════════════════════════════════════════════════════════════════
function getRoutineLogToday() {
  const dk = new Date().toISOString().slice(0, 10);
  if (!routineLog[dk]) routineLog[dk] = {};
  return routineLog[dk];
}

function isRoutineItemDone(period, idx) {
  const item = routines[period]?.[idx];
  if (!item) return false;
  if (item.habitId && log[item.habitId]) return !!log[item.habitId].completedToday;
  const today = getRoutineLogToday();
  return !!today[period + '_' + idx];
}

function toggleRoutineItem(period, idx) {
  const item = routines[period]?.[idx];
  if (!item) return;
  if (item.habitId) {
    tapHabit(item.habitId, 'r');
    renderHabits();
    return;
  }
  const today = getRoutineLogToday();
  const key = period + '_' + idx;
  today[key] = !today[key];
  LS.set('hvi_routine_log', routineLog);
  renderHabits();
}

function renderRoutines(toggle) {
  const today = getRoutineLogToday();
  const buildSection = (period, label, icon) => {
    const items = routines[period] || [];
    if (!items.length && !_routineEditMode) return `<div class="sec-lbl" style="padding-top:20px">${icon} ${label}</div><div class="routine-empty">No ${label.toLowerCase()} items yet. Tap Edit to add some.</div>`;
    const rows = items.map((item, i) => {
      const done = isRoutineItemDone(period, i);
      const linked = item.habitId ? ' · habit' : '';
      if (_routineEditMode) {
        return `<div class="hi" style="opacity:0.85">
          <div class="hi-info"><div class="hi-name">${esc(item.name)}<span style="font-size:10px;color:var(--text-dim);opacity:0.5">${linked}</span></div></div>
          <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
            ${item.habitId ? `<span style="font-size:9px;color:var(--text-muted)">linked</span>` : ''}
            ${i > 0 ? `<button class="habit-move-btn" onclick="event.stopPropagation();moveRoutineItem('${period}',${i},-1)">▲</button>` : ''}
            ${i < items.length - 1 ? `<button class="habit-move-btn" onclick="event.stopPropagation();moveRoutineItem('${period}',${i},1)">▼</button>` : ''}
            <button class="habit-del-btn" onclick="event.stopPropagation();deleteRoutineItem('${period}',${i})">&times;</button>
          </div></div>`;
      }
      return `<div class="hi${done?' done':''}" onclick="toggleRoutineItem('${period}',${i})" role="checkbox" aria-checked="${done}" tabindex="0">
        <div class="hi-info"><div class="hi-name">${esc(item.name)}<span style="font-size:10px;color:var(--text-dim);opacity:0.5">${linked}</span></div></div>
        <div class="hi-check" aria-hidden="true">✓</div></div>`;
    }).join('');
    return `<div class="sec-lbl" style="padding-top:20px">${icon} ${label}</div>${rows}
      ${_routineEditMode ? `<div style="display:flex;gap:8px;padding:10px 0">
        <input class="d-input" id="add-${period}" placeholder="Add ${label.toLowerCase()} item…" style="flex:1" onkeydown="if(event.key==='Enter')addRoutineItem('${period}')">
        <button class="w-action-btn" style="margin:0;padding:8px 14px;font-size:16px;width:auto;line-height:1" onclick="addRoutineItem('${period}')">+</button>
      </div>` : ''}`;
  };

  const morningItems = routines.morning || [];
  const nightItems = routines.night || [];
  const totalItems = morningItems.length + nightItems.length;
  let doneCount = 0;
  morningItems.forEach((_, i) => { if (isRoutineItemDone('morning', i)) doneCount++; });
  nightItems.forEach((_, i) => { if (isRoutineItemDone('night', i)) doneCount++; });
  const pct = totalItems ? Math.round((doneCount / totalItems) * 100) : 0;

  document.getElementById('view').innerHTML = `
    ${toggle}
    <div class="ah-head ani" style="display:flex;align-items:flex-start;justify-content:space-between">
      <div><div class="ah-title">Routines</div><div class="ah-sub">${totalItems ? `${doneCount}/${totalItems} done today · ${pct}%` : 'Build your daily rituals.'}</div></div>
      <div style="display:flex;gap:8px;padding-top:8px">
        ${!_routineEditMode ? `<button class="w-action-btn" style="margin:0;padding:8px 18px;font-size:11px;width:auto" onclick="_routineEditMode=true;renderHabits()">Edit</button>` : `<button class="w-action-btn" style="margin:0;padding:8px 18px;font-size:11px;width:auto;background:rgba(154,130,86,0.15);border-color:var(--accent)" onclick="_routineEditMode=false;renderHabits()">Done</button>`}
      </div>
    </div>
    <div class="ani">
      ${buildSection('morning', 'Morning Routine', '☀️')}
      ${buildSection('night', 'Night Routine', '🌙')}
    </div>`;
}

function addRoutineItem(period) {
  const input = document.getElementById('add-' + period);
  const name = input?.value?.trim();
  if (!name) return;
  if (!routines[period]) routines[period] = [];
  const matchingHabit = habits.find(h => h.name.toLowerCase() === name.toLowerCase());
  const item = matchingHabit ? { name, habitId: matchingHabit.id } : { name };
  routines[period].push(item);
  LS.set('hvi_routines', routines);
  renderHabits();
}

function moveRoutineItem(period, idx, dir) {
  const arr = routines[period];
  const ni = idx + dir;
  if (ni < 0 || ni >= arr.length) return;
  [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
  LS.set('hvi_routines', routines);
  renderHabits();
}

function deleteRoutineItem(period, idx) {
  const item = routines[period][idx];
  if (!confirm(`Delete "${item.name}"?`)) return;
  routines[period].splice(idx, 1);
  LS.set('hvi_routines', routines);
  const dk = new Date().toISOString().slice(0, 10);
  if (routineLog[dk]) {
    const newLog = {};
    Object.keys(routineLog[dk]).forEach(k => {
      const [p, i] = k.split('_');
      if (p === period && parseInt(i) > idx) newLog[p + '_' + (parseInt(i) - 1)] = routineLog[dk][k];
      else if (p !== period || parseInt(i) !== idx) newLog[k] = routineLog[dk][k];
    });
    routineLog[dk] = newLog;
    LS.set('hvi_routine_log', routineLog);
  }
  renderHabits();
}

function moveHabit(id, dir) {
  const idx = habits.findIndex(h => h.id === id);
  if (idx < 0) return;
  const ni = idx + dir;
  if (ni < 0 || ni >= habits.length) return;
  [habits[idx], habits[ni]] = [habits[ni], habits[idx]];
  LS.set('hvi_habits', habits);
  renderHabits();
}

function deleteHabit(id) {
  const h = habits.find(x => x.id === id);
  if (!confirm(`Delete "${h ? h.name : 'this habit'}"? This can't be undone.`)) return;
  habits = habits.filter(h => h.id !== id);
  delete log[id];
  LS.set('hvi_habits', habits);
  LS.set('hvi_log', log);
  go('habits');
}

function openEditHabit(id) {
  const h = habits.find(x => x.id === id);
  if (!h) return;
  const cats = ['mindset','discipline','fitness','health','learning','social','financial'];
  const catBtns = cats.map(c => `<button class="d-type-btn${c===h.category?' active':''}" onclick="document.querySelectorAll('#edit-habit-modal .cat-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');this.dataset.val='${c}'" data-val="${c}" class="d-type-btn cat-btn${c===h.category?' active':''}">${c}</button>`).join('');
  const sched = h.schedule || 'daily';
  const dayNames = ['S','M','T','W','T','F','S'];
  const dayBtns = dayNames.map((d,i) => `<button class="sched-day-btn${(!h.days || h.days.includes(i))?' active':''}" data-day="${i}" onclick="this.classList.toggle('active')">${d}</button>`).join('');
  let modal = document.getElementById('edit-habit-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'edit-habit-modal'; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div class="edit-habit-backdrop" onclick="closeEditHabit()"></div>
    <div class="edit-habit-sheet">
      <div class="edit-habit-title">Edit Habit</div>
      <input class="d-input" id="edit-habit-name" type="text" value="${esc(h.name)}" placeholder="Habit name" style="margin-bottom:16px">
      <div class="sec-lbl" style="padding:0 0 8px">Category</div>
      <div class="d-type-row" style="flex-wrap:wrap;gap:6px">${catBtns}</div>
      <div class="sec-lbl" style="padding:12px 0 8px">Schedule</div>
      <div class="d-type-row" style="flex-wrap:wrap;gap:6px">
        <button class="d-type-btn sched-btn${sched==='daily'?' active':''}" data-sched="daily" onclick="_setEditSchedMode(this,'daily')">Daily</button>
        <button class="d-type-btn sched-btn${sched==='specific'?' active':''}" data-sched="specific" onclick="_setEditSchedMode(this,'specific')">Specific</button>
        <button class="d-type-btn sched-btn${sched==='weekly'?' active':''}" data-sched="weekly" onclick="_setEditSchedMode(this,'weekly')">× / week</button>
      </div>
      <div id="edit-sched-days" style="display:${sched==='specific'?'block':'none'};padding:8px 0"><div class="sched-day-row">${dayBtns}</div></div>
      <div id="edit-sched-weekly" style="display:${sched==='weekly'?'block':'none'};padding:8px 0">
        <div class="d-goals-row"><div class="d-goals-label">× per week</div><input class="d-input" type="number" id="edit-per-week" value="${h.perWeek||3}" min="1" max="7" style="width:60px;text-align:center"></div>
      </div>
      ${(() => {
        const curLink = (typeof getHabitLink === 'function') ? getHabitLink(id) : '';
        const opt = (val, label) => `<button class="d-type-btn link-btn${curLink===val?' active':''}" data-link="${val}" onclick="_setEditLink(this)">${label}</button>`;
        return `<div class="sec-lbl" style="padding:12px 0 8px">Auto-complete when</div>
      <div class="d-type-row" style="flex-wrap:wrap;gap:6px">
        ${opt('', 'None')}${opt('workout', icon('activity', 14) + ' Workout done')}${opt('protein', icon('meat', 14) + ' Protein hit')}${opt('calories', icon('flame', 14) + ' Calories hit')}
      </div>
      <div style="font-size:11px;color:var(--text-muted);padding:6px 0 0">This habit ticks itself when the linked action happens, so you never log it twice.</div>`;
      })()}
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="w-action-btn" style="flex:1;margin:0" onclick="closeEditHabit()">Cancel</button>
        <button class="w-action-btn" style="flex:1;margin:0;background:var(--accent);color:#fff" onclick="saveEditHabit('${id}')">Save</button>
      </div>
    </div>`;
  modal.style.display = 'block';
}

function _setEditSchedMode(btn, mode) {
  btn.parentElement.querySelectorAll('.sched-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('edit-sched-days').style.display = mode === 'specific' ? 'block' : 'none';
  document.getElementById('edit-sched-weekly').style.display = mode === 'weekly' ? 'block' : 'none';
}

function _setEditLink(btn) {
  btn.parentElement.querySelectorAll('.link-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function closeEditHabit() {
  const m = document.getElementById('edit-habit-modal');
  if (m) m.style.display = 'none';
}

function saveEditHabit(id) {
  const name = document.getElementById('edit-habit-name')?.value?.trim();
  const catBtn = document.querySelector('#edit-habit-modal .cat-btn.active');
  const category = catBtn?.dataset?.val || catBtn?.textContent;
  if (!name) return;
  const h = habits.find(x => x.id === id);
  if (!h) return;
  h.name = name;
  if (category) h.category = category;
  // Save schedule
  const schedBtn = document.querySelector('#edit-habit-modal .sched-btn.active');
  const sched = schedBtn?.dataset?.sched || 'daily';
  h.schedule = sched;
  if (sched === 'specific') {
    h.days = [...document.querySelectorAll('#edit-sched-days .sched-day-btn.active')].map(b => parseInt(b.dataset.day));
  } else { delete h.days; }
  if (sched === 'weekly') {
    h.perWeek = Math.min(7, Math.max(1, parseInt(document.getElementById('edit-per-week')?.value) || 3));
  } else { delete h.perWeek; }
  LS.set('hvi_habits', habits);
  // Persist auto-complete link
  const linkBtn = document.querySelector('#edit-habit-modal .link-btn.active');
  const link = linkBtn ? (linkBtn.dataset.link || '') : '';
  const links = LS.get('hvi_habit_links', {});
  if (link) links[id] = link; else delete links[id];
  LS.set('hvi_habit_links', links);
  closeEditHabit();
  renderHabits();
}

function renderHabitCreate() {
  const cats = ['mindset','discipline','fitness','health','learning','social','financial'];
  const catBtns = cats.map(c => `<button class="d-type-btn${c===curHabitCat?' active':''}" onclick="curHabitCat='${c}';go('habitCreate')">${c}</button>`).join('');

  const dayNames = ['S','M','T','W','T','F','S'];
  const dayBtns = dayNames.map((d,i) => `<button class="sched-day-btn active" data-day="${i}" onclick="this.classList.toggle('active')">${d}</button>`).join('');
  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('habits')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">New Habit</div><div class="page-sub">Build your own daily practice.</div></div>
    <div style="padding:0 24px" class="ani">
      <div class="d-goals-row"><div class="d-goals-label">Name</div><input class="d-input" type="text" id="hc-name" placeholder="e.g. Cold plunge 5 min" style="flex:1"></div>
      <div class="sec-lbl" style="padding:16px 0 8px">Category</div>
      <div class="d-type-btns" style="padding:0 0 16px">${catBtns}</div>
      <div class="sec-lbl" style="padding:0 0 8px">Schedule</div>
      <div class="d-type-btns" style="padding:0 0 8px">
        <button class="d-type-btn active" data-sched="daily" onclick="_setSchedMode(this,'daily')">Daily</button>
        <button class="d-type-btn" data-sched="specific" onclick="_setSchedMode(this,'specific')">Specific Days</button>
        <button class="d-type-btn" data-sched="weekly" onclick="_setSchedMode(this,'weekly')">× per week</button>
      </div>
      <div id="sched-days" style="display:none;padding:0 0 12px"><div class="sched-day-row">${dayBtns}</div></div>
      <div id="sched-weekly" style="display:none;padding:0 0 12px">
        <div class="d-goals-row"><div class="d-goals-label">Times per week</div><input class="d-input" type="number" id="hc-per-week" value="3" min="1" max="7" inputmode="numeric" style="width:60px;text-align:center"></div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="w-finish" style="flex:1" onclick="saveHabit()">SAVE</button>
        <button class="w-action-btn" style="flex:1;margin:16px 0 24px" onclick="go('habits')">CANCEL</button>
      </div>
    </div>`;
}

function _setSchedMode(btn, mode) {
  btn.parentElement.querySelectorAll('.d-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('sched-days').style.display = mode === 'specific' ? 'block' : 'none';
  document.getElementById('sched-weekly').style.display = mode === 'weekly' ? 'block' : 'none';
}

function _getSchedFromForm() {
  const active = document.querySelector('[data-sched].active');
  const mode = active?.dataset?.sched || 'daily';
  if (mode === 'daily') return { schedule: 'daily' };
  if (mode === 'specific') {
    const days = [...document.querySelectorAll('.sched-day-btn.active')].map(b => parseInt(b.dataset.day));
    return { schedule: 'specific', days };
  }
  if (mode === 'weekly') {
    const pw = Math.min(7, Math.max(1, parseInt(document.getElementById('hc-per-week')?.value) || 3));
    return { schedule: 'weekly', perWeek: pw };
  }
  return { schedule: 'daily' };
}

// Paywall-aware entry points for habit creation & routines
function tryAddHabit() {
  if (typeof isPremium === 'function' && !isPremium() && habits.length >= FREE_HABIT_LIMIT) {
    showUpgradeModal('habits');
    return;
  }
  go('habitCreate');
}
function tryRoutinesTab() {
  if (typeof isPremium === 'function' && !isPremium()) {
    showUpgradeModal('routines');
    return;
  }
  _habitsTab = 'routines';
  renderHabits();
}

function saveHabit() {
  const name = document.getElementById('hc-name')?.value?.trim();
  if (!name) return;
  // Paywall backstop: free tier capped at FREE_HABIT_LIMIT habits
  if (typeof isPremium === 'function' && !isPremium() && habits.length >= FREE_HABIT_LIMIT) {
    showUpgradeModal('habits');
    return;
  }
  const id = genId('cu');
  const sched = _getSchedFromForm();
  const h = { id, name, category: curHabitCat, ...sched };
  habits.push(h);
  log[id] = { streak: 0, lastCompletedDate: '', completedToday: false };
  LS.set('hvi_habits', habits);
  LS.set('hvi_log', log);
  go('habits');
}

// ── SWIPE NAVIGATION ─────────────────────────────────────────────────────
const _NAV_ORDER = ['home', 'habits', 'workout', 'diet', 'library', 'stats'];
let _swipeX0 = null, _swipeY0 = null, _swiping = false;

function initSwipeNav() {
  const view = document.getElementById('view');
  view.addEventListener('touchstart', e => {
    _swipeX0 = e.touches[0].clientX;
    _swipeY0 = e.touches[0].clientY;
    _swiping = false;
  }, { passive: true });

  view.addEventListener('touchmove', e => {
    if (_swipeX0 === null) return;
    const dx = e.touches[0].clientX - _swipeX0;
    const dy = e.touches[0].clientY - _swipeY0;
    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 30) _swiping = true;
  }, { passive: true });

  view.addEventListener('touchend', e => {
    if (!_swiping || _swipeX0 === null) { _swipeX0 = null; return; }
    const dx = e.changedTouches[0].clientX - _swipeX0;
    _swipeX0 = null; _swiping = false;
    if (Math.abs(dx) < 60) return;
    const base = NAV_PARENT[curView] || curView;
    const idx = _NAV_ORDER.indexOf(base);
    if (idx === -1) return;
    const next = dx < 0 ? _NAV_ORDER[idx + 1] : _NAV_ORDER[idx - 1];
    if (next) go(next);
  }, { passive: true });
}

// ── iOS HAPTIC FALLBACK ──────────────────────────────────────────────────
function haptic(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern || 10);
  } else {
    // iOS Safari fallback — play a short silent-ish tick
    try {
      if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = _audioCtx.createOscillator();
      const gain = _audioCtx.createGain();
      osc.connect(gain); gain.connect(_audioCtx.destination);
      gain.gain.value = 0.01; // nearly silent
      osc.frequency.value = 200;
      osc.start(); osc.stop(_audioCtx.currentTime + 0.02);
    } catch {}
  }
}

// ── INVITE / REFERRAL ────────────────────────────────────────────────────
function shareInvite() {
  const lvl = getLevel(gamification.xp || 0);
  const best = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const wCount = Object.keys(workoutLog).length;
  const lines = [];
  if (best > 0) lines.push(`🔥 ${best}-day habit streak`);
  if (wCount > 0) lines.push(`💪 ${wCount} workouts logged`);
  if (lvl > 1) lines.push(`⚡ Level ${lvl} ${getLevelTitle(lvl)}`);
  const statsLine = lines.length ? '\n' + lines.join(' · ') + '\n' : '';
  const text = `I've been using Arete to build better habits, track workouts, and stay on top of nutrition.${statsLine}\nFree, no account needed.`;
  const url = 'https://get-arete.com?utm_source=share&utm_medium=invite';
  track('share_invite', { method: navigator.share ? 'native' : 'clipboard', level: lvl });
  if (navigator.share) {
    navigator.share({ title: 'Arete', text, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text + '\n' + url).then(() => {
      _showToast('Link copied!');
    }).catch(() => {});
  }
}

function _showToast(msg, duration = 2500) {
  const el = document.createElement('div');
  el.className = 'streak-toast';
  el.style.cssText = `bottom:100px;animation-duration:${(duration/1000).toFixed(1)}s`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── PWA INSTALL PROMPT ──────────────────────────────────────────────────
let _deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  track('install_prompt_available');
  // Show install banner after a delay if user has used the app
  if (localStorage.getItem('hvi_onboarded') && !localStorage.getItem('hvi_install_dismissed')) {
    setTimeout(() => _showInstallBanner(), 3000);
  }
});

// iOS doesn't fire beforeinstallprompt — show install hint on mobile Safari
if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream && !navigator.standalone) {
  if (localStorage.getItem('hvi_onboarded') && !localStorage.getItem('hvi_install_dismissed')) {
    setTimeout(() => _showInstallBanner(), 5000);
  }
}

window.addEventListener('appinstalled', () => {
  track('app_installed');
  _deferredInstallPrompt = null;
  const banner = document.getElementById('install-banner');
  if (banner) banner.remove();
});

function _showInstallBanner() {
  if (navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) return;
  if (document.getElementById('install-banner')) return;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  // For iOS (no beforeinstallprompt), show instructions instead
  if (isIOS && !_deferredInstallPrompt) {
    if (localStorage.getItem('hvi_install_dismissed')) return;
    const banner = document.createElement('div');
    banner.id = 'install-banner';
    banner.innerHTML = `
      <div class="install-banner">
        <img src="icon-192.png" alt="" style="width:40px;height:40px;border-radius:10px;flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--serif);font-size:15px;color:var(--text);font-weight:600">Install Arete</div>
          <div style="font-size:12px;color:var(--text-dim);margin-top:2px">Tap <span style="font-size:16px;vertical-align:-2px">⎙</span> Share then "Add to Home Screen"</div>
        </div>
        <button class="install-dismiss" onclick="dismissInstall()" aria-label="Dismiss">✕</button>
      </div>`;
    document.body.appendChild(banner);
    track('install_banner_shown', { type: 'ios' });
    return;
  }
  if (!_deferredInstallPrompt) return;
  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.innerHTML = `
    <div class="install-banner">
      <img src="icon-192.png" alt="" style="width:40px;height:40px;border-radius:10px;flex-shrink:0">
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--serif);font-size:15px;color:var(--text);font-weight:600">Install Arete</div>
        <div style="font-size:12px;color:var(--text-dim);margin-top:2px">Get the full app experience</div>
      </div>
      <button class="install-btn" onclick="triggerInstall()">Install</button>
      <button class="install-dismiss" onclick="dismissInstall()" aria-label="Dismiss">✕</button>
    </div>`;
  document.body.appendChild(banner);
  track('install_banner_shown', { type: 'android' });
}

function triggerInstall() {
  track('install_banner_click');
  if (_deferredInstallPrompt) {
    _deferredInstallPrompt.prompt();
    _deferredInstallPrompt.userChoice.then(result => {
      track('install_choice', { outcome: result.outcome });
      _deferredInstallPrompt = null;
    });
  }
  const banner = document.getElementById('install-banner');
  if (banner) banner.remove();
}

function dismissInstall() {
  track('install_banner_dismiss');
  localStorage.setItem('hvi_install_dismissed', Date.now().toString());
  const banner = document.getElementById('install-banner');
  if (banner) banner.remove();
}

// ── PRO UPGRADE PROMPT ───────────────────────────────────────────────────
function showProPrompt() {
  let el = document.getElementById('pro-overlay');
  if (!el) { el = document.createElement('div'); el.id = 'pro-overlay'; document.body.appendChild(el); }
  el.innerHTML = `
    <div class="pro-overlay" onclick="closeProPrompt()">
      <div class="pro-card" onclick="event.stopPropagation()">
        <div class="pro-star"><svg viewBox="0 0 120 120" width="52" height="52" xmlns="http://www.w3.org/2000/svg"><g fill="#c4a96c"><ellipse cx="35" cy="12" rx="3.5" ry="8" transform="rotate(-65,35,12)"/><ellipse cx="25" cy="22" rx="4" ry="9" transform="rotate(-50,25,22)"/><ellipse cx="17" cy="34" rx="4.5" ry="10" transform="rotate(-38,17,34)"/><ellipse cx="13" cy="48" rx="5" ry="11" transform="rotate(-22,13,48)"/><ellipse cx="13" cy="62" rx="5" ry="11" transform="rotate(-8,13,62)"/><ellipse cx="17" cy="76" rx="5" ry="11" transform="rotate(10,17,76)"/><ellipse cx="25" cy="88" rx="4.5" ry="10" transform="rotate(26,25,88)"/><ellipse cx="36" cy="97" rx="4" ry="9" transform="rotate(40,36,97)"/><ellipse cx="48" cy="102" rx="3.5" ry="8" transform="rotate(55,48,102)"/><ellipse cx="85" cy="12" rx="3.5" ry="8" transform="rotate(65,85,12)"/><ellipse cx="95" cy="22" rx="4" ry="9" transform="rotate(50,95,22)"/><ellipse cx="103" cy="34" rx="4.5" ry="10" transform="rotate(38,103,34)"/><ellipse cx="107" cy="48" rx="5" ry="11" transform="rotate(22,107,48)"/><ellipse cx="107" cy="62" rx="5" ry="11" transform="rotate(8,107,62)"/><ellipse cx="103" cy="76" rx="5" ry="11" transform="rotate(-10,103,76)"/><ellipse cx="95" cy="88" rx="4.5" ry="10" transform="rotate(-26,95,88)"/><ellipse cx="84" cy="97" rx="4" ry="9" transform="rotate(-40,84,97)"/><ellipse cx="72" cy="102" rx="3.5" ry="8" transform="rotate(-55,72,102)"/></g><path d="M52 106 Q56 112 60 114 Q64 112 68 106" fill="none" stroke="#c4a96c" stroke-width="2.5" stroke-linecap="round"/></svg></div>
        <div class="pro-title">Arete Pro</div>
        <div class="pro-sub">Unlock the full system to accelerate your progress.</div>
        <div class="pro-features">
          <div class="pro-feat"><span class="pro-feat-icon">🤖</span> Unlimited AI Coach conversations</div>
          <div class="pro-feat"><span class="pro-feat-icon">🔍</span> Food database search (millions of foods)</div>
          <div class="pro-feat"><span class="pro-feat-icon">📸</span> Progress photo timeline & comparison</div>
          <div class="pro-feat"><span class="pro-feat-icon">☁️</span> Cloud sync across all devices</div>
          <div class="pro-feat"><span class="pro-feat-icon">📊</span> Advanced analytics & trends</div>
          <div class="pro-feat"><span class="pro-feat-icon">📤</span> Shareable weekly recaps</div>
        </div>
        <button class="pro-btn" onclick="alert('Coming soon!')">UPGRADE — $4.99/MONTH</button>
        <button class="pro-skip" onclick="closeProPrompt()">Maybe later</button>
      </div>
    </div>`;
}

function closeProPrompt() {
  const el = document.getElementById('pro-overlay');
  if (el) el.remove();
}

// ── SMART SYNC (only changed keys) ───────────────────────────────────────
let _lastSyncHash = {};

function _computeSyncHash() {
  const h = {};
  SYNC_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v) h[k] = v.length; // simple length-based change detection
  });
  return h;
}

function _getChangedKeys() {
  const cur = _computeSyncHash();
  const changed = SYNC_KEYS.filter(k => cur[k] !== _lastSyncHash[k]);
  _lastSyncHash = cur;
  return changed;
}

// ── ERROR BOUNDARY + REPORTING ───────────────────────────────────────────
// Errors used to stop at console.error, which meant a bug on someone else's
// phone was invisible — the only ones ever found were the ones we happened to
// trip over. Now they go to Analytics (already loaded) with enough context to
// locate them, and the last few are kept on-device for the diagnostics panel.
//
// Deliberately narrow: only the error text, the script, the line and the view
// being rendered. No habit, meal, workout or account content is ever attached.
const APP_VERSION = (function () {
  try {
    const s = Array.prototype.slice.call(document.scripts).find(x => /app\.js/.test(x.src || ''));
    const m = s && s.src.match(/[?&]v=(\d+)/);
    return m ? m[1] : 'dev';
  } catch { return 'dev'; }
})();

const _ERR_CAP = 8;          // per session, so a render loop can't spam
let _errCount = 0;
const _errSeen = new Set();  // one report per unique error per session

function reportError(kind, msg, extra) {
  try {
    const text = String((msg && msg.message) || msg || 'unknown').slice(0, 300);
    const sig = kind + '|' + text;
    if (_errSeen.has(sig)) return;
    _errSeen.add(sig);
    if (++_errCount > _ERR_CAP) return;

    const rec = Object.assign({
      kind, msg: text,
      where: (typeof curView !== 'undefined' && curView) || 'boot',
      v: APP_VERSION,
      at: new Date().toISOString(),
    }, extra || {});

    // On-device ring buffer, surfaced under Profile so issues can be read back
    try {
      const log = JSON.parse(localStorage.getItem('hvi_error_log') || '[]');
      log.unshift(rec);
      localStorage.setItem('hvi_error_log', JSON.stringify(log.slice(0, 20)));
    } catch {}

    if (typeof gtag === 'function') {
      gtag('event', 'exception', {
        description: `v${rec.v} ${kind}: ${text} @${rec.where}${rec.line ? ':' + rec.line : ''}${rec.src ? ' (' + rec.src + ')' : ''}`.slice(0, 480),
        fatal: kind === 'crash',
      });
    }
    console.error('[arete]', kind, text, extra || '');
  } catch {}
}

function getErrorLog() {
  try { return JSON.parse(localStorage.getItem('hvi_error_log') || '[]'); } catch { return []; }
}
function clearErrorLog() {
  try { localStorage.removeItem('hvi_error_log'); } catch {}
  if (typeof renderStats === 'function') renderStats();
}

window.onerror = function (msg, src, line, col, err) {
  reportError('crash', msg, {
    src: String(src || '').split('/').pop().split('?')[0],
    line: line || 0,
    stack: err && err.stack ? String(err.stack).slice(0, 240) : undefined,
  });
  const view = document.getElementById('view');
  if (view && !document.querySelector('.error-boundary')) {
    const el = document.createElement('div');
    el.className = 'error-boundary';
    el.innerHTML = `
      <h2>Something went wrong</h2>
      <p>An unexpected error occurred. This won't affect your saved data.</p>
      <button onclick="this.closest('.error-boundary').remove();go('home')">Back to Home</button>`;
    document.body.appendChild(el);
  }
};

window.addEventListener('unhandledrejection', e => {
  const r = e && e.reason;
  reportError('promise', r, {
    stack: r && r.stack ? String(r.stack).slice(0, 240) : undefined,
  });
});

// ── PULL-TO-REFRESH ──────────────────────────────────────────────────────
function initPullToRefresh() {
  const view = document.getElementById('view');
  if (!view) return;
  let startY = 0, pulling = false, dist = 0;
  const threshold = 70;
  let indicator = document.getElementById('ptr-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'ptr-indicator';
    indicator.className = 'ptr-indicator';
    indicator.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>';
    document.body.appendChild(indicator);
  }

  view.addEventListener('touchstart', e => {
    if (view.scrollTop <= 0) { startY = e.touches[0].clientY; pulling = true; dist = 0; }
  }, { passive: true });

  view.addEventListener('touchmove', e => {
    if (!pulling) return;
    dist = e.touches[0].clientY - startY;
    if (dist < 0) { pulling = false; return; }
    if (dist > 10) {
      indicator.classList.add('ptr-visible');
      indicator.classList.toggle('ptr-ready', dist > threshold);
    }
  }, { passive: true });

  view.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    if (dist > threshold) {
      indicator.classList.add('ptr-refreshing');
      indicator.classList.remove('ptr-ready');
      haptic(15);
      const renders = { home: renderHome, habits: renderHabits, workout: renderWorkout, diet: renderDiet, library: renderLibrary, stats: renderStats };
      setTimeout(() => {
        (renders[curView] || renderHome)();
        indicator.classList.remove('ptr-visible', 'ptr-refreshing');
      }, 400);
    } else {
      indicator.classList.remove('ptr-visible', 'ptr-ready');
    }
    dist = 0;
  }, { passive: true });
}

// ── RECOVERY / TRAINING LOAD ─────────────────────────────────────────────
function getRecoveryStatus() {
  const dates = Object.keys(workoutLog || {}).sort().reverse();
  const now = new Date(today() + 'T12:00');
  let workoutsLast7 = 0, totalVolume = 0, consecutiveDays = 0;

  for (const d of dates) {
    const diff = Math.floor((now - new Date(d + 'T12:00')) / 86400000);
    if (diff > 7) break;
    if (!trainedOnDay(d)) continue; // opened-but-empty entries don't count
    workoutsLast7++;
    const w = workoutLog[d];
    if (w && w.exercises) {
      w.exercises.forEach(ex => {
        (ex.sets || []).forEach(s => {
          if (!s.warmup && s.completed && s.weight && s.reps) totalVolume += s.weight * s.reps;
        });
      });
    }
  }

  // Consecutive training days ending today/yesterday
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (trainedOnDay(key)) consecutiveDays++;
    else break;
  }

  if (consecutiveDays >= 4 || workoutsLast7 >= 6) return { status: 'fatigued', label: 'Consider rest', days: workoutsLast7, consecutive: consecutiveDays };
  if (consecutiveDays >= 3 || workoutsLast7 >= 4) return { status: 'moderate', label: 'Moderate load', days: workoutsLast7, consecutive: consecutiveDays };
  return { status: 'fresh', label: 'Well recovered', days: workoutsLast7, consecutive: consecutiveDays };
}

function recoveryBadgeHTML() {
  const r = getRecoveryStatus();
  if (r.status === 'fresh' && r.days === 0) return '';
  return `<div class="hm-card-recovery recovery-${r.status}">${r.status === 'fatigued' ? '⚠️' : r.status === 'moderate' ? '⚡' : '✓'} ${r.label} (${r.days}× this week)</div>`;
}

// ── START ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  init();
  initSwipeNav();
  initPullToRefresh();
});
