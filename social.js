// ══════════════════════════════════════════════════════════════════════════
// Arete — Social Module (Library, Sleep, Calendar)
// ══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════
// RENDER: LIBRARY (Books + Journal)
// ══════════════════════════════════════════════════════════════════════════
function renderLibrary() {
  const tabs = `<div class="lib-tabs"><button class="lib-tab${libTab==='books'?' active':''}" onclick="libTab='books';renderLibrary()">Books</button><button class="lib-tab${libTab==='journal'?' active':''}" onclick="libTab='journal';renderLibrary()">Journal</button></div>`;

  if (libTab === 'journal') {
    renderLibraryJournal(tabs);
  } else {
    renderLibraryBooks(tabs);
  }
}

function renderLibraryBooks(tabs) {
  const groups = PILLARS.map(p => {
    const pBooks = BOOKS.filter(b => b.pillar === p.id);
    if (!pBooks.length) return '';
    return `<div class="sec-lbl" style="padding-top:16px">${p.name}</div>` +
      pBooks.map(b => `<div class="book-card${b.url?' book-card-link':''}" ${b.url?`onclick="window.open('${b.url}','_blank')"`:''}>
        <div class="book-title"><span class="book-pillar-dot"></span>${esc(b.title)}</div>
        <div class="book-author">${esc(b.author)}</div>
        <div class="book-desc">${esc(b.desc)}</div>
        ${b.url ? '<div class="book-link-hint">View on Goodreads →</div>' : ''}
      </div>`).join('');
  }).join('');

  document.getElementById('view').innerHTML = `
    <div class="page-head ani"><div class="page-title">Library</div><div class="page-sub">Curated reading for growth.</div></div>
    ${tabs}<div class="ani">${groups}</div>`;
}

let _journalSearch = '';
let _journalEditing = false;

const _DEFAULT_JOURNAL_QS = [
  { key: 'wins', label: 'Wins Today', placeholder: 'What went well?' },
  { key: 'lessons', label: 'Lessons Learned', placeholder: 'What did you learn?' },
  { key: 'intentions', label: 'Intentions for Tomorrow', placeholder: 'What will you focus on?' },
];

function _getJournalQs() { return settings.journalQuestions || _DEFAULT_JOURNAL_QS; }

function renderLibraryJournal(tabs) {
  const t = today();
  const e = journal[t] || {};
  const qs = _getJournalQs();

  const fieldsHTML = qs.map(q =>
    `<div class="j-lbl">${esc(q.label)}</div><textarea class="j-ta" id="j-${q.key}" placeholder="${esc(q.placeholder)}" rows="3">${esc(e[q.key]||'')}</textarea>`
  ).join('');

  let pastDates = Object.keys(journal).filter(d => d !== t && Object.values(journal[d]).some(Boolean)).sort().reverse();
  if (_journalSearch) {
    const sq = _journalSearch.toLowerCase();
    pastDates = pastDates.filter(d => Object.values(journal[d]).join(' ').toLowerCase().includes(sq));
  }
  pastDates = pastDates.slice(0, 30);
  const pastHTML = pastDates.length ? pastDates.map(d => {
    const je = journal[d]; let parts = '';
    qs.forEach(q => { if (je[q.key]) parts += `<div class="jp-field">${esc(q.label)}</div><div class="jp-text">${esc(je[q.key])}</div>`; });
    Object.keys(je).forEach(k => { if (!qs.find(q => q.key === k) && je[k]) parts += `<div class="jp-field">${esc(k)}</div><div class="jp-text">${esc(je[k])}</div>`; });
    return `<div class="jp-item"><div class="jp-date">${fmtDate(d)}</div>${parts}</div>`;
  }).join('') : '<div class="empty-state" style="padding:16px 0"><div class="empty-state-icon">📝</div><div class="empty-state-title">No past entries</div><div class="empty-state-sub">Write your first journal entry above to start reflecting.</div></div>';

  document.getElementById('view').innerHTML = `
    <div class="jh ani"><div class="jh-title">Library</div><div class="jh-sub">Reflect on your day. Recalibrate for tomorrow.</div></div>
    ${tabs}
    <div class="j-body ani">
      <div style="display:flex;justify-content:flex-end;margin-bottom:4px">
        <button class="j-edit-btn" onclick="_journalEditing=!_journalEditing;renderLibrary()" title="Edit questions">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span style="margin-left:4px">${_journalEditing ? 'Done' : 'Edit questions'}</span>
        </button>
      </div>
      ${_journalEditing ? _renderJournalEditor(qs) : fieldsHTML}
      ${_journalEditing ? '' : '<div class="j-status" id="j-status">Auto-saving</div>'}
      <button class="j-tog" onclick="togglePast()">Past Entries</button>
      <div class="j-past" id="j-past">
        <input class="search-input" type="text" placeholder="Search entries…" value="${esc(_journalSearch)}" oninput="_journalSearch=this.value;renderLibrary()" style="margin-bottom:12px">
        ${pastHTML}
      </div>
    </div>`;

  if (!_journalEditing) {
    qs.forEach(q => {
      const el = document.getElementById('j-' + q.key);
      if (el) el.addEventListener('input', () => {
        clearTimeout(jDebounce);
        const s = document.getElementById('j-status');
        if (s) { s.textContent = 'Saving…'; s.classList.remove('saved'); }
        jDebounce = setTimeout(saveJournal, 800);
      });
    });
  }
}

function _renderJournalEditor(qs) {
  const rows = qs.map((q, i) => `
    <div class="jq-edit-row">
      <div class="jq-edit-fields">
        <input class="jq-edit-input" placeholder="Label (e.g. Gratitude)" value="${esc(q.label)}" data-field="label" data-idx="${i}">
        <input class="jq-edit-input jq-edit-ph" placeholder="Placeholder text" value="${esc(q.placeholder)}" data-field="placeholder" data-idx="${i}">
      </div>
      <button class="jq-edit-del" onclick="_removeJournalQ(${i})" title="Remove">×</button>
    </div>
  `).join('');

  return `
    <div class="jq-editor">
      <div class="jq-edit-list">${rows}</div>
      <button class="jq-add-btn" onclick="_addJournalQ()">+ Add question</button>
      <button class="jq-reset-btn" onclick="_resetJournalQs()">Reset to defaults</button>
    </div>
  `;
}

function _addJournalQ() {
  const qs = _getJournalQs().slice();
  qs.push({ key: 'q' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), label: 'New Question', placeholder: 'Your answer...' });
  settings.journalQuestions = qs;
  LS.set('hvi_settings', settings);
  renderLibrary();
}

function _removeJournalQ(idx) {
  const qs = _getJournalQs().slice();
  if (qs.length <= 1) return;
  qs.splice(idx, 1);
  settings.journalQuestions = qs;
  LS.set('hvi_settings', settings);
  renderLibrary();
}

function _resetJournalQs() {
  delete settings.journalQuestions;
  LS.set('hvi_settings', settings);
  _journalEditing = false;
  renderLibrary();
}

function _saveJournalQEdits() {
  const rows = document.querySelectorAll('.jq-edit-row');
  if (!rows.length) return;
  const qs = _getJournalQs().slice();
  rows.forEach((row, i) => {
    if (!qs[i]) return;
    const labelEl = row.querySelector('[data-field="label"]');
    const phEl = row.querySelector('[data-field="placeholder"]');
    if (labelEl) qs[i].label = labelEl.value.trim() || qs[i].label;
    if (phEl) qs[i].placeholder = phEl.value.trim() || qs[i].placeholder;
  });
  settings.journalQuestions = qs;
  LS.set('hvi_settings', settings);
}

document.addEventListener('input', e => {
  if (e.target.classList.contains('jq-edit-input')) {
    clearTimeout(jDebounce);
    jDebounce = setTimeout(_saveJournalQEdits, 500);
  }
});


