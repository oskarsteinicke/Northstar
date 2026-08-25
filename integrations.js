// ══════════════════════════════════════════════════════════════════════════
// Arete — Device Integrations (Google Fit, Strava, Fitbit, Whoop)
// ══════════════════════════════════════════════════════════════════════════

const INTEGRATIONS = {
  googlefit: {
    name: 'Google Fit',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2L6.5 7.5 12 13l5.5-5.5L12 2z" fill="#4285F4"/><path d="M6.5 7.5L2 12l4.5 4.5L12 13 6.5 7.5z" fill="#EA4335"/><path d="M12 13l5.5 5.5L22 14l-4.5-4.5L12 13z" fill="#34A853"/><path d="M12 13l-5.5 5.5L12 24l5.5-5.5L12 13z" fill="#FBBC05"/></svg>',
    scopes: 'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.sleep.read https://www.googleapis.com/auth/fitness.heart_rate.read https://www.googleapis.com/auth/fitness.body.read',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    provides: ['sleep', 'workouts', 'heart_rate', 'steps']
  },
  strava: {
    name: 'Strava',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116z" fill="#FC4C02"/><path d="M7.778 13.828h3.065L5.23 2 0 13.828h3.065L5.23 9.576l2.548 4.252z" fill="#FC4C02"/></svg>',
    scopes: 'activity:read_all',
    authUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    provides: ['workouts', 'heart_rate']
  },
  fitbit: {
    name: 'Fitbit',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20"><g fill="#00B0B9"><circle cx="12" cy="4" r="2"/><circle cx="12" cy="9" r="2.2"/><circle cx="12" cy="14.5" r="2"/><circle cx="12" cy="19.5" r="1.5"/><circle cx="7" cy="6.5" r="1.8"/><circle cx="7" cy="11.5" r="1.5"/><circle cx="7" cy="16" r="1.2"/><circle cx="17" cy="6.5" r="1.8"/><circle cx="17" cy="11.5" r="1.5"/><circle cx="17" cy="16" r="1.2"/></g></svg>',
    scopes: 'activity heartrate sleep weight',
    authUrl: 'https://www.fitbit.com/oauth2/authorize',
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    provides: ['sleep', 'workouts', 'heart_rate', 'weight']
  },
  whoop: {
    name: 'Whoop',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 8c0-2.2 1.8-4 4-4s4 1.8 4 4c0 2.2 1.8 4 4 4s4-1.8 4-4" fill="none" stroke="#1A1A1A" stroke-width="2.5" stroke-linecap="round"/><path d="M4 14c0-2.2 1.8-4 4-4s4 1.8 4 4c0 2.2 1.8 4 4 4s4-1.8 4-4" fill="none" stroke="#1A1A1A" stroke-width="2.5" stroke-linecap="round"/></svg>',
    scopes: 'read:recovery read:sleep read:workout read:body_measurement',
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    provides: ['sleep', 'workouts', 'recovery']
  }
};

const _OAUTH_PROXY = 'https://arete-ai.oskarsteinicke.workers.dev';

// ── APPLE HEALTH (via iOS Shortcut → Worker KV) ────────────────────────
const APPLE_HEALTH_CFG = {
  name: 'Apple Health',
  icon: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M16.5 3C14.76 3 13.09 3.81 12 5.09 10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3z" fill="#FF2D55"/></svg>',
  provides: ['steps', 'sleep', 'heart_rate', 'workouts', 'active_energy']
};

function _getHealthToken() {
  return localStorage.getItem('hvi_health_token') || '';
}

