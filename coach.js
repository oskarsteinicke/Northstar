// ══════════════════════════════════════════════════════════════════════════
// Arete — AI Coach Module
// ══════════════════════════════════════════════════════════════════════════

let _coachHistory = [];   // [{role:'user'|'assistant', content:'...'}]
let _coachBusy = false;

function _loadCoachHistory() {
  try { _coachHistory = JSON.parse(localStorage.getItem('hvi_coach_history') || '[]'); } catch { _coachHistory = []; }
}
function _saveCoachHistory() {
  // Keep last 40 messages (20 exchanges)
  if (_coachHistory.length > 40) _coachHistory = _coachHistory.slice(-40);
  localStorage.setItem('hvi_coach_history', JSON.stringify(_coachHistory));
}

function buildCoachSystemPrompt() {
  const name = userName() || 'there';
  const d = today();

  // Habits — log is keyed by habit ID, not date
  const todayDone = habits.filter(h => log[h.id]?.completedToday).length;
  const totalH = habits.length;
  const pct = totalH ? Math.round(todayDone / totalH * 100) : 0;

  // Weekly average from habit history
  const hist = LS.get('hvi_habit_history', {});
  const weekDays = [...Array(7)].map((_, i) => {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    return dateKey(dt);
  });
  const weekTotal = weekDays.reduce((s, dd) => {
    if (dd === d) return s + todayDone;
    return s + Object.values(hist).filter(arr => arr.includes(dd)).length;
  }, 0);
  const weekAvg = totalH ? Math.round(weekTotal / 7 / totalH * 100) : 0;

  // Workout
  const progName = (workoutMeta?.activeProgram
    ? (allPrograms().find(p => p.id === workoutMeta.activeProgram)?.name || workoutMeta.activeProgram)
    : null) || 'None';
  // Same trap: an auto-created empty entry would tell the coach a workout was
  // logged, so it congratulated people on sessions they had not done.
  const todayWorkout = (typeof trainedOnDay === 'function' && trainedOnDay(d)) ? 'Logged' : 'Not logged yet';

  // Diet (training-adjusted targets so coach references what the user sees)
  const dm = getDayMacros();
  const goals = (typeof getTodaysMacroTargets === 'function') ? getTodaysMacroTargets() : (dietMeta?.dailyGoals || {});

  // Weight — weightLog is date-keyed object
  const wtDates = Object.keys(weightLog || {}).sort().reverse();
  const latestWtDate = wtDates[0];
  const latestWt = latestWtDate ? weightLog[latestWtDate] : null;

  // Gamification
  const g = gamification || {};
  const lvl = getLevel(g.xp || 0);
  const maxStreak = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));

  // Last journal
  const jKeys = Object.keys(journal || {}).sort().reverse();
  const lastJ = jKeys[0] ? journal[jKeys[0]] : null;

  // Why + active goals (connected context)
  const _why = LS.get('hvi_why', '');
  const _activeGoals = (LS.get('hvi_goals', []) || []).filter(g => !g.done);

  // Current habits list
  const habitsList = habits.map(h => `  - "${h.name}" (${h.category})${log[h.id]?.completedToday ? ' ✓' : ''} | streak: ${log[h.id]?.streak || 0}d`).join('\n');

  // Available programs
  const progList = allPrograms().map(p => `  - ${p.name} (${p.days.length}-day)`).join('\n');

  return `You are Arete Coach — ${name}'s personal guide inside the Arete app. You blend Stoic philosophy with modern performance science. Be direct, warm, and practical — like a mentor who genuinely knows them.

TODAY: ${d}

USER PROFILE:
Name: ${name}
Level ${lvl} (${getLevelTitle(lvl)}) | ${g.xp || 0} XP | Best streak: ${maxStreak}d
${_why ? `\nWHY THEY GRIND: "${_why}"` : ''}${_activeGoals.length ? `\nACTIVE GOALS:\n${_activeGoals.map(gg => `  - ${gg.text}${gg.target ? ` (target ${gg.target})` : ''}`).join('\n')}` : ''}

HABITS TODAY: ${todayDone}/${totalH} completed (${pct}%) | 7-day avg: ${weekAvg}%
${habitsList}

WORKOUT: Program — ${progName} | Today — ${todayWorkout}
${(() => {
  const r = typeof getRecoveryStatus === 'function' ? getRecoveryStatus() : null;
  if (!r) return '';
  const recentDates = Object.keys(workoutLog || {}).sort().reverse().slice(0, 7);
  const recent = recentDates.map(d => {
    const w = workoutLog[d];
    const vol = w?.exercises ? w.exercises.reduce((s, ex) => s + (ex.sets || []).reduce((ss, set) => ss + (!set.warmup && set.kg && set.reps ? set.kg * set.reps : 0), 0), 0) : 0;
    const dur = w?.duration ? `${w.duration}min` : '';
    return `  ${d}: ${w?.dayName || 'Unknown'} ${dur ? '(' + dur + ')' : ''} | ${vol.toLocaleString()} kg volume`;
  }).join('\n');
  return `Recovery: ${r.label} — ${r.days} sessions in 7 days, ${r.consecutive} consecutive