function saveJournal() {
  const t = today();
  const qs = _getJournalQs();
  const entry = {};
  qs.forEach(q => { entry[q.key] = (document.getElementById('j-' + q.key)?.value || '').trim(); });
  // Preserve any fields from other question sets
  if (journal[t]) Object.keys(journal[t]).forEach(k => { if (!(k in entry)) entry[k] = journal[t][k]; });
  journal[t] = entry;
  LS.set('hvi_journal3', journal);
  if (typeof track === 'function') track('journal_save', { word_count: Object.values(entry).join(' ').split(/\s+/).filter(Boolean).length });
  if (gamification.journalXPDate !== t && Object.values(journal[t] || {}).some(Boolean)) {
    gamification.journalXPDate = t;
    LS.set('hvi_gamification', gamification);
    awardXP(20, 'mind');
    trackWeeklyJournal();
    checkDailyQuests();
  }
  const s = document.getElementById('j-status');
  if (s) { s.textContent = 'Saved \u2713'; s.classList.add('saved'); setTimeout(() => { if (s) { s.textContent = 'Auto-saving'; s.classList.remove('saved'); } }, 2000); }
}

function togglePast() {
  const el = document.getElementById('j-past'), btn = document.querySelector('.j-tog');
  if (!el) return;
  el.classList.toggle('open');
  if (btn) btn.textContent = el.classList.contains('open') ? 'Hide Past Entries' : 'Past Entries';
}

