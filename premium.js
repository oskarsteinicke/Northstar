// ══════════════════════════════════════════════════════════════════════════
// Arete — Premium / Paywall Module  (single-tier freemium)
// ══════════════════════════════════════════════════════════════════════════
//
// Model:
//   Free      — core habit tracking (max 5 habits), streaks, leaderboard, character
//   Premium   — unlimited habits, workout + nutrition logging, AI coach,
//               custom routines, progress analytics.   $7.99/mo or $59/yr
//
//   • Existing users (anyone with data when this shipped) are grandfathered to
//     Premium for life, free of charge.
//   • Brand-new users get a 7-day Premium trial (no card), then the wall drops.
// ──────────────────────────────────────────────────────────────────────────

const PREMIUM = {
  priceMonthly: '$7.99',
  priceYearly: '$59',
  yearlyPerMonth: '$4.92',
  yearlySavePct: 38,
  trialDays: 7,
  freeHabitLimit: 5,
};
const FREE_HABIT_LIMIT = PREMIUM.freeHabitLimit;
const _PREMIUM_WORKER_URL = 'https://arete-ai.oskarsteinicke.workers.dev';

// ── ONE-TIME MIGRATION ──────────────────────────────────────────────────────
// Grandfather everyone who already uses the app; start a trial for new users.
(function _paywallMigration() {
  try {
    if (localStorage.getItem('hvi_paywall_migrated')) return;
    const isExisting = !!(localStorage.getItem('hvi_onboarded') || localStorage.getItem('hvi_habits'));
    if (isExisting) {
      localStorage.setItem('hvi_grandfathered', 'true');
    } else {
      localStorage.setItem('hvi_trial_start', String(Date.now()));
    }
    localStorage.setItem('hvi_paywall_migrated', '1');
  } catch {}
})();

// ── PLAN STATE ──────────────────────────────────────────────────────────────
function isGrandfathered() {
  return localStorage.getItem('hvi_grandfathered') === 'true';
}
function _trialStart() {
  return parseInt(localStorage.getItem('hvi_trial_start') || '0', 10);
}
function isTrialActive() {
  const s = _trialStart();
  if (!s) return false;
  return (Date.now() - s) < PREMIUM.trialDays * 86400000;
}
function trialDaysLeft() {
  const s = _trialStart();
  if (!s) return 0;
  return Math.max(0, Math.ceil(PREMIUM.trialDays - (Date.now() - s) / 86400000));
}
function _metaPlan() {
  try {
    const meta = (typeof getSession === 'function' ? getSession() : null)?.user?.user_metadata;
    if (meta && (meta.plan === 'premium' || meta.plan === 'pro' || meta.plan === 'elite')) return meta.plan;
  } catch {}
  return null;
}
function getUserPlan() {
  if (_metaPlan()) return 'premium';                                   // server of truth
  const local = localStorage.getItem('hvi_plan');
  if (local === 'premium' || local === 'pro' || local === 'elite') return 'premium';
  if (isGrandfathered()) return 'premium';
  if (isTrialActive()) return 'premium';
  return 'free';
}
function isPremium() { return getUserPlan() === 'premium'; }
// True only for paying subscribers (not grandfathered / trial) — used for "Manage" UI
function isPaidSubscriber() {
  return !!_metaPlan() || ['premium', 'pro', 'elite'].includes(localStorage.getItem('hvi_plan'));
}

// ── GATE HELPERS ──────────────────────────────────────────────────────────
// Returns true if allowed; otherwise opens the paywall and returns false.
function requirePremium(feature) {
  if (isPremium()) return true;
  showUpgradeModal(feature);
  return false;
}
function canAddHabit() {
  if (isPremium()) return true;
  try {
    // `habits` is a top-level `let` in app.js, which is script-scoped and never
    // becomes a property of window. Reading window.habits therefore always gave
    // undefined, the count fell back to 0, and the free limit was never
    // enforced for anyone. Classic scripts share one lexical scope, so the
    // binding is reachable directly.
    const list = (typeof habits !== 'undefined' && Array.isArray(habits)) ? habits : [];
    return list.length < FREE_HABIT_LIMIT;
  } catch { return true; }   // never block someone because of a lookup failure
}