async function syncAppleHealth() {
  const token = _getHealthToken();
  if (!token) return;
  try {
    const res = await fetch(_OAUTH_PROXY + '/health?days=7', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    Object.entries(data).forEach(([dk, d]) => {
      if (d.sleep && (!sleepLog[dk] || !sleepLog[dk].hours)) {
        sleepLog[dk] = {
          ...sleepLog[dk],
          hours: parseFloat(d.sleep),
          source: 'applehealth'
        };
      }
      if (d.sleepQuality && !sleepLog[dk]?.quality) {
        sleepLog[dk] = { ...sleepLog[dk], quality: d.sleepQuality };
      }
      if (d.restingHR) {
        sleepLog[dk] = { ...sleepLog[dk], restingHR: d.restingHR };
      }
      if (d.steps) {
        const existing = JSON.parse(localStorage.getItem('hvi_steps_log') || '{}');
        existing[dk] = d.steps;
        localStorage.setItem('hvi_steps_log', JSON.stringify(existing));
      }
      if (d.activeEnergy) {
        const existing = JSON.parse(localStorage.getItem('hvi_energy_log') || '{}');
        existing[dk] = d.activeEnergy;
        localStorage.setItem('hvi_energy_log', JSON.stringify(existing));
      }
      if (d.weight) {
        if (!weightLog[dk]) {
          weightLog[dk] = d.weight;
        }
      }
      if (d.workouts && Array.isArray(d.workouts)) {
        d.workouts.forEach(w => {
          if (!workoutLog[dk]) {
            workoutLog[dk] = {
              dayName: w.type || 'Apple Health Activity',
              duration: w.duration || 0,
              exercises: [],
              source: 'applehealth',
              distance: w.distance ? w.distance.toFixed(1) + ' km' : null,
              avgHr: w.avgHR || null,
              calories: w.calories || null
            };
          }
        });
      }
    });

    LS.set('hvi_sleep_log', sleepLog);
    LS.set('hvi_workout_log', workoutLog);
    LS.set('hvi_weight_log', weightLog);

    const int = _getIntegrations();
    int.applehealth = { ...(int.applehealth || {}), lastSync: Date.now(), connectedAt: int.applehealth?.connectedAt || Date.now() };
    _saveIntegrations(int);
  } catch (err) {
    console.error('[integrations] Apple Health sync failed:', err);
  }
}

// ── TOKEN STORAGE ────────────────────────────────────────────────────────
function _getIntegrations() { return LS.get('hvi_integrations', {}); }
function _saveIntegrations(data) { LS.set('hvi_integrations', data); }

function _getToken(service) {
  const int = _getIntegrations();
  return int[service] || null;
}
function _saveToken(service, tokenData) {
  const int = _getIntegrations();
  int[service] = { ...tokenData, connectedAt: Date.now() };
  _saveIntegrations(int);
}
function _removeToken(service) {
  const int = _getIntegrations();
  delete int[service];
  _saveIntegrations(int);
}

// ── OAUTH FLOW ───────────────────────────────────────────────────────────
function connectIntegration(service) {
  const cfg = INTEGRATIONS[service];
  if (!cfg) return;
  const clientId = _getClientId(service);
  if (!clientId) { alert('Integration not configured. Set up client ID in settings.'); return; }

  const state = service + '_' + Math.random().toString(36).slice(2);
  sessionStorage.setItem('oauth_state', state);
  sessionStorage.setItem('oauth_service', service);

  const redirectUri = window.location.origin + window.location.pathname;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: cfg.scopes,
    state: state,
    access_type: 'offline',
    prompt: 'consent'
  });

  // Strava uses slightly different param name
  if (service === 'strava') {
    params.set('approval_prompt', 'force');
    params.delete('access_type');
    params.delete('prompt');
  }
  // Fitbit needs response_type=code and code_challenge for PKCE (optional, use basic for now)
  if (service === 'fitbit') {
    params.set('response_type', 'code');
  }

  window.location.href = cfg.authUrl + '?' + params.toString();
}

function disconnectIntegration(service) {
  _removeToken(service);
  renderStats();
}

// Handle OAuth callback on page load
function _handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (!code || !state) return;

  const savedState = sessionStorage.getItem('oauth_state');
  const service = sessionStorage.getItem('oauth_service');

  if (state !== savedState || !service) {
    console.warn('[integrations] OAuth state mismatch');
    _clearUrlParams();
    return;
  }

  sessionStorage.removeItem('oauth_state');
  sessionStorage.removeItem('oauth_service');
  _clearUrlParams();

  // Exchange code for token via worker proxy
  _exchangeCode(service, code);
}

function _clearUrlParams() {
  const url = new URL(window.location);
  url.search = '';
  history.replaceState({}, '', url.pathname + url.hash);
}

