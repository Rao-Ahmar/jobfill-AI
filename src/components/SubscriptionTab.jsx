import { useState, useEffect } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { PLAN_PRICING, PLAN_LIMITS, PLAN_LABELS } from '@/config/plans';
import {
  Crown, CheckCircle2, XCircle, Loader2,
  RefreshCw, ExternalLink, Shield, Zap, Star,
  FileText, Target, Settings, ArrowUp
} from 'lucide-react';

const PLAN_FEATURES = {
  starter: [
    '50 Auto-Fills / month',
    '5 Custom Fields',
    'Resume Upload & Attach',
  ],
  pro: [
    '150 Auto-Fills / month',
    '50 Cover Letters / month',
    '50 ATS Keyword Scans / month',
    'Unlimited Custom Fields',
  ],
  power: [
    '500 Auto-Fills / month (fair use)',
    'Unlimited Cover Letters',
    'Unlimited ATS Keywords',
    'Priority AI Processing',
    'Unlimited Custom Fields',
  ],
};

const PLAN_COLORS = {
  starter: { border: 'border-blue-500/30', bg: 'bg-blue-500/10', accent: 'text-blue-400', btn: 'bg-blue-500 hover:bg-blue-600' },
  pro:     { border: 'border-indigo-500/30', bg: 'bg-indigo-500/10', accent: 'text-indigo-400', btn: 'bg-indigo-500 hover:bg-indigo-600' },
  power:   { border: 'border-purple-500/30', bg: 'bg-purple-500/10', accent: 'text-purple-400', btn: 'bg-purple-500 hover:bg-purple-600' },
};

