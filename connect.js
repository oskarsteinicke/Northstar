// ══════════════════════════════════════════════════════════════════════════
// Arete — Connected System Layer
// ──────────────────────────────────────────────────────────────────────────
// Phase 0: a tiny event bus + shared derived-state selectors so the five
// modules can react to each other without being hard-wired together.
//
// This file READS the global state vars declared in app.js (habits, log,
// workoutLog, mealLog, dietMeta, sleepLog, journal, gamification ...) the same
// way coach.js already does. It adds no new storage and changes no behavior on
// its own — it only computes connected signals on demand.
// ══════════════════════════════════════════════════════════════════════════

// ── EVENT BUS ───────────────────────────────────────────────────────────────
// Modules emit on key writes (e.g. Arete.emit('workout:logged', {...})) and
// "connectors" subscribe to react. New cross-module links = new subscribers.
window.Arete = window.Arete || (function () {
  const subs = {};
  return {
    on(evt, fn) { (subs[evt] = subs[evt] || []).push(fn); return () => window.Arete.off(evt, fn); },
    off(evt, fn) { if (subs[evt]) subs[evt] = subs[evt].filter(f => f !== fn); },
    emit(evt, payload) {
      (subs[evt] || []).forEach(fn => { try { fn(payload); } catch (e) { console.warn('[Arete] handler error:', evt, e); } });
    },
    _subs: subs,
  };
})();

// ── SMALL HELPERS (namespaced to avoid global collisions) ────────────────────
function _cnClamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function _cnClamp01(v) { return _cnClamp(v, 0, 1); }
function _cnDateKey(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() - (offsetDays || 0));
  return d.toLocaleDateString('en-CA');
}

// ── DERIVED SIGNAL: habit adherence over last 7 days (0..1) ──────────────────
function getHabitAdherence7d() {
  try {
    if (!Array.isArray(habits) || !habits.length) return 0.6; // neutral when nothing to measure
    const hist = LS.get('hvi_habit_history', {});
    const t = today();
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const key = _cnDateKey(i);
      const doneThatDay = key === t
        ? habits.filter(h => log[h.id]?.completedToday).length
        : Object.values(hist).filter(arr => Array.isArray(arr) && arr.includes(key)).length;
      total += doneThatDay;
    }
    return _cnClamp01(total / (7 * habits.length));
  } catch { return 0.6; }
}

// ── DERIVED SIGNAL: nutrition adherence over last 3 logged days (0..1) ────────
// Skips days with no meals logged so "didn't log" is not treated as "didn't eat well".
function getNutritionAdherence3d() {
  try {
    const goals = (typeof dietMeta !== 'undefined' && dietMeta) ? dietMeta.dailyGoals || {} : {};
    if (!goals.calories) return 0.6; // neutral when no target set
    let hit = 0, days = 0;
    for (let i = 0; i < 3; i++) {
      const key = _cnDateKey(i);
      const meals = ((mealLog || {})[key] || {}).meals || [];
      if (!meals.length) continue;
      days++;
      let cal = 0, p = 0;
      meals.forEach(m => (m.items || []).forEach(it => { cal += it.calories || 0; p += it.protein || 0; }));
      const proteinOK = goals.protein ? p >= goals.protein * 0.9 : true;
      const calOK = cal >= goals.calories * 0.8 && cal <= goals.calories * 1.15;
      if (proteinOK && calOK) hit++;
    }
    return days ? hit / days : 0.6;
  } catch { return 0.6; }
}

// ── DERIVED SIGNAL: most recent sleep entry (today or yesterday) ──────────────
function getRecentSleep() {
  const sl = (typeof sleepLog !== 'undefined' && sleepLog) ? sleepLog : {};
  return sl[today()] || sl[_cnDateKey(1)] || {};
}

// ── PHASE 1: DAILY READINESS ─────────────────────────────────────────────────
// One fused morning signal (0..100). Blends training load, sleep, habit
// consistency and nutrition adherence. If a Whoop recovery score exists for the
// day it is weighted heavily (the user chose: prefer Whoop when present).
function getReadiness() {
  const slp = getRecentSleep();
  const whoop = (typeof slp.whoopRecovery === 'number') ? slp.whoopRecovery : null;

  // Sleep score 0..1 (hours weighted 60%, quality 40%); neutral if unlogged
  let sleepScore = 0.6;
  if (slp.hours || slp.quality) {
    sleepScore = _cnClamp01((slp.hours || 0) / 8) * 0.6 + _cnClamp01((slp.quality || 0) / 5) * 0.4;
  }

  // Training-load score 0..1 (inverse of fatigue) from existing recovery logic
  let loadScore = 1.0;
  try {
    if (typeof getRecoveryStatus === 'function') {
      const rec = getRecoveryStatus();
      loadScore = rec.status === 'fatigued' ? 0.4 : rec.status === 'moderate' ? 0.7 : 1.0;
    }
  } catch {}

  const habitScore = getHabitAdherence7d();
  const nutScore = getNutritionAdherence3d();

  let score;
  if (whoop !== null) {
    // Prefer Whoop; nudge with sleep + load so a bad night still moves it
    score = 0.7 * whoop + 0.3 * 100 * ((sleepScore + loadScore) / 2);
  } else {
    score = 100 * (0.40 * loadScore + 0.30 * sleepScore + 0.15 * habitScore + 0.15 * nutScore);
  }
  score = Math.round(_cnClamp(score, 0, 100));

  const label = score >= 75 ? 'Primed' : score >= 50 ? 'Steady' : score >= 30 ? 'Run down' : 'Depleted';
  return {
    score,
    label,
    factors: { whoop, sleep: sleepScore, load: loadScore, habits: habitScore, nutrition: nutScore },
  };
}

