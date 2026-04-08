import { useState, useEffect } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { PLAN_LIMITS, PLAN_LABELS } from '@/config/plans';
import {
  Crown, CheckCircle2, Loader2,
  RefreshCw, Shield, Zap,
  FileText, Target, Settings, ExternalLink
} from 'lucide-react';

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
    refreshStatus, openWebsite
  } = useSubscription();

  const [email, setEmail] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

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

  const formatDate = (timestamp) => {
    if (!timestamp) return null;
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-custom pb-20 fade-in">

      {/* Header */}
      <div className="bg-gradient-to-br from-violet-900 via-indigo-900 to-purple-900 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg flex-shrink-0">
            <Crown size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-white truncate">JobFill AI Pro</h1>
            <p className="text-[11px] text-indigo-200 truncate">
              {isSubscribed
                ? `${PLAN_LABELS[plan]} Plan Active`
                : 'Free Plan'}
            </p>
          </div>
          {isSubscribed && (
            <span className="flex items-center gap-1 text-[9px] font-bold text-green-400 bg-green-400/10 rounded-full px-2 py-0.5 flex-shrink-0 whitespace-nowrap">
              <CheckCircle2 size={9} /> Active
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">

        {/* ── SUBSCRIBED VIEW ── */}
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
                <p>Plan: <span className="text-textPrimary font-medium">{PLAN_LABELS[plan]}</span></p>
              </div>
            )}

            {/* Manage on Website */}
            <div className="card-container space-y-2">
              <h2 className="text-sm font-semibold text-textPrimary">Manage Subscription</h2>
              <button
                onClick={() => openWebsite('manage')}
                className="w-full flex items-center justify-center gap-2 border border-border hover:border-indigo-500 text-sm text-textPrimary py-2 rounded-lg transition-colors"
              >
                <ExternalLink size={14} /> Manage on Website
              </button>
            </div>
          </>
        )}

        {/* ── UNSUBSCRIBED VIEW ── */}
        {!isSubscribed && (
          <>
            {/* Free Tier Info */}
            <div className="card-container space-y-3">
              <h2 className="text-sm font-semibold text-textPrimary">Free Plan Usage</h2>
              <UsageBar label="Auto-Fill" used={usage.autofill} limit={limits.autofill} icon={Zap} />
              <p className="text-[10px] text-textSecondary">Resets in {daysUntilReset} days</p>
            </div>

            {/* Upgrade CTA */}
            <button
              onClick={openWebsite}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-indigo-900/40"
            >
              <Crown size={16} /> View Plans & Upgrade
            </button>

            {/* Verify Existing Subscription */}
            <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-textPrimary">Already subscribed?</h2>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your purchase email..."
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
                  {verifyResult === 'active'
                    ? '✓ Subscription verified!'
                    : verifyResult === 'cancelled'
                    ? '✕ Subscription was cancelled.'
                    : '✕ No active subscription found.'}
                </div>
              )}
            </div>
          </>
        )}

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-4 text-[10px] text-textSecondary pt-1">
          <span className="flex items-center gap-1"><Shield size={10} /> Secure Payments</span>
          <span>·</span>
          <span>Cancel anytime</span>
          <span>·</span>
          <span>Powered by Stripe</span>
        </div>

      </div>
    </div>
  );
}