function UsageBar({ label, used, limit, icon: Icon }) {
  const isUnlimited = !limit || limit === Infinity;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-indigo-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-textSecondary">
          <Icon size={12} /> {label}
        </span>
        <span className="text-textPrimary font-medium">
          {isUnlimited ? `${used} used` : `${used} / ${limit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export function SubscriptionTab() {
  const {
    plan, isSubscribed, isLoading, subscriptionData, usage, daysUntilReset,
    refreshStatus, openCheckout, openPortal, clearSubscription
  } = useSubscription();

  const [email, setEmail] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [billing, setBilling] = useState('monthly');

  useEffect(() => {
    if (subscriptionData?.email) setEmail(subscriptionData.email);
  }, [subscriptionData]);

  const handleVerify = async () => {
    if (!email.trim()) return;
    setVerifying(true);
    setVerifyResult(null);
    const result = await refreshStatus(email.trim());
    setVerifyResult(result.status);
    setVerifying(false);
  };

  const handleCheckout = async (planName) => {
    if (!email.trim()) return;
    setCheckingOut(true);
    await openCheckout(email.trim(), planName, billing);
    setCheckingOut(false);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return null;
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-custom pb-20 fade-in">

      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-violet-900 via-indigo-900 to-purple-900 px-5 py-6">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #a78bfa, transparent 60%)' }} />
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg flex-shrink-0">
            <Crown size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">JobFill AI Plans</h1>
            <p className="text-xs text-indigo-200">
              {isSubscribed
                ? `${PLAN_LABELS[plan]} Plan Active`
                : 'Choose your plan'}
            </p>
          </div>
          {isSubscribed && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-400/10 rounded-full px-2 py-1">
              <CheckCircle2 size={10} /> Active
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* ── Subscribed View ─────────────────────────────────────── */}
        {isSubscribed && (
          <>
            {/* Usage Dashboard */}
            <div className="card-container space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-textPrimary">Usage This Month</h2>
                <span className="text-[10px] text-textSecondary">Resets in {daysUntilReset} days</span>
              </div>

              <UsageBar label="Auto-Fill" used={usage.autofill} limit={limits.autofill} icon={Zap} />

              {limits.coverletter > 0 && (
                <UsageBar label="Cover Letters" used={usage.coverletter} limit={limits.coverletter} icon={FileText} />
              )}
              {limits.keywords > 0 && (
                <UsageBar label="ATS Keywords" used={usage.keywords} limit={limits.keywords} icon={Target} />
              )}

              {limits.customFields !== Infinity && (
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-textSecondary">
                    <Settings size={12} /> Custom Fields
                  </span>
                  <span className="text-textPrimary font-medium">Max {limits.customFields}</span>
                </div>
              )}
            </div>

            {/* Subscription Info */}
            {subscriptionData && (
              <div className="card-container space-y-1.5 text-xs text-textSecondary">
                {subscriptionData.email && (
                  <p>Email: <span className="text-textPrimary">{subscriptionData.email}</span></p>
                )}
                {subscriptionData.currentPeriodEnd && (
                  <p>Renews: <span className="text-textPrimary">{formatDate(subscriptionData.currentPeriodEnd)}</span></p>
                )}
              </div>
            )}

            {/* Upgrade prompt (if not Power) */}
            {plan !== 'power' && (
              <button
                onClick={() => {
                  // scroll to plans or just show them — for now, clear to show plans
                }}
                className="w-full flex items-center justify-center gap-2 text-sm font-medium text-indigo-400 border border-indigo-500/30 py-2.5 rounded-lg hover:bg-indigo-500/10 transition-colors"
              >
                <ArrowUp size={14} /> Upgrade Plan
              </button>
            )}

            {/* Billing */}
            <div className="card-container space-y-2">
              <h2 className="text-sm font-semibold text-textPrimary">Billing</h2>
              <button
                onClick={() => openPortal(subscriptionData?.email || email)}
                className="w-full flex items-center justify-center gap-2 border border-border hover:border-indigo-500 text-sm text-textPrimary py-2.5 rounded-lg transition-colors"
              >
                <ExternalLink size={14} /> Manage Billing & Invoices
              </button>
              <button
                onClick={clearSubscription}
                className="w-full text-xs text-textSecondary hover:text-red-400 transition-colors py-1.5"
              >
                Sign out / clear subscription data
              </button>
            </div>
          </>
        )}

        {/* ── Unsubscribed View ───────────────────────────────────── */}
        {!isSubscribed && (
          <div className="space-y-4">

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setBilling('monthly')}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  billing === 'monthly'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-card border border-border text-textSecondary hover:text-textPrimary'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling('annual')}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  billing === 'annual'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-card border border-border text-textSecondary hover:text-textPrimary'
                }`}
              >
                Annual <span className="text-green-400 text-[10px] ml-1">Save ~30%</span>
              </button>
            </div>

            {/* Email Input */}
            <div>
              <label className="block text-xs text-textSecondary mb-1.5">Your email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input-field py-2 text-xs w-full"
              />
            </div>

            {/* Plan Cards */}
            {['starter', 'pro', 'power'].map((planKey) => {
              const colors = PLAN_COLORS[planKey];
              const price = PLAN_PRICING[planKey];
              const features = PLAN_FEATURES[planKey];
              const isPro = planKey === 'pro';

              return (
                <div
                  key={planKey}
                  className={`relative rounded-2xl border ${colors.border} ${colors.bg} p-4 transition-all hover:shadow-lg ${
                    isPro ? 'ring-1 ring-indigo-500/30' : ''
                  }`}
                >
                  {isPro && (
                    <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-bl-xl rounded-tr-xl">
                      MOST POPULAR
                    </div>
                  )}

                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className={`text-sm font-bold ${colors.accent}`}>
                        {PLAN_LABELS[planKey]}
                      </h3>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-black text-textPrimary">
                          ${billing === 'monthly' ? price.monthly : price.annual}
                        </span>
                        <span className="text-[10px] text-textSecondary">
                          /{billing === 'monthly' ? 'mo' : 'yr'}
                        </span>
                      </div>
                      {billing === 'annual' && (
                        <p className="text-[10px] text-green-400 mt-0.5">
                          ${Math.round(price.annual / 12)}/mo billed annually
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleCheckout(planKey)}
                      disabled={checkingOut || !email.trim()}
                      className={`${colors.btn} text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-md disabled:opacity-50`}
                    >
                      {checkingOut ? '...' : 'Subscribe'}
                    </button>
                  </div>

                  <ul className="space-y-1">
                    {features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-[11px] text-textSecondary">
                        <CheckCircle2 size={10} className={colors.accent} /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            {/* Verify Existing Sub */}
            <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-textPrimary">Verify Existing Subscription</h2>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Purchase email..."
                  className="input-field flex-1 py-2 text-xs"
                />
                <button
                  onClick={handleVerify}
                  disabled={verifying || !email.trim()}
                  className="bg-card border border-border hover:border-indigo-500 text-textPrimary px-3 rounded-lg transition-colors disabled:opacity-50"
                >
                  {verifying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                </button>
              </div>

              {verifyResult && (
                <div className={`text-[10px] rounded-lg px-2 py-1.5 ${
                  verifyResult === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  {verifyResult === 'active' ? '✓ Subscription verified!' : '✕ No active subscription found.'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-4 text-[10px] text-textSecondary pt-1">
          <span className="flex items-center gap-1"><Shield size={10} /> Secure Checkout</span>
          <span>·</span>
          <span>Cancel anytime</span>
          <span>·</span>
          <span>Lemon Squeezy</span>
        </div>

      </div>
    </div>
  );
}
