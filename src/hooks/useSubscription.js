import { useState, useEffect } from 'react';
import { PLAN_LIMITS, PLAN_TIERS, FEATURE_REQUIRED_PLAN, hasTierAccess, getUpgradeTarget } from '@/config/plans';

const SERVER_URL = 'http://localhost:3001';
const WEBSITE_URL = SERVER_URL;

// ─── TESTING BYPASS ──────────────────────────────────────────────────────────
// Set to true during development: forces plan='power', all features allowed
const TESTING_BYPASS = false;
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
  const [userEmail, setUserEmail] = useState(null);

  // Backward compat
  const isSubscribed = plan !== 'free';
  const usageCount = usage.autofill;

  useEffect(() => {
    loadFromStorage();
  }, []);

  // Sync usage counters from server into local state + chrome.storage
  // NOTE: This only syncs usage numbers, NEVER the plan.
  // Plan is set exclusively from the verify-subscription response.
  const syncServerUsage = async (serverUsage) => {
    if (!serverUsage) return;

    const newUsage = {
      autofill: serverUsage.usage?.autofill ?? 0,
      coverletter: serverUsage.usage?.coverletter ?? 0,
      keywords: serverUsage.usage?.keywords ?? 0,
      resetDate: serverUsage.resetDate ? new Date(serverUsage.resetDate).getTime() : getNextResetDate(),
    };

    setUsage(newUsage);
    await chrome.storage.local.set({ jobfill_usage: newUsage });
  };

  // Fetch server-side usage for a given email
  const fetchServerUsage = async (email) => {
    if (!email) return null;
    try {
      const response = await fetch(`${SERVER_URL}/api/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      await syncServerUsage(data);
      return data;
    } catch {
      return null;
    }
  };

  const loadFromStorage = async () => {
    try {
      const result = await chrome.storage.local.get([
        'jobfill_subscription',
        'jobfill_usage',
        'jobfill_usage_count', // legacy key for migration
        'jobfill_checkout_email',
        'jobfill_profile',
      ]);

      // Resolve user email from profile or subscription
      const profileEmail = result.jobfill_profile?.email || null;
      const subEmail = result.jobfill_subscription?.email || null;
      const resolvedEmail = subEmail || profileEmail || null;
      setUserEmail(resolvedEmail);

      // Restore subscription / plan
      const stored = result.jobfill_subscription;
      const pendingEmail = result.jobfill_checkout_email;

      if (stored?.status === 'active') {
        // Always verify with Stripe before trusting cached data
        const email = stored.email;
        if (email) {
          try {
            const response = await fetch(`${SERVER_URL}/api/verify-subscription`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            });
            const data = await response.json();

            // Always trust server for plan (Stripe is source of truth)
            if (!TESTING_BYPASS) setPlan(data.plan || 'free');

            if (data.status === 'active') {
              const subData = { ...data, email };
              await chrome.storage.local.set({ jobfill_subscription: subData });
              setSubscriptionData(subData);
            } else {
              // Subscription cancelled or not found — clear cached data
              await chrome.storage.local.remove(['jobfill_subscription']);
              setSubscriptionData(null);
            }
            if (data.serverUsage) await syncServerUsage(data.serverUsage);
          } catch (err) {
            // Server unreachable — fall back to cached data so offline still works
            console.warn('Server verification failed, using cached data:', err);
            if (!TESTING_BYPASS) setPlan(stored.plan || 'starter');
            setSubscriptionData(stored);
          }
        } else {
          // No email in cached data — use cached plan
          if (!TESTING_BYPASS) setPlan(stored.plan || 'starter');
          setSubscriptionData(stored);
        }
      } else if (pendingEmail) {
        // Auto-verify: user went through checkout, check if subscription is now active
        try {
          const response = await fetch(`${SERVER_URL}/api/verify-subscription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingEmail }),
          });
          const data = await response.json();
          // Always trust server for plan (Stripe is source of truth)
          if (!TESTING_BYPASS) setPlan(data.plan || 'free');

          if (data.status === 'active') {
            const subData = { ...data, email: pendingEmail };
            await chrome.storage.local.set({ jobfill_subscription: subData });
            await chrome.storage.local.remove('jobfill_checkout_email');
            setSubscriptionData(subData);
          }
          if (data.serverUsage) await syncServerUsage(data.serverUsage);
        } catch (err) {
          console.error('Auto-verify failed:', err);
        }
      } else if (resolvedEmail) {
        // No subscription but we have an email — fetch server usage for free user
        fetchServerUsage(resolvedEmail);
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
    if (TESTING_BYPASS || isLoading) {
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

  const incrementUsage = async (feature, serverCount) => {
    const key = feature || 'autofill';
    // If server provided the count, use it (authoritative); otherwise increment locally
    const newCount = serverCount != null ? serverCount : (usage[key] || 0) + 1;
    const updated = { ...usage, [key]: newCount };
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

      // Always trust server for plan (Stripe is source of truth)
      if (!TESTING_BYPASS) setPlan(data.plan || 'free');

      if (data.status === 'active') {
        const subData = { ...data, email: lookupEmail };
        await chrome.storage.local.set({ jobfill_subscription: subData });
        setSubscriptionData(subData);
      } else {
        await chrome.storage.local.remove(['jobfill_subscription']);
        setSubscriptionData(null);
      }

      if (data.serverUsage) await syncServerUsage(data.serverUsage);
      setUserEmail(lookupEmail);
      return data;
    } catch (err) {
      console.error('Failed to verify subscription:', err);
      return { status: 'error' };
    } finally {
      setIsLoading(false);
    }
  };

  const openWebsite = (hash) => {
    chrome.tabs.create({ url: hash ? `${WEBSITE_URL}/#${hash}` : WEBSITE_URL });
  };

  const clearSubscription = async () => {
    await chrome.storage.local.remove(['jobfill_subscription', 'jobfill_usage', 'jobfill_usage_count', 'jobfill_checkout_email']);
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
    userEmail,
    canUseFeature,
    incrementUsage,
    syncServerUsage,
    fetchServerUsage,
    refreshStatus,
    openWebsite,
    clearSubscription,
  };
}