async function _exchangeCode(service, code) {
  const redirectUri = window.location.origin + window.location.pathname;
  try {
    const res = await fetch(_OAUTH_PROXY + '/oauth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, code, redirect_uri: redirectUri })
    });
    if (!res.ok) throw new Error(await res.text());
    const tokenData = await res.json();
    _saveToken(service, tokenData);
    // Immediately sync
    syncIntegration(service);
    if (typeof renderStats === 'function') renderStats();
  } catch (err) {
    console.error('[integrations] Token exchange failed:', err);
    alert('Connection failed: ' + err.message);
  }
}

async function _refreshToken(service) {
  const token = _getToken(service);
  if (!token || !token.refresh_token) return null;
  try {
    const res = await fetch(_OAUTH_PROXY + '/oauth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, refresh_token: token.refresh_token })
    });
    if (!res.ok) throw new Error('Refresh failed');
    const newToken = await res.json();
    _saveToken(service, { ...token, ...newToken });
    return newToken.access_token;
  } catch (err) {
    console.error('[integrations] Token refresh failed:', err);
    _removeToken(service);
    return null;
  }
}

async function _authedFetch(service, url, opts = {}) {
  let token = _getToken(service);
  if (!token) return null;

  // Check if token is expired
  if (token.expires_at && Date.now() > token.expires_at) {
    const newAccess = await _refreshToken(service);
    if (!newAccess) return null;
    token = _getToken(service);
  }

  const res = await fetch(url, {
    ...opts,
    headers: { ...opts.headers, 'Authorization': 'Bearer ' + token.access_token }
  });

  if (res.status === 401) {
    const newAccess = await _refreshToken(service);
    if (!newAccess) return null;
    return fetch(url, { ...opts, headers: { ...opts.headers, 'Authorization': 'Bearer ' + newAccess } });
  }
  return res;
}

// ── CLIENT IDS ───────────────────────────────────────────────────────────
const _CLIENT_IDS = {
  strava: '246559',
  googlefit: '681305896160-s020jd287h1kdj7lh79k3m3keeis9q4p.apps.googleusercontent.com',
  fitbit: '',
  whoop: ''
};
function _getClientId(service) {
  return _CLIENT_IDS[service] || (settings.integrationClientIds || {})[service] || null;
}

// ── SYNC FUNCTIONS ───────────────────────────────────────────────────────
async function syncIntegration(service) {
  const token = _getToken(service);
  if (!token) return;

  try {
    switch (service) {
      case 'googlefit': await _syncGoogleFit(); break;
      case 'strava': await _syncStrava(); break;
      case 'fitbit': await _syncFitbit(); break;
      case 'whoop': await _syncWhoop(); break;
    }
    // Update last sync time
    const int = _getIntegrations();
    if (int[service]) { int[service].lastSync = Date.now(); _saveIntegrations(int); }
  } catch (err) {
    console.error(`[integrations] ${service} sync failed:`, err);
  }
}

function syncAllIntegrations() {
  const int = _getIntegrations();
  Object.keys(int).forEach(service => syncIntegration(service));
}

// ── GOOGLE FIT ───────────────────────────────────────────────────────────
async function _syncGoogleFit() {
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;

  // Sleep sessions
  const sleepRes = await _authedFetch('googlefit',
    'https://www.googleapis.com/fitness/v1/users/me/sessions?' + new URLSearchParams({
      startTime: new Date(weekAgo).toISOString(),
      endTime: new Date(now).toISOString(),
      activityType: '72' // sleep
    })
  );
  if (sleepRes?.ok) {
    const data = await sleepRes.json();
    (data.session || []).forEach(s => {
      const start = new Date(parseInt(s.startTimeMillis));
      const end = new Date(parseInt(s.endTimeMillis));
      const hours = ((end - start) / 3600000).toFixed(1);
      const dayKey = dateKey(start);
      if (!sleepLog[dayKey] || !sleepLog[dayKey].hours) {
        sleepLog[dayKey] = { ...sleepLog[dayKey], hours: parseFloat(hours), source: 'googlefit' };
      }
    });
    LS.set('hvi_sleep_log', sleepLog);
  }

  // Activity sessions (workouts)
  const actRes = await _authedFetch('googlefit',
    'https://www.googleapis.com/fitness/v1/users/me/sessions?' + new URLSearchParams({
      startTime: new Date(weekAgo).toISOString(),
      endTime: new Date(now).toISOString()
    })
  );
  if (actRes?.ok) {
    const data = await actRes.json();
    (data.session || []).forEach(s => {
      if (s.activityType === 72) return; // skip sleep
      const start = new Date(parseInt(s.startTimeMillis));
      const dayKey = dateKey(start);
      const duration = Math.round((parseInt(s.endTimeMillis) - parseInt(s.startTimeMillis)) / 60000);
      // Only add if no workout logged that day already
      if (!workoutLog[dayKey]) {
        workoutLog[dayKey] = {
          dayName: s.name || 'External Activity',
          duration: duration,
          exercises: [],
          source: 'googlefit',
          activityType: s.activityType
        };
      }
    });
    LS.set('hvi_workout_log', workoutLog);
  }

  // Weight (body measurements)
  const weightRes = await _authedFetch('googlefit',
    'https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.weight:com.google.android.gms:merge_weight/datasets/' + weekAgo + '000000-' + now + '000000'
  );
  if (weightRes?.ok) {
    const data = await weightRes.json();
    (data.point || []).forEach(p => {
      const dayKey = dateKey(new Date(parseInt(p.startTimeNanos) / 1e6));
      const kg = p.value?.[0]?.fpVal;
      const w = _kgToDisplayWeight(kg);
      if (w && !weightLog[dayKey]) {
        weightLog[dayKey] = w;
        LS.set('hvi_weight_log', weightLog);
      }
    });
  }
}

