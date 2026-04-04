import { useState, useEffect } from 'react';
import { PLAN_LIMITS, PLAN_TIERS, FEATURE_REQUIRED_PLAN, hasTierAccess, getUpgradeTarget } from '@/config/plans';

const SERVER_URL = 'http://localhost:3001';

// ─── TESTING BYPASS ──────────────────────────────────────────────────────────
// Set to true during development: forces plan='power', all features allowed
const TESTING_BYPASS = true;
// ─────────────────────────────────────────────────────────────────────────────

function getNextResetDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
}

function createEmptyUsage() {
  return { autofill: 0, coverletter: 0, keywords: 0, resetDate: getNextResetDate() };
}

export function useSubscription() {
  const [plan, setPlan] = useState(TESTING_BYPASS ? 'power' : 'free');
  const [usage, setUsage] = useState(createEmptyUsage());
  const [isLoading, setIsLoading] = useState(!TESTING_BYPASS);
  const [subscriptionData, setSubscriptionData] = useState(null);

  // Backward compat
  const isSubscribed = plan !== 'free';
  const usageCount = usage.autofill;

  useEffect(() => {
    loadFromStorage();
  }, []);

  const loadFromStorage = async () => {
    try {
      const result = await chrome.storage.local.get([
        'jobfill_subscription',
        'jobfill_usage',
        'jobfill_usage_count', // legacy key for migration
      ]);

      // Restore subscription / plan
      const stored = result.jobfill_subscription;
      if (stored?.status === 'active') {
        if (!TESTING_BYPASS) setPlan(stored.plan || 'starter');
        setSubscriptionData(stored);
      }

      // Restore usage (with migration from old single counter)
      let storedUsage = result.jobfill_usage;
      if (!storedUsage && result.jobfill_usage_count != null) {
        // Migrate old format
        storedUsage = {
          autofill: result.jobfill_usage_count,
          coverletter: 0,
          keywords: 0,
          resetDate: getNextResetDate(),
        };
        await chrome.storage.local.set({ jobfill_usage: storedUsage });
        await chrome.storage.local.remove('jobfill_usage_count');
      }

      if (storedUsage) {
        // Monthly reset: if past resetDate, zero counters
        if (Date.now() >= storedUsage.resetDate) {
          const fresh = createEmptyUsage();
          await chrome.storage.local.set({ jobfill_usage: fresh });
          setUsage(fresh);
        } else {
          setUsage(storedUsage);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const canUseFeature = (feature) => {
    if (TESTING_BYPASS) {
      return { allowed: true, reason: null, upgradeTarget: null, remaining: Infinity };
    }

    const currentPlan = plan;
    const requiredPlan = FEATURE_REQUIRED_PLAN[feature] || 'starter';

    // Check tier access
    if (!hasTierAccess(currentPlan, requiredPlan)) {
      return {
        allowed: false,
        reason: 'tier',
        upgradeTarget: requiredPlan,
        remaining: 0,
      };
    }

    // Check usage limit
    const limits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;
    const limit = limits[feature];
    if (limit != null && limit !== Infinity) {
      const used = usage[feature] || 0;
      const remaining = Math.max(0, limit - used);
      if (remaining <= 0) {
        return {
          allowed: false,
          reason: 'limit',
          upgradeTarget: getUpgradeTarget(currentPlan, feature),
          remaining: 0,
          used,
          limit,
        };
      }
      return { allowed: true, reason: null, upgradeTarget: null, remaining, used, limit };
    }

    return { allowed: true, reason: null, upgradeTarget: null, remaining: Infinity };
  };

  const incrementUsage = async (feature) => {
    const key = feature || 'autofill';
    const updated = { ...usage, [key]: (usage[key] || 0) + 1 };
    await chrome.storage.local.set({ jobfill_usage: updated });
    setUsage(updated);
    return updated[key];
  };

  const refreshStatus = async (email) => {
    setIsLoading(true);
    try {
      const result = await chrome.storage.local.get('jobfill_subscription');
      const lookupEmail = email || result.jobfill_subscription?.email;
      if (!lookupEmail) return { status: 'none' };

      const response = await fetch(`${SERVER_URL}/api/verify-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: lookupEmail }),
      });

      const data = await response.json();

      if (data.status === 'active') {
        const subData = { ...data, email: lookupEmail };
        await chrome.storage.local.set({ jobfill_subscription: subData });
        setSubscriptionData(subData);
        if (!TESTING_BYPASS) setPlan(data.plan || 'starter');
      } else {
        if (!TESTING_BYPASS) setPlan('free');
      }

      return data;
    } catch (err) {
      console.error('Failed to verify subscription:', err);
      return { status: 'error' };
    } finally {
      setIsLoading(false);
    }
  };

  const openCheckout = async (email, planName, billing) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, plan: planName, billing }),
      });
      const data = await response.json();
      if (data.url) {
        chrome.tabs.create({ url: data.url });
      }
      return data;
    } catch (err) {
      console.error('Checkout error:', err);
      return { error: err.message };
    }
  };

  const openPortal = async (email) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/customer-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (data.url) {
        chrome.tabs.create({ url: data.url });
      }
    } catch (err) {
      console.error('Portal error:', err);
    }
  };

  const clearSubscription = async () => {
    await chrome.storage.local.remove(['jobfill_subscription', 'jobfill_usage', 'jobfill_usage_count']);
    if (!TESTING_BYPASS) setPlan('free');
    setSubscriptionData(null);
    setUsage(createEmptyUsage());
  };

  const daysUntilReset = Math.max(0, Math.ceil((usage.resetDate - Date.now()) / (1000 * 60 * 60 * 24)));

  return {
    plan,
    isSubscribed,
    isLoading,
    usage,
    usageCount,
    daysUntilReset,
    subscriptionData,
    canUseFeature,
    incrementUsage,
    refreshStatus,
    openCheckout,
    openPortal,
    clearSubscription,
  };
}