// ══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// SLEEP TRACKING
// ══════════════════════════════════════════════════════════════════════════
function renderSleep() {
  const t = today();
  const entry = sleepLog[t] || {};
  const last7 = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = d.toLocaleDateString('en-CA');
    const e = sleepLog[k];
    if (e && e.hours) last7.push(e);
  }
  const avg = last7.length ? (last7.reduce((s,e) => s + e.hours, 0) / last7.length).toFixed(1) : '—';
  const avgQ = last7.length ? (last7.reduce((s,e) => s + (e.quality || 3), 0) / last7.length).toFixed(1) : '—';

  const barHTML = (() => {
    const bars = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = d.toLocaleDateString('en-CA');
      const e = sleepLog[k];
      const h = e?.hours || 0;
      const pct = Math.min(1, h / 10) * 100;
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0,2);
      const col = h >= 7 ? 'var(--accent-b)' : h >= 5 ? 'var(--carb)' : 'var(--fat)';
      bars.push(`<div class="sl-bar-col">
        <div class="sl-bar-val">${h || ''}</div>
        <div class="sl-bar-track"><div class="sl-bar-fill" style="height:${pct}%;background:${col}"></div></div>
        <div class="sl-bar-day">${dayLabel}</div>
      </div>`);
    }
    return bars.join('');
  })();

  const qualOpts = [1,2,3,4,5].map(q =>
    `<button class="sl-q-btn${(entry.quality||0)===q?' active':''}" onclick="setSleepQuality(${q})">${q}</button>`
  ).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('home')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Sleep</div><div class="page-sub">Recovery is where growth happens.</div></div>
    <div class="da-section ani" style="margin:0 24px 16px;padding:20px">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px">Last Night's Sleep</div>
      <div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:16px">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">Hours slept</div>
          <input class="d-input" type="number" min="0" max="16" step="0.5" value="${entry.hours||''}" placeholder="e.g. 7.5" style="margin:0" oninput="saveSleepHours(this.value)">
        </div>
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">Bedtime</div>
          <input class="d-input" type="time" value="${entry.bedtime||''}" style="margin:0" oninput="saveSleepField('bedtime',this.value)">
        </div>
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">Wake time</div>
          <input class="d-input" type="time" value="${entry.wake||''}" style="margin:0" oninput="saveSleepField('wake',this.value)">
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">Sleep quality</div>
      <div class="sl-q-row">${qualOpts}</div>
    </div>
    <div class="da-section ani" style="margin:0 24px 16px;padding:20px">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px">This Week</div>
      <div class="s-grid" style="margin:0 0 16px">
        <div class="s-card"><div class="s-val" style="font-size:22px">${avg}</div><div class="s-lbl">Avg Hours</div></div>
        <div class="s-card"><div class="s-val" style="font-size:22px">${avgQ}</div><div class="s-lbl">Avg Quality</div></div>
      </div>
      <div class="sl-bars">${barHTML}</div>
    </div>`;
}

function saveSleepHours(val) {
  const t = today();
  if (!sleepLog[t]) sleepLog[t] = {};
  sleepLog[t].hours = parseFloat(val) || 0;
  LS.set('hvi_sleep_log', sleepLog);
  if (typeof track === 'function') track('sleep_logged', { hours: sleepLog[t].hours });
}
function setSleepQuality(q) {
  const t = today();
  if (!sleepLog[t]) sleepLog[t] = {};
  sleepLog[t].quality = q;
  LS.set('hvi_sleep_log', sleepLog);
  renderSleep();
}
function saveSleepField(field, val) {
  const t = today();
  if (!sleepLog[t]) sleepLog[t] = {};
  sleepLog[t][field] = val;
  LS.set('hvi_sleep_log', sleepLog);
}

// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// RENDER: CALENDAR
// ══════════════════════════════════════════════════════════════════════════
// ── Calendar task helpers ─────────────────────────────────────────────────
function addCalTask(date, text) {
  text = (text || '').trim();
  if (!text) return;
  if (!calTasks[date]) calTasks[date] = [];
  calTasks[date].push({ id: genId('t'), text, done: false });
  LS.set('hvi_cal_tasks', calTasks);
}
function toggleCalTask(date, id) {
  const t = (calTasks[date] || []).find(t => t.id === id);
  if (t) { t.done = !t.done; LS.set('hvi_cal_tasks', calTasks); }
}
function deleteCalTask(date, id) {
  if (!calTasks[date]) return;
  calTasks[date] = calTasks[date].filter(t => t.id !== id);
  LS.set('hvi_cal_tasks', calTasks);
}
function submitCalTask(date) {
  const inp = document.getElementById('cal-task-inp-' + date);
  if (!inp) return;
  addCalTask(date, inp.value);
  inp.value = '';
  _refreshCalTasks(date);
}
function _onCalTaskKey(e, date) {
  if (e.key === 'Enter') { e.preventDefault(); submitCalTask(date); }
}
function _refreshCalTasks(date) {
  const el = document.getElementById('cal-tasks-' + date);
  if (el) el.innerHTML = _buildTaskListHTML(date);
}
function _toggleCalTaskUI(date, id) {
  toggleCalTask(date, id);
  _refreshCalTasks(date);
  // also refresh dots in monthly/weekly
  const dot = document.getElementById('cal-task-dot-' + date);
  if (dot) { const tasks = calTasks[date] || []; dot.style.display = tasks.length ? '' : 'none'; }
}
function _deleteCalTaskUI(date, id) {
  deleteCalTask(date, id);
  _refreshCalTasks(date);
}

function _buildTaskListHTML(date) {
  const tasks = calTasks[date] || [];
  const rows = tasks.map(t => `
    <div class="cal-task-item">
      <button class="cal-task-cb${t.done ? ' cal-task-cb-done' : ''}"
        onclick="_toggleCalTaskUI('${date}','${t.id}')">✓</button>
      <span class="cal-task-text${t.done ? ' cal-task-text-done' : ''}">${esc(t.text)}</span>
      <button class="cal-task-del" onclick="_deleteCalTaskUI('${date}','${t.id}')">×</button>
    </div>`).join('');
  return rows;
}

function _buildTasksSection(date) {
  return `
    <div class="cal-daily-sec">
      <div class="cal-daily-sec-hdr">📋 Tasks</div>
      <div class="cal-task-list" id="cal-tasks-${date}">${_buildTaskListHTML(date)}</div>
      <div class="cal-task-add">
        <input class="cal-task-input" id="cal-task-inp-${date}" placeholder="Add a task…"
          onkeydown="_onCalTaskKey(event,'${date}')">
        <button class="cal-task-add-btn" onclick="submitCalTask('${date}')">+</button>
      </div>
    </div>`;
}

// ── Calendar navigation ───────────────────────────────────────────────────
function setCalView(v) { calView = v; renderCalendar(); }

function calPrev() {
  const d = new Date(calSelectedDate + 'T00:00:00');
  if (calView === 'daily')        { d.setDate(d.getDate() - 1); }
  else if (calView === 'weekly')  { d.setDate(d.getDate() - 7); }
  else { if (calMonth === 0) { calMonth = 11; calYear--; } else calMonth--; renderCalendar(); return; }
  calSelectedDate = d.toLocaleDateString('en-CA');
  calYear = d.getFullYear(); calMonth = d.getMonth();
  renderCalendar();
}
function calNext() {
  const d = new Date(calSelectedDate + 'T00:00:00');
  if (calView === 'daily')        { d.setDate(d.getDate() + 1); }
  else if (calView === 'weekly')  { d.setDate(d.getDate() + 7); }
  else {
    const now = new Date();
    if (calYear > now.getFullYear() || (calYear === now.getFullYear() && calMonth >= now.getMonth())) return;
    if (calMonth === 11) { calMonth = 0; calYear++; } else calMonth++;
    renderCalendar(); return;
  }
  calSelectedDate = d.toLocaleDateString('en-CA');
  calYear = d.getFullYear(); calMonth = d.getMonth();
  renderCalendar();
}
// Legacy aliases kept for any inline calls
function calPrevMonth() { calPrev(); }
function calNextMonth() { calNext(); }

function calSelectDate(date) {
  calSelectedDate = date;
  if (calView === 'monthly') {
    const el = document.getElementById('cal-detail');
    if (el) {
      el.innerHTML = buildCalDayDetail(date);
      document.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('cal-selected'));
      const sel = document.querySelector(`.cal-cell[data-date="${date}"]`);
      if (sel) sel.classList.add('cal-selected');
    }
  } else if (calView === 'weekly') {
    const el = document.getElementById('cal-detail');
    if (el) {
      el.innerHTML = buildCalDayDetail(date);
      document.querySelectorAll('.cal-wcol').forEach(c => c.classList.remove('cal-wcol-sel'));
      const sel = document.querySelector(`.cal-wcol[data-date="${date}"]`);
      if (sel) sel.classList.add('cal-wcol-sel');
    }
  }
}

function buildCalDayDetail(date) {
  if (!date) return '';
  const d = new Date(date + 'T00:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const isToday = date === today();
  const isFuture = date > today();

  // ── Tasks ──
  const tasksHTML = _buildTasksSection(date);

  if (isFuture) {
    return `<div class="cal-detail-hdr">${label}</div>${tasksHTML}`;
  }

  // ── Habits ──
  const doneHabits = isToday
    ? habits.filter(h => log[h.id]?.completedToday)
    : habits.filter(h => log[h.id]?.lastCompletedDate === date);
  const totalHabits = habits.length;
  let habitHTML = '';
  if (totalHabits) {
    const pct = Math.round(doneHabits.length / totalHabits * 100);
    const rows = doneHabits.map(h => `<div class="cal-di">✓ <span>${esc(h.name)}</span></div>`).join('');
    const missed = habits.filter(h => !doneHabits.includes(h));
    const missedRows = missed.map(h => `<div class="cal-di" style="opacity:.4">○ <span>${esc(h.name)}</span></div>`).join('');
    habitHTML = `<div class="cal-daily-sec-hdr">✅ Habits <span style="font-size:11px;font-weight:400;color:var(--accent-b)">${doneHabits.length}/${totalHabits} · ${pct}%</span></div>${rows}${missedRows}`;
  }

  // ── Workout ──
  const wl = workoutLog[date];
  const workoutDone = wl?.exercises?.some(e => e.sets?.some(s => s.completed));
  let workoutHTML = '';
  if (workoutDone) {
    const prog = findProgram(wl.programId);
    const day = prog?.days[wl.dayIndex % prog.days.length];
    const exDone = wl.exercises.filter(e => e.sets.some(s => s.completed));
    const exRows = exDone.map(e => {
      const ex = lookupExercise(e.exerciseId);
      const sets = e.sets.filter(s => s.completed);
      const best = sets.length ? Math.max(...sets.map(s => s.weight)) : 0;
      return `<div class="cal-di-sub">${esc(ex?.name || 'Exercise')} — ${sets.length} sets${best ? ' · best ' + best + wtUnit() : ''}</div>`;
    }).join('');
    workoutHTML = `<div class="cal-daily-sec-hdr">💪 Workout</div>
      <div class="cal-di">🏋️ <span>${day ? day.name + ' · ' + prog.name : 'Workout logged'}</span></div>${exRows}`;
  }

  // ── Meals ──
  const meals = mealLog[date]?.meals || [];
  let mealsHTML = '';
  if (meals.length) {
    const totalCal = meals.reduce((s, m) => s + m.items.reduce((a, i) => a + (i.calories || 0), 0), 0);
    const totalP   = meals.reduce((s, m) => s + m.items.reduce((a, i) => a + (i.protein  || 0), 0), 0);
    const rows = meals.map(m => {
      const cal = m.items.reduce((s, i) => s + (i.calories || 0), 0);
      const p   = m.items.reduce((s, i) => s + (i.protein  || 0), 0);
      return `<div class="cal-di">🍽 <span>${esc(m.name)} — ${cal} cal · ${p}g P</span></div>`;
    }).join('');
    mealsHTML = `<div class="cal-daily-sec-hdr">🍽 Meals <span style="font-size:11px;font-weight:400;color:var(--accent-b)">${totalCal} cal · ${totalP}g P</span></div>${rows}`;
  }

  // ── Weight ──
  const w = weightLog[date];
  const weightHTML = w ? `<div class="cal-daily-sec-hdr">⚖️ Weight</div><div class="cal-di">⚖️ <span>${w} ${wtUnit()}</span></div>` : '';

  // ── Journal ──
  const je = journal[date] || {};
  const hasJournal = Object.values(je).some(Boolean);
  let journalHTML = '';
  if (hasJournal) {
    const parts = [
      je.wins    && `<div class="cal-di-sub">Wins: ${esc(je.wins.slice(0,100))}${je.wins.length>100?'…':''}</div>`,
      je.lessons && `<div class="cal-di-sub">Lessons: ${esc(je.lessons.slice(0,100))}${je.lessons.length>100?'…':''}</div>`
    ].filter(Boolean).join('');
    journalHTML = `<div class="cal-daily-sec-hdr">📖 Journal</div><div class="cal-di">📖 <span>Entry</span></div>${parts}`;
  }

  const nothingLogged = !doneHabits.length && !workoutDone && !meals.length && !w && !hasJournal;
  const nothingMsg = nothingLogged ? '<div class="cal-di-empty">Nothing logged this day.</div>' : '';

  return `<div class="cal-detail-hdr">${label}</div>
    ${tasksHTML}${nothingMsg}${habitHTML}${workoutHTML}${mealsHTML}${weightHTML}${journalHTML}`;
}

// ── Dot builder (shared) ─────────────────────────────────────────────────
function _calDots(date) {
  const t = today();
  const isFuture = date > t;
  const isToday = date === t;
  const hasTasks = (calTasks[date] || []).length > 0;
  if (isFuture) return hasTasks ? `<span class="cal-dot" style="background:#f472b6"></span>` : '';
  const hasWorkout = workoutLog[date]?.exercises?.some(e => e.sets?.some(s => s.completed));
  const hasMeal    = (mealLog[date]?.meals || []).length > 0;
  const hasJournal = Object.values(journal[date] || {}).some(Boolean);
  const hasWeight  = !!weightLog[date];
  const habitsDone = isToday
    ? habits.filter(h => log[h.id]?.completedToday).length
    : habits.filter(h => log[h.id]?.lastCompletedDate === date).length;
  const habitPct = habits.length ? habitsDone / habits.length : 0;
  return [
    hasTasks    ? `<span class="cal-dot" style="background:#f472b6"></span>` : '',
    habitsDone > 0 ? `<span class="cal-dot" style="background:${habitPct >= 1 ? 'var(--accent-b)' : 'var(--accent)'}"></span>` : '',
    hasWorkout  ? `<span class="cal-dot" style="background:#5b9cf6"></span>` : '',
    hasMeal     ? `<span class="cal-dot" style="background:#4ade80"></span>` : '',
    hasJournal  ? `<span class="cal-dot" style="background:#a78bfa"></span>` : '',
    hasWeight   ? `<span class="cal-dot" style="background:#fb923c"></span>` : '',
  ].filter(Boolean).join('');
}

function _calViewToggle() {
  return `<div class="cal-view-seg ani">
    <button class="cal-vbtn${calView==='monthly'?' cal-vbtn-active':''}" onclick="setCalView('monthly')">Month</button>
    <button class="cal-vbtn${calView==='weekly'?' cal-vbtn-active':''}" onclick="setCalView('weekly')">Week</button>
    <button class="cal-vbtn${calView==='daily'?' cal-vbtn-active':''}" onclick="setCalView('daily')">Day</button>
  </div>`;
}

function _calLegend() {
  return `<div class="cal-legend ani">
    <span class="cal-leg"><span class="cal-dot" style="background:#f472b6"></span> Tasks</span>
    <span class="cal-leg"><span class="cal-dot" style="background:var(--accent)"></span> Habits</span>
    <span class="cal-leg"><span class="cal-dot" style="background:#5b9cf6"></span> Workout</span>
    <span class="cal-leg"><span class="cal-dot" style="background:#4ade80"></span> Meals</span>
    <span class="cal-leg"><span class="cal-dot" style="background:#a78bfa"></span> Journal</span>
  </div>`;
}

function renderCalMonthly() {
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
    const isToday  = date === t;
    const isSel    = date === calSelectedDate;
    cells += `<div class="cal-cell${isToday?' cal-today':''}${isSel?' cal-selected':''}${isFuture?' cal-future':''}" data-date="${date}" onclick="calSelectDate('${date}')">
      <div class="cal-num">${day}</div>
      <div class="cal-dots">${_calDots(date)}</div>
    </div>`;
  }

  document.getElementById('view').innerHTML = `
    <div class="cal-hdr ani">
      <button class="cal-nav-btn" onclick="calPrev()">‹</button>
      <div class="cal-month-label">${monthLabel}</div>
      <button class="cal-nav-btn${isCurrentMonth?' cal-nav-disabled':''}" onclick="calNext()">›</button>
    </div>
    ${_calViewToggle()}
    ${_calLegend()}
    <div class="cal-dow-row">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}</div>
    <div class="cal-grid ani">${cells}</div>
    <div class="cal-detail ani" id="cal-detail">${buildCalDayDetail(calSelectedDate)}</div>`;
}

function renderCalWeekly() {
  if (!calSelectedDate) calSelectedDate = today();
  const sel = new Date(calSelectedDate + 'T00:00:00');
  // find Monday of this week
  const dow = sel.getDay(); // 0=Sun
  const monday = new Date(sel);
  monday.setDate(sel.getDate() - (dow === 0 ? 6 : dow - 1));
  const t = today();
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let cols = '';
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const date = d.toLocaleDateString('en-CA');
    days.push(date);
    const isFuture = date > t;
    const isToday  = date === t;
    const isSel    = date === calSelectedDate;
    cols += `<div class="cal-wcol${isSel?' cal-wcol-sel':''}${isFuture?' cal-wfuture':''}" data-date="${date}" onclick="calSelectDate('${date}')">
      <div class="cal-wday">${dayNames[i]}</div>
      <div class="cal-wnum${isToday?' cal-wnum-today':''}">${d.getDate()}</div>
      <div class="cal-dots" style="margin-top:4px">${_calDots(date)}</div>
    </div>`;
  }
  // week label
  const startLabel = new Date(monday).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endDay = new Date(monday); endDay.setDate(monday.getDate() + 6);
  const endLabel = endDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  document.getElementById('view').innerHTML = `
    <div class="cal-hdr ani">
      <button class="cal-nav-btn" onclick="calPrev()">‹</button>
      <div class="cal-month-label">${startLabel} – ${endLabel}</div>
      <button class="cal-nav-btn" onclick="calNext()">›</button>
    </div>
    ${_calViewToggle()}
    ${_calLegend()}
    <div class="cal-week-cols ani">${cols}</div>
    <div class="cal-detail ani" id="cal-detail">${buildCalDayDetail(calSelectedDate)}</div>`;
}

function renderCalDaily() {
  if (!calSelectedDate) calSelectedDate = today();
  const d = new Date(calSelectedDate + 'T00:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  document.getElementById('view').innerHTML = `
    <div class="cal-hdr ani">
      <button class="cal-nav-btn" onclick="calPrev()">‹</button>
      <div class="cal-month-label" style="font-size:15px">${label}</div>
      <button class="cal-nav-btn" onclick="calNext()">›</button>
    </div>
    ${_calViewToggle()}
    <div class="cal-daily-wrap ani">${_buildDailyBody(calSelectedDate)}</div>`;
}

function _buildDailyBody(date) {
  const t = today();
  const isToday  = date === t;
  const isFuture = date > t;

  // ── Tasks ──
  const tasksHTML = _buildTasksSection(date);

  if (isFuture) {
    // Future: show planned workout + tasks only
    const prog = findProgram(workoutMeta.activeProgram);
    let plannedHTML = '';
    if (prog) {
      // figure out which day index this date would be
      const dayIndex = workoutMeta.currentDayIndex % prog.days.length;
      const day = prog.days[dayIndex];
      plannedHTML = `<div class="cal-daily-sec-hdr">💪 Planned Workout</div>
        <div class="cal-di">📅 <span>${day.name} · ${prog.name}</span></div>
        ${(day.exercises || []).map(eid => {
          const ex = lookupExercise(eid);
          return ex ? `<div class="cal-di-sub">• ${esc(ex.name)}</div>` : '';
        }).join('')}`;
    }
    return `<div class="cal-daily-sec">${tasksHTML}</div>${plannedHTML ? `<div class="cal-daily-sec">${plannedHTML}</div>` : ''}`;
  }

  // ── Habits ──
  const doneHabits = isToday
    ? habits.filter(h => log[h.id]?.completedToday)
    : habits.filter(h => log[h.id]?.lastCompletedDate === date);
  const totalHabits = habits.length;
  let habitHTML = '';
  if (totalHabits) {
    const pct = Math.round(doneHabits.length / totalHabits * 100);
    const doneRows  = doneHabits.map(h => `<div class="cal-di">✓ <span>${esc(h.name)}</span></div>`).join('');
    const missedRows = habits.filter(h => !doneHabits.includes(h))
      .map(h => `<div class="cal-di" style="opacity:.4">○ <span>${esc(h.name)}</span></div>`).join('');
    habitHTML = `<div class="cal-daily-sec">
      <div class="cal-daily-sec-hdr">✅ Habits <span style="font-size:11px;font-weight:400;color:var(--accent-b)">${doneHabits.length}/${totalHabits} · ${pct}%</span></div>
      ${doneRows}${missedRows}
    </div>`;
  }

  // ── Workout ──
  const wl = workoutLog[date];
  const workoutDone = wl?.exercises?.some(e => e.sets?.some(s => s.completed));
  let workoutHTML = '';
  if (workoutDone) {
    const prog = findProgram(wl.programId);
    const day  = prog?.days[wl.dayIndex % prog.days.length];
    const exDone = wl.exercises.filter(e => e.sets.some(s => s.completed));
    const exRows = exDone.map(e => {
      const ex = lookupExercise(e.exerciseId);
      const sets = e.sets.filter(s => s.completed);
      const best = sets.length ? Math.max(...sets.map(s => s.weight)) : 0;
      return `<div class="cal-di-sub">• ${esc(ex?.name || 'Exercise')} — ${sets.length} sets${best ? ' · best ' + best + wtUnit() : ''}</div>`;
    }).join('');
    workoutHTML = `<div class="cal-daily-sec">
      <div class="cal-daily-sec-hdr">💪 Workout</div>
      <div class="cal-di">🏋️ <span>${day ? day.name + ' · ' + prog.name : 'Workout logged'}</span></div>${exRows}
    </div>`;
  }

  // ── Meals ──
  const meals = mealLog[date]?.meals || [];
  let mealsHTML = '';
  if (meals.length) {
    const totalCal = meals.reduce((s, m) => s + m.items.reduce((a, i) => a + (i.calories || 0), 0), 0);
    const totalP   = meals.reduce((s, m) => s + m.items.reduce((a, i) => a + (i.protein  || 0), 0), 0);
    const rows = meals.map(m => {
      const cal = m.items.reduce((s, i) => s + (i.calories || 0), 0);
      const p   = m.items.reduce((s, i) => s + (i.protein  || 0), 0);
      return `<div class="cal-di">🍽 <span>${esc(m.name)} — ${cal} cal · ${p}g P</span></div>`;
    }).join('');
    mealsHTML = `<div class="cal-daily-sec">
      <div class="cal-daily-sec-hdr">🍽 Meals <span style="font-size:11px;font-weight:400;color:var(--accent-b)">${totalCal} cal · ${totalP}g P</span></div>
      ${rows}
    </div>`;
  }

  // ── Weight ──
  const w = weightLog[date];
  const weightHTML = w ? `<div class="cal-daily-sec">
    <div class="cal-daily-sec-hdr">⚖️ Weight</div>
    <div class="cal-di">⚖️ <span>${w} ${wtUnit()}</span></div>
  </div>` : '';

  // ── Journal ──
  const je = journal[date] || {};
  const hasJournal = Object.values(je).some(Boolean);
  let journalHTML = '';
  if (hasJournal) {
    const parts = [
      je.wins    && `<div class="cal-di-sub">Wins: ${esc(je.wins.slice(0,120))}${je.wins.length>120?'…':''}</div>`,
      je.lessons && `<div class="cal-di-sub">Lessons: ${esc(je.lessons.slice(0,120))}${je.lessons.length>120?'…':''}</div>`
    ].filter(Boolean).join('');
    journalHTML = `<div class="cal-daily-sec">
      <div class="cal-daily-sec-hdr">📖 Journal</div>
      <div class="cal-di">📖 <span>Entry</span></div>${parts}
    </div>`;
  }

  const nothingLogged = !totalHabits && !workoutDone && !meals.length && !w && !hasJournal;

  return `<div class="cal-daily-sec">${tasksHTML}</div>
    ${nothingLogged ? '<div class="cal-di-empty" style="padding:20px 0">Nothing logged this day.</div>' : ''}
    ${habitHTML}${workoutHTML}${mealsHTML}${weightHTML}${journalHTML}`;
}

function renderCalendar() {
  if (!calSelectedDate) calSelectedDate = today();
  if (calView === 'weekly') renderCalWeekly();
  else if (calView === 'daily') renderCalDaily();
  else renderCalMonthly();
}

// ══════════════════════════════════════════════════════════════════════════
// CHALLENGE A FRIEND
// ══════════════════════════════════════════════════════════════════════════
// Challenges are local-first: encoded in a shareable URL, tracked in localStorage.
// No backend needed. Each user tracks their own progress independently.

const CHALLENGE_TEMPLATES = [
  { id: '7day_habits',   icon: '🔥', name: '7-Day Streak',        desc: 'Complete all habits for 7 days straight', duration: 7,  metric: 'perfect_days', goal: 7 },
  { id: '5day_workout',  icon: '💪', name: '5 Workouts in 7 Days', desc: 'Log 5 workouts within a week',           duration: 7,  metric: 'workouts',     goal: 5 },
  { id: '7day_journal',  icon: '📖', name: 'Journal Every Day',    desc: 'Write a journal entry 7 days in a row',  duration: 7,  metric: 'journal_days', goal: 7 },
  { id: '10day_habits',  icon: '⚡', name: '10-Day Grind',         desc: 'Complete all habits for 10 days',         duration: 10, metric: 'perfect_days', goal: 10 },
  { id: '30day_streak',  icon: '👑', name: '30-Day Challenge',     desc: 'Maintain a streak on any habit for 30 days', duration: 30, metric: 'best_streak', goal: 30 },
  { id: 'meal_tracker',  icon: '🥗', name: 'Track Every Meal',     desc: 'Log at least one meal every day for 7 days', duration: 7, metric: 'meal_days', goal: 7 },
];

function _getChallenges() { return JSON.parse(localStorage.getItem('hvi_challenges') || '[]'); }
function _saveChallenges(c) { localStorage.setItem('hvi_challenges', JSON.stringify(c)); if (typeof schedulePush === 'function') schedulePush(); }

function _challengeProgress(challenge) {
  const start = challenge.startDate;
  const end = challenge.endDate;
  const t = today();
  let count = 0;

  for (let i = 0; i < challenge.duration; i++) {
    const d = new Date(start + 'T00:00:00');
    d.setDate(d.getDate() + i);
    const date = d.toLocaleDateString('en-CA');
    if (date > t) break;

    switch (challenge.metric) {
      case 'perfect_days': {
        const isToday = date === t;
        const allDone = isToday
          ? habits.every(h => log[h.id]?.completedToday)
          : habits.every(h => {
              const hist = LS.get('hvi_habit_history', {});
              return Object.values(hist).some(arr => arr.includes(date));
            });
        if (allDone) count++;
        break;
      }
      case 'workouts':
        if (workoutLog[date]?.exercises?.some(e => e.sets?.some(s => s.completed))) count++;
        break;
      case 'journal_days':
        if (Object.values(journal[date] || {}).some(Boolean)) count++;
        break;
      case 'best_streak':
        count = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
        return { count, pct: Math.min(1, count / challenge.goal), done: count >= challenge.goal };
      case 'meal_days':
        if ((mealLog[date]?.meals || []).length > 0) count++;
        break;
    }
  }
  return { count, pct: Math.min(1, count / challenge.goal), done: count >= challenge.goal };
}

function _daysLeft(challenge) {
  const end = new Date(challenge.endDate + 'T23:59:59');
  const now = new Date();
  return Math.max(0, Math.ceil((end - now) / 86400000));
}

function createChallenge(templateId) {
  const tmpl = CHALLENGE_TEMPLATES.find(t => t.id === templateId);
  if (!tmpl) return;

  const startDate = today();
  const endD = new Date(); endD.setDate(endD.getDate() + tmpl.duration - 1);
  const endDate = endD.toLocaleDateString('en-CA');
  const challenge = {
    id: genId('ch'),
    templateId: tmpl.id,
    icon: tmpl.icon,
    name: tmpl.name,
    desc: tmpl.desc,
    duration: tmpl.duration,
    metric: tmpl.metric,
    goal: tmpl.goal,
    startDate,
    endDate,
    createdBy: userName() || 'A friend',
  };

  const challenges = _getChallenges();
  challenges.push(challenge);
  _saveChallenges(challenges);
  track('challenge_created', { template: templateId });
  _shareChallengeLink(challenge);
  renderChallenges();
}

function _shareChallengeLink(challenge) {
  const payload = btoa(JSON.stringify({
    t: challenge.templateId,
    s: challenge.startDate,
    e: challenge.endDate,
    n: challenge.createdBy,
  }));
  const url = `https://get-arete.com/?challenge=${payload}`;
  const text = `${challenge.createdBy} challenged you: ${challenge.icon} ${challenge.name}. ${challenge.desc}. Can you keep up?`;

  if (navigator.share) {
    navigator.share({ title: `Arete Challenge: ${challenge.name}`, text, url }).catch(() => {
      _copyChallengeLink(url);
    });
  } else {
    _copyChallengeLink(url);
  }
}