// ── READINESS -> TRAINING ADVICE ──────────────────────────────────────────
// Readiness is built from sleep, training load, habit adherence and nutrition,
// but it only ever appeared on the home screen. The workout screen — the one
// place it should change what you actually do — never saw it. This turns the
// score into a concrete instruction for today's session, and names the factor
// holding it back so the advice is actionable rather than mystical.
function trainingAdvice() {
  if (!hasReadinessSignal()) return null;
  const r = getReadiness();

  // The weakest input is what to fix; Whoop is a reading, not something you do
  const named = { sleep: 'Sleep', load: 'Training load', habits: 'Habits', nutrition: 'Nutrition' };
  let limiter = null, worst = 1.1;
  Object.keys(named).forEach(k => {
    const v = r.factors[k];
    if (typeof v === 'number' && v < worst) { worst = v; limiter = named[k]; }
  });

  let headline, detail;
  if (r.score >= 75) {
    headline = 'Primed — go heavy';
    detail = 'Push top sets. A PR attempt is well timed today.';
  } else if (r.score >= 50) {
    headline = 'Steady — train as planned';
    detail = 'Hit your normal loads and rep targets.';
  } else if (r.score >= 30) {
    headline = 'Run down — hold intensity, cut volume';
    detail = 'Keep the weights, drop a set per exercise and stop two reps short.';
  } else {
    headline = 'Depleted — deload today';
    detail = 'Same movements at roughly 60% load. Moving well beats moving heavy.';
  }
  if (limiter && worst < 0.65) detail += ` ${limiter} is what is holding this back.`;
  return { score: r.score, label: r.label, color: readinessColor(r.score), headline, detail };
}

function trainingAdviceHTML() {
  const a = trainingAdvice();
  if (!a) return '';
  return `<div class="w-advice ani" onclick="go('home')" role="button" tabindex="0"
      onkeydown="if(event.key==='Enter'){go('home')}" aria-label="Readiness ${a.score} of 100. ${esc(a.headline)}">
      <div class="w-advice-score" style="color:${a.color};border-color:${a.color}">${a.score}</div>
      <div class="w-advice-text">
        <div class="w-advice-head">${esc(a.headline)}</div>
        <div class="w-advice-detail">${esc(a.detail)}</div>
      </div>
    </div>`;
}

function readinessColor(score) {
  return score >= 75 ? 'var(--accent-b)' : score >= 50 ? 'var(--carb)' : score >= 30 ? '#e0a866' : 'var(--fat)';
}

// Only meaningful once we have at least one real input. Avoids showing a
// confident score to a brand-new user with no data.
function hasReadinessSignal() {
  const slp = getRecentSleep();
  if (slp.hours || slp.quality || typeof slp.whoopRecovery === 'number') return true;
  try {
    const wl = (typeof workoutLog !== 'undefined' && workoutLog) ? workoutLog : {};
    for (let i = 0; i < 7; i++) { if (wl[_cnDateKey(i)]) return true; }
  } catch {}
  return false;
}

// ── PHASE 2: TRAINING DRIVES NUTRITION ───────────────────────────────────────
// Weekly training schedule (0=Sun..6=Sat). Defaults from the active program's
// day count; persisted to hvi_settings once the user edits it.
function _defaultTrainingDays() {
  let n = 5;
  try {
    const prog = (typeof findProgram === 'function') ? findProgram(workoutMeta && workoutMeta.activeProgram) : null;
    if (prog && prog.days) n = prog.days.length;
  } catch {}
  const map = { 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] };
  return map[n] || [1, 2, 3, 4, 5];
}
function getTrainingDays() {
  try {
    const s = (typeof settings !== 'undefined' && settings) ? settings : {};
    if (Array.isArray(s.trainingDays)) return s.trainingDays;
  } catch {}
  return _defaultTrainingDays();
}
function setTrainingDays(arr) {
  try {
    if (typeof settings === 'undefined' || !settings) return;
    settings.trainingDays = arr.slice().sort((a, b) => a - b);
    LS.set('hvi_settings', settings);
    window.Arete.emit('trainingDays:changed', settings.trainingDays);
  } catch {}
}