Recent workouts:
${recent || '  (none)'}`;
})()}
Available programs:
${progList}

NUTRITION TODAY:${goals.adjusted ? ` (targets adjusted — ${typeof macroAdjustReason === 'function' ? macroAdjustReason() : goals.type})` : ''}
  Calories  ${dm.cal} / ${goals.calories || '—'} target
  Protein   ${dm.p}g / ${goals.protein || '—'}g target
  Carbs     ${dm.c}g / ${goals.carbs || '—'}g target
  Fat       ${dm.f}g / ${goals.fat || '—'}g target
${latestWt ? `  Weight: ${latestWt} kg (${latestWtDate})` : '  Weight: not logged'}

SLEEP:
${(() => {
  const sl = typeof sleepLog !== 'undefined' ? sleepLog : {};
  const slDates = Object.keys(sl).sort().reverse().slice(0, 5);
  if (!slDates.length) return '  No sleep data logged';
  return slDates.map(d => `  ${d}: ${sl[d].hours || '?'}h | quality ${sl[d].quality || '?'}/5`).join('\n');
})()}
${lastJ ? `\nLAST JOURNAL (${jKeys[0]}):
  Win: ${lastJ.win || '—'}
  Struggle: ${lastJ.struggle || '—'}
  Focus: ${lastJ.focus || '—'}` : ''}

RULES:
- ONLY reference data shown above — never invent context about the user
- Never show internal IDs, codes, or technical data to the user — use habit names and plain language only
- If you don't know something, ask
- Reference their actual numbers to make advice feel personal
- When it's relevant and natural, connect advice back to their Why and active goals
- Be honest about gaps but solution-focused
- Keep replies under 150 words unless asked for detail
- When they share a win, celebrate it genuinely before coaching

APP ACTIONS:
You can make changes to the user's app by embedding action tags in your response. Place them at the END of your message, after your coaching text. The user will see a confirmation of each change.

Available actions (use exact format, one per line):

1. Set macro targets:
   [[ACTION:set_macros:{"calories":2500,"protein":180,"carbs":280,"fat":80}]]
   - Only include the fields you want to change (e.g. just protein)

2. Add a new habit:
   [[ACTION:add_habit:{"name":"Drink 3L water","category":"health"}]]
   - Valid categories: mindset, discipline, fitness, health, learning, social, financial

3. Remove a habit (use the habit id from the list above):
   [[ACTION:remove_habit:{"id":"h07"}]]

4. Switch workout program (use program id from list above):
   [[ACTION:switch_program:{"id":"ppl"}]]

5. Set workout day index (0-based):
   [[ACTION:set_workout_day:{"dayIndex":2}]]

IMPORTANT action rules:
- ALWAYS explain what you're changing and why BEFORE the action tags
- ONLY use actions when the user explicitly asks you to make a change, or clearly agrees to a suggestion you made
- NEVER silently change things — always tell the user what you're doing
- If unsure, ASK first rather than making the change
- You can use multiple actions in one response`;
}


