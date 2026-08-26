// ══════════════════════════════════════════════════════════════════════════
// Arete — Profile Module
// ══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════
// GAMIFICATION
// ══════════════════════════════════════════════════════════════════════════

const ACHIEVEMENTS = [
  { id: 'first_habit',   icon: '⚡', name: 'Prótos',            desc: 'Complete your first habit' },
  { id: 'streak_3',      icon: '🔥', name: 'Kindled',           desc: '3-day streak on any habit' },
  { id: 'streak_7',      icon: '🔥', name: 'Hepta',             desc: '7-day streak on any habit' },
  { id: 'streak_30',     icon: '💎', name: 'Adámantos',         desc: '30-day streak on any habit' },
  { id: 'perfect_day',   icon: '⭐', name: 'Kalokagathía',      desc: 'Complete all habits in one day' },
  { id: 'perfect_3',     icon: '🌟', name: 'Steadfast',         desc: '3 perfect habit days' },
  { id: 'first_workout', icon: '💪', name: 'First Labour',      desc: 'Log your first workout' },
  { id: 'workouts_10',   icon: '🏋', name: 'Palaestra',         desc: 'Log 10 workouts' },
  { id: 'workouts_50',   icon: '🏆', name: 'Olympian',          desc: 'Log 50 workouts' },
  { id: 'first_pr',      icon: '🏆', name: 'Aristeia',          desc: 'Set your first PR' },
  { id: 'pr_5',          icon: '💥', name: 'Rising Titan',      desc: 'Set 5 PRs' },
  { id: 'journal_7',     icon: '📖', name: 'Gnōthi Seautón',    desc: 'Journal for 7 days' },
  { id: 'nutrition_7',   icon: '🥗', name: 'Sōphrosynē',        desc: 'Log meals 7 days' },
  { id: 'level_5',       icon: '⬆️', name: 'Ascent',            desc: 'Reach Level 5' },
  { id: 'level_10',      icon: '👑', name: 'Héros',              desc: 'Reach Level 10' },
  { id: 'all_pillars',   icon: '🏛', name: 'Five Pillars',      desc: 'Complete a habit in every pillar' },
  { id: 'streak_14',     icon: '🔥', name: 'Fortnight',         desc: '14-day streak on any habit' },
  { id: 'streak_100',    icon: '💎', name: 'Hekatón',            desc: '100-day streak on any habit' },
  { id: 'perfect_7',     icon: '🌟', name: 'Teleios',           desc: '7 perfect habit days in total' },
  { id: 'workouts_25',   icon: '💪', name: 'Agonistés',         desc: 'Log 25 workouts' },
  { id: 'first_quest',   icon: '⚡', name: 'Odyssey Begun',     desc: 'Complete your first daily quest' },
  { id: 'quests_7',      icon: '🎯', name: 'Labour Master',     desc: 'Complete 7 daily quests total' },
  { id: 'pr_10',         icon: '💥', name: 'Krátos',             desc: 'Set 10 personal records' },
  { id: 'nutrition_30',  icon: '🥗', name: 'Diaita',             desc: 'Log meals on 30 different days' },
  { id: 'sleep_7',       icon: '😴', name: 'Hypnos',             desc: 'Log sleep for 7 days' },
  { id: 'sleep_30',      icon: '💤', name: 'Morpheus',           desc: 'Log sleep for 30 days' },
  { id: 'xp_1000',       icon: '⚡', name: 'Chiliarch',          desc: 'Earn 1,000 XP total' },
  { id: 'xp_5000',       icon: '💫', name: 'Demigod',            desc: 'Earn 5,000 XP total' },
  { id: 'perfect_14',    icon: '🌟', name: 'Unwavering',        desc: '14 perfect habit days total' },
  { id: 'workouts_100',  icon: '🏆', name: 'Heraklean',          desc: 'Log 100 workouts' },
  { id: 'pr_25',         icon: '💥', name: 'Titan',              desc: 'Set 25 personal records' },
  { id: 'level_20',      icon: '👑', name: 'Arete',              desc: 'Reach Level 20' },
  { id: 'streak_60',     icon: '🔥', name: 'Athanatos',          desc: '60-day streak on any habit' },
];

// ── Level Titles ──────────────────────────────────────────────────────────
const LEVEL_TITLES = [
  { min: 1,  title: 'Neophyte' },
  { min: 3,  title: 'Ephebos' },
  { min: 5,  title: 'Hoplite' },
  { min: 8,  title: 'Strategos' },
  { min: 12, title: 'Philosophos' },
  { min: 20, title: 'Arete' },
];
function getLevelTitle(lvl) {
  let t = LEVEL_TITLES[0].title;
  for (const lt of LEVEL_TITLES) { if (lvl >= lt.min) t = lt.title; }
  return t;
}

// ── Daily Quests ───────────────────────────────────────────────────────────
const QUEST_POOL = [
  { id: 'q_all_habits',  icon: '✅', label: 'Complete all habits today',           xp: 60, check: () => habits.length > 0 && habits.every(h => log[h.id]?.completedToday) },
  { id: 'q_any_3',       icon: '⚡', label: 'Complete 3 or more habits',           xp: 30, check: () => habits.filter(h => log[h.id]?.completedToday).length >= 3 },
  { id: 'q_workout',     icon: '💪', label: 'Log a workout today',                 xp: 50, check: () => !!workoutLog[today()]?.exercises?.some(e => e.sets?.some(s => s.completed)) },
  { id: 'q_5_exercises', icon: '🏋', label: 'Complete 5+ exercises in a session',  xp: 60, check: () => (workoutLog[today()]?.exercises || []).filter(e => e.sets?.some(s => s.completed)).length >= 5 },
  { id: 'q_protein',     icon: '🥩', label: 'Hit your protein goal',               xp: 50, check: () => { const dm = getDayMacros(); return dietMeta.dailyGoals.protein > 0 && dm.p >= dietMeta.dailyGoals.protein; } },
  { id: 'q_calories',    icon: '🔥', label: 'Stay within calorie goal',            xp: 40, check: () => { const dm = getDayMacros(); const g = dietMeta.dailyGoals.calories; return g > 0 && dm.cal > 0 && dm.cal <= g * 1.05; } },
  { id: 'q_3_meals',     icon: '🍽', label: 'Log 3 or more meals today',           xp: 40, check: () => (mealLog[today()]?.meals || []).length >= 3 },
  { id: 'q_journal',     icon: '📖', label: 'Write in your journal today',         xp: 40, check: () => { const je = journal[today()] || {}; return Object.values(je).some(Boolean); } },
  { id: 'q_all_pillars', icon: '🏛', label: 'Complete a habit in every pillar',    xp: 75, check: () => PILLARS.every(p => pillarHabits(p.id).some(h => log[h.id]?.completedToday)) },
  { id: 'q_3_sets',      icon: '💥', label: 'Log 3+ sets on any exercise',         xp: 35, check: () => (workoutLog[today()]?.exercises || []).some(e => e.sets?.filter(s => s.completed).length >= 3) },
  { id: 'q_new_pr',      icon: '🏆', label: 'Set a personal record today',         xp: 80, check: () => Object.values(prs).some(p => p.date === today()) },
  { id: 'q_finish',      icon: '🏁', label: 'Finish a workout session',            xp: 45, check: () => workoutMeta.lastWorkoutDate === today() },
];