function _intensityFromDayName(name) {
  if (!name) return 'moderate';
  const n = String(name).toLowerCase();
  if (/leg|lower|squat|deadlift|power|full ?body|posterior|hinge/.test(n)) return 'hard';
  return 'moderate';
}

// Classify today: 'hard' | 'moderate' | 'rest'. A logged workout always counts
// as a training day; otherwise the weekly schedule decides training vs rest.
function classifyTodaySession() {
  const t = today();
  const wl = (typeof workoutLog !== 'undefined' && workoutLog) ? workoutLog[t] : null;
  // Only a session with actual completed work counts as trained — opening the
  // workout screen auto-creates an empty entry, which must not flip macros.
  const trained = (typeof workoutDoneToday === 'function') ? workoutDoneToday()
    : !!(wl && (wl.source || (wl.exercises || []).some(e => (e.sets || []).some(s => s.completed))));
  if (wl && trained) {
    return { type: _intensityFromDayName(wl.dayName), dayName: wl.dayName || null, source: 'logged' };
  }
  const dow = new Date().getDay();
  if (!getTrainingDays().includes(dow)) return { type: 'rest', dayName: 'Rest', source: 'schedule' };
  let dayName = null;
  try {
    const prog = (typeof findProgram === 'function' ? findProgram(workoutMeta && workoutMeta.activeProgram) : null)
      || (typeof WORKOUT_PROGRAMS !== 'undefined' ? WORKOUT_PROGRAMS[0] : null);
    if (prog && prog.days && prog.days.length) {
      const day = prog.days[((workoutMeta && workoutMeta.currentDayIndex) || 0) % prog.days.length];
      dayName = (day && day.name) || null;
    }
  } catch {}
  return { type: _intensityFromDayName(dayName), dayName, source: 'planned' };
}

// Today's macro targets = base goals + carb-cycling modifier (non-destructive;
// base dietMeta.dailyGoals is never mutated). Hard days: carbs +20%, protein
// +10%. Rest days: carbs -25%. Normal training day = your set goal unchanged.
function getTodaysMacroTargets() {
  const base = (typeof dietMeta !== 'undefined' && dietMeta) ? (dietMeta.dailyGoals || {}) : {};
  let { calories, protein, carbs, fat } = base;
  if (!calories) return { calories, protein, carbs, fat, adjusted: false, type: null, dayName: null };
  protein = protein || 0;
  fat = (fat != null) ? fat : Math.round(calories * 0.25 / 9);
  carbs = (carbs != null) ? carbs : Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  const sess = classifyTodaySession();
  // hard day: carbs +20% / protein +10%; normal training day: carbs +8%; rest: carbs -25%
  const carbMult = sess.type === 'hard' ? 1.20 : sess.type === 'rest' ? 0.75 : 1.08;
  const protMult = sess.type === 'hard' ? 1.10 : 1.0;
  const adjCarbs = Math.round(carbs * carbMult);
  const adjProtein = Math.round(protein * protMult);
  // Calories = the user's set goal plus only the delta from the adjustment, so
  // a normal day shows their exact numbers (macros need not sum to calories).
  const adjCalories = Math.round(calories + (adjCarbs - carbs) * 4 + (adjProtein - protein) * 4);

  return {
    calories: adjCalories, protein: adjProtein, carbs: adjCarbs, fat,
    baseCalories: calories, baseCarbs: carbs, baseProtein: protein,
    adjusted: carbMult !== 1.0 || protMult !== 1.0,
    type: sess.type, dayName: sess.dayName, source: sess.source,
  };
}

// Short human label for the current adjustment, used by home/diet/coach.
function macroAdjustReason() {
  const t = getTodaysMacroTargets();
  if (!t.adjusted) return '';
  if (t.type === 'hard') return `${t.dayName || 'Heavy day'} · carbs +20%, protein +10%`;
  if (t.type === 'rest') return 'Rest day · carbs -25%';
  return `${t.dayName || 'Training day'} · carbs +8%`;
}

function macroAdjustBadgeHTML() {
  try {
    const t = getTodaysMacroTargets();
    if (!t.adjusted) return '';
    const isHard = t.type === 'hard';
    const isRest = t.type === 'rest';
    const ic = (n, s) => (typeof icon === 'function' ? icon(n, s) : '');
    const glyph = isRest ? ic('moon', 15) : isHard ? ic('flame', 15) : ic('activity', 15);
    const color = isRest ? 'var(--text-dim)' : 'var(--carb)';
    return `<div class="d-adjust-badge" style="border-color:${color}">
      <span class="d-adjust-main">${glyph} ${macroAdjustReason()}</span>
      <span class="d-adjust-base">${t.baseCalories.toLocaleString()} → ${t.calories.toLocaleString()} cal</span>
    </div>`;
  } catch { return ''; }
}

// ── PHASE 3: CROSS-MODULE HABIT COMPLETION ───────────────────────────────────
// Habits can be linked to a trigger ('workout' | 'protein' | 'calories') in the
// habit editor. When that action happens the linked habit auto-completes through
// the event bus, so the user never logs the same thing twice.
const TRIGGER_LABELS = { workout: '🏋️ Workout', protein: '🥩 Protein target', calories: '🔥 Calorie target' };

