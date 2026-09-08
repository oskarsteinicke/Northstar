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
// Google Play requires Google Play Billing for digital purchases in apps
// distributed there. Arete charges through Stripe, so rather than route Android
// users into a checkout that violates that policy, the native build ships with
// everything unlocked. This is the gate for the whole paywall: with it true,
// none of the upgrade prompts below can be reached.
function isNativeBuild() {
  try { return !!(typeof window !== 'undefined' && window.Capacitor); } catch { return false; }
}

function getUserPlan() {
  if (isNativeBuild()) return 'premium';                               // see isNativeBuild
  if (_metaPlan()) return 'premium';                                   // server of truth
  const local = localStorage.getItem('hvi_plan');
  if (local === 'premium' || local === 'pro' || local === 'elite') return 'premium';
  if (isGrandfathered()) return 'premium';
  if (isTrialActive()) return 'premium';
  return 'free';
}
function isPremium() { return getUserPlan() === 'premium'; }

// An early account, granted premium permanently by the server. The server's
// answer is authoritative; the local copy only keeps the badge correct before
// the session metadata has been refreshed.
function isFounder() {
  try {
    const meta = (typeof getSession === 'function' ? getSession() : null)?.user?.user_metadata;
    if (meta && meta.founder === true) return true;
  } catch {}
  return localStorage.getItem('hvi_founder') === '1';
}

// True only for paying subscribers (not grandfathered / trial / founder) —
// used for "Manage" UI. Founders carry plan:'premium' in exactly the same
// fields a subscriber does, so without the founder test they would be offered
// a billing portal for a Stripe customer that does not exist.
function isPaidSubscriber() {
  if (isFounder()) return false;
  return !!_metaPlan() || ['premium', 'pro', 'elite'].includes(localStorage.getItem('hvi_plan'));
}

// ── PLAN RECONCILIATION ─────────────────────────────────────────────────────
// hvi_plan is a local cache, not a grant. It exists so the app works offline and
// so a purchase feels instant while the Stripe webhook lands. Anyone can type it
// into devtools, and no client-side check can prevent that — a pure client app
// cannot enforce entitlements, and pretending otherwise is worse than saying so.
//
// What this does is stop the forged flag *persisting*. Once signed in and
// online, the refreshed session carries the server's answer, and if that says
// no plan the local cache is cleared. Bypassing becomes something you have to
// redo every launch rather than set once.
//
// The exception is a purchase whose webhook has not arrived yet: the checkout
// return marks the flag optimistically, so clearing it immediately would undo a
// real purchase. Those are honoured for a day.
const _PLAN_GRACE_MS = 24 * 60 * 60 * 1000;

function _markPlanLocally(reason) {
  try {
    localStorage.setItem('hvi_plan', 'premium');
    localStorage.setItem('hvi_plan_since', String(Date.now()));
    localStorage.setItem('hvi_plan_reason', reason || 'unknown');
  } catch {}
}

function reconcilePlan() {
  try {
    if (typeof getSession !== 'function') return false;
    const session = getSession();
    if (!session || !session.user) return false;            // guest: nothing to check
    if (!localStorage.getItem('hvi_plan')) return false;    // nothing cached to clear
    if (_metaPlan()) return false;                          // server agrees
    if (isFounder()) return false;                          // granted, just not via plan

    const since = parseInt(localStorage.getItem('hvi_plan_since') || '0', 10);
    if (since && (Date.now() - since) < _PLAN_GRACE_MS) return false;   // webhook may still land

    localStorage.removeItem('hvi_plan');
    localStorage.removeItem('hvi_plan_since');
    localStorage.removeItem('hvi_plan_reason');
    if (typeof track === 'function') track('plan_reconciled', {});
    return true;
  } catch { return false; }
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

function showUpgradeModal(context) {
  if (isNativeBuild()) return;      // no Stripe checkout in a Play Store build
  return _showUpgradeModal(context);
}

function _showUpgradeModal(feature) {
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
    _markPlanLocally('restore');
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
        _markPlanLocally('checkout');
        if (meta.stripe_customer) localStorage.setItem('hvi_stripe_customer', meta.stripe_customer);
      } else {
        // Webhook may lag — mark locally and let reconcilePlan() confirm or
        // clear it once the grace window is up.
        _markPlanLocally('checkout-pending');
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
  if (isNativeBuild()) {
    return `<div class="pw-status pw-status-founder">
      <div class="pw-status-row"><span class="pw-status-badge">\u2b50 Premium</span><span class="pw-status-plan">Included</span></div>
      <div class="pw-status-note">Every feature is unlocked in the app. Nothing to subscribe to.</div>
    </div>`;
  }
  // Early accounts — server-granted, permanent, never billed
  if (isFounder()) {
    return `<div class="pw-status pw-status-founder">
      <div class="pw-status-row"><span class="pw-status-badge">\u{1F451} Founder</span><span class="pw-status-plan">Premium \u00b7 free for life</span></div>
      <div class="pw-status-note">You were here early. Everything is unlocked, permanently, with nothing to pay. Thank you.</div>
    </div>`;
  }
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