function getDailyQuests() {
  const t = today();
  let seed = t.split('').reduce((s, c) => (s * 31 + c.charCodeAt(0)) & 0x7FFFFFFF, 0);
  const pool = [...QUEST_POOL];
  const picked = [];
  while (picked.length < 3 && pool.length > 0) {
    seed = (seed * 1664525 + 1013904223) & 0x7FFFFFFF;
    const idx = seed % pool.length;
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function checkDailyQuests() {
  const t = today();
  if (!gamification.questsCompleted) gamification.questsCompleted = {};
  const done = new Set(gamification.questsCompleted[t] || []);
  const quests = getDailyQuests();
  let newlyDone = [];
  quests.forEach(q => {
    try {
      if (!done.has(q.id) && q.check()) {
        done.add(q.id);
        newlyDone.push(q);
      }
    } catch(e) {}
  });
  if (newlyDone.length) {
    gamification.questsCompleted[t] = [...done];
    newlyDone.forEach(q => {
      gamification.xp = (gamification.xp || 0) + q.xp;
    });
    LS.set('hvi_gamification', gamification);
    const first = newlyDone[0];
    showXPToast(`+${first.xp} XP · Quest done!`);
    checkAchievements();
    // Refresh quest UI if on home
    const qEl = document.getElementById('quest-section');
    if (qEl) {
      const _qd2 = new Set((gamification.questsCompleted || {})[today()] || []);
      qEl.innerHTML = getDailyQuests().map(q => {
        const qd = _qd2.has(q.id);
        return `<div class="hm-quest${qd?' hm-quest-done':''}">
          <div class="hm-quest-ico">${q.icon}</div>
          <div class="hm-quest-body"><div class="hm-quest-lbl">${q.label}</div><div class="hm-quest-xp">+${q.xp} XP</div></div>
          <div class="hm-quest-done-row"><div class="hm-quest-cb${qd?' hm-quest-cb-done':''}">${qd?'✓':''}</div></div>
        </div>`;
      }).join('');
    }
  }
}

function buildQuestHTML() {
  const t = today();
  const done = new Set((gamification.questsCompleted || {})[t] || []);
  const quests = getDailyQuests();
  return quests.map(q => {
    const isDone = done.has(q.id);
    return `<div class="g-quest${isDone ? ' g-quest-done' : ''}">
      <div class="g-quest-icon">${q.icon}</div>
      <div class="g-quest-label">${q.label}</div>
      <div class="g-quest-xp">${isDone ? '✓' : '+' + q.xp + ' XP'}</div>
    </div>`;
  }).join('');
}

function getWeekKey() {
  const d = new Date(), jan1 = new Date(d.getFullYear(), 0, 1);
  const wk = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
}

// Guard the input: Math.sqrt of a negative is NaN, and Math.max(1, NaN) is NaN,
// which would then render as "Level NaN" on every screen that shows one.
function getLevel(xp) {
  const n = Number(xp);
  const safe = Number.isFinite(n) && n > 0 ? n : 0;
  return Math.max(1, Math.floor(Math.sqrt(safe / 100)) + 1);
}

function xpToNextLevel(xp) {
  const lvl = getLevel(xp);
  const curThreshold = (lvl - 1) * (lvl - 1) * 100;
  const nextThreshold = lvl * lvl * 100;
  const progress = xp - curThreshold;
  const needed = nextThreshold - curThreshold;
  return { lvl, progress, needed, pct: progress / needed };
}

function getPillarLevel(pid) {
  return Math.max(1, Math.floor(((gamification.pillarXP || {})[pid] || 0) / 100) + 1);
}

let _xpToastTimer = null;
function showXPToast(text) {
  let t = document.getElementById('xp-toast');
  if (!t) { t = document.createElement('div'); t.id = 'xp-toast'; document.body.appendChild(t); }
  t.textContent = text;
  t.className = '';
  void t.offsetWidth;
  t.className = 'xp-toast-show';
  clearTimeout(_xpToastTimer);
  _xpToastTimer = setTimeout(() => { t.className = ''; }, 1500);
}

function showAchievementToast(ach) {
  let t = document.getElementById('ach-toast');
  if (!t) { t = document.createElement('div'); t.id = 'ach-toast'; document.body.appendChild(t); }
  t.innerHTML = `${ach.icon} <strong>${ach.name}</strong> unlocked!`;
  t.className = '';
  void t.offsetWidth;
  t.className = 'ach-toast-show';
  launchConfetti(0.3);
}

function awardXP(amount, pillarId) {
  const prevLvl = getLevel(gamification.xp || 0);
  gamification.xp = (gamification.xp || 0) + amount;
  if (pillarId) {
    if (!gamification.pillarXP) gamification.pillarXP = {};
    gamification.pillarXP[pillarId] = (gamification.pillarXP[pillarId] || 0) + amount;
  }
  LS.set('hvi_gamification', gamification);
  const newLvl = getLevel(gamification.xp || 0);
  if (newLvl > prevLvl && amount > 0) { playSound('levelup'); haptic([30, 20, 30, 20, 60]); }
  showXPToast('+' + amount + ' XP');
  checkAchievements();
}

function checkAchievements() {
  const unlocked = new Set(achievements);
  const maxStreak = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const totalWorkouts = Object.values(workoutLog).filter(wl => wl.exercises.some(e => e.sets.some(s => s.completed))).length;
  const totalPRs = Object.keys(prs).length;
  const totalJournalDays = Object.keys(journal).filter(d => Object.values(journal[d]).some(Boolean)).length;
  const allHabitsDone = habits.length > 0 && habits.every(h => log[h.id]?.completedToday);
  const allPillarsHit = PILLARS.every(p => pillarHabits(p.id).some(h => log[h.id]?.completedToday));
  const mealDays = Object.keys(mealLog).filter(d => (mealLog[d]?.meals || []).length > 0).length;
  const lvl = getLevel(gamification.xp || 0);

  const totalQuests = Object.values(gamification.questsCompleted || {}).reduce((s, arr) => s + arr.length, 0);
  const checks = {
    first_habit:   habits.some(h => log[h.id]?.completedToday || (log[h.id]?.streak || 0) > 0),
    streak_3:      maxStreak >= 3,
    streak_7:      maxStreak >= 7,
    streak_14:     maxStreak >= 14,
    streak_30:     maxStreak >= 30,
    streak_100:    maxStreak >= 100,
    perfect_day:   allHabitsDone || (meta.totalPerfectDays || 0) >= 1,
    perfect_3:     (meta.totalPerfectDays || 0) >= 3,
    perfect_7:     (meta.totalPerfectDays || 0) >= 7,
    first_workout: totalWorkouts >= 1,
    workouts_10:   totalWorkouts >= 10,
    workouts_25:   totalWorkouts >= 25,
    workouts_50:   totalWorkouts >= 50,
    first_pr:      totalPRs >= 1,
    pr_5:          totalPRs >= 5,
    pr_10:         totalPRs >= 10,
    journal_7:     totalJournalDays >= 7,
    nutrition_7:   mealDays >= 7,
    nutrition_30:  mealDays >= 30,
    level_5:       lvl >= 5,
    level_10:      lvl >= 10,
    all_pillars:   allPillarsHit,
    first_quest:   totalQuests >= 1,
    quests_7:      totalQuests >= 7,
    sleep_7:       Object.keys(sleepLog || {}).filter(d => sleepLog[d]?.hours > 0).length >= 7,
    sleep_30:      Object.keys(sleepLog || {}).filter(d => sleepLog[d]?.hours > 0).length >= 30,
    xp_1000:       (gamification.xp || 0) >= 1000,
    xp_5000:       (gamification.xp || 0) >= 5000,
    perfect_14:    (meta.totalPerfectDays || 0) >= 14,
    workouts_100:  totalWorkouts >= 100,
    pr_25:         totalPRs >= 25,
    level_20:      lvl >= 20,
    streak_60:     maxStreak >= 60,
  };

  ACHIEVEMENTS.forEach(ach => {
    if (!unlocked.has(ach.id) && checks[ach.id]) {
      achievements.push(ach.id);
      LS.set('hvi_achievements', achievements);
      if (typeof track === 'function') track('achievement_unlock', { achievement_id: ach.id, achievement_name: ach.name, total_unlocked: achievements.length });
      showAchievementToast(ach);
    }
  });
}

function computeDailyScore() {
  const { done, total } = totalPct();
  const habitScore = total > 0 ? (done / total) * 40 : 0;
  // Opening the workout screen creates an empty entry for the day, so testing
  // for the entry handed out 30 of 100 points for merely visiting the tab.
  const workoutScore = trainedOnDay(today()) ? 30 : 0;
  const je = journal[today()] || {};
  const journalScore = Object.values(je).some(Boolean) ? 15 : 0;
  const dm = getDayMacros();
  const calGoal = dietMeta.dailyGoals.calories;
  const nutritionScore = calGoal > 0 && dm.cal > 0 && Math.abs(dm.cal - calGoal) / calGoal <= 0.15 ? 15 : 0;
  return Math.round(habitScore + workoutScore + journalScore + nutritionScore);
}

function ensureWeeklyStats() {
  const wk = getWeekKey();
  if (!gamification.weeklyStats || gamification.weeklyStats.weekKey !== wk) {
    gamification.weeklyStats = { weekKey: wk, workoutDays: [], journalDays: [], proteinDays: [] };
    LS.set('hvi_gamification', gamification);
  }
}

function getWeeklyChallenges() {
  ensureWeeklyStats();
  const ws = gamification.weeklyStats;
  return [
    { icon: '🏋', label: 'Complete 4 workouts', current: ws.workoutDays.length, goal: 4 },
    { icon: '🥩', label: 'Hit protein goal 5 days', current: ws.proteinDays.length, goal: 5 },
    { icon: '📖', label: 'Journal 5 days', current: ws.journalDays.length, goal: 5 },
  ];
}

function trackWeeklyWorkout() {
  ensureWeeklyStats();
  const t = today();
  if (!gamification.weeklyStats.workoutDays.includes(t)) {
    gamification.weeklyStats.workoutDays.push(t);
    LS.set('hvi_gamification', gamification);
  }
}

function trackWeeklyJournal() {
  ensureWeeklyStats();
  const t = today();
  if (!gamification.weeklyStats.journalDays.includes(t)) {
    gamification.weeklyStats.journalDays.push(t);
    LS.set('hvi_gamification', gamification);
  }
}

function trackWeeklyProtein() {
  ensureWeeklyStats();
  const t = today();
  if (!gamification.weeklyStats.proteinDays.includes(t)) {
    gamification.weeklyStats.proteinDays.push(t);
    LS.set('hvi_gamification', gamification);
  }
}

function injectGamificationStyles() {
  if (document.getElementById('gamification-styles')) return;
  const s = document.createElement('style');
  s.id = 'gamification-styles';
  s.textContent = `
    @keyframes xpPop { 0%{opacity:0;transform:translateY(0) scale(.8)} 15%{opacity:1;transform:translateY(-10px) scale(1.1)} 80%{opacity:1;transform:translateY(-22px) scale(1)} 100%{opacity:0;transform:translateY(-32px)} }
    @keyframes achSlide { 0%{opacity:0;transform:translateX(120%)} 10%{opacity:1;transform:translateX(0)} 80%{opacity:1;transform:translateX(0)} 100%{opacity:0;transform:translateX(120%)} }
    #xp-toast{position:fixed;bottom:90px;right:20px;background:var(--accent);color:#fff;font-weight:700;font-size:13px;padding:6px 14px;border-radius:20px;opacity:0;pointer-events:none;z-index:999}
    #xp-toast.xp-toast-show{animation:xpPop 1.5s ease forwards}
    #ach-toast{position:fixed;top:20px;right:16px;left:16px;background:var(--surface2);border:1px solid var(--accent);color:var(--text);font-size:13px;padding:12px 16px;border-radius:12px;opacity:0;pointer-events:none;z-index:1000;text-align:center}
    #ach-toast.ach-toast-show{animation:achSlide 3s ease forwards}
    .g-score-ring{text-align:center;cursor:pointer;padding:4px 8px}
    .g-score-val{font-family:var(--serif);font-size:32px;font-weight:700;line-height:1}
    .g-score-lbl{font-size:10px;letter-spacing:.04em;color:var(--accent);font-weight:600;margin-top:2px}
    .g-xp-bar-track{height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;margin:6px 0 2px}
    .g-xp-bar-fill{height:100%;background:var(--accent-b);border-radius:2px;transition:width .5s ease}
    .g-challenge{background:var(--surface2);border-radius:10px;padding:12px 16px;margin-bottom:8px}
    .g-challenge-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
    .g-challenge-label{font-size:13px;color:var(--text)}
    .g-challenge-ct{font-size:12px;font-weight:700;color:var(--accent-b)}
    .g-challenge-track{height:4px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden}
    .g-challenge-fill{height:100%;background:var(--accent);border-radius:2px;transition:width .4s}
    .g-ach-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 24px 16px}
    .g-ach-card{background:var(--surface2);border-radius:10px;padding:12px 6px;text-align:center;border:1px solid transparent;transition:all .2s}
    .g-ach-card.unlocked{border-color:var(--accent)}
    .g-ach-card.locked{opacity:0.35}
    .g-ach-icon{font-size:22px;margin-bottom:4px}
    .g-ach-name{font-size:10px;font-weight:700;color:var(--text);line-height:1.2}
    .g-ach-desc{font-size:9px;color:var(--text-dim);margin-top:2px;line-height:1.3}
    .g-pillar-levels{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:0 24px 16px}
    .g-pl-card{background:var(--surface2);border-radius:8px;padding:10px 4px;text-align:center}
    .g-pl-card svg{width:18px;height:18px;display:block;margin:0 auto 4px;fill:none;stroke:var(--text-dim);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .g-pl-name{font-size:8px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px}
    .g-pl-lv{font-size:15px;font-weight:800;font-family:var(--serif);color:var(--accent-b)}
    .g-weekly{padding:0 24px 8px}
    .w-set-del{background:none;border:none;color:var(--text-dim);font-size:14px;padding:4px 6px;cursor:pointer;flex-shrink:0;opacity:0.4;margin-left:auto}
    .w-set-del:active{opacity:1;color:var(--fat)}
    .w-ex-tip{font-size:11.5px;line-height:1.45;margin:2px 12px 8px;padding:8px 12px;border-radius:10px;background:var(--surface2);border:1px solid var(--border2);color:var(--text-dim);display:flex;align-items:center;gap:8px}
    .w-ex-tip::before{content:"";width:6px;height:6px;border-radius:50%;flex-shrink:0;background:var(--text-muted)}
    .w-ex-tip-increase::before{background:var(--carb)}
    .w-ex-tip-maintain::before{background:var(--accent-b)}
    .w-ex-tip-first::before{background:var(--pro)}
    /* Calendar */
    .cal-hdr{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 8px}
    .cal-month-label{font-family:var(--serif);font-size:18px;color:var(--text);text-align:center;flex:1}
    .cal-nav-btn{background:none;border:none;color:var(--text);font-size:28px;padding:4px 10px;cursor:pointer;line-height:1;flex-shrink:0}
    .cal-nav-disabled{opacity:0.25;pointer-events:none}
    .cal-view-seg{display:flex;background:var(--surface2);border-radius:12px;padding:3px;gap:2px;margin:0 24px 12px}
    .cal-vbtn{flex:1;border:none;background:none;color:var(--text-muted);font-size:12px;padding:7px 4px;border-radius:10px;cursor:pointer;transition:all .2s;font-weight:600;letter-spacing:.02em}
    .cal-vbtn-active{background:var(--accent);color:#1a1208}
    .cal-legend{display:flex;flex-wrap:wrap;gap:10px;padding:0 20px 10px}
    .cal-leg{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-dim)}
    .cal-dow-row{display:grid;grid-template-columns:repeat(7,1fr);padding:0 8px}
    .cal-dow{text-align:center;font-size:10px;color:var(--text-dim);padding:4px 0;text-transform:uppercase;letter-spacing:.04em}
    .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);padding:0 8px;gap:2px}
    .cal-cell{min-height:54px;padding:5px 2px 3px;border-radius:8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;transition:background .15s}
    .cal-cell:active{background:rgba(255,255,255,0.06)}
    .cal-empty{pointer-events:none}
    .cal-future{opacity:0.45}
    .cal-today .cal-num{color:var(--accent-b);font-weight:800}
    .cal-selected{background:var(--surface2)!important;outline:1px solid rgba(154,130,86,.3)}
    .cal-num{font-size:13px;color:var(--text);line-height:1.3}
    .cal-dots{display:flex;gap:2px;margin-top:4px;flex-wrap:wrap;justify-content:center;min-height:7px}
    .cal-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
    .cal-detail{border-top:1px solid var(--border2);margin:10px 0 0;padding:0 20px 80px}
    .cal-detail-hdr{font-size:13px;font-weight:700;color:var(--accent-b);padding:14px 0 8px;letter-spacing:.02em}
    .cal-di{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;color:var(--text)}
    .cal-di span{flex:1;line-height:1.4}
    .cal-di-sub{font-size:11px;color:var(--text-dim);padding:2px 0 4px 22px;line-height:1.4}
    .cal-di-empty{font-size:12px;color:var(--text-dim);font-style:italic;padding:16px 0}
    /* Weekly strips */
    .cal-week-cols{display:grid;grid-template-columns:repeat(7,1fr);padding:0 8px;gap:2px}
    .cal-wcol{padding:8px 2px 6px;border-radius:8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;transition:background .15s}
    .cal-wcol:active{background:rgba(255,255,255,0.06)}
    .cal-wcol-sel{background:var(--surface2)!important;outline:1px solid rgba(154,130,86,.3)}
    .cal-wday{font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em}
    .cal-wnum{font-size:16px;color:var(--text);font-weight:600;line-height:1.2}
    .cal-wnum-today{color:var(--accent-b);font-weight:800}
    .cal-wfuture{opacity:0.45}
    /* Daily view */
    .cal-daily-wrap{padding:0 20px 80px}
    .cal-daily-sec{margin-bottom:4px}
    .cal-daily-sec-hdr{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim);padding:16px 0 6px;display:flex;align-items:center;justify-content:space-between}
    /* Tasks */
    .cal-task-list{margin-bottom:4px}
    .cal-task-item{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
    .cal-task-cb{width:20px;height:20px;border-radius:50%;border:2px solid var(--accent);background:none;cursor:pointer;flex-shrink:0;padding:0;display:flex;align-items:center;justify-content:center;transition:all .2s;font-size:12px;color:transparent}
    .cal-task-cb-done{background:var(--accent);color:#1a1208}
    .cal-task-text{flex:1;font-size:13px;color:var(--text);line-height:1.4;background:none;border:none;outline:none;padding:0}
    .cal-task-text-done{text-decoration:line-through;color:var(--text-dim)}
    .cal-task-del{background:none;border:none;color:var(--text-dim);font-size:18px;cursor:pointer;padding:0 2px;line-height:1;opacity:0.5}
    .cal-task-del:active{opacity:1;color:var(--fat)}
    .cal-task-add{display:flex;gap:8px;align-items:center;margin-top:8px}
    .cal-task-input{flex:1;background:var(--surface2);border:1px solid var(--border2);border-radius:10px;padding:9px 12px;font-size:13px;color:var(--text);outline:none;font-family:inherit}
    .cal-task-input:focus{border-color:var(--accent)}
    .cal-task-add-btn{background:var(--accent);border:none;color:#1a1208;border-radius:10px;width:36px;height:36px;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700}
    /* Unit toggle */
    .unit-toggle{display:flex;background:var(--surface2);border-radius:10px;padding:3px;gap:2px}
    .unit-btn{background:none;border:none;color:var(--text-muted);font-size:12px;font-weight:600;padding:6px 16px;border-radius:8px;cursor:pointer;transition:all .2s;letter-spacing:.02em}
    .unit-btn-active{background:var(--accent);color:#fff}
    .g-quests{padding:0 24px 16px}
    .g-quest{display:flex;align-items:center;gap:12px;background:var(--surface2);border-radius:10px;padding:12px 14px;margin-bottom:8px;border:1px solid transparent;transition:all .25s}
    .g-quest-done{border-color:var(--accent-b);opacity:0.7}
    .g-quest-icon{font-size:18px;flex-shrink:0}
    .g-quest-label{flex:1;font-size:13px;color:var(--text);line-height:1.3}
    .g-quest-done .g-quest-label{text-decoration:line-through;color:var(--text-dim)}
    .g-quest-xp{font-size:12px;font-weight:700;color:var(--accent-b);white-space:nowrap}
    .g-quest-done .g-quest-xp{color:var(--accent-b)}
    /* Avatar */
    .av-wrap{display:flex;flex-direction:column;align-items:center;padding:28px 24px 12px;text-align:center;position:relative}
    .av-orb{width:170px;height:170px;position:relative;flex-shrink:0}
    .av-stage-label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-top:2px;opacity:0.8}
    .av-name{font-family:var(--serif);font-size:24px;color:var(--text);margin-top:10px;line-height:1.2}
    .av-level{font-size:13px;color:var(--text-dim);margin-top:3px;letter-spacing:.02em}
    .av-xp-outer{width:100%;max-width:200px;margin-top:12px}
    .av-xp-track{height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden}
    .av-xp-fill{height:100%;background:var(--accent);border-radius:3px;transition:width .6s ease}
    .av-xp-lbl{font-size:10px;color:var(--text-dim);margin-top:4px;letter-spacing:.01em}
    .av-edit-btn{position:absolute;top:24px;right:20px;background:none;border:1px solid var(--border2);color:var(--text-dim);font-size:11px;padding:5px 10px;border-radius:8px;cursor:pointer}
  `;
  document.head.appendChild(s);
}

// ══════════════════════════════════════════════════════════════════════════
// CONFETTI
// ══════════════════════════════════════════════════════════════════════════
function launchConfetti(originY = 0.35) {
  const existing = document.getElementById('confetti-canvas');
  if (existing) existing.remove();
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10000';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const COLORS = ['#9a8256','#b89d68','#6e9fd4','#6fd48e','#e4dace','#d46f6f'];
  const particles = Array.from({length: 90}, () => ({
    x: canvas.width * (0.3 + Math.random() * 0.4),
    y: canvas.height * originY,
    vx: (Math.random() - 0.5) * 12,
    vy: -(Math.random() * 10 + 4),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    w: Math.random() * 9 + 4,
    h: Math.random() * 5 + 3,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.25,
    life: 1,
  }));
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach(p => {
      if (p.life <= 0) return;
      alive = true;
      p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.vx *= 0.99; p.angle += p.spin; p.life -= 0.007;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (alive) requestAnimationFrame(draw); else canvas.remove();
  }
  requestAnimationFrame(draw);
}

// ══════════════════════════════════════════════════════════════════════════
// SWIPE-TO-COMPLETE
// ══════════════════════════════════════════════════════════════════════════
function initSwipeGestures() {
  document.querySelectorAll('.hi:not([data-swipe])').forEach(row => {
    row.dataset.swipe = '1';
    let sx = 0, sy = 0, isH = false;
    row.addEventListener('touchstart', e => {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; isH = false;
    }, { passive: true });
    row.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (!isH && Math.abs(dy) > Math.abs(dx)) return;
      if (dx > 5) { isH = true; e.preventDefault(); }
      if (isH && dx > 0) {
        const capped = Math.min(dx, 110);
        row.style.transform = `translateX(${capped}px)`;
        row.style.background = `rgba(110,212,142,${Math.min(dx/100,1)*0.18})`;
      }
    }, { passive: false });
    row.addEventListener('touchend', () => {
      const tx = parseFloat((row.style.transform || '').replace('translateX(','')) || 0;
      row.style.transition = 'transform 0.25s ease,background 0.25s ease';
      row.style.transform = ''; row.style.background = '';
      setTimeout(() => { row.style.transition = ''; }, 260);
      if (tx >= 75 && isH) {
        const m = row.id.match(/^hi([^-]*)-(.+)$/);
        if (m) tapHabit(m[2], m[1]);
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════
// RPG CHARACTER STATS + CHARACTER PAGE
// ══════════════════════════════════════════════════════════════════════════

// 5 RPG stats derived from real activity
function _computeRPGStats() {
  const maxStreak = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const totalWorkouts = Object.values(workoutLog).filter(wl => wl.exercises?.some(e => e.sets?.some(s => s.completed))).length;
  const totalPRs = Object.keys(prs || {}).length;
  const totalJournalDays = Object.keys(journal).filter(d => Object.values(journal[d]).some(Boolean)).length;
  const mealDays = Object.keys(mealLog).filter(d => (mealLog[d]?.meals || []).length > 0).length;
  const sleepDays = Object.keys(sleepLog || {}).filter(d => sleepLog[d]?.hours > 0).length;
  const perfectDays = meta.totalPerfectDays || 0;
  const lvl = getLevel(gamification.xp || 0);

  // Each stat 0-100, scaled to feel rewarding early but requiring effort to max
  const strength = Math.min(100, Math.round(
    Math.min(40, totalWorkouts * 2) +
    Math.min(30, totalPRs * 3) +
    Math.min(30, lvl * 3)
  ));
  const wisdom = Math.min(100, Math.round(
    Math.min(40, totalJournalDays * 2) +
    Math.min(30, (achievements || []).length * 3) +
    Math.min(30, lvl * 3)
  ));
  const discipline = Math.min(100, Math.round(
    Math.min(40, maxStreak * 2) +
    Math.min(30, perfectDays * 2) +
    Math.min(30, lvl * 3)
  ));
  const vitality = Math.min(100, Math.round(
    Math.min(40, mealDays * 1.5) +
    Math.min(30, sleepDays * 1.5) +
    Math.min(30, lvl * 3)
  ));
  const spirit = Math.min(100, Math.round(
    Math.min(30, (gamification.xp || 0) / 100) +
    Math.min(30, maxStreak * 1.5) +
    Math.min(20, totalWorkouts) +
    Math.min(20, totalJournalDays)
  ));

  return [
    { key: 'STR', name: 'Strength', val: strength, icon: '⚔️', color: '#ef4444' },
    { key: 'WIS', name: 'Wisdom',   val: wisdom,   icon: '📖', color: '#a78bfa' },
    { key: 'DIS', name: 'Discipline', val: discipline, icon: '🛡️', color: '#c4a96c' },
    { key: 'VIT', name: 'Vitality', val: vitality, icon: '💚', color: '#4ade80' },
    { key: 'SPI', name: 'Spirit',   val: spirit,   icon: '🔥', color: '#f59e0b' },
  ];
}

// Radar chart SVG (pentagon)
function _buildRadarChart(stats, size) {
  size = size || 140;
  const cx = size / 2, cy = size / 2;
  const r = size * 0.38;
  const n = stats.length;
  const angleOff = -Math.PI / 2; // start from top

  function point(i, scale) {
    const a = angleOff + (2 * Math.PI * i) / n;
    return [cx + Math.cos(a) * r * scale, cy + Math.sin(a) * r * scale];
  }

  // Grid rings
  let grid = '';
  [0.25, 0.5, 0.75, 1].forEach(s => {
    const pts = Array.from({length: n}, (_, i) => point(i, s).join(',')).join(' ');
    grid += `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="0.8"/>`;
  });

  // Grid lines from center
  for (let i = 0; i < n; i++) {
    const [x, y] = point(i, 1);
    grid += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="0.6"/>`;
  }

  // Data polygon
  const dataPts = stats.map((s, i) => point(i, s.val / 100).join(',')).join(' ');

  // Labels
  let labels = '';
  stats.forEach((s, i) => {
    const [x, y] = point(i, 1.25);
    labels += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="10" fill="var(--text-dim)" font-weight="600">${s.key}</text>`;
    const [vx, vy] = point(i, 1.08);
    labels += `<text x="${vx}" y="${vy + 10}" text-anchor="middle" font-size="8" fill="var(--accent-b)">${s.val}</text>`;
  });

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">
    ${grid}
    <polygon points="${dataPts}" fill="rgba(196,169,108,0.15)" stroke="var(--accent-b)" stroke-width="1.5" stroke-linejoin="round"/>
    ${stats.map((s, i) => {
      const [x, y] = point(i, s.val / 100);
      return `<circle cx="${x}" cy="${y}" r="3" fill="${s.color}" stroke="var(--bg)" stroke-width="1"/>`;
    }).join('')}
    ${labels}
  </svg>`;
}

// ── Character Profile Page ───────────────────────────────────────────────
function renderCharacter() {
  const xp = gamification.xp || 0;
  const lvl = getLevel(xp);
  const { progress, needed } = xpToNextLevel(xp);
  const xpPct = needed > 0 ? (progress / needed * 100).toFixed(1) : 100;
  const title = getLevelTitle(lvl);
  const stats = _computeRPGStats();
  const totalPower = Math.round(stats.reduce((s, st) => s + st.val, 0) / stats.length);

  // Avatar stage info
  const stage = lvl >= 20 ? 6 : lvl >= 12 ? 5 : lvl >= 8 ? 4 : lvl >= 5 ? 3 : lvl >= 3 ? 2 : 1;
  const stageNames = ['', 'Recruit', 'Initiate', 'Warrior', 'Champion', 'Philosopher', 'Arete'];
  const nextStage = stage < 6 ? stageNames[stage + 1] : null;
  const nextStageLevel = [0, 3, 5, 8, 12, 20, 999][stage];

  // Gear/equipment based on achievements
  const gear = [];
  if ((achievements || []).includes('first_workout')) gear.push({ icon: '🗡️', name: 'Training Blade', desc: 'First workout completed' });
  if ((achievements || []).includes('streak_7'))      gear.push({ icon: '🔥', name: 'Flame Emblem', desc: '7-day streak' });
  if ((achievements || []).includes('streak_30'))     gear.push({ icon: '💎', name: 'Diamond Shield', desc: '30-day streak' });
  if ((achievements || []).includes('workouts_10'))   gear.push({ icon: '🏋️', name: 'Iron Gauntlets', desc: '10 workouts logged' });
  if ((achievements || []).includes('workouts_50'))   gear.push({ icon: '⚡', name: 'Thunder Bracers', desc: '50 workouts' });
  if ((achievements || []).includes('first_pr'))      gear.push({ icon: '🏆', name: 'Victory Crown', desc: 'First PR set' });
  if ((achievements || []).includes('journal_7'))     gear.push({ icon: '📜', name: 'Scroll of Gnōsis', desc: '7 journal days' });
  if ((achievements || []).includes('nutrition_7'))   gear.push({ icon: '🍇', name: 'Ambrosia Charm', desc: '7 nutrition days' });
  if ((achievements || []).includes('level_5'))       gear.push({ icon: '🛡️', name: 'Hoplite Shield', desc: 'Reached Level 5' });
  if ((achievements || []).includes('level_10'))      gear.push({ icon: '👑', name: 'Héros Crown', desc: 'Reached Level 10' });
  if ((achievements || []).includes('all_pillars'))   gear.push({ icon: '🏛️', name: 'Pillar Stone', desc: 'All pillars hit' });
  if ((achievements || []).includes('streak_100'))    gear.push({ icon: '💫', name: 'Eternal Flame', desc: '100-day streak' });
  if ((achievements || []).includes('xp_5000'))       gear.push({ icon: '✨', name: 'Demigod Aura', desc: '5,000 XP earned' });

  const gearHTML = gear.length ? gear.map(g =>
    `<div class="char-gear-item"><span class="char-gear-icon">${g.icon}</span><div class="char-gear-info"><div class="char-gear-name">${g.name}</div><div class="char-gear-desc">${g.desc}</div></div></div>`
  ).join('') : '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">Complete achievements to unlock gear.</div>';

  // Stat bars
  const statBars = stats.map(s =>
    `<div class="char-stat-row">
      <div class="char-stat-icon">${s.icon}</div>
      <div class="char-stat-info">
        <div class="char-stat-name">${s.name}</div>
        <div class="char-stat-bar"><div class="char-stat-fill" style="width:${s.val}%;background:${s.color}"></div></div>
      </div>
      <div class="char-stat-val">${s.val}</div>
    </div>`
  ).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('home')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="char-hero ani">
      <div class="char-avatar avatar-frame">${avatarImg(lvl)}</div>
      <div class="char-name">${userName() || 'Warrior'}</div>
      <div class="char-title">Lv.${lvl} ${title}</div>
      <div class="char-stage">${stageNames[stage]}${nextStage ? ` → ${nextStage} at Lv.${nextStageLevel}` : ' (Max Stage)'}</div>
      <div class="char-xp-row">
        <div class="char-xp-track"><div class="char-xp-fill" style="width:${xpPct}%"></div></div>
        <div class="char-xp-label">${progress.toLocaleString()} / ${needed.toLocaleString()} XP</div>
      </div>
      <div class="char-power">⚡ Power: ${totalPower}</div>
    </div>

    <div class="da-section ani" style="margin:0 24px 16px;padding:20px">
      <div class="char-sec-title">Character Stats</div>
      ${_buildRadarChart(stats, 160)}
      <div class="char-stat-list" style="margin-top:16px">${statBars}</div>
    </div>

    <div class="da-section ani" style="margin:0 24px 16px;padding:20px">
      <div class="char-sec-title">Equipment · ${gear.length} items</div>
      <div class="char-gear-list">${gearHTML}</div>
    </div>

    <div class="da-section ani" style="margin:0 24px 16px;padding:20px">
      <div class="char-sec-title">Achievements · ${(achievements||[]).length}/${ACHIEVEMENTS.length}</div>
      <div class="g-ach-grid">${ACHIEVEMENTS.map(a => {
        const u = (achievements || []).includes(a.id);
        return `<div class="g-ach${u ? ' g-ach-un' : ''}" title="${esc(a.desc)}"><div class="g-ach-icon">${u ? a.icon : '🔒'}</div><div class="g-ach-name">${esc(a.name)}</div></div>`;
      }).join('')}</div>
    </div>

    <button class="w-action-btn ani" style="margin:0 24px 32px" onclick="shareCharacterCard()">${icon('share')} Share Character Card</button>`;
}

// ── Shareable Character Card (Canvas) ────────────────────────────────────
function _loadImage(src) {
  return new Promise(resolve => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

async function shareCharacterCard() {
  const canvas = document.createElement('canvas');
  const w = 600, h = 1060;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0f0d0a');
  bg.addColorStop(1, '#1a1714');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Border
  ctx.strokeStyle = '#c4a96c';
  ctx.lineWidth = 3;
  _roundRect(ctx, 10, 10, w - 20, h - 20, 20);
  ctx.stroke();

  // Inner border
  ctx.strokeStyle = 'rgba(196,169,108,0.2)';
  ctx.lineWidth = 1;
  _roundRect(ctx, 20, 20, w - 40, h - 40, 14);
  ctx.stroke();

  const xp = gamification.xp || 0;
  const lvl = getLevel(xp);
  const title = getLevelTitle(lvl);
  const stats = _computeRPGStats();
  const totalPower = Math.round(stats.reduce((s, st) => s + st.val, 0) / stats.length);

  // Character portrait (framed so the art's dark background blends)
  const _stage = (typeof avatarStage === 'function') ? avatarStage(lvl) : 1;
  const _av = await _loadImage(`avatar-${_stage}.png?v=1`);
  const pw = 210, ph = 264, px = (w - pw) / 2, py = 40;
  const pg = ctx.createLinearGradient(0, py, 0, py + ph);
  pg.addColorStop(0, '#14110b');
  pg.addColorStop(1, '#000000');
  ctx.fillStyle = pg;
  _roundRect(ctx, px, py, pw, ph, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(196,169,108,0.35)'; ctx.lineWidth = 1.5;
  _roundRect(ctx, px, py, pw, ph, 16); ctx.stroke();
  if (_av && _av.naturalWidth) {
    const maxW = pw - 16, maxH = ph - 16;
    const sc = Math.min(maxW / _av.naturalWidth, maxH / _av.naturalHeight);
    const dw = _av.naturalWidth * sc, dh = _av.naturalHeight * sc;
    ctx.save();
    _roundRect(ctx, px, py, pw, ph, 16); ctx.clip();
    ctx.drawImage(_av, px + (pw - dw) / 2, py + ph - dh - 6, dw, dh);
    ctx.restore();
  }

  // Shift the rest of the card below the portrait
  ctx.save();
  ctx.translate(0, 250);

  // Name
  ctx.fillStyle = '#e8dfd3';
  ctx.font = 'bold 36px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(userName() || 'Warrior', w / 2, 80);

  // Level & Title
  ctx.fillStyle = '#c4a96c';
  ctx.font = '20px Georgia, serif';
  ctx.fillText(`Level ${lvl} · ${title}`, w / 2, 115);

  // XP
  ctx.fillStyle = 'rgba(232,223,211,0.5)';
  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillText(`${xp.toLocaleString()} XP · Power ${totalPower}`, w / 2, 145);

  // Divider
  ctx.strokeStyle = 'rgba(196,169,108,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 165);
  ctx.lineTo(w - 60, 165);
  ctx.stroke();

  // Radar chart on canvas
  const rcx = w / 2, rcy = 295;
  const rr = 90;
  const n = stats.length;
  const off = -Math.PI / 2;

  // Grid
  [0.25, 0.5, 0.75, 1].forEach(scale => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = off + (2 * Math.PI * (i % n)) / n;
      const x = rcx + Math.cos(a) * rr * scale;
      const y = rcy + Math.sin(a) * rr * scale;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();
  });

  // Data polygon
  ctx.beginPath();
  stats.forEach((s, i) => {
    const a = off + (2 * Math.PI * i) / n;
    const x = rcx + Math.cos(a) * rr * (s.val / 100);
    const y = rcy + Math.sin(a) * rr * (s.val / 100);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(196,169,108,0.2)';
  ctx.fill();
  ctx.strokeStyle = '#c4a96c';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dots + labels
  stats.forEach((s, i) => {
    const a = off + (2 * Math.PI * i) / n;
    const dx = rcx + Math.cos(a) * rr * (s.val / 100);
    const dy = rcy + Math.sin(a) * rr * (s.val / 100);
    ctx.beginPath();
    ctx.arc(dx, dy, 4, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();

    const lx = rcx + Math.cos(a) * (rr + 28);
    const ly = rcy + Math.sin(a) * (rr + 28);
    ctx.fillStyle = 'rgba(232,223,211,0.7)';
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.key, lx, ly);
    ctx.fillStyle = '#c4a96c';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillText(String(s.val), lx, ly + 14);
  });

  // Stat bars below radar
  let barY = 430;
  stats.forEach(s => {
    ctx.fillStyle = 'rgba(232,223,211,0.5)';
    ctx.font = '13px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${s.icon} ${s.name}`, 60, barY);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#c4a96c';
    ctx.fillText(String(s.val), w - 60, barY);

    // Bar track
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    _roundRect(ctx, 60, barY + 6, w - 120, 8, 4);
    ctx.fill();

    // Bar fill
    ctx.fillStyle = s.color;
    const fillW = (w - 120) * (s.val / 100);
    if (fillW > 0) {
      _roundRect(ctx, 60, barY + 6, fillW, 8, 4);
      ctx.fill();
    }

    barY += 38;
  });

  // Key stats
  barY += 10;
  ctx.strokeStyle = 'rgba(196,169,108,0.3)';
  ctx.beginPath();
  ctx.moveTo(60, barY);
  ctx.lineTo(w - 60, barY);
  ctx.stroke();
  barY += 25;

  const maxStreak = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const totalWorkouts = Object.values(workoutLog).filter(wl => wl.exercises?.some(e => e.sets?.some(s => s.completed))).length;
  const keyStats = [
    { label: '🔥 Best Streak', val: `${maxStreak} days` },
    { label: '💪 Workouts', val: String(totalWorkouts) },
    { label: '🏆 Achievements', val: `${(achievements || []).length}/${ACHIEVEMENTS.length}` },
  ];

  ctx.font = '13px -apple-system, sans-serif';
  const colW = (w - 120) / keyStats.length;
  keyStats.forEach((ks, i) => {
    const kx = 60 + colW * i + colW / 2;
    ctx.fillStyle = 'rgba(232,223,211,0.5)';
    ctx.textAlign = 'center';
    ctx.fillText(ks.label, kx, barY);
    ctx.fillStyle = '#e8dfd3';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText(ks.val, kx, barY + 28);
    ctx.font = '13px -apple-system, sans-serif';
  });

  // End content shift (footer stays anchored to the card bottom)
  ctx.restore();

  // Footer
  ctx.fillStyle = 'rgba(232,223,211,0.3)';
  ctx.font = '12px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('get-arete.com · Become your greatest self', w / 2, h - 35);

  // Convert to blob and share
  canvas.toBlob(async blob => {
    if (!blob) return;
    const file = new File([blob], 'arete-character.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: `${userName() || 'My'} Arete Character`,
          text: `Level ${lvl} ${title} · Power ${totalPower} · ${xp.toLocaleString()} XP\n\nBecome your greatest self at get-arete.com`,
          files: [file],
        });
        track('character_card_shared');
      } catch {}
    } else {
      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'arete-character.png';
      a.click();
      URL.revokeObjectURL(url);
      if (typeof _showToast === 'function') _showToast('Character card saved!');
      track('character_card_downloaded');
    }
  }, 'image/png');
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ══════════════════════════════════════════════════════════════════════════
// RENDER: STATS
// ══════════════════════════════════════════════════════════════════════════
// ── Avatar builder ────────────────────────────────────────────────────────
function buildAvatarSVG(lvl) {
  const gender = (typeof tdeeProfile !== 'undefined' && tdeeProfile?.sex) || 'male';
  const stage = lvl >= 20 ? 6 : lvl >= 12 ? 5 : lvl >= 8 ? 4 : lvl >= 5 ? 3 : lvl >= 3 ? 2 : 1;
  const uid = `av${stage}_${lvl}_${gender[0]}`;
  return _buildGreekAvatar(stage, gender, uid);
}

function _buildGreekAvatar(stage, gender, uid) {

  // Greek-inspired colour palette
  const sk = '#e8d5bc', skL = '#f0e0cc', skS = '#d4b896', skD = '#c4a07a';

  // Stage colours: hair, eyes, outfit, accents, aura
  const C = [null,
    { hc:'#3d2814', hh:'#5c3a1e', toga:'#d4cfc6', toga2:'#bfb9ae', sash:null,     metal:null,       ac:null,     ao:0, pn:0  },
    { hc:'#5c3a1e', hh:'#8a6240', toga:'#c8c0b4', toga2:'#b0a898', sash:'#8b4513', metal:null,       ac:null,     ao:0, pn:0  },
    { hc:'#6b4423', hh:'#a07850', toga:'#e8e0d4', toga2:'#d4cfc6', sash:'#6b7c3a', metal:'#8a9a6c',  ac:'#8a9a6c',ao:.10, pn:3 },
    { hc:'#4a3520', hh:'#7a5c3a', toga:'#d4cfc6', toga2:'#b8b0a2', sash:'#8b2020', metal:'#b08d57',  ac:'#b08d57',ao:.15, pn:6 },
    { hc:'#2d1f14', hh:'#5c4430', toga:'#f0ece4', toga2:'#d8d0c4', sash:'#7b3fa0', metal:'#c4a96c',  ac:'#c4a96c',ao:.22, pn:10 },
    { hc:'#1a1510', hh:'#3d3020', toga:'#f8f4ee', toga2:'#e8e0d4', sash:'#c4a96c', metal:'#e8c97e',  ac:'#e8c97e',ao:.35, pn:14 },
  ][stage];

  // ── GRADIENT DEFS ───────────────────────────────────────────────────────
  const defs = `
    <filter id="${uid}sh" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.8"/>
    </filter>
    <filter id="${uid}gl" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="${uid}sk" cx="50%" cy="35%" r="60%">
      <stop offset="0%" stop-color="${skL}"/>
      <stop offset="70%" stop-color="${sk}"/>
      <stop offset="100%" stop-color="${skS}"/>
    </radialGradient>
    <linearGradient id="${uid}hr" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.hh}"/>
      <stop offset="100%" stop-color="${C.hc}"/>
    </linearGradient>
    <linearGradient id="${uid}tg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.toga}"/>
      <stop offset="100%" stop-color="${C.toga2}"/>
    </linearGradient>`;

  // ── AURA (stages 3+) ────────────────────────────────────────────────────
  const auraRx = 36 + stage * 5, auraRy = 24 + stage * 4;
  const aura = C.ac ? `<ellipse cx="50" cy="82" rx="${auraRx}" ry="${auraRy}" fill="${C.ac}" opacity="${C.ao}">
    <animate attributeName="ry" values="${auraRy};${auraRy+6};${auraRy}" dur="3s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="${C.ao};${(C.ao*.45).toFixed(2)};${C.ao}" dur="3s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="50" cy="82" rx="${auraRx+8}" ry="${auraRy+6}" fill="none" stroke="${C.ac}" stroke-width="0.8" opacity="${(C.ao*.6).toFixed(2)}">
    <animate attributeName="opacity" values="${(C.ao*.6).toFixed(2)};0.02;${(C.ao*.6).toFixed(2)}" dur="2.5s" repeatCount="indefinite"/>
  </ellipse>` : '';

  // ── PARTICLES ────────────────────────────────────────────────────────────
  let parts = '';
  for (let i = 0; i < C.pn; i++) {
    const a = (i / C.pn) * Math.PI * 2;
    const r = 38 + (i % 3) * 9;
    const cx = (50 + Math.cos(a) * r).toFixed(1);
    const cy = (82 + Math.sin(a) * r * 0.55).toFixed(1);
    const sz = i % 5 === 0 ? 2.4 : 1.5;
    const dur = (1.4 + (i % 5) * 0.4).toFixed(1);
    parts += `<circle cx="${cx}" cy="${cy}" r="${sz}" fill="${C.ac}" opacity="0.55">
      <animate attributeName="opacity" values="0.55;0.1;0.55" dur="${dur}s" repeatCount="indefinite"/>
      <animate attributeName="r" values="${sz};${(sz*1.6).toFixed(1)};${sz}" dur="${dur}s" repeatCount="indefinite"/>
    </circle>`;
  }

  // ── HAIR ─────────────────────────────────────────────────────────────────
  const hFill = `url(#${uid}hr)`;
  let hair = '';

  if (gender === 'female') {
    // Classical Greek updo / braided style
    hair = `<path d="M 24 54 Q 22 26 50 22 Q 78 26 76 54 Q 68 32 50 30 Q 32 32 24 54 Z" fill="${hFill}"/>`;
    if (stage <= 2) {
      // Simple gathered style
      hair += `<path d="M 28 44 Q 34 28 50 28 Q 66 28 72 44 Q 62 36 50 35 Q 38 36 28 44 Z" fill="${C.hh}" opacity="0.6"/>
        <ellipse cx="50" cy="24" rx="8" ry="5" fill="${C.hc}"/>`;
    } else {
      // Elegant updo with bun
      hair += `<path d="M 28 44 Q 34 26 50 26 Q 66 26 72 44 Q 62 34 50 33 Q 38 34 28 44 Z" fill="${C.hh}" opacity="0.6"/>
        <ellipse cx="50" cy="20" rx="10" ry="7" fill="${hFill}"/>
        <ellipse cx="50" cy="20" rx="7" ry="5" fill="${C.hc}" opacity="0.5"/>`;
    }
  } else {
    // Classical Greek male hair — short, curly/wavy
    if (stage <= 2) {
      hair = `<path d="M 25 54 Q 24 28 50 24 Q 76 28 75 54 Q 67 34 50 32 Q 33 34 25 54 Z" fill="${hFill}"/>
        <path d="M 30 44 Q 36 30 50 30 Q 64 30 70 44 Q 60 36 50 35 Q 40 36 30 44 Z" fill="${C.hh}" opacity="0.5"/>`;
    } else if (stage <= 4) {
      hair = `<path d="M 24 54 Q 22 26 50 22 Q 78 26 76 54 Q 68 30 50 28 Q 32 30 24 54 Z" fill="${hFill}"/>
        <path d="M 28 44 Q 34 26 50 26 Q 66 26 72 44 Q 62 34 50 33 Q 38 34 28 44 Z" fill="${C.hh}" opacity="0.55"/>
        <path d="M 34 36 Q 42 26 50 28 Q 58 26 66 36" stroke="${C.hh}" stroke-width="1.5" fill="none" opacity="0.4" stroke-linecap="round"/>`;
    } else {
      // Longer, philosopher-style
      hair = `<path d="M 23 56 Q 21 24 50 20 Q 79 24 77 56 Q 69 30 50 28 Q 31 30 23 56 Z" fill="${hFill}"/>
        <path d="M 23 56 Q 18 68 20 78 Q 24 80 26 70 Q 24 63 23 56 Z" fill="${C.hc}" opacity="0.7"/>
        <path d="M 77 56 Q 82 68 80 78 Q 76 80 74 70 Q 76 63 77 56 Z" fill="${C.hc}" opacity="0.7"/>
        <path d="M 28 44 Q 34 24 50 24 Q 66 24 72 44 Q 62 32 50 31 Q 38 32 28 44 Z" fill="${C.hh}" opacity="0.55"/>`;
    }
  }

  // ── HEADGEAR (stage-based) ───────────────────────────────────────────────
  let headgear = '';
  if (stage === 2 && C.sash) {
    // Headband
    headgear = `<path d="M 26 44 Q 50 38 74 44" stroke="${C.sash}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M 26 44 Q 50 40 74 44" stroke="${C.sash}" stroke-width="1.5" fill="none" opacity="0.5" stroke-linecap="round" transform="translate(0,-2)"/>`;
  } else if (stage === 3 && C.metal) {
    // Olive wreath
    headgear = `<path d="M 26 40 Q 34 32 50 30 Q 66 32 74 40" stroke="${C.metal}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <ellipse cx="30" cy="38" rx="4" ry="2.5" fill="${C.metal}" opacity="0.8" transform="rotate(-30 30 38)"/>
      <ellipse cx="38" cy="34" rx="4" ry="2.5" fill="${C.metal}" opacity="0.7" transform="rotate(-15 38 34)"/>
      <ellipse cx="50" cy="32" rx="4" ry="2.5" fill="${C.metal}" opacity="0.8"/>
      <ellipse cx="62" cy="34" rx="4" ry="2.5" fill="${C.metal}" opacity="0.7" transform="rotate(15 62 34)"/>
      <ellipse cx="70" cy="38" rx="4" ry="2.5" fill="${C.metal}" opacity="0.8" transform="rotate(30 70 38)"/>`;
  } else if (stage === 4 && C.metal) {
    // Spartan helmet crest
    headgear = `<path d="M 24 52 Q 24 28 50 22 Q 76 28 76 52" stroke="${C.metal}" stroke-width="2.5" fill="none"/>
      <path d="M 24 52 L 22 56" stroke="${C.metal}" stroke-width="2" stroke-linecap="round"/>
      <path d="M 76 52 L 78 56" stroke="${C.metal}" stroke-width="2" stroke-linecap="round"/>
      <path d="M 50 22 Q 50 8 50 4" stroke="${C.sash}" stroke-width="3" stroke-linecap="round"/>
      <path d="M 48 4 Q 50 2 52 4 Q 54 10 56 18" stroke="${C.sash}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M 44 18 Q 46 10 48 4" stroke="${C.sash}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M 30 48 Q 50 42 70 48" stroke="${C.metal}" stroke-width="1.5" fill="none" opacity="0.6"/>`;
  } else if (stage === 5 && C.metal) {
    // Golden laurel wreath
    headgear = `<path d="M 26 42 Q 38 30 50 28 Q 62 30 74 42" stroke="${C.metal}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <ellipse cx="28" cy="40" rx="5" ry="3" fill="${C.metal}" opacity="0.85" transform="rotate(-35 28 40)"/>
      <ellipse cx="35" cy="35" rx="5" ry="3" fill="${C.metal}" opacity="0.75" transform="rotate(-20 35 35)"/>
      <ellipse cx="43" cy="31" rx="5" ry="3" fill="${C.metal}" opacity="0.85" transform="rotate(-8 43 31)"/>
      <ellipse cx="50" cy="29" rx="5" ry="3" fill="${C.metal}" opacity="0.9"/>
      <ellipse cx="57" cy="31" rx="5" ry="3" fill="${C.metal}" opacity="0.85" transform="rotate(8 57 31)"/>
      <ellipse cx="65" cy="35" rx="5" ry="3" fill="${C.metal}" opacity="0.75" transform="rotate(20 65 35)"/>
      <ellipse cx="72" cy="40" rx="5" ry="3" fill="${C.metal}" opacity="0.85" transform="rotate(35 72 40)"/>`;
  } else if (stage === 6 && C.metal) {
    // Radiant golden crown with glow
    headgear = `<path d="M 24 42 Q 38 28 50 26 Q 62 28 76 42" stroke="${C.metal}" stroke-width="2.5" fill="none" stroke-linecap="round" filter="url(#${uid}gl)"/>
      <ellipse cx="28" cy="40" rx="5" ry="3" fill="${C.metal}" transform="rotate(-35 28 40)"/>
      <ellipse cx="35" cy="34" rx="5.5" ry="3" fill="${C.metal}" transform="rotate(-20 35 34)"/>
      <ellipse cx="43" cy="30" rx="5.5" ry="3" fill="${C.metal}" transform="rotate(-8 43 30)"/>
      <ellipse cx="50" cy="28" rx="5.5" ry="3.5" fill="${C.metal}"/>
      <ellipse cx="57" cy="30" rx="5.5" ry="3" fill="${C.metal}" transform="rotate(8 57 30)"/>
      <ellipse cx="65" cy="34" rx="5.5" ry="3" fill="${C.metal}" transform="rotate(20 65 34)"/>
      <ellipse cx="72" cy="40" rx="5" ry="3" fill="${C.metal}" transform="rotate(35 72 40)"/>
      <circle cx="50" cy="27" r="3" fill="${C.metal}" opacity="0.9">
        <animate attributeName="opacity" values="0.9;0.5;0.9" dur="2s" repeatCount="indefinite"/>
      </circle>
      <line x1="50" y1="24" x2="50" y2="18" stroke="${C.metal}" stroke-width="1.5" opacity="0.7" stroke-linecap="round">
        <animate attributeName="opacity" values="0.7;0.3;0.7" dur="1.8s" repeatCount="indefinite"/>
      </line>
      <line x1="43" y1="26" x2="40" y2="20" stroke="${C.metal}" stroke-width="1.2" opacity="0.5" stroke-linecap="round"/>
      <line x1="57" y1="26" x2="60" y2="20" stroke="${C.metal}" stroke-width="1.2" opacity="0.5" stroke-linecap="round"/>`;
  }

  // ── BODY & TOGA ──────────────────────────────────────────────────────────
  const neckShadow = `<ellipse cx="50" cy="82" rx="12" ry="4" fill="${skD}" opacity="0.35" filter="url(#${uid}sh)"/>`;
  const neck = `<path d="M 44 80 L 44 89 Q 50 91 56 89 L 56 80 Z" fill="url(#${uid}sk)"/>`;

  // Toga / chiton body
  const torso = `<path d="M 19 95 Q 14 102 13 130 L 87 130 Q 86 102 81 95 Q 65 85 50 85 Q 35 85 19 95 Z" fill="url(#${uid}tg)"/>`;

  // Toga drape detail
  let togaDetail = '';
  if (gender === 'female') {
    // Feminine chiton with gathered neckline
    togaDetail = `<path d="M 36 89 Q 50 96 64 89" stroke="${C.toga2}" stroke-width="1.5" fill="none" opacity="0.6" stroke-linecap="round"/>
      <path d="M 30 100 Q 35 95 40 100 Q 45 105 50 100 Q 55 95 60 100 Q 65 105 70 100" stroke="${C.toga2}" stroke-width="1" fill="none" opacity="0.35"/>`;
    if (C.sash && stage >= 3) {
      togaDetail += `<path d="M 62 89 Q 70 95 74 110 Q 72 115 68 105 Q 64 95 62 89 Z" fill="${C.sash}" opacity="0.75"/>`;
    }
  } else {
    // Male toga with shoulder drape
    togaDetail = `<path d="M 38 89 Q 50 94 62 89" stroke="${C.toga2}" stroke-width="1.5" fill="none" opacity="0.5" stroke-linecap="round"/>
      <path d="M 22 96 Q 28 92 35 100 Q 40 110 38 120" stroke="${C.toga2}" stroke-width="1.2" fill="none" opacity="0.3"/>
      <path d="M 60 100 Q 65 95 72 96 Q 78 100 80 110" stroke="${C.toga2}" stroke-width="1.2" fill="none" opacity="0.3"/>`;
    if (C.sash && stage >= 2) {
      togaDetail += `<path d="M 22 95 Q 30 88 38 89 Q 34 100 28 108 Q 22 112 20 108 Q 20 102 22 95 Z" fill="${C.sash}" opacity="0.7"/>`;
    }
  }

  // Metal brooch/pin for higher stages
  let brooch = '';
  if (C.metal && stage >= 3) {
    brooch = `<circle cx="${gender === 'female' ? 50 : 30}" cy="${gender === 'female' ? 89 : 92}" r="3" fill="${C.metal}" opacity="0.9"/>
      <circle cx="${gender === 'female' ? 50 : 30}" cy="${gender === 'female' ? 89 : 92}" r="1.5" fill="${C.toga}" opacity="0.5"/>`;
  }

  // ── FACE (classical proportions, not anime) ──────────────────────────────
  const eyeRx = gender === 'female' ? 5.5 : 5;
  const eyeRy = gender === 'female' ? 4.5 : 4;
  const browW = gender === 'female' ? 1.5 : 2;
  const irisC = '#5a4830';  // warm brown iris
  const irisH = '#3d2814';  // darker pupil

  const face = `
    <!-- Head -->
    <circle cx="50" cy="56" r="26" fill="url(#${uid}sk)"/>
    <!-- Jaw definition -->
    <path d="M 28 62 Q 50 82 72 62" stroke="${skS}" stroke-width="0.6" fill="none" opacity="0.2"/>
    <!-- Ears -->
    <ellipse cx="24" cy="58" rx="3.5" ry="5" fill="url(#${uid}sk)"/>
    <ellipse cx="76" cy="58" rx="3.5" ry="5" fill="url(#${uid}sk)"/>
    <ellipse cx="24" cy="59" rx="2" ry="3" fill="${skS}" opacity="0.4"/>
    <ellipse cx="76" cy="59" rx="2" ry="3" fill="${skS}" opacity="0.4"/>
    <!-- Eyebrows -->
    <path d="M 34 48 Q 40 45 46 47" stroke="${C.hc}" stroke-width="${browW}" fill="none" stroke-linecap="round"/>
    <path d="M 54 47 Q 60 45 66 48" stroke="${C.hc}" stroke-width="${browW}" fill="none" stroke-linecap="round"/>
    <!-- Eyes -->
    <ellipse cx="40" cy="54" rx="${eyeRx}" ry="${eyeRy}" fill="white"/>
    <ellipse cx="60" cy="54" rx="${eyeRx}" ry="${eyeRy}" fill="white"/>
    <!-- Upper lid line -->
    <path d="M ${40-eyeRx} 53 Q 40 ${50} ${40+eyeRx} 53" stroke="#2a1a0a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M ${60-eyeRx} 53 Q 60 ${50} ${60+eyeRx} 53" stroke="#2a1a0a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <!-- Iris -->
    <circle cx="40" cy="55" r="3.5" fill="${irisC}"/>
    <circle cx="60" cy="55" r="3.5" fill="${irisC}"/>
    <!-- Pupil -->
    <circle cx="40" cy="55" r="1.8" fill="${irisH}"/>
    <circle cx="60" cy="55" r="1.8" fill="${irisH}"/>
    <!-- Catchlight -->
    <circle cx="38.5" cy="53.5" r="1.2" fill="white"/>
    <circle cx="58.5" cy="53.5" r="1.2" fill="white"/>
    ${gender === 'female' ? `<path d="M ${40-eyeRx-0.5} 52 Q ${40-eyeRx+1} 50 ${40-eyeRx+3} 51" stroke="#2a1a0a" stroke-width="1" fill="none" stroke-linecap="round"/>
    <path d="M ${60+eyeRx-3} 51 Q ${60+eyeRx-1} 50 ${60+eyeRx+0.5} 52" stroke="#2a1a0a" stroke-width="1" fill="none" stroke-linecap="round"/>` : ''}
    <!-- Nose -->
    <path d="M 48 62 Q 50 64 52 62" stroke="${skS}" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <!-- Mouth -->
    <path d="M 44 70 Q 50 74 56 70" stroke="#c4756a" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <!-- Subtle cheek shading -->
    <ellipse cx="33" cy="63" rx="5" ry="3" fill="#dba898" opacity="0.15"/>
    <ellipse cx="67" cy="63" rx="5" ry="3" fill="#dba898" opacity="0.15"/>`;

  return `<svg viewBox="5 -10 90 140" xmlns="http://www.w3.org/2000/svg"
      style="width:100%;height:100%" aria-hidden="true">
    <defs>${defs}</defs>
    ${aura}${parts}
    ${hair}
    ${neckShadow}${neck}${torso}${togaDetail}${brooch}
    ${face}
    ${headgear}
  </svg>`;
}

function setCalView_stats(v) { calView = v; window._statsSubView = 'calendar'; renderStats(); }

// ── WEEK-OVER-WEEK TREND HELPERS ─────────────────────────────────────────
function _lastWeekDates() {
  const dates = [];
  for (let i = 7; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() - i); dates.push(d.toLocaleDateString('en-CA')); }
  return dates;
}
function _lastWeekWorkouts() {
  return _lastWeekDates().filter(d => workoutLog[d] && workoutLog[d].exercises.some(e => e.sets.some(s => s.completed))).length;
}
function _lastWeekHabitDays() {
  let ct = 0;
  _lastWeekDates().forEach(d => { if (habits.some(h => log[h.id]?.lastCompletedDate === d)) ct++; });
  return ct;
}
function _lastWeekJournalDays() {
  return _lastWeekDates().filter(d => journal[d] && Object.values(journal[d]).some(Boolean)).length;
}
function _trendBadge(cur, prev) {
  if (prev === 0 && cur === 0) return '';
  const diff = cur - prev;
  if (diff === 0) return '<div class="trend-badge trend-flat">—</div>';
  const arrow = diff > 0 ? '↑' : '↓';
  const cls = diff > 0 ? 'trend-up' : 'trend-down';
  return `<div class="trend-badge ${cls}">${arrow}${Math.abs(diff)}</div>`;
}

function renderStats() {
  const {done,total} = totalPct();
  const best = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const q = QUOTES[meta.quoteIndex % QUOTES.length];
  const psRows = PILLARS.map(p => { const {pct} = pillarPct(p.id); return `<div class="ps-row"><div class="ps-name">${p.name}</div><div class="ps-track"><div class="ps-fill" style="width:${(pct*100).toFixed(0)}%"></div></div><div class="ps-val">${Math.round(pct*10)}/10</div></div>`; }).join('');

  const { lvl, progress, needed } = xpToNextLevel(gamification.xp || 0);
  const xpBarPct = needed > 0 ? progress / needed : 1;
  const unlockedSet = new Set(achievements);
  const achHTML = ACHIEVEMENTS.map(a => `
    <div class="g-ach-card ${unlockedSet.has(a.id) ? 'unlocked' : 'locked'}">
      <div class="g-ach-icon">${a.icon}</div>
      <div class="g-ach-name">${a.name}</div>
      <div class="g-ach-desc">${a.desc}</div>
    </div>`).join('');
  const pillarLevels = PILLARS.map(p => `
    <div class="g-pl-card">
      ${p.icon}
      <div class="g-pl-name">${p.name}</div>
      <div class="g-pl-lv">Lv ${getPillarLevel(p.id)}</div>
    </div>`).join('');

  // Weekly summary stats
  ensureWeeklyStats();
  const ws = gamification.weeklyStats;
  const weekAvgCal = computeWeeklyAvgCalories(mealLog);
  const weekHabits7 = (() => {
    let daysWithAny = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-CA');
      if (habits.some(h => log[h.id]?.lastCompletedDate === key)) daysWithAny++;
    }
    return daysWithAny;
  })();

  // Sub-view toggle: Profile | Calendar
  const _statsSubView = window._statsSubView || 'profile';
  if (_statsSubView === 'calendar') {
    document.getElementById('view').innerHTML = `
      <div class="sh ani" style="display:flex;align-items:flex-start;justify-content:space-between">
        <div><div class="sh-title">Profile</div><div class="sh-sub">Become your greatest self.</div></div>
      </div>
      <div class="cal-view-seg ani" style="margin:0 24px 12px">
        <button class="cal-vbtn" onclick="window._statsSubView='profile';renderStats()">Profile</button>
        <button class="cal-vbtn cal-vbtn-active" onclick="window._statsSubView='calendar';renderStats()">Calendar</button>
      </div>
      <div id="stats-calendar-area"></div>`;
    // Render calendar content into the area
    const calArea = document.getElementById('stats-calendar-area');
    if (calArea) {
      // Temporarily replace the view rendering
      const origView = document.getElementById('view');
      const tempDiv = document.createElement('div');
      tempDiv.id = 'view';
      origView.appendChild(tempDiv);
      // Build calendar HTML directly
      if (!calSelectedDate) calSelectedDate = today();
      let calHTML = '';
      if (calView === 'weekly') {
        // Inline weekly calendar
        const sel = new Date(calSelectedDate + 'T00:00:00');
        const dow = sel.getDay();
        const monday = new Date(sel);
        monday.setDate(sel.getDate() - (dow === 0 ? 6 : dow - 1));
        const t = today();
        const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        let cols = '';
        for (let i = 0; i < 7; i++) {
          const d = new Date(monday); d.setDate(monday.getDate() + i);
          const date = d.toLocaleDateString('en-CA');
          const isFuture = date > t;
          const isToday = date === t;
          const isSel = date === calSelectedDate;
          cols += `<div class="cal-wcol${isSel?' cal-wcol-sel':''}${isFuture?' cal-wfuture':''}" data-date="${date}" onclick="calSelectDate('${date}');window._statsSubView='calendar';renderStats()">
            <div class="cal-wday">${dayNames[i]}</div>
            <div class="cal-wnum${isToday?' cal-wnum-today':''}">${d.getDate()}</div>
            <div class="cal-dots" style="margin-top:4px">${_calDots(date)}</div>
          </div>`;
        }
        const startLabel = new Date(monday).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endDay = new Date(monday); endDay.setDate(monday.getDate() + 6);
        const endLabel = endDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        calHTML = `<div class="cal-hdr ani">
          <button class="cal-nav-btn" onclick="calPrev();window._statsSubView='calendar';renderStats()">‹</button>
          <div class="cal-month-label">${startLabel} – ${endLabel}</div>
          <button class="cal-nav-btn" onclick="calNext();window._statsSubView='calendar';renderStats()">›</button>
        </div>
        ${_calViewToggle().replace(/setCalView\(/g, "setCalView_stats(")}
        ${_calLegend()}
        <div class="cal-week-cols ani">${cols}</div>
        <div class="cal-detail ani" id="cal-detail">${buildCalDayDetail(calSelectedDate)}</div>`;
      } else if (calView === 'daily') {
        const d = new Date(calSelectedDate + 'T00:00:00');
        const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        calHTML = `<div class="cal-hdr ani">
          <button class="cal-nav-btn" onclick="calPrev();window._statsSubView='calendar';renderStats()">‹</button>
          <div class="cal-month-label" style="font-size:15px">${label}</div>
          <button class="cal-nav-btn" onclick="calNext();window._statsSubView='calendar';renderStats()">›</button>
        </div>
        ${_calViewToggle().replace(/setCalView\(/g, "setCalView_stats(")}
        <div class="cal-daily-wrap ani">${_buildDailyBody(calSelectedDate)}</div>`;
      } else {
        // Monthly (default)
        if (!calSelectedDate) calSelectedDate = today();
        const firstDay = new Date(calYear, calMonth, 1);
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        const startDow = firstDay.getDay();
        const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const t = today();
        const now = new Date();
        const isCurrentMonth = calYear === now.getFullYear() && calMonth === now.getMonth();
        let cells = Array.from({length: startDow}, () => `<div class="cal-cell cal-empty"></div>`).join('');
        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(calYear, calMonth, day).toLocaleDateString('en-CA');
          const isFuture = date > t;
          const isToday = date === t;
          const isSel = date === calSelectedDate;
          cells += `<div class="cal-cell${isToday?' cal-today':''}${isSel?' cal-selected':''}${isFuture?' cal-future':''}" data-date="${date}" onclick="calSelectDate('${date}');window._statsSubView='calendar';renderStats()">
            <div class="cal-num">${day}</div>
            <div class="cal-dots">${_calDots(date)}</div>
          </div>`;
        }
        calHTML = `<div class="cal-hdr ani">
          <button class="cal-nav-btn" onclick="calPrev();window._statsSubView='calendar';renderStats()">‹</button>
          <div class="cal-month-label">${monthLabel}</div>
          <button class="cal-nav-btn${isCurrentMonth?' cal-nav-disabled':''}" onclick="calNext();window._statsSubView='calendar';renderStats()">›</button>
        </div>
        ${_calViewToggle().replace(/setCalView\(/g, "setCalView_stats(")}
        ${_calLegend()}
        <div class="cal-dow-row">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}</div>
        <div class="cal-grid ani">${cells}</div>
        <div class="cal-detail ani" id="cal-detail">${buildCalDayDetail(calSelectedDate)}</div>`;
      }
      calArea.innerHTML = calHTML;
      tempDiv.remove();
    }
    qTimer = setInterval(() => rotQ(1), 30000);
    return;
  }

  document.getElementById('view').innerHTML = `
    <div class="sh ani" style="display:flex;align-items:flex-start;justify-content:space-between">
      <div><div class="sh-title">Profile</div><div class="sh-sub">Become your greatest self.</div></div>
      <button class="w-action-btn" style="margin:0;padding:10px 16px;font-size:13px;width:auto" onclick="openEditName()">Edit Name</button>
    </div>
    <div class="cal-view-seg ani" style="margin:0 24px 12px">
      <button class="cal-vbtn cal-vbtn-active" onclick="window._statsSubView='profile';renderStats()">Profile</button>
      <button class="cal-vbtn" onclick="window._statsSubView='calendar';renderStats()">Calendar</button>
    </div>
    <div class="da-section ani" style="margin:0 24px 16px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border2)">
        <div>
          <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">Name</div>
          <div style="font-family:var(--serif);font-size:20px;color:var(--text)" id="profile-name-display">${userName() || 'Tap Edit Name →'}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <div style="font-size:13px;color:var(--text-dim)">Level <span style="font-family:var(--serif);font-size:26px;color:var(--accent-b);font-weight:700">${lvl}</span> <span style="font-size:12px;color:var(--accent);font-weight:600;letter-spacing:.04em">${getLevelTitle(lvl)}</span></div>
        <div style="font-size:11px;color:var(--text-dim)">${(gamification.xp||0).toLocaleString()} XP</div>
      </div>
      <div class="g-xp-bar-track"><div class="g-xp-bar-fill" style="width:${(xpBarPct*100).toFixed(1)}%"></div></div>
      <div style="font-size:10px;color:var(--text-dim);text-align:right;margin-top:2px">${(needed-progress).toLocaleString()} XP to Level ${lvl+1}</div>
    </div>
    <div class="da-section ani" style="margin:0 24px 16px;padding:16px">
      <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Settings</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;color:var(--text)">Units</div>
        <div class="unit-toggle">
          <button class="unit-btn${!isImperial()?' unit-btn-active':''}" onclick="setUnits('metric');renderStats()">kg</button>
          <button class="unit-btn${isImperial()?' unit-btn-active':''}" onclick="setUnits('imperial');renderStats()">lbs</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;color:var(--text)">Theme</div>
        <div class="unit-toggle">
          <button class="unit-btn${(settings.theme||'dark')==='dark'?' unit-btn-active':''}" onclick="settings.theme='dark';LS.set('hvi_settings',settings);applyTheme();renderStats()">Dark</button>
          <button class="unit-btn${settings.theme==='light'?' unit-btn-active':''}" onclick="settings.theme='light';LS.set('hvi_settings',settings);applyTheme();renderStats()">Light</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;color:var(--text)">Avatar</div>
        <div class="unit-toggle">
          <button class="unit-btn${(tdeeProfile?.sex||'male')==='male'?' unit-btn-active':''}" onclick="setGender('male')">Male</button>
          <button class="unit-btn${(tdeeProfile?.sex||'male')==='female'?' unit-btn-active':''}" onclick="setGender('female')">Female</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;color:var(--text)">Sounds</div>
        <div class="unit-toggle">
          <button class="unit-btn${settings.sounds!==false?' unit-btn-active':''}" onclick="settings.sounds=true;LS.set('hvi_settings',settings);renderStats()">On</button>
          <button class="unit-btn${settings.sounds===false?' unit-btn-active':''}" onclick="settings.sounds=false;LS.set('hvi_settings',settings);renderStats()">Off</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div style="font-size:14px;color:var(--text)">Ask about sleep daily</div>
        <div class="unit-toggle">
          <button class="unit-btn${settings.sleepPrompt!==false?' unit-btn-active':''}" onclick="settings.sleepPrompt=true;LS.set('hvi_settings',settings);renderStats()">On</button>
          <button class="unit-btn${settings.sleepPrompt===false?' unit-btn-active':''}" onclick="settings.sleepPrompt=false;LS.set('hvi_settings',settings);renderStats()">Off</button>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">Once on the first open of each day, unless it's already logged.</div>
      ${(() => {
        const native = typeof _nativeNotifier === 'function' && !!_nativeNotifier();
        const push = typeof pushSupported === 'function' && pushSupported();
        if (!native && !push && !('Notification' in window)) return '';
        const granted = native || (('Notification' in window) && Notification.permission === 'granted');
        // The toggle reflects the setting, not the browser permission — it used
        // to read permission, so switching Off never appeared to stick.
        const on = !!settings.notifications && granted;
        const needsPerm = !native && !granted;
        const needsInstall = !native && typeof pushNeedsInstall === 'function' && pushNeedsInstall();
        const err = (typeof notifyError === 'function' && notifyError()) || '';
        const note = native
          ? ''
          : needsInstall
            ? 'Add Arete to your Home Screen (Share → Add to Home Screen) to get reminders while the app is closed.'
            : push
              ? 'Reminders arrive at 7:30, 12:30 and 20:30 — even when Arete is closed.'
              : 'Your browser can only show reminders while Arete is open.';
        return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${note || err ? 4 : 14}px">
          <div style="font-size:14px;color:var(--text)">Reminders</div>
          <div class="unit-toggle">
            ${needsPerm
              ? `<button class="unit-btn" onclick="requestNotifications()">Enable</button>`
              : `<button class="unit-btn${on ? ' unit-btn-active' : ''}" onclick="setNotifications(true)">On</button>
                 <button class="unit-btn${!on ? ' unit-btn-active' : ''}" onclick="setNotifications(false)">Off</button>`}
          </div>
        </div>
        ${err ? `<div style="font-size:11px;color:var(--fat);line-height:1.45;margin-bottom:14px">${esc(err)}</div>`
              : note ? `<div style="font-size:10.5px;color:var(--text-muted);line-height:1.45;margin-bottom:14px">${note}</div>` : ''}`;
      })()}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;color:var(--text)">App version</div>
        <button class="unit-btn" style="padding:6px 14px;background:var(--surface);border:1px solid var(--border2)" onclick="if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(r=>r.forEach(x=>x.unregister())).then(()=>window.location.reload(true))}else{window.location.reload(true)}">Refresh</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:14px;color:var(--text)">Backup</div>
        <div style="display:flex;gap:6px">
          <button class="unit-btn" style="padding:6px 14px;background:var(--surface);border:1px solid var(--border2)" onclick="exportAllData()">Export</button>
          <label class="unit-btn" style="padding:6px 14px;background:var(--surface);border:1px solid var(--border2);cursor:pointer">Import<input type="file" accept=".json" style="display:none" onchange="importData(this)"></label>
        </div>
      </div>
    </div>
    ${typeof renderIntegrationsSection === 'function' ? renderIntegrationsSection() : ''}
    <div class="s-grid ani">
      <div class="s-card"><div class="s-val">${done}</div><div class="s-lbl">Today</div></div>
      <div class="s-card"><div class="s-val">${best}</div><div class="s-lbl">Best Streak</div></div>
      <div class="s-card"><div class="s-val">${meta.totalPerfectDays||0}</div><div class="s-lbl">Perfect Days</div></div>
      <div class="s-card"><div class="s-val">${total}</div><div class="s-lbl">Total Habits</div></div>
    </div>
    <div class="da-section ani" style="margin:0 24px 8px">
      <div class="sec-lbl" style="padding:0 0 10px">THIS WEEK vs LAST WEEK</div>
      <div class="s-grid" style="margin:0">
        <div class="s-card"><div class="s-val" style="font-size:22px">${ws.workoutDays.length}</div><div class="s-lbl">Workouts</div>${_trendBadge(ws.workoutDays.length, _lastWeekWorkouts())}</div>
        <div class="s-card"><div class="s-val" style="font-size:22px">${weekHabits7}</div><div class="s-lbl">Habit Days</div>${_trendBadge(weekHabits7, _lastWeekHabitDays())}</div>
        <div class="s-card"><div class="s-val" style="font-size:22px">${ws.journalDays.length}</div><div class="s-lbl">Journaled</div>${_trendBadge(ws.journalDays.length, _lastWeekJournalDays())}</div>
        <div class="s-card"><div class="s-val" style="font-size:22px">${weekAvgCal !== null ? weekAvgCal.toLocaleString() : '—'}</div><div class="s-lbl">Avg Cal</div></div>
      </div>
    </div>
    <div class="sec-lbl" style="padding-left:24px">Pillar Scores</div>
    <div class="ps ani">${psRows}</div>
    <div class="sec-lbl" style="padding-left:24px">Pillar Levels</div>
    <div class="g-pillar-levels ani">${pillarLevels}</div>
    <div class="sec-lbl" style="padding-left:24px">Achievements · ${achievements.length}/${ACHIEVEMENTS.length}</div>
    <div class="g-ach-grid ani">${achHTML}</div>
    <div class="sec-lbl" style="padding-left:24px">Today's Wisdom</div>
    <div class="q-block ani">
      <div class="q-mark">\u201C</div>
      <div class="q-text" id="qt">${esc(q.text)}</div>
      <div class="q-auth" id="qa">\u2014 ${esc(q.author)}</div>
      <div class="q-nav"><button class="q-btn" onclick="rotQ(-1)">\u2190</button><button class="q-btn" onclick="rotQ(1)">\u2192</button></div>
    </div>
    ${typeof renderWeekInReview === 'function' ? renderWeekInReview() : ''}
    ${typeof renderPremiumSettingsCard === 'function' ? `<div style="margin:16px 24px 4px">${renderPremiumSettingsCard()}</div>` : ''}
    <button class="w-action-btn" style="margin:12px 24px 8px" onclick="go('goals')">${icon('flag')} My Goals</button>
    <button class="w-action-btn" style="margin:0 24px 8px" onclick="go('sleep')">${icon('moon')} Log Sleep</button>
    <button class="w-action-btn" style="margin:0 24px 8px" onclick="go('progressPhotos')">${icon('camera')} Progress Photos</button>
    <button class="w-action-btn" style="margin:0 24px 8px" onclick="shareRecap()">${icon('share')} Share Weekly Recap</button>
    <button class="w-action-btn" style="margin:0 24px 8px" onclick="go('leaderboard')">${icon('award')} Leaderboard</button>
    <button class="w-action-btn" style="margin:0 24px 8px" onclick="go('challenges')">${icon('swords')} Challenge a Friend</button>
    <button class="w-action-btn" style="margin:0 24px 8px" onclick="shareInvite()">${icon('link')} Invite a Friend</button>
    <button class="w-action-btn" style="margin:0 24px 8px" onclick="window.open('https://forms.gle/QMHZaYy2grUNmCpJ7','_blank');track('feedback_click')">${icon('edit')} Send Feedback</button>
    <button class="w-action-btn" style="margin:0 24px 8px" onclick="window.open('/privacy.html','_blank')">Privacy Policy</button>
    ${(typeof isGuest === 'function' && isGuest())
      ? `<div class="guest-cta" style="margin:0 24px 8px">
           <div class="guest-cta-text">You're using Arete as a guest. Your data lives only on this device.</div>
           <button class="guest-cta-btn" onclick="showSignup()">Create a free account to save & sync</button>
         </div>
         <button class="w-action-btn" style="margin:8px 24px 32px" onclick="showAuth()">Already have an account? Sign in</button>`
      : `<button class="w-action-btn" style="margin:0 24px 8px" onclick="forceSync()" id="force-sync-btn">${icon('refresh')} Force Sync Now</button>
         <div id="sync-log" style="margin:0 24px 8px;font-size:11px;color:var(--text-dim);max-height:120px;overflow:auto;font-family:monospace;white-space:pre-wrap"></div>
         <button class="w-action-btn" style="margin:0 24px 8px;color:var(--fat);border-color:var(--fat)" onclick="if(confirm('Sign out?'))authSignOut()">Sign Out</button>
         <button class="w-action-btn" style="margin:0 24px 32px;color:var(--text-muted)" onclick="openDeleteAccount()">Delete Account</button>`}
    ${_errorLogHTML()}
    <div style="text-align:center;padding:0 24px 28px;font-size:10px;color:var(--text-muted);letter-spacing:0.08em">ARETE ${(() => { try { return 'v' + (document.querySelector('script[src*="app.js?v="]').src.match(/v=(\d+)/) || [])[1]; } catch { return ''; } })()}</div>`;
  qTimer = setInterval(() => rotQ(1), 30000);
}

// ── DELETE ACCOUNT ────────────────────────────────────────────────────────
// Irreversible, so the sheet spells out what goes, and the confirm button
// stays disabled until DELETE is typed. A plain confirm() is too easy to
// dismiss by reflex for something that can't be undone.
function openDeleteAccount() {
  let modal = document.getElementById('del-acct-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'del-acct-modal'; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div class="edit-habit-backdrop" onclick="closeDeleteAccount()"></div>
    <div class="edit-habit-sheet">
      <div class="edit-habit-title" style="color:var(--fat)">Delete account</div>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.6;margin-bottom:12px">
        This permanently deletes your account and everything synced to it:
      </div>
      <ul style="font-size:12.5px;color:var(--text-dim);line-height:1.6;margin:0 0 12px 18px">
        <li>Habits, streaks and journal</li>
        <li>Workouts, personal records and progress</li>
        <li>Meals, macros, bodyweight and sleep</li>
        <li>Progress photos</li>
        <li>Your leaderboard entries</li>
      </ul>
      <div style="font-size:12.5px;color:var(--text-dim);line-height:1.6;margin-bottom:14px">
        Any active subscription is cancelled. <strong style="color:var(--text)">This cannot be undone</strong> and support cannot recover it.
      </div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:6px">Type DELETE to confirm</div>
      <input class="d-input" id="del-acct-input" type="text" autocapitalize="characters" autocomplete="off"
        placeholder="DELETE" oninput="_delAcctCheck()" style="margin-bottom:10px">
      <div id="del-acct-error" style="color:var(--fat);font-size:12px;min-height:18px;margin-bottom:8px"></div>
      <div style="display:flex;gap:10px">
        <button class="w-action-btn" style="flex:1;margin:0" onclick="closeDeleteAccount()">Cancel</button>
        <button class="w-action-btn" id="del-acct-go" disabled
          style="flex:1;margin:0;opacity:0.4;color:var(--fat);border-color:var(--fat)"
          onclick="_delAcctConfirm()">Delete</button>
      </div>
    </div>`;
  modal.style.display = 'block';
  setTimeout(() => document.getElementById('del-acct-input')?.focus(), 100);
}

function closeDeleteAccount() {
  const m = document.getElementById('del-acct-modal');
  if (m) m.style.display = 'none';
}

function _delAcctCheck() {
  const ok = (document.getElementById('del-acct-input')?.value || '').trim().toUpperCase() === 'DELETE';
  const btn = document.getElementById('del-acct-go');
  if (btn) { btn.disabled = !ok; btn.style.opacity = ok ? '1' : '0.4'; }
}

async function _delAcctConfirm() {
  const btn = document.getElementById('del-acct-go');
  const err = document.getElementById('del-acct-error');
  const input = document.getElementById('del-acct-input');
  if ((input?.value || '').trim().toUpperCase() !== 'DELETE') return;
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; btn.style.opacity = '0.6'; }
  if (err) err.textContent = '';

  const res = await deleteAccount();
  if (res && res.ok) {
    // Only wipe the device once the server confirms the account is gone
    wipeLocalData();
    if (typeof cancelNativeReminders === 'function') { try { await cancelNativeReminders(); } catch {} }
    closeDeleteAccount();
    location.replace('/');
    return;
  }
  if (err) err.textContent = (res && res.error) || 'Deletion failed. Please try again.';
  if (btn) { btn.disabled = false; btn.textContent = 'Delete'; btn.style.opacity = '1'; }
  _delAcctCheck();
}

// Recent errors, on-device. Hidden entirely when there's nothing to report so
// a healthy install shows no scary panel.
function _errorLogHTML() {
  const log = (typeof getErrorLog === 'function') ? getErrorLog() : [];
  if (!log.length) return '';
  const rows = log.slice(0, 6).map(e => {
    const when = (e.at || '').slice(5, 16).replace('T', ' ');
    return `<div style="padding:5px 0;border-bottom:1px solid var(--border2)">
      <div style="color:var(--fat);font-size:10.5px">${esc(String(e.msg || '').slice(0, 90))}</div>
      <div style="color:var(--text-muted);font-size:9.5px;margin-top:1px">${when} · ${esc(e.where || '')}${e.src ? ' · ' + esc(e.src) : ''}${e.line ? ':' + e.line : ''} · v${esc(String(e.v || '?'))}</div>
    </div>`;
  }).join('');
  return `
    <div class="sec-lbl" style="padding:8px 24px 6px">RECENT ISSUES (${log.length})</div>
    <div style="margin:0 24px 8px;padding:10px 12px;background:var(--surface);border:1px solid var(--border2);border-radius:12px;font-family:monospace">
      ${rows}
      <div style="font-size:9.5px;color:var(--text-muted);margin-top:8px;font-family:var(--display)">Reported anonymously to help fix bugs. No personal data included.</div>
    </div>
    <button class="w-action-btn" style="margin:0 24px 20px" onclick="clearErrorLog()">Clear issue log</button>`;
}

function openEditName() {
  let modal = document.getElementById('edit-name-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'edit-name-modal'; document.body.appendChild(modal); }
  const current = userName();
  modal.innerHTML = `
    <div class="edit-habit-backdrop" onclick="closeEditName()"></div>
    <div class="edit-habit-sheet">
      <div class="edit-habit-title">Your Name</div>
      <input class="d-input" id="edit-name-input" type="text" value="${esc(current)}" placeholder="First name" style="margin-bottom:20px">
      <div style="display:flex;gap:10px">
        <button class="w-action-btn" style="flex:1;margin:0" onclick="closeEditName()">Cancel</button>
        <button class="w-action-btn" style="flex:1;margin:0;background:var(--accent);color:#fff" onclick="saveEditName()">Save</button>
      </div>
    </div>`;
  modal.style.display = 'block';
  setTimeout(() => document.getElementById('edit-name-input')?.focus(), 100);
}

function closeEditName() {
  const m = document.getElementById('edit-name-modal');
  if (m) m.style.display = 'none';
}

function saveEditName() {
  const name = document.getElementById('edit-name-input')?.value?.trim();
  if (!name) return;
  localStorage.setItem('hvi_user_name', name);
  closeEditName();
  const el = document.getElementById('profile-name-display');
  if (el) el.textContent = name;
}

function setGender(g) {
  if (!tdeeProfile) tdeeProfile = {};
  tdeeProfile.sex = g;
  LS.set('hvi_tdee_profile', tdeeProfile);
  renderStats();
}

function rotQ(dir) {
  meta.quoteIndex = (meta.quoteIndex + dir + QUOTES.length) % QUOTES.length;
  LS.set('hvi_meta', meta);
  const q = QUOTES[meta.quoteIndex];
  const qt = document.getElementById('qt'), qa = document.getElementById('qa');
  if (!qt) return;
  qt.style.opacity = '0';
  setTimeout(() => { if (qt) { qt.textContent = q.text; qt.style.opacity = '1'; } if (qa) qa.textContent = '\u2014 ' + q.author; }, 200);
}

// ══════════════════════════════════════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════════════════════════════════════
// Step 3 (which path they care about) and step 5 (nutrition goal) used to
// share _obGoalType. Step 5 overwrote step 3, so the path answer was thrown
// away — and picking one on step 3 left step 5 with no goal highlighted even
// though its macro fields were prefilled.
let _obPath = 'all';
let _obGoalType = 'maintain';
let _obCalories = 2500;
let _obProtein = 180;
let _obName = '', _obGender = 'male';
let _obProgram = 'ppl';

function injectOnboardingStyles() {
  if (document.getElementById('ob-styles')) return;
  const s = document.createElement('style');
  s.id = 'ob-styles';
  s.textContent = `
    #ob-overlay{position:fixed;inset:0;background:var(--bg);z-index:2000;overflow-y:auto;display:flex;flex-direction:column}
    .ob-wrap{flex:1;display:flex;flex-direction:column;padding:0 28px 48px;max-width:480px;margin:0 auto;width:100%}
    .ob-step-dots{display:flex;gap:6px;justify-content:center;padding:20px 0 4px}
    .ob-dot{width:6px;height:6px;border-radius:3px;background:rgba(255,255,255,0.15);transition:all .3s}
    .ob-dot.active{width:20px;background:var(--accent)}
    .ob-eyebrow{font-family:var(--display);font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;margin-top:32px}
    .ob-title{font-family:var(--display);font-size:28px;color:var(--text);line-height:1.2;margin-bottom:8px;letter-spacing:0.5px}
    .ob-sub{font-size:14px;color:var(--text-dim);line-height:1.6;margin-bottom:28px}
    .ob-input{width:100%;background:var(--surface);border:1.5px solid var(--border2);border-radius:14px;color:var(--text);font-size:18px;padding:18px 20px;outline:none;font-family:var(--serif);margin-bottom:24px;box-sizing:border-box}
    .ob-input:focus{border-color:var(--accent)}
    .ob-input::placeholder{color:var(--text-muted)}
    .ob-goal-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:28px}
    .ob-goal-card{background:var(--surface);border:1.5px solid var(--border2);border-radius:14px;padding:18px 14px;cursor:pointer;transition:all .2s;text-align:center}
    .ob-goal-card.active{border-color:var(--accent);background:rgba(154,130,86,0.1)}
    .ob-goal-card.full{grid-column:1/-1}
    .ob-goal-emoji{font-size:26px;margin-bottom:8px}
    .ob-goal-name{font-size:13px;font-weight:700;color:var(--text);margin-bottom:3px}
    .ob-goal-desc{font-size:11px;color:var(--text-dim)}
    .ob-nut-btns{display:flex;gap:8px;margin-bottom:20px}
    .ob-nut-btn{flex:1;padding:14px 8px;border:1.5px solid var(--border2);border-radius:12px;background:transparent;color:var(--text-dim);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .2s;text-align:center}
    .ob-nut-btn.active{border-color:var(--accent);color:var(--accent-b);background:rgba(154,130,86,0.08)}
    .ob-macro-row{display:flex;gap:10px;margin-bottom:20px}
    .ob-macro-card{flex:1;background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:14px 10px;text-align:center}
    .ob-macro-label{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
    .ob-macro-input{width:100%;background:transparent;border:none;color:var(--accent-b);font-family:var(--serif);font-size:22px;font-weight:700;text-align:center;outline:none}
    .ob-btn{display:block;width:100%;padding:18px;border:none;border-radius:14px;background:var(--accent);color:#0a0908;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;margin-top:auto;transition:transform .15s}
    .ob-btn:active{transform:scale(0.98)}
    .ob-welcome{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 32px 60px}
    .ob-welcome-star{font-size:48px;color:var(--accent);margin-bottom:20px;line-height:1}
    .ob-welcome-title{font-family:var(--display);font-size:38px;color:var(--text);margin-bottom:14px;letter-spacing:2px}
    .ob-welcome-sub{font-size:15px;color:var(--text-dim);line-height:1.7;margin-bottom:48px;max-width:300px}
    .ob-welcome-btn{padding:18px 48px;border:none;border-radius:14px;background:var(--accent);color:#0a0908;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer}
  `;
  document.head.appendChild(s);
}

function renderOnboarding(step) {
  let overlay = document.getElementById('ob-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ob-overlay';
    document.body.appendChild(overlay);
  }

  // Step 0: welcome splash
  if (step === 0) {
    overlay.innerHTML = `
      <div class="ob-welcome">
        <div class="ob-welcome-star"><img src="icon-192.png" alt="Arete" style="width:72px;height:72px;border-radius:16px"></div>
        <div class="ob-welcome-title">Arete</div>
        <div class="ob-welcome-sub">The pursuit of excellence in mind, body, and spirit.</div>
        <button class="ob-welcome-btn" onclick="renderOnboarding(1)">GET STARTED \u2192</button>
      </div>`;
    return;
  }

  const dots = [1,2,3,4,5].map(i => `<div class="ob-dot${i===step?' active':''}" ></div>`).join('');
  let content = '';

  if (step === 1) {
    content = `
      <div class="ob-eyebrow">Step 1 of 5</div>
      <div class="ob-title">What is your name?</div>
      <div class="ob-sub">Knowing yourself is the beginning of all wisdom.</div>
      <input class="ob-input" type="text" id="ob-name-input" placeholder="Your first name" maxlength="30" value="${esc(_obName)}" oninput="_obName=this.value.trim()">`;

  } else if (step === 2) {
    content = `
      <div class="ob-eyebrow">Step 2 of 5</div>
      <div class="ob-title">Choose your avatar</div>
      <div class="ob-sub">This shapes your character's appearance. You can always change it later.</div>
      <div class="ob-gender-row">
        <div class="ob-gender-card${_obGender==='male'?' active':''}" onclick="_obGender='male';renderOnboarding(2)">
          <div style="width:60px;height:94px;margin:0 auto 8px">${buildAvatarSVG(1)}</div>
          <div style="font-size:13px;color:var(--text)">Male</div>
        </div>
        <div class="ob-gender-card${_obGender==='female'?' active':''}" onclick="_obGender='female';renderOnboarding(2)">
          <div style="width:60px;height:94px;margin:0 auto 8px">${(()=>{const _tmp=tdeeProfile;tdeeProfile={sex:'female'};const s=buildAvatarSVG(1);tdeeProfile=_tmp;return s;})()}</div>
          <div style="font-size:13px;color:var(--text)">Female</div>
        </div>
      </div>`;

  } else if (step === 3) {
    const goals = [
      {k:'habits', emoji:'\u{1F525}', name:'Forge discipline', desc:'Daily virtues & practice'},
      {k:'fitness', emoji:'\u{1F4AA}', name:'Strengthen the body', desc:'Training & performance'},
      {k:'nutrition', emoji:'\u{1F957}', name:'Master your diet', desc:'Macros & nourishment'},
      {k:'all', emoji:'\u{1F3DB}', name:'Pursue arete', desc:'The complete path to excellence', full:true},
    ];
    const cards = goals.map(g => `
      <div class="ob-goal-card${_obPath===g.k?' active':''} ${g.full?'full':''}" onclick="_obPath='${g.k}';renderOnboarding(3)">
        <div class="ob-goal-emoji">${g.emoji}</div>
        <div class="ob-goal-name">${g.name}</div>
        <div class="ob-goal-desc">${g.desc}</div>
      </div>`).join('');
    content = `
      <div class="ob-eyebrow">Step 3 of 5</div>
      <div class="ob-title">Choose your path.</div>
      <div class="ob-sub">First say to yourself what you would be; and then do what you have to do.</div>
      <div class="ob-goal-grid">${cards}</div>`;

  } else if (step === 4) {
    const programs = [
      { id: 'ppl', name: 'Push / Pull / Legs', desc: '6-day rotation. High volume.', emoji: '🏋️' },
      { id: 'ul', name: 'Upper / Lower', desc: '4-day split. Strength focus.', emoji: '💪' },
      { id: 'fb', name: 'Full Body', desc: '3-day rotation. Efficient.', emoji: '⚡' },
      { id: 'athlete', name: 'Soccer Athlete', desc: 'Built for sport performance.', emoji: '⚽' },
    ];
    const progCards = programs.map(p => `
      <div class="ob-goal-card${_obProgram===p.id?' active':''}" onclick="_obProgram='${p.id}';renderOnboarding(4)">
        <div class="ob-goal-emoji">${p.emoji}</div>
        <div class="ob-goal-name">${p.name}</div>
        <div class="ob-goal-desc">${p.desc}</div>
      </div>`).join('');
    content = `
      <div class="ob-eyebrow">Step 4 of 5</div>
      <div class="ob-title">Pick your program.</div>
      <div class="ob-sub">Choose a training split. You can switch anytime or build your own later.</div>
      <div class="ob-goal-grid">${progCards}</div>`;

  } else if (step === 5) {
    const nuts = [['cut','Cut','Lose fat'],['maintain','Maintain','Stay lean'],['bulk','Bulk','Build muscle']];
    const nutBtns = nuts.map(([k,l,s]) =>
      `<button class="ob-nut-btn${_obGoalType===k?' active':''}" onclick="_obGoalType='${k}';_obCalories=${k==='cut'?2000:k==='bulk'?3000:2500};_obProtein=${k==='cut'?160:k==='bulk'?200:180};renderOnboarding(5)">${l}<br><span style="font-weight:400;font-size:10px;text-transform:none">${s}</span></button>`
    ).join('');
    content = `
      <div class="ob-eyebrow">Step 5 of 5</div>
      <div class="ob-title">Set your measures.</div>
      <div class="ob-sub">Without measure, even the finest things become excess. Set your daily targets.</div>
      <div class="ob-nut-btns">${nutBtns}</div>
      <div class="ob-macro-row">
        <div class="ob-macro-card"><div class="ob-macro-label">Calories</div><input class="ob-macro-input" type="number" id="ob-cal" value="${_obCalories}" onchange="_obCalories=+this.value"></div>
        <div class="ob-macro-card"><div class="ob-macro-label">Protein (g)</div><input class="ob-macro-input" type="number" id="ob-pro" value="${_obProtein}" onchange="_obProtein=+this.value"></div>
      </div>`;
  }

  const isLast = step === 5;
  overlay.innerHTML = `
    <div class="ob-wrap">
      <div class="ob-step-dots">${dots}</div>
      ${content}
      <button class="ob-btn" onclick="obNext(${step})">${isLast ? 'START MY JOURNEY \u2192' : 'CONTINUE \u2192'}</button>
      <div style="text-align:center;margin-top:14px">
        <span onclick="obSkip()" style="font-size:12px;color:var(--text-muted);cursor:pointer">Skip setup \u2014 I'll do this later</span>
      </div>
    </div>`;
}

function obNext(step) {
  if (step === 1) {
    // Save name
    const n = _obName || (document.getElementById('ob-name-input')?.value?.trim() || '');
    if (n) { _obName = n; localStorage.setItem('hvi_user_name', n); }
  }
  if (step === 2) {
    // Save gender to tdee profile
    if (!tdeeProfile) tdeeProfile = {};
    tdeeProfile.sex = _obGender;
    LS.set('hvi_tdee_profile', tdeeProfile);
  }
  if (step === 3) {
    // Keep the chosen path — the question used to have no effect at all
    try {
      if (typeof meta === 'object' && meta) { meta.path = _obPath; LS.set('hvi_meta', meta); }
    } catch {}
  }
  if (step === 4) {
    // Save workout program selection
    workoutMeta.activeProgram = _obProgram;
    workoutMeta.currentDayIndex = 0;
    LS.set('hvi_workout_meta', workoutMeta);
  }
  if (step < 5) { renderOnboarding(step + 1); return; }
  obFinish();
}

function obFinish() {
  // Save name
  if (_obName) localStorage.setItem('hvi_user_name', _obName);

  // Save nutrition goals (only for cut/maintain/bulk selections)
  const nutritionGoalType = ['cut','maintain','bulk'].includes(_obGoalType) ? _obGoalType : 'maintain';
  const cal = _obCalories;
  const pro = _obProtein;
  const carbs = Math.round((cal - pro * 4 - 70 * 9) / 4);
  dietMeta.dailyGoals = { calories: cal, protein: pro, carbs: Math.max(50, carbs), fat: 70 };
  dietMeta.goalType = nutritionGoalType;
  LS.set('hvi_diet_meta', dietMeta);

  // Mark onboarded
  LS.set('hvi_onboarded', true);
  // Report the answers so it's visible what new users actually come for
  if (typeof track === 'function') {
    track('onboarding_complete', { path: _obPath, program: _obProgram, nutrition: nutritionGoalType });
  }

  // Remove overlay
  const overlay = document.getElementById('ob-overlay');
  if (overlay) {
    overlay.style.transition = 'opacity .4s';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 400);
  }

  launchConfetti(0.4);
  go('home', {}, false);

  // An invite link is deferred until here, so someone arriving from a shared
  // group link actually lands on the invite instead of a generic home screen.
  const invited = _hasPendingJoin();
  if (invited && typeof _handlePendingJoin === 'function') _handlePendingJoin();

  // Show feature tour after a short delay — but not on top of an invite
  if (!invited) setTimeout(() => showFeatureTour(), 1200);
}

function _hasPendingJoin() {
  try { return !!localStorage.getItem('hvi_pending_join'); } catch { return false; }
}

function obSkip() {
  LS.set('hvi_onboarded', true);
  const overlay = document.getElementById('ob-overlay');
  if (overlay) overlay.remove();
  go('home', {}, false);
  if (_hasPendingJoin() && typeof _handlePendingJoin === 'function') _handlePendingJoin();
}

// ── FEATURE TOUR (shown once after onboarding) ─────────────────────────
function showFeatureTour() {
  if (LS.get('hvi_tour_done', false)) return;
  const steps = [
    { icon: '✅', title: 'Track your habits', desc: 'Tap the Habits tab to add daily habits. Check them off each day to build streaks.', tab: 'habits' },
    { icon: '🏋️', title: 'Log your workouts', desc: 'Hit the Workout tab to start your training program. The app tracks your weights and flags PRs.', tab: 'workout' },
    { icon: '🥗', title: 'Track what you eat', desc: 'Go to Diet to log meals. Describe food in plain English or snap a photo. The AI calculates macros.', tab: 'diet' },
    { icon: '🤖', title: 'Ask the AI Coach', desc: 'Tap the chat bubble in the bottom right corner anytime. It knows your data and gives personalized advice.', tab: null },
  ];
  let step = 0;

  function render() {
    const s = steps[step];
    let overlay = document.getElementById('tour-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'tour-overlay';
      overlay.className = 'tour-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="tour-card">
        <div class="tour-step">${step + 1} of ${steps.length}</div>
        <div class="tour-icon">${s.icon}</div>
        <div class="tour-title">${s.title}</div>
        <div class="tour-desc">${s.desc}</div>
        <div class="tour-btns">
          <button class="tour-skip" onclick="dismissTour()">Skip tour</button>
          <button class="tour-next" onclick="nextTourStep()">${step === steps.length - 1 ? 'Got it!' : 'Next →'}</button>
        </div>
      </div>`;
  }

  window._tourStep = step;
  window._tourSteps = steps;
  window._tourRender = render;
  render();
}

function nextTourStep() {
  window._tourStep++;
  if (window._tourStep >= window._tourSteps.length) {
    dismissTour();
    return;
  }
  const s = window._tourSteps[window._tourStep];
  if (s.tab) go(s.tab, {}, false);
  window._tourRender();
}

function dismissTour() {
  LS.set('hvi_tour_done', true);
  const overlay = document.getElementById('tour-overlay');
  if (overlay) {
    overlay.style.transition = 'opacity .3s';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 300);
  }
  go('home', {}, false);
  // Ask for notifications after tour
  if (!settings.notifications && 'Notification' in window && Notification.permission === 'default') {
    setTimeout(() => requestNotifications(), 1000);
  }
}

// WEEKLY RECAP CARD
// ══════════════════════════════════════════════════════════════════════════
function generateRecapCard() {
  const W = 390, H = 680;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2; canvas.height = H * 2; // retina
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = '#0a0908';
  ctx.fillRect(0, 0, W, H);

  // Vignette
  const grad = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.75);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, 'rgba(60,20,5,0.6)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Gold accent line top
  ctx.fillStyle = '#9a8256';
  ctx.fillRect(28, 52, 40, 2);

  // Week range
  const now = new Date();
  const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  ctx.fillStyle = 'rgba(228,218,206,0.45)';
  ctx.font = '11px -apple-system,sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText(`${fmt(mon).toUpperCase()} – ${fmt(sun).toUpperCase()}`, 28, 44);

  // Title
  ctx.fillStyle = '#e4dace';
  ctx.font = 'italic 600 52px "Georgia",serif';
  ctx.fillText('Weekly', 28, 110);
  ctx.fillStyle = '#b89d68';
  ctx.fillText('Recap.', 28, 165);

  // Stats
  ensureWeeklyStats();
  const ws = gamification.weeklyStats;
  const { done, total } = totalPct();
  const best = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const lvl = getLevel(gamification.xp || 0);

  const stats = [
    { label: 'WORKOUTS', value: ws.workoutDays.length + '/7' },
    { label: 'JOURNALED', value: ws.journalDays.length + '/7' },
    { label: 'BEST STREAK', value: best + 'd' },
    { label: 'LEVEL', value: 'LVL ' + lvl },
  ];

  const cardW = 156, cardH = 90, cardGap = 14;
  const startX = 28, startY = 210;

  stats.forEach((st, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = startX + col * (cardW + cardGap);
    const y = startY + row * (cardH + cardGap);
    // Card bg
    ctx.fillStyle = '#141210';
    roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.stroke();
    // Value
    ctx.fillStyle = '#b89d68';
    ctx.font = '700 28px "Georgia",serif';
    ctx.fillText(st.value, x + 14, y + 40);
    // Label
    ctx.fillStyle = 'rgba(228,218,206,0.4)';
    ctx.font = '500 10px -apple-system,sans-serif';
    ctx.fillText(st.label, x + 14, y + 62);
  });

  // Habit progress bar
  const barY = 440, barX = 28, barW2 = W - 56;
  ctx.fillStyle = 'rgba(228,218,206,0.4)';
  ctx.font = '500 10px -apple-system,sans-serif';
  ctx.fillText('HABITS COMPLETED TODAY', barX, barY - 8);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  roundRect(ctx, barX, barY, barW2, 6, 3);
  ctx.fill();
  if (total > 0) {
    ctx.fillStyle = '#9a8256';
    roundRect(ctx, barX, barY, (done/total) * barW2, 6, 3);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(228,218,206,0.5)';
  ctx.font = '500 12px -apple-system,sans-serif';
  ctx.fillText(`${done} / ${total}`, barX, barY + 22);

  // XP
  const xp = gamification.xp || 0;
  ctx.fillStyle = '#9a8256';
  ctx.font = '700 14px -apple-system,sans-serif';
  ctx.fillText(`+${xp.toLocaleString()} XP EARNED`, barX, barY + 50);

  // Quote
  const q = QUOTES[(meta.quoteIndex || 0) % QUOTES.length];
  ctx.fillStyle = 'rgba(184,157,104,0.6)';
  ctx.font = 'italic 700 28px "Georgia",serif';
  ctx.fillText('“', barX, barY + 100);
  ctx.fillStyle = 'rgba(228,218,206,0.75)';
  ctx.font = 'italic 13px "Georgia",serif';
  wrapText(ctx, q.text.slice(0, 80) + (q.text.length > 80 ? '…' : ''), barX + 20, barY + 115, barW2 - 20, 18);
  ctx.fillStyle = 'rgba(228,218,206,0.4)';
  ctx.font = '11px -apple-system,sans-serif';
  ctx.fillText('— ' + q.author, barX + 20, barY + 165);

  // Branding + watermark
  ctx.fillStyle = 'rgba(228,218,206,0.2)';
  ctx.font = '700 11px -apple-system,sans-serif';
  ctx.fillText('ARETE', barX, H - 28);
  ctx.fillStyle = 'rgba(184,157,104,0.35)';
  ctx.font = '500 10px -apple-system,sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('get-arete.com', W - 28, H - 28);
  ctx.textAlign = 'left';

  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineH;
    } else { line = test; }
  }
  if (line) ctx.fillText(line, x, y);
}

function checkWeeklyRecap() {
  const dow = new Date().getDay(); // 0=Sun, 1=Mon
  const hour = new Date().getHours();
  // Show on Monday, or Sunday after 4pm
  if (dow !== 1 && !(dow === 0 && hour >= 16)) return;
  const recapKey = 'hvi_last_recap_week';
  const weekId = getWeekKey();
  if (LS.get(recapKey, '') === weekId) return; // already shown this week
  LS.set(recapKey, weekId);
  showWeeklyRecap();
}

function showWeeklyRecap() {
  ensureWeeklyStats();
  const ws = gamification.weeklyStats;
  const best = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const lvl = getLevel(gamification.xp || 0);
  const weekAvgCal = computeWeeklyAvgCalories(mealLog);
  const xp = gamification.xp || 0;

  // Sleep average
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  let sleepT = 0, sleepC = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    const k = dateKey(d);
    if (k > today()) break;
    const s = sleepLog[k];
    if (s && s.hours) { sleepT += s.hours; sleepC++; }
  }
  const avgSlp = sleepC ? (sleepT / sleepC).toFixed(1) : null;

  // Steps average
  const sLog = JSON.parse(localStorage.getItem('hvi_steps_log') || '{}');
  let stpT = 0, stpC = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    const k = dateKey(d);
    if (k > today()) break;
    if (sLog[k]) { stpT += sLog[k]; stpC++; }
  }
  const avgStp = stpC ? Math.round(stpT / stpC) : null;

  const _recapCell = (val, lbl) => `<div style="background:var(--surface);border-radius:14px;padding:14px">
    <div style="font-family:var(--serif);font-size:26px;color:var(--accent-b)">${val}</div>
    <div style="font-size:10px;color:var(--text-muted);letter-spacing:1px">${lbl}</div>
  </div>`;

  const modal = document.createElement('div');
  modal.id = 'weekly-recap-modal';
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:4000;display:flex;align-items:center;justify-content:center;padding:24px" onclick="this.remove()">
      <div style="background:var(--bg);border:1px solid var(--border2);border-radius:24px;padding:32px 24px;max-width:360px;width:100%;text-align:center" onclick="event.stopPropagation()">
        <div style="font-size:11px;color:var(--accent);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Weekly Recap</div>
        <div style="font-family:var(--serif);font-size:28px;color:var(--text);margin-bottom:4px">Great week!</div>
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:24px">Here's how you showed up.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
          ${_recapCell(ws.workoutDays.length, 'WORKOUTS')}
          ${_recapCell(best + 'd', 'BEST STREAK')}
          ${_recapCell(ws.journalDays.length, 'JOURNALED')}
          ${_recapCell(weekAvgCal !== null ? weekAvgCal.toLocaleString() : '—', 'AVG CAL')}
          ${avgSlp ? _recapCell(avgSlp + 'h', 'AVG SLEEP') : ''}
          ${avgStp ? _recapCell(avgStp.toLocaleString(), 'AVG STEPS') : ''}
        </div>
        <div style="font-size:13px;color:var(--accent);font-weight:600;margin-bottom:20px">Level ${lvl} · ${xp.toLocaleString()} XP</div>
        <div style="display:flex;gap:10px">
          <button class="w-action-btn" style="flex:1;margin:0" onclick="this.closest('#weekly-recap-modal').remove()">Dismiss</button>
          <button class="w-action-btn" style="flex:1;margin:0;background:var(--accent);color:#fff" onclick="this.closest('#weekly-recap-modal').remove();shareRecap()">Share</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function generateDailyCard() {
  const W = 390, H = 500;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2; canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = '#0a0908';
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createRadialGradient(W/2, H/2, H*0.15, W/2, H/2, H*0.7);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, 'rgba(60,20,5,0.6)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Date
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
  ctx.fillStyle = 'rgba(228,218,206,0.4)';
  ctx.font = '600 10px -apple-system,sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText(dateStr, 28, 44);

  // Gold line
  ctx.fillStyle = '#9a8256';
  ctx.fillRect(28, 52, 40, 2);

  // Title
  ctx.fillStyle = '#e4dace';
  ctx.font = 'italic 600 44px "Georgia",serif';
  ctx.fillText("Today's", 28, 100);
  ctx.fillStyle = '#b89d68';
  ctx.fillText('Progress.', 28, 148);

  // Stats
  const {done, total} = totalPct();
  const pct = total > 0 ? Math.round((done/total)*100) : 0;
  const best = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const todayMacros = getDayMacros();
  const todayWorkout = trainedOnDay(today());
  const lvl = getLevel(gamification.xp || 0);

  const stats = [
    { label: 'HABITS', value: `${done}/${total}` },
    { label: 'COMPLETION', value: `${pct}%` },
    { label: 'BEST STREAK', value: `${best}d` },
    { label: 'CALORIES', value: todayMacros.cal.toLocaleString() },
  ];

  const cardW = 156, cardH = 80, cardGap = 14;
  stats.forEach((st, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 28 + col * (cardW + cardGap);
    const y = 190 + row * (cardH + cardGap);
    ctx.fillStyle = '#141210';
    roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.stroke();
    ctx.fillStyle = '#b89d68';
    ctx.font = '700 26px "Georgia",serif';
    ctx.fillText(st.value, x + 14, y + 36);
    ctx.fillStyle = 'rgba(228,218,206,0.4)';
    ctx.font = '500 10px -apple-system,sans-serif';
    ctx.fillText(st.label, x + 14, y + 56);
  });

  // Workout status
  const workoutText = todayWorkout ? '✓ Workout completed' : '— No workout today';
  ctx.fillStyle = todayWorkout ? '#9a8256' : 'rgba(228,218,206,0.35)';
  ctx.font = '600 13px -apple-system,sans-serif';
  ctx.fillText(workoutText, 28, 400);

  // Level
  ctx.fillStyle = '#b89d68';
  ctx.font = '700 13px -apple-system,sans-serif';
  ctx.fillText(`Level ${lvl} · ${getLevelTitle(lvl)}`, 28, 425);

  // Branding + URL
  ctx.fillStyle = 'rgba(228,218,206,0.2)';
  ctx.font = '700 11px -apple-system,sans-serif';
  ctx.fillText('ARETE', 28, H - 28);
  ctx.fillStyle = 'rgba(184,157,104,0.35)';
  ctx.font = '500 10px -apple-system,sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('get-arete.com', W - 28, H - 28);
  ctx.textAlign = 'left';

  return canvas;
}

function shareDailyCard() {
  const canvas = generateDailyCard();
  canvas.toBlob(async blob => {
    const file = new File([blob], 'arete-today.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Today's Arete Progress" }); return; } catch {}
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'arete-today.png';
    a.click();
  }, 'image/png');
}

function shareRecap() {
  if (typeof track === 'function') track('share_recap', { method: navigator.canShare ? 'native' : 'download' });
  const canvas = generateRecapCard();
  canvas.toBlob(async blob => {
    const file = new File([blob], 'arete-recap.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'My Arete Weekly Recap' }); return; } catch {}
    }
    // Fallback: download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'arete-recap.png';
    a.click();
  }, 'image/png');
}


// ══════════════════════════════════════════════════════════════════════════
// HABIT HEATMAP
// ══════════════════════════════════════════════════════════════════════════
function buildHeatmapHTML() {
  const days = 91; // ~13 weeks
  const cells = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = d.toLocaleDateString('en-CA');
    const count = habits.filter(h => log[h.id]?.lastCompletedDate === k || (k === today() && log[h.id]?.completedToday)).length;
    const total = habits.length || 1;
    const pct = count / total;
    const lvl = pct === 0 ? 0 : pct < 0.25 ? 1 : pct < 0.5 ? 2 : pct < 0.75 ? 3 : 4;
    cells.push(`<div class="hm-heatcell hm-heat-${lvl}" title="${k}: ${count}/${habits.length}"></div>`);
  }
  return `<div class="hm-heatmap">
    <div class="hm-heat-label">Less</div>
    <div class="hm-heat-grid">${cells.join('')}</div>
    <div class="hm-heat-label">More</div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════════
// STREAK SHIELDS
// ══════════════════════════════════════════════════════════════════════════
function getStreakShields() {
  return gamification.streakShields || 0;
}
function useStreakShield(habitId) {
  if (getStreakShields() <= 0) return;
  gamification.streakShields = (gamification.streakShields || 0) - 1;
  // Restore the streak by re-setting lastCompletedDate to yesterday
  if (log[habitId]) {
    log[habitId].lastCompletedDate = yesterday();
    // Don't increment streak, just preserve it
  }
  LS.set('hvi_gamification', gamification);
  LS.set('hvi_log', log);
}
// Award a streak shield each Sunday (checked in checkReset)
function maybeAwardStreakShield() {
  const dow = new Date().getDay(); // 0 = Sunday
  if (dow === 0 && gamification._lastShieldWeek !== getWeekKey()) {
    gamification.streakShields = Math.min((gamification.streakShields || 0) + 1, 3); // Max 3
    gamification._lastShieldWeek = getWeekKey();
    LS.set('hvi_gamification', gamification);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// EXPORT DATA
// ══════════════════════════════════════════════════════════════════════════
function exportAllData() {
  const data = {};
  const keys = ['hvi_habits','hvi_log','hvi_journal3','hvi_meta','hvi_workout_log','hvi_workout_meta',
    'hvi_meal_log','hvi_diet_meta','hvi_weight_log','hvi_prs','hvi_gamification','hvi_achievements',
    'hvi_tdee_profile','hvi_custom_programs','hvi_sleep_log','hvi_cal_tasks','hvi_settings'];
  keys.forEach(k => { try { data[k] = JSON.parse(localStorage.getItem(k)); } catch {} });
  data.hvi_user_name = localStorage.getItem('hvi_user_name');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `arete-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      Object.keys(data).forEach(k => {
        if (k === 'hvi_user_name') localStorage.setItem(k, data[k] || '');
        else localStorage.setItem(k, JSON.stringify(data[k]));
      });
      alert('Data imported! Reloading...');
      window.location.reload();
    } catch (err) { alert('Invalid backup file.'); }
  };
  reader.readAsText(file);
}

// ══════════════════════════════════════════════════════════════════════════
// DARK/LIGHT THEME
// ══════════════════════════════════════════════════════════════════════════
function toggleTheme() {
  const cur = settings.theme || 'dark';
  settings.theme = cur === 'dark' ? 'light' : 'dark';
  LS.set('hvi_settings', settings);
  applyTheme();
}
function applyTheme() {
  const theme = (settings || {}).theme || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

// ══════════════════════════════════════════════════════════════════════════
// PROGRESS PHOTOS
// ══════════════════════════════════════════════════════════════════════════

function getProgressPhotos() { return LS.get('hvi_progress_photos', []); }

function renderProgressPhotos() {
  const photos = getProgressPhotos();
  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('stats')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Progress Photos</div><div class="page-sub">Track your visual transformation over time.</div></div>
    <div style="padding:0 24px">
      <label class="w-action-btn" style="display:block;text-align:center;cursor:pointer;margin-bottom:20px">
        ${icon('camera')} Take / Upload Photo
        <input type="file" accept="image/*" capture="environment" style="display:none" onchange="handleProgressPhoto(this)">
      </label>
      ${photos.length === 0 ? `<div class="empty-state"><div class="empty-icon">📷</div><div class="empty-txt">No progress photos yet.<br>Take your first photo to start tracking your transformation.</div></div>` : ''}
      ${photos.length >= 2 ? `<button class="w-action-btn" style="margin-bottom:16px;width:100%" onclick="showPhotoCompare()">↔ Compare Photos</button>` : ''}
      <div class="progress-photo-grid">
        ${photos.map((p, i) => `
          <div class="progress-photo-card" onclick="viewProgressPhoto(${i})">
            <img src="${p.thumb}" class="progress-photo-img">
            <div class="progress-photo-date">${new Date(p.date).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}</div>
            ${p.note ? `<div class="progress-photo-note">${esc(p.note)}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
}

function handleProgressPhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    // Resize to thumbnail (max 600px wide) to save localStorage space
    const img = new Image();
    img.onload = function() {
      const maxW = 600, maxH = 800;
      let w = img.width, h = img.height;
      if (w > maxW) { h = h * maxW / w; w = maxW; }
      if (h > maxH) { w = w * maxH / h; h = maxH; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const thumb = canvas.toDataURL('image/jpeg', 0.7);
      // Ask for optional note
      const note = prompt('Add a note (optional):', '') || '';
      const photos = getProgressPhotos();
      photos.unshift({ date: new Date().toISOString(), thumb, note });
      // Keep max 30 photos to avoid localStorage overflow
      if (photos.length > 30) photos.pop();
      LS.set('hvi_progress_photos', photos);
      renderProgressPhotos();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function viewProgressPhoto(i) {
  const photos = getProgressPhotos();
  const p = photos[i];
  if (!p) return;
  let modal = document.getElementById('photo-view-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'photo-view-modal'; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:5000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px" onclick="this.parentElement.style.display='none'">
      <img src="${p.thumb}" style="max-width:90%;max-height:70vh;border-radius:12px;object-fit:contain">
      <div style="color:#fff;margin-top:12px;font-size:14px">${new Date(p.date).toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'})}</div>
      ${p.note ? `<div style="color:var(--text-dim);margin-top:4px;font-size:13px">${esc(p.note)}</div>` : ''}
      <button style="margin-top:16px;background:var(--fat);color:#fff;border:none;padding:8px 20px;border-radius:8px;font-size:12px;cursor:pointer" onclick="event.stopPropagation();deleteProgressPhoto(${i})">Delete Photo</button>
    </div>`;
  modal.style.display = 'block';
}

function deleteProgressPhoto(i) {
  if (!confirm('Delete this progress photo?')) return;
  const photos = getProgressPhotos();
  photos.splice(i, 1);
  LS.set('hvi_progress_photos', photos);
  document.getElementById('photo-view-modal').style.display = 'none';
  renderProgressPhotos();
}

function showPhotoCompare() {
  const photos = getProgressPhotos();
  if (photos.length < 2) return;
  const first = photos[photos.length - 1]; // oldest
  const last = photos[0]; // newest
  let modal = document.getElementById('photo-compare-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'photo-compare-modal'; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:5000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px" onclick="this.parentElement.style.display='none'">
      <div style="color:var(--text);font-size:16px;font-weight:600;margin-bottom:16px">Your Transformation</div>
      <div style="display:flex;gap:12px;max-width:100%;overflow:hidden">
        <div style="flex:1;text-align:center">
          <img src="${first.thumb}" style="max-width:100%;max-height:50vh;border-radius:10px;object-fit:contain">
          <div style="color:var(--text-dim);font-size:11px;margin-top:6px">${new Date(first.date).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</div>
        </div>
        <div style="flex:1;text-align:center">
          <img src="${last.thumb}" style="max-width:100%;max-height:50vh;border-radius:10px;object-fit:contain">
          <div style="color:var(--text-dim);font-size:11px;margin-top:6px">${new Date(last.date).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</div>
        </div>
      </div>
      <div style="color:var(--text-muted);font-size:12px;margin-top:12px">Tap anywhere to close</div>
    </div>`;
  modal.style.display = 'block';
}

// ══════════════════════════════════════════════════════════════════════════
// MY WHY + GOALS
// ══════════════════════════════════════════════════════════════════════════

// ── MY WHY (home card + editor) ─────────────────────────────────────────────
function whyCardHTML() {
  const why = LS.get('hvi_why', '');
  const goals = LS.get('hvi_goals', []);
  const active = goals.filter(g => !g.done).length;
  const goalsLabel = goals.length ? `${active} active goal${active === 1 ? '' : 's'}` : 'Set your goals';
  const goalsLink = `<div class="why-goals-link" onclick="event.stopPropagation();go('goals')">${icon('flag', 14)} ${goalsLabel} ›</div>`;
  if (!why) {
    return `<div class="why-card ani">
      <div onclick="editWhy()" role="button" tabindex="0" style="cursor:pointer">
        <div class="why-eyebrow">Your Why</div>
        <div class="why-empty-text">Define the one reason you get up and grind. Tap to set it.</div>
      </div>
      ${goalsLink}
    </div>`;
  }
  return `<div class="why-card ani">
    <div onclick="editWhy()" role="button" tabindex="0" style="cursor:pointer">
      <div class="why-eyebrow">Your Why <span class="why-edit-hint">✎</span></div>
      <div class="why-quote">${esc(why)}</div>
    </div>
    ${goalsLink}
  </div>`;
}

function editWhy() {
  const cur = LS.get('hvi_why', '');
  let modal = document.getElementById('why-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'why-modal'; document.body.appendChild(modal); }
  modal.className = 'why-modal-overlay';
  modal.innerHTML = `
    <div class="why-modal-backdrop" onclick="closeWhyModal()"></div>
    <div class="why-modal-sheet">
      <div class="why-modal-title">Your Why</div>
      <div class="why-modal-sub">The one reason you get up and grind. Make it real. You'll see it every day.</div>
      <textarea class="why-modal-input" id="why-input" rows="4" maxlength="280" placeholder="e.g. To become the man my younger self needed, and the one my future family deserves.">${esc(cur)}</textarea>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="w-action-btn" style="flex:1;margin:0" onclick="closeWhyModal()">Cancel</button>
        <button class="w-action-btn" style="flex:1;margin:0;background:var(--accent);color:#1a1209" onclick="saveWhy()">Save</button>
      </div>
    </div>`;
  modal.style.display = 'block';
  setTimeout(() => { const i = document.getElementById('why-input'); if (i) i.focus(); }, 150);
}

function closeWhyModal() {
  const m = document.getElementById('why-modal');
  if (m) m.style.display = 'none';
}

function saveWhy() {
  const v = (document.getElementById('why-input')?.value || '').trim();
  LS.set('hvi_why', v);
  closeWhyModal();
  if (curView === 'home') go('home', {}, false);
  else if (curView === 'goals') renderGoals();
}

// ── GOALS (full page CRUD) ──────────────────────────────────────────────────
function renderGoals() {
  const goals = LS.get('hvi_goals', []);
  const why = LS.get('hvi_why', '');
  const active = goals.filter(g => !g.done);
  const done = goals.filter(g => g.done);

  const goalRow = g => {
    const dateTxt = g.target ? `<span class="goal-target">by ${fmtDate(g.target)}</span>` : '';
    return `<div class="goal-item${g.done ? ' goal-done' : ''}">
      <div class="goal-check" onclick="toggleGoal('${g.id}')" role="checkbox" aria-checked="${!!g.done}">${g.done ? '✓' : ''}</div>
      <div class="goal-body">
        <div class="goal-text">${esc(g.text)}</div>
        ${dateTxt}
      </div>
      <button class="goal-del" onclick="deleteGoal('${g.id}')" aria-label="Delete goal">&times;</button>
    </div>`;
  };

  const activeHTML = active.length ? active.map(goalRow).join('')
    : '<div class="goal-empty">No active goals yet. What are you aiming at?</div>';
  const doneHTML = done.length ? `<div class="sec-lbl" style="padding-top:20px">Achieved · ${done.length}</div>${done.map(goalRow).join('')}` : '';

  const whyBanner = why
    ? `<div class="goals-why" onclick="editWhy()"><div class="why-eyebrow">Your Why</div><div class="why-quote" style="font-size:16px">${esc(why)}</div></div>`
    : `<div class="goals-why goals-why-empty" onclick="editWhy()"><div class="why-eyebrow">Your Why</div><div class="why-empty-text">Tap to define the reason behind these goals.</div></div>`;

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('stats')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Goals</div><div class="page-sub">Aim at what matters. Then close the gap daily.</div></div>
    ${whyBanner}
    <div class="goal-add ani">
      <input class="d-input" id="goal-input" type="text" maxlength="120" placeholder="Add a goal…" onkeydown="if(event.key==='Enter')addGoal()">
      <input class="d-input goal-date" id="goal-date" type="date" title="Optional target date">
      <button class="goal-add-btn" onclick="addGoal()">Add</button>
    </div>
    <div class="ani">${activeHTML}</div>
    ${doneHTML}`;
}

function addGoal() {
  const inp = document.getElementById('goal-input');
  const text = (inp?.value || '').trim();
  if (!text) return;
  const target = document.getElementById('goal-date')?.value || '';
  const goals = LS.get('hvi_goals', []);
  const id = 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  goals.push({ id, text, target, done: false, created: today() });
  LS.set('hvi_goals', goals);
  if (typeof track === 'function') track('goal_added', {});
  renderGoals();
}

function toggleGoal(id) {
  const goals = LS.get('hvi_goals', []);
  const g = goals.find(x => x.id === id);
  if (!g) return;
  g.done = !g.done;
  g.completedDate = g.done ? today() : '';
  LS.set('hvi_goals', goals);
  if (g.done) { if (typeof playSound === 'function') playSound('check'); if (typeof launchConfetti === 'function') launchConfetti(0.4); }
  renderGoals();
}

function deleteGoal(id) {
  const goals = LS.get('hvi_goals', []);
  const g = goals.find(x => x.id === id);
  if (g && !confirm(`Delete goal "${g.text}"?`)) return;
  LS.set('hvi_goals', goals.filter(x => x.id !== id));
  renderGoals();
}