function getHabitLink(id) { return (LS.get('hvi_habit_links', {}) || {})[id] || ''; }

// Complete a habit if (and only if) it is not already done today. Reuses
// tapHabit so streaks, XP, quests and milestones behave exactly like a manual
// tap. tapHabit toggles, so we guard on completedToday; the unmatched suffix
// makes tapHabit skip its DOM updates when the habit row isn't on screen.
function autoCompleteHabit(id) {
  try {
    if (!log[id] || log[id].completedToday) return false;
    if (typeof tapHabit !== 'function') return false;
    tapHabit(id, '__auto');
    return true;
  } catch (e) { console.warn('[Arete] autoCompleteHabit error:', e); return false; }
}

function _connectToast(msg) {
  try {
    const el = document.createElement('div');
    el.className = 'streak-toast';
    el.style.cssText = 'bottom:100px;animation-duration:4s';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  } catch {}
}

function _autoCompleteLinkedHabits(trigger) {
  const links = LS.get('hvi_habit_links', {}) || {};
  const done = [];
  Object.keys(links).forEach(hid => {
    if (links[hid] === trigger && autoCompleteHabit(hid)) {
      const h = (Array.isArray(habits) ? habits.find(x => x.id === hid) : null);
      if (h) done.push(h.name);
    }
  });
  if (done.length) {
    _connectToast('✓ Auto-completed: ' + done.join(', '));
    // Refresh a habit-showing view so the tick appears immediately
    if (typeof go === 'function' && (curView === 'home' || curView === 'habits')) {
      try { go(curView, {}, false); } catch {}
    }
  }
  return done;
}

// Called after the diet view renders (covers every meal-add path) and is
// idempotent — a habit only completes the first time its target is crossed.
function checkNutritionTriggers() {
  try {
    const goals = getTodaysMacroTargets();
    if (!goals || !goals.calories) return;
    const m = (typeof getDayMacros === 'function') ? getDayMacros() : null;
    if (!m) return;
    if (goals.protein && m.p >= goals.protein) _autoCompleteLinkedHabits('protein');
    if (goals.calories && m.cal >= goals.calories) _autoCompleteLinkedHabits('calories');
  } catch (e) { console.warn('[Arete] nutrition triggers error:', e); }
}

// Sleep and journal are tracked but nothing could react to them, so a
// "Sleep 7h+" or "Reflect daily" habit still had to be ticked by hand even
// though the app already knew it had happened.
function checkSleepTriggers() {
  try {
    const sl = (typeof sleepLog !== 'undefined' && sleepLog) ? sleepLog[today()] : null;
    if (sl && (sl.hours || 0) >= 7) _autoCompleteLinkedHabits('sleep');
  } catch (e) { console.warn('[Arete] sleep triggers error:', e); }
}

function checkJournalTriggers() {
  try {
    const je = (typeof journal !== 'undefined' && journal) ? journal[today()] : null;
    if (je && Object.values(je).some(Boolean)) _autoCompleteLinkedHabits('journal');
  } catch (e) { console.warn('[Arete] journal triggers error:', e); }
}

// Everything that can complete a linked habit now goes through the bus, so a
// new integration only has to listen rather than find every write site.
window.Arete.on('workout:completed', () => _autoCompleteLinkedHabits('workout'));
window.Arete.on('sleep:logged', checkSleepTriggers);
window.Arete.on('journal:saved', checkJournalTriggers);
window.Arete.on('meal:logged', () => { if (typeof checkNutritionTriggers === 'function') checkNutritionTriggers(); });

// ── PHASE 4: PROACTIVE COACH (rule-based local nudges) ───────────────────────
// Deterministic flags computed on-device from the signals the connected layer
// already produces. The single highest-priority flag surfaces as a coach card
// on the home screen — unprompted, free, instant. The AI coach (when opened)
// remains the deeper, conversational layer.
function _lastJournal() {
  const j = (typeof journal !== 'undefined' && journal) ? journal : {};
  const keys = Object.keys(j).sort().reverse();
  return keys.length ? j[keys[0]] : null;
}