// ── PAYWALL MODAL ───────────────────────────────────────────────────────────
const _FEATURE_COPY = {
  habits:    { icon: '🎯', title: 'Unlock unlimited habits', sub: `Free covers ${FREE_HABIT_LIMIT} habits. Go Premium to build your full routine.` },
  workout:   { icon: '🏋️', title: 'Unlock workout logging', sub: 'Track lifts, programs, PRs and full history with Premium.' },
  diet:      { icon: '🥗', title: 'Unlock nutrition tracking', sub: 'Log meals, scan food photos and hit your macros with Premium.' },
  coach:     { icon: '🧠', title: 'Unlock your AI coach', sub: 'Personal coaching on your habits, training and diet, anytime.' },
  routines:  { icon: '🌅', title: 'Unlock custom routines', sub: 'Build your morning and night rituals with Premium.' },
  analytics: { icon: '📊', title: 'Unlock progress analytics', sub: 'See deep trends across every pillar with Premium.' },
  default:   { icon: '👑', title: 'Unlock Arete Premium', sub: 'Get everything Arete has to offer.' },
};

let _selectedBilling = 'yearly';

function _premiumFeatureList() {
  return [
    'Unlimited habits',
    'Full workout logging, programs & PRs',
    'Nutrition tracking + AI food scan',
    'Unlimited AI coaching',
    'Custom morning & night routines',
    'Progress analytics across all pillars',
  ].map(f => `<li><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>${f}</li>`).join('');
}

function _billingToggleHTML() {
  const m = _selectedBilling === 'monthly', y = _selectedBilling === 'yearly';
  return `
    <div class="pw-billing">
      <button class="pw-bill-opt${m ? ' active' : ''}" onclick="setBilling('monthly')">
        <span class="pw-bill-name">Monthly</span>
        <span class="pw-bill-price">${PREMIUM.priceMonthly}<small>/mo</small></span>
      </button>
      <button class="pw-bill-opt${y ? ' active' : ''}" onclick="setBilling('yearly')">
        <span class="pw-bill-badge">Save ${PREMIUM.yearlySavePct}%</span>
        <span class="pw-bill-name">Yearly</span>
        <span class="pw-bill-price">${PREMIUM.priceYearly}<small>/yr</small></span>
        <span class="pw-bill-sub">${PREMIUM.yearlyPerMonth}/mo</span>
      </button>
    </div>`;
}

function setBilling(b) {
  _selectedBilling = b;
  const wrap = document.querySelector('.pw-billing');
  if (wrap) wrap.outerHTML = _billingToggleHTML();
}

function showUpgradeModal(feature) {
  const existing = document.getElementById('premium-modal');
  if (existing) existing.remove();

  const copy = _FEATURE_COPY[feature] || _FEATURE_COPY.default;
  const modal = document.createElement('div');
  modal.id = 'premium-modal';
  modal.className = 'pw-overlay';
  modal.innerHTML = `
    <div class="pw-card">
      <button class="pw-close" onclick="closeUpgradeModal()" aria-label="Close">&times;</button>
      <div class="pw-icon">${copy.icon}</div>
      <h2 class="pw-title">${copy.title}</h2>
      <p class="pw-sub">${copy.sub}</p>
      <ul class="pw-features">${_premiumFeatureList()}</ul>
      ${_billingToggleHTML()}
      <button class="pw-cta" id="premium-cta" onclick="startCheckout()">Go Premium</button>
      <p class="pw-fine">Cancel anytime. Secure checkout via Stripe.</p>
      <p class="pw-restore" onclick="restorePurchase()">Restore purchase</p>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('pw-visible'));
  if (typeof track === 'function') track('paywall_shown', { feature });
}

function closeUpgradeModal() {
  const modal = document.getElementById('premium-modal');
  if (!modal) return;
  modal.classList.remove('pw-visible');
  setTimeout(() => modal.remove(), 280);
}

// ── CHECKOUT ────────────────────────────────────────────────────────────────
async function startCheckout() {
  if (typeof track === 'function') track('checkout_start', { billing: _selectedBilling });
  const session = typeof getSession === 'function' ? getSession() : null;
  if (!session?.user) {
    alert('Create an account first to subscribe. Open Profile and sign up.');
    return;
  }
  const btn = document.getElementById('premium-cta');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  try {
    const res = await fetch(`${_PREMIUM_WORKER_URL}/stripe/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: 'premium',
        billing: _selectedBilling,
        user_id: session.user.id,
        email: session.user.email,
      }),
    });
    const data = await res.json();
    if (data.url) { window.location.href = data.url; return; }
    throw new Error(data.error || 'Could not start checkout');
  } catch (e) {
    console.warn('[premium] checkout error:', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Try again'; }
  }
}