// ── STRAVA ───────────────────────────────────────────────────────────────
async function _syncStrava() {
  const weekAgo = Math.floor((Date.now() - 7 * 86400000) / 1000);
  const res = await _authedFetch('strava',
    'https://www.strava.com/api/v3/athlete/activities?after=' + weekAgo + '&per_page=30'
  );
  if (!res?.ok) return;
  const activities = await res.json();

  activities.forEach(a => {
    const dateKey = a.start_date_local?.slice(0, 10) || a.start_date?.slice(0, 10);
    if (!dateKey) return;
    const duration = Math.round((a.elapsed_time || a.moving_time || 0) / 60);

    // Map to workout log if no existing entry
    if (!workoutLog[dateKey]) {
      workoutLog[dateKey] = {
        dayName: a.name || a.sport_type || 'Strava Activity',
        duration: duration,
        exercises: [],
        source: 'strava',
        distance: a.distance ? (a.distance / 1000).toFixed(1) + ' km' : null,
        avgHr: a.average_heartrate || null,
        calories: a.calories || null
      };
    }
  });
  LS.set('hvi_workout_log', workoutLog);
}

// weightLog is stored in whatever unit the user sees, but Google Fit and Fitbit
// both report kilograms (Fitbit defaults to metric when no Accept-Language unit
// system is requested, which is the case here). Importing the raw number showed
// an 80 kg bodyweight as "80 lbs" for imperial users — and that figure feeds the
// relative-strength scoring, so it skewed those percentages too.
function _kgToDisplayWeight(kg) {
  const n = parseFloat(kg);
  if (!isFinite(n)) return null;
  const v = (typeof isImperial === 'function' && isImperial()) ? n * 2.20462 : n;
  return parseFloat(v.toFixed(1));
}