function getCoachNudge() {
  try {
    // Don't nag brand-new users with no signal at all
    if (!hasReadinessSignal() && !(Array.isArray(habits) && habits.length)) return null;

    const flags = [];
    const r = getReadiness();
    const rec = (typeof getRecoveryStatus === 'function') ? getRecoveryStatus() : { status: 'fresh', days: 0 };
    const mt = getTodaysMacroTargets();
    const m = (typeof getDayMacros === 'function') ? getDayMacros() : { cal: 0, p: 0 };
    const hourNow = new Date().getHours();
    const nutAdh = getNutritionAdherence3d();
    const habitAdh = getHabitAdherence7d();

    // 1) Hard training day, afternoon, well under protein
    if (mt && mt.type === 'hard' && mt.protein && hourNow >= 14 && (m.p / mt.protein) < 0.5) {
      flags.push({ id: 'hardfuel', icon: 'meat', sev: 3,
        text: `Heavy day today and you're at ${m.p}g of ${mt.protein}g protein. Muscle doesn't rebuild on an empty tank. Get a protein-heavy meal in.` });
    }
    // 2) Training load vs nutrition mismatch over recent days
    if ((rec.status === 'fatigued' || rec.status === 'moderate') && nutAdh < 0.4) {
      flags.push({ id: 'mismatch', icon: 'scale', sev: 2,
        text: `You've trained ${rec.days}x this week but nutrition's been short. Hard training plus underfueling is how you stall and get hurt. Lock in your meals today.` });
    }
    // 3) Low readiness — ease off
    if (r.score < 35) {
      flags.push({ id: 'lowready', icon: 'battery', sev: 2,
        text: `Readiness is ${r.score} today. Pushing hard now just digs the hole deeper. Make today lighter and prioritize sleep and food.` });
    }
    // 4) Habits slipping while the journal shows a struggle
    const lastJ = _lastJournal();
    if (habitAdh < 0.5 && lastJ && lastJ.struggle && String(lastJ.struggle).trim()) {
      flags.push({ id: 'slip', icon: 'compass', sev: 1,
        text: `Your habits have slipped this week and your last journal named a struggle. This is the moment that decides who you become. One small win today turns it around.` });
    }
    // 5) Everything aligned — push (only when nothing's wrong)
    if (!flags.length && r.score >= 75 && habitAdh >= 0.8 && nutAdh >= 0.6) {
      flags.push({ id: 'aligned', icon: 'zap', sev: 0,
        text: `Readiness ${r.score}, habits on track, nutrition dialed in. Everything's aligned. This is the day to push.` });
    }

    if (!flags.length) return null;
    flags.sort((a, b) => b.sev - a.sev);
    return flags[0];
  } catch (e) { console.warn('[Arete] nudge error:', e); return null; }
}

// ── PREMIUM: COACH'S DAILY FOCUS ─────────────────────────────────────────────
// One AI-generated, personalized focus per day, built from this account's
// actual data. Premium-only (it costs API calls); free users see a locked
// teaser that opens the paywall. Cached per day in hvi_coach_insight.
const _INSIGHT_PROXY = 'https://arete-ai.oskarsteinicke.workers.dev';

function _coachInsightContext() {
  const parts = [];
  try {
    const r = getReadiness();
    parts.push(`Readiness ${r.score}/100 (${r.label}); load ${Math.round(r.factors.load * 100)}%, sleep ${Math.round(r.factors.sleep * 100)}%, habits ${Math.round(r.factors.habits * 100)}%, nutrition ${Math.round(r.factors.nutrition * 100)}%${r.factors.whoop != null ? ', Whoop ' + Math.round(r.factors.whoop) : ''}`);
  } catch {}
  try {
    const mt = getTodaysMacroTargets();
    const m = getDayMacros();
    parts.push(`Day type: ${mt.type || 'training'}${mt.dayName ? ' (' + mt.dayName + ')' : ''}. Eaten ${m.cal}/${mt.calories || '?'} kcal, protein ${m.p}/${mt.protein || '?'}g`);
  } catch {}
  try {
    const done = habits.filter(h => log[h.id]?.completedToday).length;
    parts.push(`Habits today: ${done}/${habits.length}`);
    const risk = habits.filter(h => (log[h.id]?.streak || 0) >= 3 && !log[h.id]?.completedToday).slice(0, 3).map(h => `${h.name} (${log[h.id].streak}d streak)`);
    if (risk.length) parts.push('Streaks at risk: ' + risk.join(', '));
  } catch {}
  try {
    const rec = getRecoveryStatus();
    parts.push(`Training: ${rec.days} sessions last 7 days, ${rec.consecutive} consecutive`);
  } catch {}
  try {
    const sl = sleepLog[today()] || sleepLog[yesterday()];
    if (sl && sl.hours) parts.push(`Last sleep: ${sl.hours}h${sl.quality ? ', quality ' + sl.quality + '/5' : ''}`);
  } catch {}
  try {
    const jk = Object.keys(journal || {}).sort().reverse()[0];
    const j = jk ? journal[jk] : null;
    if (j && j.struggle) parts.push(`Recent journal struggle: "${String(j.struggle).slice(0, 100)}"`);
  } catch {}
  try {
    const why = LS.get('hvi_why', '');
    if (why) parts.push(`Their why: "${String(why).slice(0, 80)}"`);
  } catch {}
  try {
    const goals = (LS.get('hvi_goals', []) || []).filter(g => !g.done).slice(0, 3).map(g => g.text);
    if (goals.length) parts.push('Active goals: ' + goals.join('; '));
  } catch {}
  return parts.join('\n');
}