function _copyChallengeLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    if (typeof _showToast === 'function') _showToast('Challenge link copied!');
  }).catch(() => {});
}

function acceptChallenge(payload) {
  try {
    const data = JSON.parse(atob(payload));
    const tmpl = CHALLENGE_TEMPLATES.find(t => t.id === data.t);
    if (!tmpl) return;

    const challenges = _getChallenges();
    // Don't add duplicate
    if (challenges.some(c => c.templateId === data.t && c.startDate === data.s)) {
      if (typeof _showToast === 'function') _showToast('You already joined this challenge!');
      return;
    }

    const challenge = {
      id: genId('ch'),
      templateId: tmpl.id,
      icon: tmpl.icon,
      name: tmpl.name,
      desc: tmpl.desc,
      duration: tmpl.duration,
      metric: tmpl.metric,
      goal: tmpl.goal,
      startDate: data.s,
      endDate: data.e,
      createdBy: data.n || 'A friend',
      accepted: true,
    };
    challenges.push(challenge);
    _saveChallenges(challenges);
    track('challenge_accepted', { template: data.t, from: data.n });
    if (typeof _showToast === 'function') _showToast(`Challenge accepted! ${tmpl.icon} ${tmpl.name}`);
    go('challenges');
  } catch (e) {
    console.warn('[challenge] failed to accept:', e);
  }
}