async function openBillingPortal() {
  const session = typeof getSession === 'function' ? getSession() : null;
  const customer = session?.user?.user_metadata?.stripe_customer || localStorage.getItem('hvi_stripe_customer');
  if (!customer) {
    alert('No active subscription found on this account. If you just subscribed, tap "Force Sync Now" first.');
    return;
  }
  try {
    const res = await fetch(`${_PREMIUM_WORKER_URL}/stripe/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customer }),
    });
    const data = await res.json();
    if (data.url) { window.location.href = data.url; return; }
    throw new Error(data.error || 'Could not open billing portal');
  } catch (e) {
    console.warn('[premium] portal error:', e);
    alert('Could not open the billing portal. Try again later.');
  }
}

function restorePurchase() {
  const session = typeof getSession === 'function' ? getSession() : null;
  if (!session?.user) { alert('Sign in first to restore your purchase.'); return; }
  const plan = session.user?.user_metadata?.plan;
  const cust = session.user?.user_metadata?.stripe_customer;
  if (plan === 'premium' || plan === 'pro' || plan === 'elite') {
    localStorage.setItem('hvi_plan', 'premium');
    if (cust) localStorage.setItem('hvi_stripe_customer', cust);
    closeUpgradeModal();
    alert('Your Premium plan has been restored.');
    if (typeof go === 'function') go('home');
  } else {
    alert('No active subscription found for this account.');
  }
}

// ── POST-CHECKOUT SUCCESS ───────────────────────────────────────────────────
(function _handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('upgrade') !== 'success') return;
  if (history.replaceState) history.replaceState(null, '', window.location.pathname);
  setTimeout(async () => {
    try {
      if (typeof authRefresh === 'function') await authRefresh();
      const session = typeof getSession === 'function' ? getSession() : null;
      const meta = session?.user?.user_metadata;
      if (meta?.plan && meta.plan !== 'free') {
        localStorage.setItem('hvi_plan', 'premium');
        if (meta.stripe_customer) localStorage.setItem('hvi_stripe_customer', meta.stripe_customer);
      } else {
        // Webhook may lag — optimistically mark locally; cloud will confirm
        localStorage.setItem('hvi_plan', 'premium');
      }
    } catch {}
    _showUpgradeSuccess();
  }, 1200);
})();

function _showUpgradeSuccess() {
  const modal = document.createElement('div');
  modal.id = 'premium-modal';
  modal.className = 'pw-overlay';
  modal.innerHTML = `
    <div class="pw-card">
      <div class="pw-icon">🎉</div>
      <h2 class="pw-title">Welcome to Premium</h2>
      <p class="pw-sub">Your upgrade is active. Everything is unlocked. Now go become your greatest self.</p>
      <button class="pw-cta" onclick="closeUpgradeModal();if(typeof go==='function')go('home')">Let's go</button>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('pw-visible'));
  if (typeof track === 'function') track('upgrade_complete', {});
}

// ── PROFILE SETTINGS CARD ───────────────────────────────────────────────────
function renderPremiumSettingsCard() {
  // Grandfathered founders
  if (isGrandfathered() && !isPaidSubscriber()) {
    return `<div class="pw-status pw-status-founder">
      <div class="pw-status-row"><span class="pw-status-badge">👑 Founder</span><span class="pw-status-plan">Premium · free for life</span></div>
      <div class="pw-status-note">You were here early. All features, always unlocked. Thank you.</div>
    </div>`;
  }
  // Paying subscriber
  if (isPaidSubscriber()) {
    return `<div class="pw-status pw-status-active">
      <div class="pw-status-row"><span class="pw-status-badge">⭐ Premium</span><span class="pw-status-plan">Active</span></div>
      <button class="w-action-btn" style="margin:12px 0 0" onclick="openBillingPortal()">Manage subscription</button>
    </div>`;
  }
  // Active trial
  if (isTrialActive()) {
    const d = trialDaysLeft();
    return `<div class="pw-status pw-status-trial">
      <div class="pw-status-row"><span class="pw-status-badge">✨ Premium trial</span><span class="pw-status-plan">${d} day${d === 1 ? '' : 's'} left</span></div>
      <div class="pw-status-note">Enjoy everything free for now. Subscribe to keep it after your trial.</div>
      <button class="pw-cta pw-cta-inline" onclick="showUpgradeModal('default')">Go Premium · ${PREMIUM.priceMonthly}/mo</button>
    </div>`;
  }
  // Free
  return `<div class="pw-status pw-status-free">
    <div class="pw-status-row"><span class="pw-status-badge pw-badge-free">Free plan</span></div>
    <div class="pw-status-note">Unlock unlimited habits, workouts, nutrition & your AI coach.</div>
    <button class="pw-cta pw-cta-inline" onclick="showUpgradeModal('default')">Go Premium · ${PREMIUM.priceMonthly}/mo</button>
  </div>`;
}
