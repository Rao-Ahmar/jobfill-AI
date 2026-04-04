import { useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { PLAN_LABELS, PLAN_PRICING } from '@/config/plans';
import { Crown, Loader2, Lock, ArrowUp } from 'lucide-react';

export function SubscriptionGate({ children, feature, featureName }) {
  const { isLoading, canUseFeature, openCheckout, daysUntilReset } = useSubscription();
  const [email, setEmail] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  const check = canUseFeature(feature || 'autofill');
  if (check.allowed) return children;

  const handleUpgrade = async (plan) => {
    if (!email.trim()) return;
    setCheckingOut(true);
    await openCheckout(email.trim(), plan, 'monthly');
    setCheckingOut(false);
  };

  // Blocked by tier — user doesn't have the right plan
  if (check.reason === 'tier') {
    const targetPlan = check.upgradeTarget || 'pro';
    const price = PLAN_PRICING[targetPlan];

    return (
      <div className="flex flex-col h-full overflow-y-auto scrollbar-custom pb-20 fade-in">
        <div className="relative overflow-hidden bg-gradient-to-br from-violet-900 via-indigo-900 to-purple-900 px-5 py-8 text-center">
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, #a78bfa 0%, transparent 70%)' }} />
          <div className="relative">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 mb-3 shadow-lg">
              <Lock size={28} className="text-white" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1">
              {featureName || 'This feature'} requires {PLAN_LABELS[targetPlan]}
            </h2>
            <p className="text-sm text-indigo-200 leading-relaxed">
              Upgrade to <span className="text-yellow-300 font-bold">{PLAN_LABELS[targetPlan]}</span> starting at{' '}
              <span className="text-yellow-300 font-bold">${price?.monthly}/mo</span>
            </p>
          </div>
        </div>

        <div className="px-4 py-4 space-y-3">
          <div>
            <label className="block text-xs text-textSecondary mb-1.5">Your email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-field py-2 text-sm"
            />
          </div>
          <button
            onClick={() => handleUpgrade(targetPlan)}
            disabled={checkingOut || !email.trim()}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-indigo-900/40 disabled:opacity-60"
          >
            {checkingOut ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Crown size={16} />
            )}
            {checkingOut ? 'Opening checkout...' : `Get ${PLAN_LABELS[targetPlan]} — $${price?.monthly}/mo`}
          </button>
          <p className="text-center text-[11px] text-textSecondary">
            Secure checkout via Lemon Squeezy
          </p>
        </div>
      </div>
    );
  }

  // Blocked by usage limit
  if (check.reason === 'limit') {
    const targetPlan = check.upgradeTarget;

    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center fade-in">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center mb-4">
          <ArrowUp size={28} className="text-amber-400" />
        </div>
        <h2 className="text-base font-bold text-textPrimary mb-1">Monthly Limit Reached</h2>
        <p className="text-sm text-textSecondary mb-1">
          You've used {check.used}/{check.limit} {featureName || feature} this month.
        </p>
        <p className="text-xs text-textSecondary mb-4">
          Resets in {daysUntilReset} days.
          {targetPlan && ` Upgrade to ${PLAN_LABELS[targetPlan]} for more.`}
        </p>
        {targetPlan && (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-field py-2 text-sm w-full mb-3"
            />
            <button
              onClick={() => handleUpgrade(targetPlan)}
              disabled={checkingOut || !email.trim()}
              className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2.5 rounded-xl transition-all disabled:opacity-60"
            >
              {checkingOut ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
              {checkingOut ? 'Opening...' : `Upgrade to ${PLAN_LABELS[targetPlan]}`}
            </button>
          </>
        )}
      </div>
    );
  }

  // Fallback
  return children;
}
