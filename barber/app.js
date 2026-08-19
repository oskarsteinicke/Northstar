// ══════════════════════════════════════════════════════════════════════════
// Chair — a little book for a little barber shop
// Everything lives in localStorage on this device. No account, no server.
// ══════════════════════════════════════════════════════════════════════════

// ── STORAGE ───────────────────────────────────────────────────────────────
const LS = {
  get: (k, fb) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const DEFAULT_SETTINGS = {
  shopName: 'The Chair',
  currency: '$',
  defaultPrice: 25,
  defaultInterval: 28,          // days between cuts, used when a client has no history
  services: [
    { name: 'Haircut', price: 25 },
    { name: 'Cut + beard', price: 35 },
    { name: 'Skin fade', price: 30 },
    { name: 'Beard trim', price: 15 },
    { name: 'Kids cut', price: 20 },
  ],
  methods: ['Cash', 'Card', 'Venmo', 'Cash App', 'Zelle', 'Other'],
};

let clients  = LS.get('barber_clients', []);
let cuts     = LS.get('barber_cuts', []);
let settings = Object.assign({}, DEFAULT_SETTINGS, LS.get('barber_settings', {}));

function saveClients() { LS.set('barber_clients', clients); }
function saveCuts()    { LS.set('barber_cuts', cuts); }
function saveSettings() { LS.set('barber_settings', settings); }

// Timestamp + random suffix, so two records made in the same millisecond
// can never collide.
function genId(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }

// ── VIEW STATE ────────────────────────────────────────────────────────────
let curView = 'today';
let curClientId = null;
let clientSearch = '';

// ── UTILS ─────────────────────────────────────────────────────────────────
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const $ = id => document.getElementById(id);
const val = id => { const el = $(id); return el ? el.value.trim() : ''; };
const num = id => { const n = parseFloat(val(id)); return isNaN(n) ? 0 : n; };

function money(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const s = v % 1 === 0 ? String(v) : v.toFixed(2);
  return settings.currency + s;
}

// ── DATES ─────────────────────────────────────────────────────────────────
// en-CA formats as YYYY-MM-DD in local time, which keeps "today" honest
// regardless of timezone (toISOString would drift to UTC).
const todayISO = () => new Date().toLocaleDateString('en-CA');
const parseISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const isoOf = d => d.toLocaleDateString('en-CA');
function isoAdd(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return isoOf(d); }
function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }

function weekStartISO() {           // weeks run Monday → Sunday
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoOf(d);
}
function monthStartISO() { const d = new Date(); d.setDate(1); return isoOf(d); }

function fmtDay(s) {
  const t = todayISO();
  if (s === t) return 'Today';
  if (s === isoAdd(t, 1)) return 'Tomorrow';
  if (s === isoAdd(t, -1)) return 'Yesterday';
  const d = parseISO(s);
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + (m ? ':' + String(m).padStart(2, '0') : '') + ampm;
}

function ago(s) {
  if (!s) return 'never';
  const n = daysBetween(s, todayISO());
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 14) return n + ' days ago';
  if (n < 60) return Math.round(n / 7) + ' weeks ago';
  return Math.round(n / 30) + ' months ago';
}

// ── LOOKUPS ───────────────────────────────────────────────────────────────
const clientById = id => clients.find(c => c.id === id);
const nameOf = id => { const c = clientById(id); return c ? c.name : 'Walk-in'; };
const cutsOf = id => cuts.filter(c => c.clientId === id);
const byDateDesc = (a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''));
const byDateAsc = (a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''));

function lastCutDate(id) {
  const done = cutsOf(id).filter(c => c.done).sort(byDateDesc);
  return done.length ? done[0].date : '';
}
function owedBy(id) { return cutsOf(id).filter(c => c.done && !c.paid).reduce((s, c) => s + (+c.price || 0), 0); }
function spentBy(id) { return cutsOf(id).filter(c => c.done && c.paid).reduce((s, c) => s + (+c.price || 0), 0); }
function nextBooking(id) {
  return cutsOf(id).filter(c => !c.done && c.date >= todayISO()).sort(byDateAsc)[0] || null;
}

// How often this client actually comes in: the median-ish average of the gaps
// between their last few cuts. Falls back to whatever they set, then the shop
// default, so a brand new client still shows up as "due" eventually.
function intervalOf(id) {
  const c = clientById(id);
  if (c && c.interval) return +c.interval;
  const dates = cutsOf(id).filter(x => x.done).map(x => x.date).sort();
  if (dates.length >= 3) {
    const gaps = [];
    for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1], dates[i]));
    const recent = gaps.slice(-5);
    return Math.max(7, Math.round(recent.reduce((a, b) => a + b, 0) / recent.length));
  }
  return settings.defaultInterval;
}

// Negative = overdue by that many days.
function daysUntilDue(id) {
  const last = lastCutDate(id);
  if (!last) return null;
  return intervalOf(id) - daysBetween(last, todayISO());
}