async function fetchCoachInsight(force) {
  const t = today();
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem('hvi_coach_insight') || 'null'); } catch {}
  if (!force && cached && cached.date === t && cached.text) return cached.text;
  const prompt = `You are Arete Coach — a direct, warm performance coach blending Stoic philosophy and sports science. Based ONLY on this user's data from today, give ONE specific focus or tip for the rest of their day.

DATA:
${_coachInsightContext()}

Rules: 2-3 sentences, maximum 55 words. Speak directly ("you"). Reference at least one of their actual numbers. Be concrete about what to do today. No greetings, no emojis, no markdown, no preamble.`;
  const res = await fetch(_INSIGHT_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 120 } }),
  });
  if (!res.ok) throw new Error('insight fetch failed: ' + res.status);
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  if (!text) throw new Error('empty insight');
  try { localStorage.setItem('hvi_coach_insight', JSON.stringify({ date: t, text })); } catch {}
  return text;
}

function coachInsightCardHTML() {
  try {
    const premium = (typeof isPremium === 'function') ? isPremium() : false;
    if (!premium) {
      return `<div class="ci-card ci-locked ani" onclick="if(typeof showUpgradeModal==='function')showUpgradeModal('coach')" role="button" tabindex="0" aria-label="Coach's Focus — Premium feature">
        <div class="ci-head"><span class="ci-label">Coach's Focus</span><span class="ci-lock">Premium</span></div>
        <div class="ci-text ci-teaser">A daily, personal focus from your AI coach — built from your readiness, training, nutrition and habits.</div>
      </div>`;
    }
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem('hvi_coach_insight') || 'null'); } catch {}
    const fresh = cached && cached.date === today() && cached.text;
    if (!fresh) setTimeout(() => _fillCoachInsight(false), 400);
    return `<div class="ci-card ani">
      <div class="ci-head"><span class="ci-label">Coach's Focus</span>
        <button class="ci-refresh" onclick="_fillCoachInsight(true)" aria-label="Get a new insight" title="New insight">${(typeof icon === 'function') ? icon('refresh', 13) : '↻'}</button>
      </div>
      <div class="ci-text" id="ci-text">${fresh ? esc(cached.text) : 'Reading your day…'}</div>
    </div>`;
  } catch { return ''; }
}

async function _fillCoachInsight(force) {
  const el = document.getElementById('ci-text');
  if (!el) return;
  if (force) el.textContent = 'Reading your day…';
  try {
    const text = await fetchCoachInsight(force);
    const el2 = document.getElementById('ci-text');
    if (el2) el2.textContent = text;
  } catch {
    const el2 = document.getElementById('ci-text');
    if (el2) el2.textContent = "Couldn't reach your coach right now. Tap ↻ to retry.";
  }
}

// ── PHASE 5: UNIFIED "TODAY" BRIEFING ────────────────────────────────────────
// One daily command-center card at the top of home that composes every module:
// readiness, today's training, the adjusted nutrition target, habit status, a
// journaling prompt, and one coach line. Folds in the standalone readiness card
// and coach nudge so home reads as a single connected briefing.
const _JOURNAL_PROMPTS = [
  'What did you do today that your future self will thank you for?',
  'Where did you fall short, and what will you do differently tomorrow?',
  'What is one thing fully within your control right now?',
  'What drained you today, and what gave you energy?',
  'If today repeated for a year, where would it take you?',
  'What did you avoid that you know you should face?',
  'What are you grateful for that you usually overlook?',
];
function _journalPrompt() {
  const d = new Date();
  const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return _JOURNAL_PROMPTS[doy % _JOURNAL_PROMPTS.length];
}

function dismissBriefCoach() {
  try { localStorage.setItem('hvi_nudge_dismissed', today()); } catch {}
  if (typeof go === 'function' && typeof curView !== 'undefined' && curView === 'home') {
    try { go('home', {}, false); } catch {}
  }
}

// Breakdown modal: shows the factors that make up the readiness score.
function _rdFactorRow(glyph, label, val, weight) {
  const v = Math.round(val);
  const c = v >= 70 ? 'var(--carb)' : v >= 40 ? '#e0a866' : 'var(--fat)';
  return `<div class="rd-factor">
    <div class="rd-factor-top">
      <span class="rd-factor-name">${glyph} ${label}</span>
      <span class="rd-factor-val">${v}<span class="rd-factor-unit">/100</span></span>
    </div>
    <div class="rd-bar"><div class="rd-bar-fill" style="width:${Math.max(3, v)}%;background:${c}"></div></div>
    <div class="rd-factor-weight">${weight}</div>
  </div>`;
}