// ── FITBIT ───────────────────────────────────────────────────────────────
async function _syncFitbit() {
  const t = today();
  const weekAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return dateKey(d); })();

  // Sleep
  const sleepRes = await _authedFetch('fitbit',
    `https://api.fitbit.com/1.2/user/-/sleep/date/${weekAgo}/${t}.json`
  );
  if (sleepRes?.ok) {
    const data = await sleepRes.json();
    (data.sleep || []).forEach(s => {
      const dateKey = s.dateOfSleep;
      const hours = (s.duration / 3600000).toFixed(1);
      const efficiency = s.efficiency; // 0-100
      if (!sleepLog[dateKey] || !sleepLog[dateKey].hours) {
        sleepLog[dateKey] = {
          ...sleepLog[dateKey],
          hours: parseFloat(hours),
          quality: Math.round(efficiency / 20), // map 0-100 to 1-5
          source: 'fitbit'
        };
      }
    });
    LS.set('hvi_sleep_log', sleepLog);
  }

  // Activities
  const actRes = await _authedFetch('fitbit',
    `https://api.fitbit.com/1/user/-/activities/list.json?afterDate=${weekAgo}&sort=asc&limit=20&offset=0`
  );
  if (actRes?.ok) {
    const data = await actRes.json();
    (data.activities || []).forEach(a => {
      const dateKey = a.startDate || a.originalStartTime?.slice(0, 10);
      if (!dateKey || workoutLog[dateKey]) return;
      workoutLog[dateKey] = {
        dayName: a.activityName || 'Fitbit Activity',
        duration: a.duration ? Math.round(a.duration / 60000) : 0,
        exercises: [],
        source: 'fitbit',
        calories: a.calories || null,
        avgHr: a.averageHeartRate || null
      };
    });
    LS.set('hvi_workout_log', workoutLog);
  }

  // Weight
  const wtRes = await _authedFetch('fitbit',
    `https://api.fitbit.com/1/user/-/body/log/weight/date/${weekAgo}/${t}.json`
  );
  if (wtRes?.ok) {
    const data = await wtRes.json();
    (data.weight || []).forEach(w => {
      const val = _kgToDisplayWeight(w.weight);
      if (val && !weightLog[w.date]) {
        weightLog[w.date] = val;
      }
    });
    LS.set('hvi_weight_log', weightLog);
  }
}

// ── WHOOP ────────────────────────────────────────────────────────────────
async function _syncWhoop() {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Recovery
  const recRes = await _authedFetch('whoop',
    'https://api.prod.whoop.com/developer/v1/recovery?start=' + weekAgo
  );
  if (recRes?.ok) {
    const data = await recRes.json();
    (data.records || []).forEach(r => {
      const dateKey = r.created_at?.slice(0, 10) || r.cycle?.days?.[0];
      if (!dateKey) return;
      const score = r.score?.recovery_score;
      if (score != null && !sleepLog[dateKey]?.whoopRecovery) {
        sleepLog[dateKey] = {
          ...sleepLog[dateKey],
          whoopRecovery: score,
          quality: Math.round(score / 20), // map 0-100 to 1-5
          source: 'whoop'
        };
      }
    });
    LS.set('hvi_sleep_log', sleepLog);
  }

  // Sleep
  const sleepRes = await _authedFetch('whoop',
    'https://api.prod.whoop.com/developer/v1/activity/sleep?start=' + weekAgo
  );
  if (sleepRes?.ok) {
    const data = await sleepRes.json();
    (data.records || []).forEach(s => {
      const dateKey = s.start?.slice(0, 10);
      if (!dateKey) return;
      const hours = s.score?.total_in_bed_time_milli ? (s.score.total_in_bed_time_milli / 3600000).toFixed(1) : null;
      if (hours && (!sleepLog[dateKey] || !sleepLog[dateKey].hours)) {
        sleepLog[dateKey] = { ...sleepLog[dateKey], hours: parseFloat(hours), source: 'whoop' };
      }
    });
    LS.set('hvi_sleep_log', sleepLog);
  }

  // Workouts
  const wkRes = await _authedFetch('whoop',
    'https://api.prod.whoop.com/developer/v1/activity/workout?start=' + weekAgo
  );
  if (wkRes?.ok) {
    const data = await wkRes.json();
    (data.records || []).forEach(w => {
      const dateKey = w.start?.slice(0, 10);
      if (!dateKey || workoutLog[dateKey]) return;
      const dur = w.score?.distance_meter ? null : Math.round(((new Date(w.end) - new Date(w.start)) / 60000));
      workoutLog[dateKey] = {
        dayName: _whoopSportName(w.sport_id) || 'Whoop Activity',
        duration: dur || 0,
        exercises: [],
        source: 'whoop',
        strain: w.score?.strain,
        avgHr: w.score?.average_heart_rate || null
      };
    });
    LS.set('hvi_workout_log', workoutLog);
  }
}

function _whoopSportName(id) {
  const names = { 0:'Activity', 1:'Running', 33:'Cycling', 52:'Weightlifting', 63:'HIIT', 71:'Yoga', 43:'Swimming' };
  return names[id] || 'Workout';
}