function _coachBubbleHTML(role, text) {
  // Simple markdown-lite: **bold**, *italic*, bullet lines
  const safe = esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-•]\s+/gm, '• ')
    .replace(/\n/g, '<br>');
  return `<div class="coach-bubble ${role}">${safe}</div>`;
}

function _renderCoachMsgs() {
  const el = document.getElementById('coach-msgs');
  if (!el) return;

  if (!_coachHistory.length) {
    const name = userName();
    el.innerHTML = `
      <div class="coach-welcome">
        <div class="coach-welcome-star"><img src="icon-192.png" alt="Arete" style="width:52px;height:52px;border-radius:12px"></div>
        <h3>Welcome${name ? ', ' + name : ''}.</h3>
        <p>I am your Arete Coach — a guide in the Stoic tradition. Ask me about your habits, training, nutrition, or mindset. I can see your real data and will speak plainly.</p>
      </div>`;
    return;
  }

  el.innerHTML = _coachHistory.map(m => {
      if (m.role === 'system' && m.content.startsWith('[[ACTIONS]]')) {
        try { return _coachActionBubbleHTML(JSON.parse(m.content.slice(11))); } catch { return ''; }
      }
      return _coachBubbleHTML(m.role === 'user' ? 'user' : 'coach', m.content);
    }).join('');
  el.scrollTop = el.scrollHeight;
}

function openCoach() {
  // Paywall: AI coach is Premium-only for free (post-trial) users
  if (typeof isPremium === 'function' && !isPremium()) {
    if (typeof showUpgradeModal === 'function') showUpgradeModal('coach');
    return;
  }
  _loadCoachHistory();
  const overlay = document.getElementById('coach-overlay');
  const fab = document.getElementById('coach-fab');
  if (overlay) overlay.classList.remove('coach-hidden');
  if (fab) fab.classList.add('coach-hidden');
  _renderCoachMsgs();
  setTimeout(() => {
    const input = document.getElementById('coach-input');
    if (input) input.focus();
  }, 200);
}

function closeCoach() {
  const overlay = document.getElementById('coach-overlay');
  const fab = document.getElementById('coach-fab');
  if (overlay) overlay.classList.add('coach-hidden');
  if (fab) fab.classList.remove('coach-hidden');
}

function clearCoachHistory() {
  if (_coachHistory.length > 0 && !confirm('Clear conversation history?')) return;
  _coachHistory = [];
  localStorage.removeItem('hvi_coach_history');
  _renderCoachMsgs();
}

// ── Coach Action System ────────────────────────────────────────────────────
function _parseCoachActions(text) {
  const actions = [];
  const re = /\[\[ACTION:(\w+):(.*?)\]\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      actions.push({ type: m[1], payload: JSON.parse(m[2]), raw: m[0] });
    } catch (e) { /* skip malformed */ }
  }
  return actions;
}

function _stripActionTags(text) {
  return text.replace(/\[\[ACTION:\w+:.*?\]\]\s*/g, '').trim();
}