function removeChallenge(id) {
  let challenges = _getChallenges();
  challenges = challenges.filter(c => c.id !== id);
  _saveChallenges(challenges);
  renderChallenges();
}

function reshareChallenge(id) {
  const challenges = _getChallenges();
  const ch = challenges.find(c => c.id === id);
  if (ch) _shareChallengeLink(ch);
}

function renderChallenges() {
  const challenges = _getChallenges();
  const active = challenges.filter(c => c.endDate >= today());
  const completed = challenges.filter(c => c.endDate < today());

  const activeHTML = active.length ? active.map(ch => {
    const prog = _challengeProgress(ch);
    const left = _daysLeft(ch);
    return `<div class="chal-card">
      <div class="chal-card-head">
        <div class="chal-card-icon">${ch.icon}</div>
        <div class="chal-card-info">
          <div class="chal-card-name">${esc(ch.name)}</div>
          <div class="chal-card-desc">${esc(ch.desc)}</div>
          <div class="chal-card-from">${ch.accepted ? 'From ' + esc(ch.createdBy) : 'Started by you'}</div>
        </div>
      </div>
      <div class="chal-prog">
        <div class="chal-prog-bar"><div class="chal-prog-fill${prog.done ? ' chal-prog-done' : ''}" style="width:${(prog.pct * 100).toFixed(0)}%"></div></div>
        <div class="chal-prog-label">
          <span>${prog.count}/${ch.goal}</span>
          <span>${prog.done ? '✓ Complete!' : left + 'd left'}</span>
        </div>
      </div>
      <div class="chal-actions">
        <button class="chal-action-btn" onclick="reshareChallenge('${ch.id}')">📤 Share</button>
        <button class="chal-action-btn chal-action-remove" onclick="if(confirm('Remove this challenge?'))removeChallenge('${ch.id}')">Remove</button>
      </div>
    </div>`;
  }).join('') : '<div class="empty-state" style="padding:24px 0"><div class="empty-state-icon">⚔️</div><div class="empty-state-title">No active challenges</div><div class="empty-state-sub">Start one below and send it to a friend.</div></div>';

  const completedHTML = completed.length ? `
    <div class="sec-lbl" style="padding:20px 24px 8px">Past Challenges</div>
    ${completed.slice(0, 5).map(ch => {
      const prog = _challengeProgress(ch);
      return `<div class="chal-card chal-card-past">
        <div class="chal-card-head">
          <div class="chal-card-icon">${ch.icon}</div>
          <div class="chal-card-info">
            <div class="chal-card-name">${esc(ch.name)} ${prog.done ? '✓' : ''}</div>
            <div class="chal-card-desc">${prog.count}/${ch.goal} · ${prog.done ? 'Completed' : 'Not completed'}</div>
          </div>
        </div>
      </div>`;
    }).join('')}` : '';

  const templateHTML = CHALLENGE_TEMPLATES.map(t => `
    <div class="chal-tmpl" onclick="createChallenge('${t.id}')">
      <div class="chal-tmpl-icon">${t.icon}</div>
      <div class="chal-tmpl-info">
        <div class="chal-tmpl-name">${t.name}</div>
        <div class="chal-tmpl-desc">${t.desc} · ${t.duration} days</div>
      </div>
      <div class="chal-tmpl-go">→</div>
    </div>`).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('home')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Challenges</div><div class="page-sub">Compete with friends. Stay accountable.</div></div>
    <div class="sec-lbl" style="padding:4px 24px 8px">Active</div>
    <div class="chal-list ani">${activeHTML}</div>
    ${completedHTML}
    <div class="sec-lbl" style="padding:20px 24px 8px">Start a Challenge</div>
    <div class="chal-tmpl-list ani">${templateHTML}</div>`;
}

// Check for challenge param on load
function _checkChallengeParam() {
  const p = new URLSearchParams(location.search);
  const ch = p.get('challenge');
  if (ch) {
    // Remove param from URL
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.hash);
    // Accept after a small delay so the app has initialized
    setTimeout(() => acceptChallenge(ch), 500);
  }
}
// Run on load
_checkChallengeParam();

// ══════════════════════════════════════════════════════════════════════════
// LEADERBOARD — Group competition with friends
// ══════════════════════════════════════════════════════════════════════════
// Uses Supabase tables: leaderboard_groups, leaderboard_members
// Each group has a short join code. Members push stats automatically.

let _lbView = 'list'; // 'list' | 'group' | 'create' | 'join'
let _lbActiveGroup = null;
let _lbGroupCache = {}; // group_id -> { group, members }
let _lbLoading = false;

// ── Supabase helpers ─────────────────────────────────────────────────────
function _lbHeaders() {
  const token = getAccessToken();
  return { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function _genGroupCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Build local stats snapshot ───────────────────────────────────────────
function _buildMyStats() {
  const xp = gamification.xp || 0;
  const lvl = getLevel(xp);
  const maxStreak = Math.max(0, ...habits.map(h => log[h.id]?.streak || 0));
  const totalWorkouts = Object.values(workoutLog).filter(wl => wl.exercises?.some(e => e.sets?.some(s => s.completed))).length;
  const totalPRs = Object.keys(prs || {}).length;
  const totalJournalDays = Object.keys(journal).filter(d => Object.values(journal[d]).some(Boolean)).length;
  const habitsToday = habits.filter(h => log[h.id]?.completedToday).length;

  // This week's workouts
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekKey = weekStart.toLocaleDateString('en-CA');
  const weekWorkouts = Object.keys(workoutLog).filter(d => d >= weekKey && workoutLog[d]?.exercises?.some(e => e.sets?.some(s => s.completed))).length;

  return {
    xp, lvl, title: getLevelTitle(lvl),
    maxStreak, totalWorkouts, weekWorkouts,
    totalPRs, totalJournalDays, habitsToday,
    totalHabits: habits.length,
    achievementCount: (achievements || []).length,
    updatedAt: new Date().toISOString(),
  };
}

// ── API calls ────────────────────────────────────────────────────────────
async function _lbCreateGroup(name) {
  const uid = getCurrentUserId();
  if (!uid) return null;
  await _ensureFreshToken();
  const code = _genGroupCode();

  // Create group
  const res = await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_groups`, {
    method: 'POST',
    headers: { ..._lbHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify({ name, code, created_by: uid }),
  });
  if (!res.ok) {
    // Code collision — retry once
    if (res.status === 409) return _lbCreateGroup(name);
    console.warn('[lb] create group failed:', res.status);
    return null;
  }
  const [group] = await res.json();

  // Auto-join as creator
  await _lbJoinGroupById(group.id);
  return group;
}