const unpaidCuts = () => cuts.filter(c => c.done && !c.paid).sort(byDateAsc);
const outstanding = () => unpaidCuts().reduce((s, c) => s + (+c.price || 0), 0);

function takenBetween(fromISO, toISO) {
  return cuts.filter(c => c.done && c.paid && (c.paidDate || c.date) >= fromISO && (c.paidDate || c.date) <= toISO)
             .reduce((s, c) => s + (+c.price || 0), 0);
}
function cutsBetween(fromISO, toISO) {
  return cuts.filter(c => c.done && c.date >= fromISO && c.date <= toISO);
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ── SHELL ─────────────────────────────────────────────────────────────────
function go(view, id) {
  curView = view;
  if (id !== undefined) curClientId = id;
  closeSheet();
  window.scrollTo(0, 0);
  render();
}

function render() {
  $('shop-name').textContent = settings.shopName || 'The Chair';
  document.title = (settings.shopName || 'The Chair') + ' — Barber Book';
  const html =
    curView === 'today'    ? viewToday() :
    curView === 'upcoming' ? viewUpcoming() :
    curView === 'clients'  ? viewClients() :
    curView === 'money'    ? viewMoney() :
    curView === 'client'   ? viewClient() :
    curView === 'settings' ? viewSettings() : viewToday();
  $('view').innerHTML = html;
  document.querySelectorAll('.tab').forEach(t => {
    const active = t.dataset.view === curView || (curView === 'client' && t.dataset.view === 'clients');
    t.classList.toggle('on', active);
  });
  $('fab').hidden = curView === 'settings';
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ── TODAY ─────────────────────────────────────────────────────────────────
function viewToday() {
  const t = todayISO();
  const booked = cuts.filter(c => !c.done && c.date === t).sort(byDateAsc);
  const done = cuts.filter(c => c.done && c.date === t).sort(byDateDesc);
  const owed = outstanding();
  const takenToday = takenBetween(t, t);

  let h = `<div class="hero">
    <div class="hero-date">${esc(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
    <div class="hero-take">${esc(money(takenToday))}</div>
    <div class="hero-sub">taken today · ${done.length} cut${done.length === 1 ? '' : 's'} done${booked.length ? ` · ${booked.length} to go` : ''}</div>
  </div>`;

  if (owed > 0) {
    h += `<button class="alert" onclick="go('money')">
      <span class="alert-dot"></span>
      <span><b>${esc(money(owed))} unpaid</b> across ${unpaidCuts().length} cut${unpaidCuts().length === 1 ? '' : 's'}</span>
      <span class="alert-go">Chase it →</span>
    </button>`;
  }

  h += `<h2 class="sec">In the chair today</h2>`;
  if (!booked.length && !done.length) {
    h += emptyState('Nothing logged yet today.', 'Tap ＋ when someone sits down.');
  } else {
    if (booked.length) h += `<div class="list">${booked.map(cutRow).join('')}</div>`;
    if (done.length) {
      h += `<div class="sub-lbl">Finished</div><div class="list">${done.map(cutRow).join('')}</div>`;
    }
  }

  const dueSoon = dueList().slice(0, 3);
  if (dueSoon.length) {
    h += `<h2 class="sec">Due for a trim <button class="link" onclick="go('upcoming')">see all</button></h2>
      <div class="list">${dueSoon.map(dueRow).join('')}</div>`;
  }
  return h;
}

function emptyState(title, sub) {
  return `<div class="empty"><div class="empty-title">${esc(title)}</div><div class="empty-sub">${esc(sub)}</div></div>`;
}

// A single cut/appointment row, used on every list in the app.
function cutRow(c, opts) {
  opts = opts || {};
  const paidChip = c.done
    ? (c.paid ? `<span class="chip ok">Paid${c.method ? ' · ' + esc(c.method) : ''}</span>`
              : `<span class="chip due">Owes ${esc(money(c.price))}</span>`)
    : `<span class="chip book">Booked${c.time ? ' · ' + esc(fmtTime(c.time)) : ''}</span>`;
  const meta = [];
  if (!opts.hideDate) meta.push(fmtDay(c.date));
  if (c.service && !opts.compact) meta.push(c.service);
  if (c.done && c.paid) meta.push(money(c.price));
  if (opts.compact && c.notes) meta.push(c.notes);
  const title = opts.compact ? (c.service || 'Cut') : nameOf(c.clientId);

  return `<div class="row">
    <div class="row-main" onclick="openCutSheet({ id: '${c.id}' })">
      <div class="ava">${esc(opts.compact ? String(parseISO(c.date).getDate()) : initials(nameOf(c.clientId)))}</div>
      <div class="row-txt">
        <div class="row-name">${esc(title)}</div>
        <div class="row-meta">${esc(meta.join(' · '))}</div>
      </div>
      ${paidChip}
    </div>
    <div class="row-acts">
      ${!c.done ? `<button class="btn tiny" onclick="markDone('${c.id}')">Cut done</button>` : ''}
      ${c.done && !c.paid ? `<button class="btn tiny gold" onclick="openPaySheet('${c.id}')">Mark paid</button>` : ''}
      ${c.done && c.paid ? `<button class="btn tiny ghost" onclick="unpay('${c.id}')">Undo paid</button>` : ''}
      <button class="btn tiny ghost" onclick="openCutSheet({ id: '${c.id}' })">Edit</button>
    </div>
  </div>`;
}

// ── UP NEXT ───────────────────────────────────────────────────────────────
// Clients who are past their usual gap and have nothing on the books.
function dueList() {
  return clients
    .filter(c => !c.archived && lastCutDate(c.id) && !nextBooking(c.id))
    .map(c => ({ client: c, due: daysUntilDue(c.id) }))
    .filter(x => x.due !== null && x.due <= 3)
    .sort((a, b) => a.due - b.due);
}

function dueRow(x) {
  const c = x.client;
  const label = x.due < 0 ? `${-x.due} days overdue` : x.due === 0 ? 'due today' : `due in ${x.due} days`;
  return `<div class="row">
    <div class="row-main" onclick="go('client','${c.id}')">
      <div class="ava">${esc(initials(c.name))}</div>
      <div class="row-txt">
        <div class="row-name">${esc(c.name)}</div>
        <div class="row-meta">Last cut ${esc(ago(lastCutDate(c.id)))} · every ${intervalOf(c.id)} days</div>
      </div>
      <span class="chip ${x.due < 0 ? 'due' : 'soft'}">${esc(label)}</span>
    </div>
    <div class="row-acts">
      <button class="btn tiny" onclick="openCutSheet({ clientId: '${c.id}', mode: 'book' })">Book</button>
      ${c.phone ? `<a class="btn tiny ghost" href="sms:${esc(c.phone)}">Text</a>` : ''}
      <button class="btn tiny ghost" onclick="openCutSheet({ clientId: '${c.id}' })">Log cut</button>
    </div>
  </div>`;
}

function viewUpcoming() {
  const t = todayISO();
  const upcoming = cuts.filter(c => !c.done && c.date >= t).sort(byDateAsc);
  const missed = cuts.filter(c => !c.done && c.date < t).sort(byDateDesc);
  const due = dueList();

  let h = `<h2 class="sec">On the books</h2>`;
  if (!upcoming.length) {
    h += emptyState('Nothing booked.', 'Book someone in from their profile, or with ＋.');
  } else {
    let day = '';
    h += '<div class="list">';
    upcoming.forEach(c => {
      if (c.date !== day) { day = c.date; h += `<div class="day-lbl">${esc(fmtDay(day))}</div>`; }
      h += cutRow(c, { hideDate: true });
    });
    h += '</div>';
  }

  if (missed.length) {
    h += `<h2 class="sec">Still open</h2>
      <div class="hint">Booked but never marked done — close them out or delete them.</div>
      <div class="list">${missed.map(c => cutRow(c)).join('')}</div>`;
  }

  h += `<h2 class="sec">Due for a trim</h2>`;
  h += due.length
    ? `<div class="list">${due.map(dueRow).join('')}</div>`
    : emptyState('Everyone is fresh.', 'Regulars show up here when they are past their usual gap.');
  return h;
}

// ── CLIENTS ───────────────────────────────────────────────────────────────
function viewClients() {
  const q = clientSearch.toLowerCase();
  const list = clients
    .filter(c => !c.archived)
    .filter(c => !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q))
    .sort((a, b) => {
      const la = lastCutDate(a.id), lb = lastCutDate(b.id);
      if (la && lb) return lb.localeCompare(la);
      if (la) return -1;
      if (lb) return 1;
      return a.name.localeCompare(b.name);
    });

  let h = `<div class="search">
    <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input id="q" placeholder="Search clients" value="${esc(clientSearch)}" oninput="onSearch(this.value)">
    ${clientSearch ? `<button class="clear" onclick="onSearch('')" aria-label="Clear">×</button>` : ''}
  </div>
  <div class="row-head"><span>${list.length} client${list.length === 1 ? '' : 's'}</span>
    <button class="link" onclick="openClientSheet()">＋ Add client</button></div>`;

  if (!list.length) {
    h += clients.length
      ? emptyState('No match.', 'Try a different name or number.')
      : emptyState('No clients yet.', 'Add your first regular — everything else builds from here.');
    return h;
  }

  h += '<div class="list">' + list.map(c => {
    const owed = owedBy(c.id);
    const n = cutsOf(c.id).filter(x => x.done).length;
    const next = nextBooking(c.id);
    const meta = [`${n} cut${n === 1 ? '' : 's'}`, `last ${ago(lastCutDate(c.id))}`];
    if (next) meta.push('booked ' + fmtDay(next.date).toLowerCase());
    return `<div class="row"><div class="row-main" onclick="go('client','${c.id}')">
      <div class="ava">${esc(initials(c.name))}</div>
      <div class="row-txt">
        <div class="row-name">${esc(c.name)}</div>
        <div class="row-meta">${esc(meta.join(' · '))}</div>
      </div>
      ${owed > 0 ? `<span class="chip due">Owes ${esc(money(owed))}</span>`
                 : `<span class="chip soft">${esc(money(spentBy(c.id)))}</span>`}
    </div></div>`;
  }).join('') + '</div>';
  return h;
}

function onSearch(v) {
  clientSearch = v;
  render();
  const el = $('q');
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

// ── ONE CLIENT ────────────────────────────────────────────────────────────
function viewClient() {
  const c = clientById(curClientId);
  if (!c) return emptyState('Client not found.', 'They may have been deleted.');
  const history = cutsOf(c.id).sort(byDateDesc);
  const doneCount = history.filter(x => x.done).length;
  const owed = owedBy(c.id);
  const next = nextBooking(c.id);
  const due = daysUntilDue(c.id);

  let h = `<button class="back" onclick="go('clients')">‹ Clients</button>
  <div class="profile">
    <div class="ava big">${esc(initials(c.name))}</div>
    <div>
      <h2 class="profile-name">${esc(c.name)}</h2>
      <div class="profile-meta">${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a> · ` : ''}every ${intervalOf(c.id)} days</div>
    </div>
  </div>`;

  if (c.notes) h += `<div class="note">${esc(c.notes)}</div>`;

  h += `<div class="tiles">
    <div class="tile"><div class="tile-n">${doneCount}</div><div class="tile-l">cuts</div></div>
    <div class="tile"><div class="tile-n">${esc(money(spentBy(c.id)))}</div><div class="tile-l">paid you</div></div>
    <div class="tile ${owed > 0 ? 'warn' : ''}"><div class="tile-n">${esc(money(owed))}</div><div class="tile-l">owed</div></div>
  </div>`;

  h += `<div class="actions">
    <button class="btn" onclick="openCutSheet({ clientId: '${c.id}' })">Log a cut</button>
    <button class="btn ghost" onclick="openCutSheet({ clientId: '${c.id}', mode: 'book' })">Book next</button>
    <button class="btn ghost" onclick="openClientSheet('${c.id}')">Edit</button>
  </div>`;

  if (next) {
    h += `<div class="banner">Booked in ${esc(fmtDay(next.date).toLowerCase())}${next.time ? ' at ' + esc(fmtTime(next.time)) : ''}</div>`;
  } else if (due !== null) {
    h += `<div class="banner ${due < 0 ? 'warn' : ''}">${due < 0 ? `Overdue by ${-due} days` : due === 0 ? 'Due today' : `Due in ${due} days`} — nothing booked</div>`;
  }

  h += `<h2 class="sec">History</h2>`;
  h += history.length
    ? `<div class="list">${history.map(x => cutRow(x, { compact: true })).join('')}</div>`
    : emptyState('No cuts logged yet.', 'Log one and their history starts here.');
  return h;
}

// ── MONEY ─────────────────────────────────────────────────────────────────
function viewMoney() {
  const t = todayISO();
  const wk = weekStartISO(), mo = monthStartISO();
  const unpaid = unpaidCuts();
  const allTime = cuts.filter(c => c.done && c.paid).reduce((s, c) => s + (+c.price || 0), 0);

  let h = `<div class="tiles">
    <div class="tile"><div class="tile-n">${esc(money(takenBetween(wk, t)))}</div><div class="tile-l">this week</div></div>
    <div class="tile"><div class="tile-n">${esc(money(takenBetween(mo, t)))}</div><div class="tile-l">this month</div></div>
    <div class="tile ${unpaid.length ? 'warn' : ''}"><div class="tile-n">${esc(money(outstanding()))}</div><div class="tile-l">unpaid</div></div>
  </div>`;

  // Last 7 days, oldest → today.
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = isoAdd(t, -i); days.push({ d, v: takenBetween(d, d) }); }
  const max = Math.max(1, ...days.map(x => x.v));
  h += `<h2 class="sec">Last 7 days</h2>
  <div class="chart">${days.map(x => `
    <div class="bar-col" title="${esc(fmtDay(x.d))}: ${esc(money(x.v))}">
      <div class="bar-v">${x.v ? esc(money(x.v)) : ''}</div>
      <div class="bar" style="height:${Math.max(3, Math.round(x.v / max * 100))}%"></div>
      <div class="bar-l">${esc(parseISO(x.d).toLocaleDateString('en-US', { weekday: 'narrow' }))}</div>
    </div>`).join('')}</div>`;

  h += `<h2 class="sec">Who owes you</h2>`;
  if (!unpaid.length) {
    h += emptyState('Everyone is square.', 'Unpaid cuts land here the moment you log them.');
  } else {
    // Grouped by client, because you chase a person, not a haircut.
    const byClient = {};
    unpaid.forEach(c => { (byClient[c.clientId] = byClient[c.clientId] || []).push(c); });
    h += '<div class="list">' + Object.keys(byClient).map(id => {
      const list = byClient[id].sort(byDateDesc);
      const total = list.reduce((s, c) => s + (+c.price || 0), 0);
      const cl = clientById(id);
      return `<div class="row">
        <div class="row-main" onclick="go('client','${id}')">
          <div class="ava">${esc(initials(nameOf(id)))}</div>
          <div class="row-txt">
            <div class="row-name">${esc(nameOf(id))}</div>
            <div class="row-meta">${esc(list.map(c => fmtDay(c.date)).join(', '))}</div>
          </div>
          <span class="chip due">${esc(money(total))}</span>
        </div>
        <div class="row-acts">
          ${list.length === 1
            ? `<button class="btn tiny gold" onclick="openPaySheet('${list[0].id}')">Mark paid</button>`
            : `<button class="btn tiny gold" onclick="payAllFor('${id}')">Settle all</button>`}
          ${cl && cl.phone ? `<a class="btn tiny ghost" href="sms:${esc(cl.phone)}">Text</a>` : ''}
        </div>
      </div>`;
    }).join('') + '</div>';
  }

  // Where the money came in this month.
  const paidThisMonth = cuts.filter(c => c.done && c.paid && (c.paidDate || c.date) >= mo);
  if (paidThisMonth.length) {
    const byMethod = {};
    paidThisMonth.forEach(c => { const m = c.method || 'Unspecified'; byMethod[m] = (byMethod[m] || 0) + (+c.price || 0); });
    const total = Object.values(byMethod).reduce((a, b) => a + b, 0);
    h += `<h2 class="sec">How they paid this month</h2><div class="split">` +
      Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([m, v]) => `
        <div class="split-row">
          <span>${esc(m)}</span>
          <span class="split-bar"><span style="width:${Math.round(v / total * 100)}%"></span></span>
          <b>${esc(money(v))}</b>
        </div>`).join('') + '</div>';
  }

  h += `<h2 class="sec">All time</h2>
    <div class="hint">${cuts.filter(c => c.done).length} cuts logged · ${esc(money(allTime))} collected</div>
    <div class="actions"><button class="btn ghost" onclick="exportCSV()">Export CSV</button>
    <button class="btn ghost" onclick="go('settings')">Backup &amp; settings</button></div>`;
  return h;
}

// ── SETTINGS ──────────────────────────────────────────────────────────────
function viewSettings() {
  return `<button class="back" onclick="go('today')">‹ Done</button>
  <h2 class="sec">Shop</h2>
  <div class="card">
    <label>Shop name<input id="s-name" value="${esc(settings.shopName)}"></label>
    <div class="two">
      <label>Currency<input id="s-cur" value="${esc(settings.currency)}" maxlength="3"></label>
      <label>Default price<input id="s-price" type="number" inputmode="decimal" value="${esc(settings.defaultPrice)}"></label>
    </div>
    <label>Usual gap between cuts (days)<input id="s-int" type="number" inputmode="numeric" value="${esc(settings.defaultInterval)}"></label>
    <label>Ways they pay<input id="s-methods" value="${esc(settings.methods.join(', '))}" placeholder="Cash, Card, Venmo"></label>
    <button class="btn" onclick="saveShopSettings()">Save</button>
  </div>

  <h2 class="sec">Services</h2>
  <div class="card">
    <div id="svc-list">${settings.services.map((s, i) => svcRow(s, i)).join('')}</div>
    <button class="btn ghost" onclick="addSvcRow()">＋ Add service</button>
    <button class="btn" onclick="saveServices()">Save services</button>
  </div>

  <h2 class="sec">Your data</h2>
  <div class="card">
    <div class="hint">Everything is stored on this device only. Back it up before you change phones.</div>
    <div class="actions">
      <button class="btn ghost" onclick="exportJSON()">Download backup</button>
      <button class="btn ghost" onclick="$('import-file').click()">Restore backup</button>
      <button class="btn ghost" onclick="exportCSV()">Export CSV</button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" hidden onchange="importJSON(this)">
    <button class="btn danger" onclick="wipeAll()">Delete everything</button>
  </div>
  <div class="hint center">${clients.length} clients · ${cuts.length} cuts stored</div>`;
}

function svcRow(s, i) {
  return `<div class="two svc" data-i="${i}">
    <input class="svc-name" value="${esc(s.name)}" placeholder="Service">
    <div class="two-end">
      <input class="svc-price" type="number" inputmode="decimal" value="${esc(s.price)}" placeholder="0">
      <button class="x" onclick="this.closest('.svc').remove()" aria-label="Remove">×</button>
    </div>
  </div>`;
}
function addSvcRow() {
  $('svc-list').insertAdjacentHTML('beforeend', svcRow({ name: '', price: settings.defaultPrice }, settings.services.length));
}
function saveServices() {
  const rows = [...document.querySelectorAll('#svc-list .svc')];
  settings.services = rows.map(r => ({
    name: r.querySelector('.svc-name').value.trim(),
    price: parseFloat(r.querySelector('.svc-price').value) || 0,
  })).filter(s => s.name);
  saveSettings();
  toast('Services saved');
  render();
}
function saveShopSettings() {
  settings.shopName = val('s-name') || 'The Chair';
  settings.currency = val('s-cur') || '$';
  settings.defaultPrice = num('s-price');
  settings.defaultInterval = Math.max(1, num('s-int') || 28);
  const methods = val('s-methods').split(',').map(m => m.trim()).filter(Boolean);
  if (methods.length) settings.methods = methods;
  saveSettings();
  toast('Saved');
  render();
}

// ── SHEETS ────────────────────────────────────────────────────────────────
function openSheet(html) {
  $('sheet').innerHTML = html;
  $('sheet').classList.add('open');
  $('scrim').classList.add('open');
  document.body.classList.add('locked');
}
function closeSheet() {
  $('sheet').classList.remove('open');
  $('scrim').classList.remove('open');
  document.body.classList.remove('locked');
}

// One editor for both "log a cut that just happened" and "book one for later".
function openCutSheet(o) {
  o = o || {};
  const existing = o.id ? cuts.find(c => c.id === o.id) : null;
  const booking = existing ? !existing.done : o.mode === 'book';
  const clientId = existing ? existing.clientId : (o.clientId || '');
  const client = clientById(clientId);
  const price = existing ? existing.price : (client && client.price ? client.price : settings.defaultPrice);
  const date = existing ? existing.date : (o.date || (booking ? isoAdd(todayISO(), 7) : todayISO()));
  const service = existing ? existing.service : (settings.services[0] ? settings.services[0].name : '');
  const paid = existing ? !!existing.paid : !booking;
  const method = existing ? (existing.method || settings.methods[0]) : settings.methods[0];

  openSheet(`
    <div class="sheet-grip"></div>
    <h3>${existing ? 'Edit' : booking ? 'Book a cut' : 'Log a cut'}</h3>
    <input type="hidden" id="f-id" value="${existing ? existing.id : ''}">
    <input type="hidden" id="f-booking" value="${booking ? '1' : ''}">

    <label>Client
      <select id="f-client" onchange="onClientPick()">
        <option value="">＋ New client</option>
        ${clients.filter(c => !c.archived).sort((a, b) => a.name.localeCompare(b.name))
          .map(c => `<option value="${c.id}" ${c.id === clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </label>
    <div id="f-new" ${clientId ? 'hidden' : ''}>
      <div class="two">
        <label>Name<input id="f-name" placeholder="Who's in the chair?"></label>
        <label>Phone<input id="f-phone" type="tel" placeholder="Optional"></label>
      </div>
    </div>

    <div class="two">
      <label>Date<input id="f-date" type="date" value="${esc(date)}"></label>
      <label>Time<input id="f-time" type="time" value="${esc(existing ? existing.time || '' : '')}"></label>
    </div>

    <label>Service
      <select id="f-service" onchange="onServicePick()">
        ${settings.services.map(s => `<option value="${esc(s.name)}" ${s.name === service ? 'selected' : ''}>${esc(s.name)} — ${esc(money(s.price))}</option>`).join('')}
        <option value="Other" ${service === 'Other' ? 'selected' : ''}>Other</option>
      </select>
    </label>

    <label>Price<input id="f-price" type="number" inputmode="decimal" step="0.5" value="${esc(price)}"></label>

    <div class="toggles">
      <label class="check"><input type="checkbox" id="f-done" ${booking ? '' : 'checked'} onchange="onDoneToggle()"><span>Cut is done</span></label>
      <label class="check"><input type="checkbox" id="f-paid" ${paid ? 'checked' : ''} onchange="onPaidToggle()"><span>Paid</span></label>
    </div>
    <label id="f-method-wrap" ${paid ? '' : 'hidden'}>Paid with
      <select id="f-method">${settings.methods.map(m => `<option ${m === method ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
    </label>

    <label>Notes<input id="f-notes" placeholder="Number 2 on the sides, scissors on top…" value="${esc(existing ? existing.notes || '' : '')}"></label>

    <div class="sheet-acts">
      ${existing ? `<button class="btn danger ghost" onclick="deleteCut('${existing.id}')">Delete</button>` : ''}
      <button class="btn ghost" onclick="closeSheet()">Cancel</button>
      <button class="btn" onclick="saveCut()">Save</button>
    </div>`);

  if (!clientId) setTimeout(() => { const el = $('f-name'); if (el) el.focus(); }, 250);
}

function onClientPick() {
  const id = val('f-client');
  $('f-new').hidden = !!id;
  const c = clientById(id);
  if (c && c.price) $('f-price').value = c.price;
  if (!id) { const el = $('f-name'); if (el) el.focus(); }
}
function onServicePick() {
  const s = settings.services.find(x => x.name === val('f-service'));
  if (s) $('f-price').value = s.price;
}
// An unfinished cut cannot be paid for, and money in hand means it happened.
function onDoneToggle() {
  if (!$('f-done').checked) { $('f-paid').checked = false; onPaidToggle(); }
}
function onPaidToggle() {
  const paid = $('f-paid').checked;
  $('f-method-wrap').hidden = !paid;
  if (paid) $('f-done').checked = true;
}

function saveCut() {
  const id = val('f-id');
  let clientId = val('f-client');

  if (!clientId) {
    const name = val('f-name');
    if (!name) { toast('Give them a name first'); const el = $('f-name'); if (el) el.focus(); return; }
    const existing = clients.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      clientId = existing.id;                       // don't create a second Dave
    } else {
      const c = { id: genId('cl'), name, phone: val('f-phone'), notes: '', price: num('f-price'), interval: 0, createdAt: todayISO() };
      clients.push(c);
      saveClients();
      clientId = c.id;
    }
  }

  const done = $('f-done').checked;
  const paid = done && $('f-paid').checked;
  const rec = {
    clientId,
    date: val('f-date') || todayISO(),
    time: val('f-time'),
    service: val('f-service'),
    price: num('f-price'),
    done,
    paid,
    method: paid ? val('f-method') : '',
    notes: val('f-notes'),
  };

  if (id) {
    const i = cuts.findIndex(c => c.id === id);
    if (i > -1) {
      // Keep the original payment date unless this edit is what settled it.
      const prev = cuts[i];
      rec.paidDate = paid ? (prev.paid && prev.paidDate ? prev.paidDate : todayISO()) : '';
      cuts[i] = Object.assign({}, prev, rec);
    }
  } else {
    rec.id = genId('cut');
    rec.paidDate = paid ? todayISO() : '';
    cuts.push(rec);
  }
  saveCuts();
  closeSheet();
  toast(id ? 'Updated' : done ? 'Cut logged' : 'Booked in');
  render();
}

function markDone(id) {
  const c = cuts.find(x => x.id === id);
  if (!c) return;
  c.done = true;
  if (c.date > todayISO()) c.date = todayISO();   // finishing early moves it to now
  saveCuts();
  render();
  openPaySheet(id, true);
}

function openPaySheet(id, fresh) {
  const c = cuts.find(x => x.id === id);
  if (!c) return;
  openSheet(`
    <div class="sheet-grip"></div>
    <h3>${esc(nameOf(c.clientId))} — ${esc(money(c.price))}</h3>
    <div class="hint">${fresh ? 'Cut logged. Did they pay?' : 'How did they pay?'}</div>
    <div class="method-grid">
      ${settings.methods.map((m, i) => `<button class="method" onclick="payWith('${c.id}', ${i})">${esc(m)}</button>`).join('')}
    </div>
    <div class="sheet-acts">
      <button class="btn ghost" onclick="closeSheet()">${fresh ? 'Not yet — they owe me' : 'Cancel'}</button>
    </div>`);
}

function payWith(id, methodIdx) {
  const c = cuts.find(x => x.id === id);
  if (!c) return;
  const method = settings.methods[methodIdx] || '';
  c.done = true;
  c.paid = true;
  c.method = method;
  c.paidDate = todayISO();
  saveCuts();
  closeSheet();
  toast(`${nameOf(c.clientId)} paid ${money(c.price)}`);
  render();
}

function payAllFor(clientId) {
  const owed = cuts.filter(c => c.clientId === clientId && c.done && !c.paid);
  if (!owed.length) return;
  const total = owed.reduce((s, c) => s + (+c.price || 0), 0);
  openSheet(`
    <div class="sheet-grip"></div>
    <h3>${esc(nameOf(clientId))} — ${esc(money(total))}</h3>
    <div class="hint">Settling ${owed.length} unpaid cuts. How did they pay?</div>
    <div class="method-grid">
      ${settings.methods.map((m, i) => `<button class="method" onclick="settleAll('${clientId}', ${i})">${esc(m)}</button>`).join('')}
    </div>
    <div class="sheet-acts"><button class="btn ghost" onclick="closeSheet()">Cancel</button></div>`);
}

function settleAll(clientId, methodIdx) {
  const method = settings.methods[methodIdx] || '';
  let total = 0;
  cuts.forEach(c => {
    if (c.clientId === clientId && c.done && !c.paid) {
      c.paid = true; c.method = method; c.paidDate = todayISO(); total += (+c.price || 0);
    }
  });
  saveCuts();
  closeSheet();
  toast(`${nameOf(clientId)} settled ${money(total)}`);
  render();
}

function unpay(id) {
  const c = cuts.find(x => x.id === id);
  if (!c) return;
  c.paid = false; c.method = ''; c.paidDate = '';
  saveCuts();
  toast('Marked unpaid');
  render();
}

function deleteCut(id) {
  if (!confirm('Delete this cut for good?')) return;
  cuts = cuts.filter(c => c.id !== id);
  saveCuts();
  closeSheet();
  toast('Deleted');
  render();
}

// ── CLIENT EDITOR ─────────────────────────────────────────────────────────
function openClientSheet(id) {
  const c = id ? clientById(id) : null;
  openSheet(`
    <div class="sheet-grip"></div>
    <h3>${c ? 'Edit client' : 'New client'}</h3>
    <input type="hidden" id="c-id" value="${c ? c.id : ''}">
    <label>Name<input id="c-name" value="${esc(c ? c.name : '')}" placeholder="Name"></label>
    <label>Phone<input id="c-phone" type="tel" value="${esc(c ? c.phone || '' : '')}" placeholder="Optional"></label>
    <div class="two">
      <label>Usual price<input id="c-price" type="number" inputmode="decimal" value="${esc(c && c.price ? c.price : settings.defaultPrice)}"></label>
      <label>Comes in every<input id="c-int" type="number" inputmode="numeric" placeholder="auto" value="${esc(c && c.interval ? c.interval : '')}"></label>
    </div>
    <div class="hint">Leave the gap blank and it is worked out from their history (days).</div>
    <label>Notes<input id="c-notes" value="${esc(c ? c.notes || '' : '')}" placeholder="Fade guard 1, hard part, no talking"></label>
    <div class="sheet-acts">
      ${c ? `<button class="btn danger ghost" onclick="deleteClient('${c.id}')">Delete</button>` : ''}
      <button class="btn ghost" onclick="closeSheet()">Cancel</button>
      <button class="btn" onclick="saveClient()">Save</button>
    </div>`);
  setTimeout(() => { const el = $('c-name'); if (el) el.focus(); }, 250);
}

function saveClient() {
  const name = val('c-name');
  if (!name) { toast('Name required'); return; }
  const id = val('c-id');
  const data = {
    name,
    phone: val('c-phone'),
    price: num('c-price'),
    interval: num('c-int'),
    notes: val('c-notes'),
  };
  if (id) {
    const i = clients.findIndex(c => c.id === id);
    if (i > -1) clients[i] = Object.assign({}, clients[i], data);
  } else {
    clients.push(Object.assign({ id: genId('cl'), createdAt: todayISO() }, data));
  }
  saveClients();
  closeSheet();
  toast('Saved');
  render();
}

function deleteClient(id) {
  const n = cutsOf(id).length;
  if (!confirm(`Delete ${nameOf(id)}${n ? ` and their ${n} logged cut${n === 1 ? '' : 's'}` : ''}? This cannot be undone.`)) return;
  clients = clients.filter(c => c.id !== id);
  cuts = cuts.filter(c => c.clientId !== id);
  saveClients(); saveCuts();
  closeSheet();
  go('clients');
  toast('Client deleted');
}

// ── BACKUP / EXPORT ───────────────────────────────────────────────────────
function download(filename, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJSON() {
  download(`chair-backup-${todayISO()}.json`,
    JSON.stringify({ version: 1, exported: new Date().toISOString(), clients, cuts, settings }, null, 2),
    'application/json');
  toast('Backup downloaded');
}

function importJSON(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!Array.isArray(d.clients) || !Array.isArray(d.cuts)) throw new Error('bad file');
      if (!confirm(`Restore ${d.clients.length} clients and ${d.cuts.length} cuts? This replaces what is on this device.`)) return;
      clients = d.clients;
      cuts = d.cuts;
      if (d.settings) settings = Object.assign({}, DEFAULT_SETTINGS, d.settings);
      saveClients(); saveCuts(); saveSettings();
      toast('Backup restored');
      go('today');
    } catch (e) {
      alert('That file could not be read as a Chair backup.');
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}

function exportCSV() {
  const q = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
  const rows = [['Date', 'Time', 'Client', 'Phone', 'Service', 'Price', 'Status', 'Paid', 'Method', 'Paid on', 'Notes']];
  cuts.slice().sort(byDateDesc).forEach(c => {
    const cl = clientById(c.clientId) || {};
    rows.push([c.date, c.time || '', nameOf(c.clientId), cl.phone || '', c.service || '',
      (+c.price || 0).toFixed(2), c.done ? 'Done' : 'Booked', c.paid ? 'Yes' : 'No',
      c.method || '', c.paidDate || '', c.notes || '']);
  });
  download(`chair-cuts-${todayISO()}.csv`, rows.map(r => r.map(q).join(',')).join('\n'), 'text/csv');
  toast('CSV downloaded');
}

function wipeAll() {
  if (!confirm('Delete every client and every cut? Download a backup first if you are not sure.')) return;
  if (!confirm('Really delete everything? There is no undo.')) return;
  clients = []; cuts = [];
  saveClients(); saveCuts();
  go('today');
  toast('All data deleted');
}

// ── BOOT ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