function showReadinessBreakdown() {
  try {
    const existing = document.getElementById('rd-modal');
    if (existing) existing.remove();
    const r = getReadiness();
    const f = r.factors;
    const color = readinessColor(r.score);
    const usingWhoop = f.whoop != null;
    const pct = v => Math.round(v * 100);

    const interp = r.score >= 75 ? 'Primed. Green light to push hard today.'
      : r.score >= 50 ? 'Steady. Train as planned, just don\'t force PRs.'
      : r.score >= 30 ? 'Run down. Dial back intensity and prioritize recovery.'
      : 'Depleted. Make today a recovery day. Sleep and food come first.';

    const ic = (n) => (typeof icon === 'function' ? icon(n, 16) : '');
    const rows = [];
    if (usingWhoop) {
      rows.push(_rdFactorRow(ic('flame'), 'Whoop recovery', f.whoop, 'Leads the score'));
      rows.push(_rdFactorRow(ic('moon'), 'Sleep', pct(f.sleep), 'Fine-tunes'));
      rows.push(_rdFactorRow(ic('activity'), 'Training load', pct(f.load), 'Fine-tunes'));
    } else {
      rows.push(_rdFactorRow(ic('activity'), 'Training load', pct(f.load), '40% of score'));
      rows.push(_rdFactorRow(ic('moon'), 'Sleep', pct(f.sleep), '30% of score'));
      rows.push(_rdFactorRow(ic('check'), 'Habit consistency', pct(f.habits), '15% of score'));
      rows.push(_rdFactorRow(ic('target'), 'Nutrition', pct(f.nutrition), '15% of score'));
    }

    const slp = getRecentSleep();
    const slpLogged = !!(slp.hours || slp.quality || typeof slp.whoopRecovery === 'number');

    // Today's biometrics (moved here from the home screen — they explain the score)
    const _t = today();
    const _slToday = (typeof sleepLog !== 'undefined' && sleepLog && sleepLog[_t]) ? sleepLog[_t] : {};
    const _steps = (LS.get('hvi_steps_log', {})[_t]) || 0;
    const _energy = (LS.get('hvi_energy_log', {})[_t]) || 0;
    const _vit = [];
    if (_slToday.hours) _vit.push([ic('moon'), _slToday.hours + 'h', 'Sleep']);
    if (_steps) _vit.push([ic('footprints'), _steps.toLocaleString(), 'Steps']);
    if (_energy) _vit.push([ic('flame'), _energy, 'kcal active']);
    if (_slToday.restingHR) _vit.push([ic('heart'), _slToday.restingHR, 'Resting HR']);
    const vitalsHTML = _vit.length
      ? `<div class="rd-vitals">${_vit.map(v => `<div class="rd-vital"><div class="rd-vital-ic">${v[0]}</div><div class="rd-vital-val">${v[1]}</div><div class="rd-vital-lbl">${v[2]}</div></div>`).join('')}</div>`
      : '';

    const foot = usingWhoop
      ? 'Your Whoop recovery score leads today; sleep and training load adjust it.'
      : 'Each factor contributes the weight shown. Log sleep and meals to sharpen it.';

    const html = `<div id="rd-modal" class="rd-overlay" role="dialog" aria-modal="true" aria-label="Readiness breakdown">
      <div class="rd-sheet">
        <button class="rd-close" onclick="closeReadinessBreakdown()" aria-label="Close">&times;</button>
        <div class="rd-score-wrap">
          <div class="rd-score-ring">${(typeof ring === 'function') ? ring(34, r.score / 100, 4, color) : ''}<div class="rd-score-num" style="color:${color}">${r.score}</div></div>
          <div class="rd-score-meta">
            <div class="rd-score-lbl" style="color:${color}">${r.label}</div>
            <div class="rd-score-cap">Daily readiness</div>
          </div>
        </div>
        <div class="rd-intro">${interp}</div>
        <div class="rd-factors">${rows.join('')}</div>
        ${vitalsHTML}
        ${slpLogged ? '' : `<div class="rd-hint">${ic('moon')} You haven't logged sleep today. Add it to sharpen your score.</div>`}
        <div class="rd-actions">
          <button class="rd-action-btn" onclick="closeReadinessBreakdown();if(typeof go==='function')go('sleep')">${ic('moon')} Log sleep</button>
        </div>
        <div class="rd-foot">${foot}</div>
      </div>
    </div>`;

    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const node = wrap.firstElementChild;
    document.body.appendChild(node);
    node.addEventListener('click', e => { if (e.target === node) closeReadinessBreakdown(); });
    requestAnimationFrame(() => node.classList.add('rd-visible'));
    if (typeof track === 'function') track('readiness_breakdown_open', { score: r.score });
  } catch (e) { console.warn('[Arete] readiness breakdown error:', e); }
}

function closeReadinessBreakdown() {
  const m = document.getElementById('rd-modal');
  if (!m) return;
  m.classList.remove('rd-visible');
  setTimeout(() => m.remove(), 250);
}

function todayBriefingHTML() {
  try {
    const t = today();
    const ic = (n, s) => (typeof icon === 'function' ? icon(n, s) : '');
    const r = hasReadinessSignal() ? getReadiness() : null;
    const rColor = r ? readinessColor(r.score) : '';
    const mt = getTodaysMacroTargets();
    const m = (typeof getDayMacros === 'function') ? getDayMacros() : { cal: 0, p: 0 };
    const sess = classifyTodaySession();

    const wEntry = (typeof workoutLog !== 'undefined' && workoutLog) ? workoutLog[t] : null;
    const wLogged = (typeof workoutDoneToday === 'function') ? workoutDoneToday()
      : !!(wEntry && (wEntry.source || (wEntry.exercises || []).some(e => (e.sets || []).some(s => s.completed))));
    const trainVal = wLogged ? 'Done' : (sess.type === 'rest' ? 'Rest' : (sess.dayName || 'Train'));
    const trainLbl = wLogged ? 'Workout' : (sess.type === 'rest' ? 'Recovery' : (sess.type === 'hard' ? 'Heavy day' : 'Training'));

    const calTarget = (mt && mt.calories) ? mt.calories
      : ((typeof dietMeta !== 'undefined' && dietMeta.dailyGoals && dietMeta.dailyGoals.calories) || 0);
    const fuelLbl = (mt && mt.adjusted) ? (mt.type === 'hard' ? 'Heavy day' : mt.type === 'rest' ? 'Rest day' : 'Training day') : 'Fuel';

    const doneH = Array.isArray(habits) ? habits.filter(h => log[h.id] && log[h.id].completedToday).length : 0;
    const totalH = Array.isArray(habits) ? habits.length : 0;

    const dismissed = (function () { try { return localStorage.getItem('hvi_nudge_dismissed') === t; } catch { return false; } })();
    const nudge = dismissed ? null : getCoachNudge();

    const prompt = _journalPrompt();
    const jToday = (typeof journal !== 'undefined' && journal[t]) || {};
    const jDone = Object.values(jToday).some(v => v && String(v).trim());

    const readyHTML = r ? `<div class="tb-ready" onclick="showReadinessBreakdown()" role="button" tabindex="0" aria-label="Readiness ${r.score}, ${r.label}. Tap for breakdown.">
        <div class="tb-ready-ring">${(typeof ring === 'function') ? ring(19, r.score / 100, 3, rColor) : ''}<span class="tb-ready-num" style="color:${rColor}">${r.score}</span></div>
        <div class="tb-ready-lbl">${r.label}</div>
      </div>` : '';

    const coachHTML = nudge ? `<div class="tb-coach">
        <span class="tb-coach-ico">${ic(nudge.icon, 18)}</span>
        <div class="tb-coach-main">
          <div class="tb-coach-text">${esc(nudge.text)}</div>
          <div class="tb-coach-actions">
            <button class="tb-coach-btn" onclick="if(typeof openCoach==='function')openCoach()">Talk to coach</button>
            <button class="tb-coach-x" onclick="dismissBriefCoach()">Dismiss</button>
          </div>
        </div>
      </div>` : '';

    return `<div class="today-brief ani">
      <div class="tb-head"><div class="tb-eyebrow">Today</div>${readyHTML}</div>
      <div class="tb-grid">
        <div class="tb-cell" onclick="go('workout')"><div class="tb-cell-ico">${ic('activity')}</div><div class="tb-cell-val">${esc(String(trainVal))}</div><div class="tb-cell-lbl">${trainLbl}</div></div>
        <div class="tb-cell" onclick="go('diet')"><div class="tb-cell-ico">${ic('target')}</div><div class="tb-cell-val">${m.cal.toLocaleString()}<span class="tb-cell-sub">/${calTarget ? calTarget.toLocaleString() : '—'}</span></div><div class="tb-cell-lbl">${fuelLbl}</div></div>
        <div class="tb-cell" onclick="go('habits')"><div class="tb-cell-ico">${ic('check')}</div><div class="tb-cell-val">${doneH}/${totalH}</div><div class="tb-cell-lbl">Habits</div></div>
      </div>
      ${coachHTML}
      ${(() => {
        // Slim sleep row: a log prompt until last night is entered, then an
        // at-a-glance stat. Keeps sleep one tap from home without a big card.
        const slp = (typeof sleepLog !== 'undefined' && sleepLog) ? (sleepLog[t] || null) : null;
        const slpLogged = !!(slp && (slp.hours || slp.quality));
        const info = slpLogged
          ? `<span class="tb-sleep-val">${slp.hours || '?'}h</span>${slp.quality ? ' · quality ' + slp.quality + '/5' : ''}`
          : `Last night's sleep — not logged`;
        return `<div class="tb-sleep">
        <span class="tb-sleep-info">${ic('moon', 14)} <span>${info}</span></span>
        <button class="tb-journal-btn" onclick="go('sleep')">${slpLogged ? 'Edit' : 'Log'}</button>
      </div>`;
      })()}
      <div class="tb-journal">
        <span class="tb-journal-prompt">${ic('book', 15)} ${esc(prompt)}</span>
        <button class="tb-journal-btn" onclick="libTab='journal';go('library')">${jDone ? 'Edit' : 'Reflect'}</button>
      </div>
    </div>`;
  } catch (e) { console.warn('[Arete] briefing error:', e); return ''; }
}