async function _lbJoinGroupByCode(code) {
  const uid = getCurrentUserId();
  if (!uid) return { error: 'Not signed in' };
  await _ensureFreshToken();

  // Look up group by code
  const res = await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_groups?code=eq.${code.toUpperCase()}&select=*`, {
    headers: _lbHeaders(),
  });
  if (!res.ok) return { error: 'Network error' };
  const groups = await res.json();
  if (!groups.length) return { error: 'Group not found. Check the code and try again.' };

  const group = groups[0];
  const joined = await _lbJoinGroupById(group.id);
  if (joined?.error) return joined;
  return { group };
}

async function _lbJoinGroupById(groupId) {
  const uid = getCurrentUserId();
  const name = userName() || 'Anonymous';
  const stats = _buildMyStats();

  // Use return=minimal to avoid RLS SELECT chicken-and-egg issue
  // Try plain INSERT first, fall back to PATCH if already a member
  const res = await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_members`, {
    method: 'POST',
    headers: { ..._lbHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify({ group_id: groupId, user_id: uid, display_name: name, stats, updated_at: new Date().toISOString() }),
  });
  if (res.ok || res.status === 201) return { ok: true };

  // 409 = already a member (unique constraint), that's fine
  if (res.status === 409) {
    // Update stats instead
    await _lbPushMyStats(groupId);
    return { ok: true };
  }

  const err = await res.text().catch(() => '');
  console.warn('[lb] join failed:', res.status, err);
  return { error: 'Failed to join group. Try again.' };
}