function _executeCoachAction(action) {
  const p = action.payload;
  switch (action.type) {

    case 'set_macros': {
      const g = dietMeta.dailyGoals;
      const changes = [];
      if (p.calories !== undefined) { g.calories = Math.round(p.calories); changes.push(`Calories → ${g.calories}`); }
      if (p.protein !== undefined)  { g.protein  = Math.round(p.protein);  changes.push(`Protein → ${g.protein}g`);  }
      if (p.carbs !== undefined)    { g.carbs    = Math.round(p.carbs);    changes.push(`Carbs → ${g.carbs}g`);    }
      if (p.fat !== undefined)      { g.fat      = Math.round(p.fat);      changes.push(`Fat → ${g.fat}g`);      }
      LS.set('hvi_diet_meta', dietMeta);
      return changes.length ? `Updated macro targets: ${changes.join(', ')}` : null;
    }

    case 'add_habit': {
      if (!p.name) return null;
      const validCats = ['mindset','discipline','fitness','health','learning','social','financial'];
      const cat = validCats.includes(p.category) ? p.category : 'discipline';
      const id = 'cu_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      habits.push({ id, name: p.name, category: cat });
      log[id] = { streak: 0, lastCompletedDate: '', completedToday: false };
      LS.set('hvi_habits', habits);
      LS.set('hvi_log', log);
      return `Added habit: "${p.name}" (${cat})`;
    }

    case 'remove_habit': {
      if (!p.id) return null;
      const h = habits.find(x => x.id === p.id);
      if (!h) return `Habit "${p.id}" not found`;
      habits = habits.filter(x => x.id !== p.id);
      delete log[p.id];
      LS.set('hvi_habits', habits);
      LS.set('hvi_log', log);
      return `Removed habit: "${h.name}"`;
    }

    case 'switch_program': {
      if (!p.id) return null;
      const prog = findProgram(p.id);
      if (!prog) return `Program "${p.id}" not found`;
      workoutMeta.activeProgram = p.id;
      workoutMeta.currentDayIndex = 0;
      LS.set('hvi_workout_meta', workoutMeta);
      return `Switched to program: ${prog.name}`;
    }

    case 'set_workout_day': {
      if (p.dayIndex === undefined) return null;
      const prog = findProgram(workoutMeta.activeProgram);
      if (!prog) return null;
      const idx = Math.max(0, Math.min(p.dayIndex, prog.days.length - 1));
      workoutMeta.currentDayIndex = idx;
      delete workoutLog[today()];
      LS.set('hvi_workout_meta', workoutMeta);
      LS.set('hvi_workout_log', workoutLog);
      return `Set workout to Day ${idx + 1}: ${prog.days[idx].name}`;
    }

    default: return null;
  }
}

function _coachActionBubbleHTML(results) {
  const items = results.map(r => `<div class="coach-action-item">‣ ${esc(r)}</div>`).join('');
  return `<div class="coach-bubble coach-action">${items}</div>`;
}

async function sendCoachMsg() {
  if (_coachBusy) return;
  const input = document.getElementById('coach-input');
  const sendBtn = document.getElementById('coach-send-btn');
  const msgsEl = document.getElementById('coach-msgs');
  if (!input || !msgsEl) return;

  const text = input.value.trim();
  if (text && typeof track === 'function') track('coach_message');
  if (!text) return;

  // Add user message
  _coachHistory.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = 'auto';
  _renderCoachMsgs();

  // Typing indicator
  _coachBusy = true;
  if (sendBtn) sendBtn.disabled = true;
  const typing = document.createElement('div');
  typing.className = 'coach-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  msgsEl.appendChild(typing);
  msgsEl.scrollTop = msgsEl.scrollHeight;

  try {
    const text = await _aiFetch([
      { role: 'system', content: buildCoachSystemPrompt() },
      ..._coachHistory,
    ]);

    typing.remove();

    {
      // Parse and execute any action tags
      const actions = _parseCoachActions(text);
      const cleanText = _stripActionTags(text);
      _coachHistory.push({ role: 'assistant', content: cleanText });
      if (actions.length) {
        const results = actions.map(a => _executeCoachAction(a)).filter(Boolean);
        if (results.length) {
          _coachHistory.push({ role: 'system', content: '[[ACTIONS]]' + JSON.stringify(results) });
        }
        // Re-render current view if changes were made
        if (typeof go === 'function' && curView) {
          setTimeout(() => go(curView, {}, false), 300);
        }
      }
    }

    _saveCoachHistory();
    _renderCoachMsgs();
  } catch (err) {
    typing.remove();
    if (err.message === 'offline') {
      _coachHistory.push({ role: 'assistant', content: 'You\'re offline right now. I need an internet connection to respond. Try again when you\'re back online!' });
    } else if (err.name === 'AbortError') {
      _coachHistory.push({ role: 'assistant', content: 'That took too long — the AI service timed out. Please try again.' });
    } else {
      _coachHistory.push({ role: 'assistant', content: 'AI service is temporarily unavailable. This usually resolves within a few minutes — try again shortly.' });
    }
    _renderCoachMsgs();
  } finally {
    _coachBusy = false;
    if (sendBtn) sendBtn.disabled = false;
    const inp = document.getElementById('coach-input');
    if (inp) inp.focus();
  }
}