// ── UI RENDERING ─────────────────────────────────────────────────────────
function connectAppleHealth() {
  const token = prompt('Enter your Health sync token.\n\nThis is the HEALTH_TOKEN secret you set in your Cloudflare Worker. The same token goes in your Apple Shortcut.');
  if (!token || !token.trim()) return;
  localStorage.setItem('hvi_health_token', token.trim());
  const int = _getIntegrations();
  int.applehealth = { connectedAt: Date.now() };
  _saveIntegrations(int);
  syncAppleHealth();
  if (typeof renderStats === 'function') renderStats();
}

function disconnectAppleHealth() {
  localStorage.removeItem('hvi_health_token');
  const int = _getIntegrations();
  delete int.applehealth;
  _saveIntegrations(int);
  if (typeof renderStats === 'function') renderStats();
}

function renderIntegrationsSection() {
  const int = _getIntegrations();

  // Apple Health row
  const ahConnected = !!int.applehealth && !!_getHealthToken();
  const ahSync = int.applehealth?.lastSync;
  const ahAge = ahSync ? _timeAgo(ahSync) : null;
  const appleRow = `<div class="intg-row">
    <div class="intg-icon">${APPLE_HEALTH_CFG.icon}</div>
    <div class="intg-info">
      <div class="intg-name">${APPLE_HEALTH_CFG.name}</div>
      <div class="intg-status">${ahConnected ? `Connected · synced ${ahAge || 'never'}` : 'steps, sleep, heart rate, workouts'}</div>
    </div>
    <div class="intg-action">
      ${ahConnected
        ? `<button class="intg-btn intg-btn-sync" onclick="syncAppleHealth();this.textContent='Syncing…'" title="Sync now">↻</button>
           <button class="intg-btn intg-btn-disc" onclick="disconnectAppleHealth()" title="Disconnect">×</button>`
        : `<button class="intg-btn intg-btn-conn" onclick="connectAppleHealth()">Connect</button>`}
    </div>
  </div>`;

  // Other integrations
  const rows = Object.entries(INTEGRATIONS).filter(([key]) => (_CLIENT_IDS[key] && _CLIENT_IDS[key] !== '') || int[key]).map(([key, cfg]) => {
    const connected = !!int[key];
    const lastSync = int[key]?.lastSync;
    const syncAge = lastSync ? _timeAgo(lastSync) : null;
    return `<div class="intg-row">
      <div class="intg-icon">${cfg.icon}</div>
      <div class="intg-info">
        <div class="intg-name">${cfg.name}</div>
        <div class="intg-status">${connected ? `Connected · synced ${syncAge || 'never'}` : cfg.provides.join(', ')}</div>
      </div>
      <div class="intg-action">
        ${connected
          ? `<button class="intg-btn intg-btn-sync" onclick="syncIntegration('${key}');this.textContent='Syncing…'" title="Sync now">↻</button>
             <button class="intg-btn intg-btn-disc" onclick="disconnectIntegration('${key}')" title="Disconnect">×</button>`
          : `<button class="intg-btn intg-btn-conn" onclick="connectIntegration('${key}')">Connect</button>`}
      </div>
    </div>`;
  }).join('');

  const allConnected = Object.keys(int).length > 0;
  return `
    <div class="da-section ani" style="margin:0 24px 16px;padding:16px">
      <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Connected Devices</div>
      <div class="intg-list">${appleRow}${rows}</div>
      ${allConnected ? `<button class="intg-sync-all" onclick="syncAllIntegrations();syncAppleHealth();this.textContent='Syncing all…'">Sync All Now</button>` : ''}
    </div>`;
}

function _timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

// ── AUTO-SYNC ON LOAD ────────────────────────────────────────────────────
function _initIntegrations() {
  _handleOAuthCallback();
  const int = _getIntegrations();
  // Auto-sync Apple Health
  if (int.applehealth && _getHealthToken()) {
    const lastSync = int.applehealth?.lastSync || 0;
    if (Date.now() - lastSync > 2 * 3600000) {
      setTimeout(() => syncAppleHealth(), 2500);
    }
  }
  // Auto-sync connected OAuth services every 2 hours
  Object.keys(int).forEach(service => {
    if (service === 'applehealth') return;
    const lastSync = int[service]?.lastSync || 0;
    if (Date.now() - lastSync > 2 * 3600000) {
      setTimeout(() => syncIntegration(service), 3000);
    }
  });
}

// Run on load
_initIntegrations();