async function _lbFetchMyGroups() {
  const uid = getCurrentUserId();
  if (!uid) return [];
  await _ensureFreshToken();

  // Get my memberships
  const res = await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_members?user_id=eq.${uid}&select=group_id`, {
    headers: _lbHeaders(),
  });
  if (!res.ok) return [];
  const memberships = await res.json();
  if (!memberships.length) return [];

  // Get group details
  const ids = memberships.map(m => m.group_id);
  const gRes = await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_groups?id=in.(${ids.join(',')})&select=*`, {
    headers: _lbHeaders(),
  });
  if (!gRes.ok) return [];
  return gRes.json();
}

async function _lbFetchGroupMembers(groupId) {
  await _ensureFreshToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_members?group_id=eq.${groupId}&select=*&order=stats->>xp.desc`, {
    headers: _lbHeaders(),
  });
  if (!res.ok) return [];
  return res.json();
}

async function _lbPushMyStats(groupId) {
  const uid = getCurrentUserId();
  if (!uid) return;
  await _ensureFreshToken();
  const stats = _buildMyStats();
  const name = userName() || 'Anonymous';

  await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_members?group_id=eq.${groupId}&user_id=eq.${uid}`, {
    method: 'PATCH',
    headers: { ..._lbHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify({ display_name: name, stats, updated_at: new Date().toISOString() }),
  });
}

async function _lbLeaveGroup(groupId) {
  const uid = getCurrentUserId();
  if (!uid) return;
  await _ensureFreshToken();
  await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_members?group_id=eq.${groupId}&user_id=eq.${uid}`, {
    method: 'DELETE',
    headers: _lbHeaders(),
  });
}

// ── Push stats to all groups (called from sync) ──────────────────────────
async function lbSyncStats() {
  const uid = getCurrentUserId();
  if (!uid) return;
  try {
    const groups = await _lbFetchMyGroups();
    for (const g of groups) await _lbPushMyStats(g.id);
  } catch (e) { console.warn('[lb] sync stats failed:', e); }
}

// ── Rendering ────────────────────────────────────────────────────────────
async function renderLeaderboard() {
  const uid = getCurrentUserId();
  if (!uid) {
    let invited = null;
    try { invited = localStorage.getItem('hvi_pending_join'); } catch {}
    document.getElementById('view').innerHTML = `
      <button class="back" onclick="go('home')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
      <div class="page-head ani"><div class="page-title">Leaderboard</div><div class="page-sub">Compete with friends on streaks and XP.</div></div>
      <div class="guest-cta" style="margin:8px 24px">
        <div class="guest-cta-text">${invited
          ? "You've been invited to a group. Create a free account (10 seconds) and you'll join it automatically."
          : 'Create a free account to start a group and climb the leaderboard with friends.'}</div>
        <button class="guest-cta-btn" onclick="if(typeof showSignup==='function')showSignup()">${invited ? 'Create account & join' : 'Create free account'}</button>
      </div>`;
    return;
  }

  if (_lbView === 'group' && _lbActiveGroup) {
    await _renderGroupLeaderboard(_lbActiveGroup);
    return;
  }

  // List view
  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('home')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Leaderboard</div><div class="page-sub">Create groups. Compete with friends.</div></div>
    <div class="lb-loading ani" id="lb-content"><div class="lb-loader">Loading groups…</div></div>`;

  try {
    const groups = await _lbFetchMyGroups();
    const el = document.getElementById('lb-content');
    if (!el) return;

    if (!groups.length) {
      el.innerHTML = `
        <div class="empty-state" style="padding:32px 0">
          <div class="empty-state-icon">🏆</div>
          <div class="empty-state-title">No groups yet</div>
          <div class="empty-state-sub">Create a group and invite friends to compete.</div>
        </div>`;
    } else {
      el.innerHTML = groups.map(g => `
        <div class="lb-group-card" onclick="_lbView='group';_lbActiveGroup='${g.id}';renderLeaderboard()">
          <div class="lb-group-info">
            <div class="lb-group-name">${esc(g.name)}</div>
            <div class="lb-group-code">Code: ${g.code}</div>
          </div>
          <div class="lb-group-arrow">→</div>
        </div>`).join('');
    }

    el.innerHTML += `
      <div class="lb-actions">
        <button class="lb-action-btn lb-create-btn" onclick="_showCreateGroup()">+ Create Group</button>
        <button class="lb-action-btn lb-join-btn" onclick="_showJoinGroup()">🔗 Join Group</button>
      </div>`;
  } catch (e) {
    console.warn('[lb] load failed:', e);
    const el = document.getElementById('lb-content');
    if (el) el.innerHTML = '<div class="lb-error">Failed to load groups. Check your connection.</div>';
  }
}

function _showCreateGroup() {
  let modal = document.getElementById('lb-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'lb-modal'; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div class="edit-habit-backdrop" onclick="_closeLbModal()"></div>
    <div class="edit-habit-sheet">
      <div class="edit-habit-title">Create Group</div>
      <input class="d-input" id="lb-group-name" type="text" placeholder="Group name (e.g. Gym Bros)" maxlength="30" style="margin-bottom:16px">
      <div id="lb-modal-error" style="color:#d46f6f;font-size:12px;min-height:18px;margin-bottom:8px"></div>
      <div style="display:flex;gap:10px">
        <button class="w-action-btn" style="flex:1;margin:0" onclick="_closeLbModal()">Cancel</button>
        <button class="w-action-btn" style="flex:1;margin:0;background:var(--accent);color:#fff" id="lb-create-submit" onclick="_submitCreateGroup()">Create</button>
      </div>
    </div>`;
  modal.style.display = 'block';
  setTimeout(() => document.getElementById('lb-group-name')?.focus(), 100);
}

async function _submitCreateGroup() {
  const nameEl = document.getElementById('lb-group-name');
  const name = nameEl?.value?.trim();
  if (!name) { document.getElementById('lb-modal-error').textContent = 'Enter a group name'; return; }

  const btn = document.getElementById('lb-create-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

  const group = await _lbCreateGroup(name);
  if (!group) {
    if (btn) { btn.disabled = false; btn.textContent = 'Create'; }
    document.getElementById('lb-modal-error').textContent = 'Failed to create group. Try again.';
    return;
  }

  _closeLbModal();
  track('leaderboard_group_created', { name });

  // Show the code to share
  _lbView = 'group';
  _lbActiveGroup = group.id;
  renderLeaderboard();
  setTimeout(() => {
    if (typeof _showToast === 'function') _showToast(`Group created! Code: ${group.code}`);
  }, 300);
}

function _showJoinGroup() {
  let modal = document.getElementById('lb-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'lb-modal'; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div class="edit-habit-backdrop" onclick="_closeLbModal()"></div>
    <div class="edit-habit-sheet">
      <div class="edit-habit-title">Join Group</div>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:12px">Enter the 6-character code from your friend.</div>
      <input class="d-input lb-code-input" id="lb-join-code" type="text" placeholder="ABC123" maxlength="6" style="margin-bottom:16px;text-align:center;letter-spacing:4px;font-size:20px;text-transform:uppercase" oninput="this.value=this.value.toUpperCase()">
      <div id="lb-modal-error" style="color:#d46f6f;font-size:12px;min-height:18px;margin-bottom:8px"></div>
      <div style="display:flex;gap:10px">
        <button class="w-action-btn" style="flex:1;margin:0" onclick="_closeLbModal()">Cancel</button>
        <button class="w-action-btn" style="flex:1;margin:0;background:var(--accent);color:#fff" id="lb-join-submit" onclick="_submitJoinGroup()">Join</button>
      </div>
    </div>`;
  modal.style.display = 'block';
  setTimeout(() => document.getElementById('lb-join-code')?.focus(), 100);
}

async function _submitJoinGroup() {
  const code = document.getElementById('lb-join-code')?.value?.trim();
  if (!code || code.length < 4) { document.getElementById('lb-modal-error').textContent = 'Enter the group code'; return; }

  const btn = document.getElementById('lb-join-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }

  const result = await _lbJoinGroupByCode(code);
  if (result.error) {
    if (btn) { btn.disabled = false; btn.textContent = 'Join'; }
    document.getElementById('lb-modal-error').textContent = result.error;
    return;
  }

  _closeLbModal();
  track('leaderboard_group_joined', { code });
  if (typeof _showToast === 'function') _showToast('Joined group!');

  _lbView = 'group';
  _lbActiveGroup = result.group.id;
  renderLeaderboard();
}

function _closeLbModal() {
  const m = document.getElementById('lb-modal');
  if (m) m.style.display = 'none';
}

async function _renderGroupLeaderboard(groupId) {
  document.getElementById('view').innerHTML = `
    <button class="back" onclick="_lbView='list';_lbActiveGroup=null;renderLeaderboard()"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Leaderboard</div><div class="page-sub">Loading…</div></div>
    <div id="lb-board" class="ani"><div class="lb-loader">Loading leaderboard…</div></div>`;

  try {
    // Push my latest stats first
    await _lbPushMyStats(groupId);

    // Fetch group info and members in parallel
    const [groups, members] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/leaderboard_groups?id=eq.${groupId}&select=*`, { headers: _lbHeaders() }).then(r => r.json()),
      _lbFetchGroupMembers(groupId),
    ]);

    const group = groups[0];
    if (!group) { _lbView = 'list'; renderLeaderboard(); return; }

    const uid = getCurrentUserId();
    // Sort by XP descending
    members.sort((a, b) => (b.stats?.xp || 0) - (a.stats?.xp || 0));

    const pageTitle = document.querySelector('.page-title');
    const pageSub = document.querySelector('.page-sub');
    if (pageTitle) pageTitle.textContent = group.name;
    if (pageSub) pageSub.textContent = `${members.length} member${members.length !== 1 ? 's' : ''} · Code: ${group.code}`;

    const boardEl = document.getElementById('lb-board');
    if (!boardEl) return;

    // Podium for top 3
    const podiumHTML = members.length >= 1 ? _buildPodium(members.slice(0, 3), uid) : '';

    // Full list
    const listHTML = members.map((m, i) => {
      const rank = i + 1;
      const isMe = m.user_id === uid;
      const s = m.stats || {};
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      const stale = _isStale(s.updatedAt);
      return `<div class="lb-row${isMe ? ' lb-row-me' : ''}">
        <div class="lb-rank">${medal}</div>
        <div class="lb-member-info">
          <div class="lb-member-name">${esc(m.display_name)}${isMe ? ' <span class="lb-you">(you)</span>' : ''}${stale ? ' <span class="lb-stale">inactive</span>' : ''}</div>
          <div class="lb-member-stats">Lv.${s.lvl || 1} ${esc(s.title || 'Neophyte')} · 🔥 ${s.maxStreak || 0} streak · 💪 ${s.weekWorkouts || 0} this week</div>
        </div>
        <div class="lb-xp">${(s.xp || 0).toLocaleString()} <span class="lb-xp-label">XP</span></div>
      </div>`;
    }).join('');

    boardEl.innerHTML = `
      ${podiumHTML}
      <div class="lb-list">${listHTML}</div>
      <div class="lb-group-actions">
        <button class="lb-action-btn" onclick="_shareGroupCode('${group.code}','${esc(group.name)}')">📤 Share Code</button>
        <button class="lb-action-btn" onclick="_lbRefresh('${groupId}')">🔄 Refresh</button>
        <button class="lb-action-btn lb-leave-btn" onclick="if(confirm('Leave this group?')){_lbDoLeave('${groupId}')}">Leave Group</button>
      </div>`;

  } catch (e) {
    console.warn('[lb] render group failed:', e);
    const el = document.getElementById('lb-board');
    if (el) el.innerHTML = '<div class="lb-error">Failed to load leaderboard. Check your connection.</div>';
  }
}

function _buildPodium(top3, uid) {
  if (!top3.length) return '';
  // Reorder for visual podium: [2nd, 1st, 3rd]
  const order = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3.length === 2 ? [top3[1], top3[0]] : [top3[0]];
  const heights = top3.length >= 3 ? [70, 100, 55] : top3.length === 2 ? [70, 100] : [100];
  const medals = top3.length >= 3 ? ['🥈', '🥇', '🥉'] : top3.length === 2 ? ['🥈', '🥇'] : ['🥇'];

  const cols = order.map((m, i) => {
    const isMe = m.user_id === uid;
    const s = m.stats || {};
    return `<div class="lb-podium-col">
      <div class="lb-podium-medal">${medals[i]}</div>
      <div class="lb-podium-name${isMe ? ' lb-podium-me' : ''}">${esc(m.display_name.split(' ')[0])}</div>
      <div class="lb-podium-xp">${(s.xp || 0).toLocaleString()}</div>
      <div class="lb-podium-bar" style="height:${heights[i]}px"></div>
    </div>`;
  }).join('');

  return `<div class="lb-podium">${cols}</div>`;
}

function _isStale(updatedAt) {
  if (!updatedAt) return true;
  return (Date.now() - new Date(updatedAt).getTime()) > 3 * 24 * 60 * 60 * 1000; // 3 days
}

function _shareGroupCode(code, name) {
  const url = `https://get-arete.com/?join=${code}`;
  const text = `Join my Arete group "${name}" — tap to join and let's compete:\n${url}`;
  const done = () => { if (typeof _showToast === 'function') _showToast('Invite link copied!'); };
  if (navigator.share) {
    navigator.share({ title: `Join ${name} on Arete`, text, url }).catch(() => {
      navigator.clipboard.writeText(text).then(done).catch(() => {});
    });
  } else {
    navigator.clipboard.writeText(text).then(done).catch(() => {});
  }
  track('leaderboard_share', { code });
}

function _lbRefresh(groupId) {
  _renderGroupLeaderboard(groupId);
}

async function _lbDoLeave(groupId) {
  await _lbLeaveGroup(groupId);
  track('leaderboard_leave');
  _lbView = 'list';
  _lbActiveGroup = null;
  renderLeaderboard();
}
