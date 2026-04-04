// Single source of truth for plan definitions

export const PLAN_TIERS = ['free', 'starter', 'pro', 'power'];

export const PLAN_LIMITS = {
  free: {
    autofill: 3,
    coverletter: 0,
    keywords: 0,
    customFields: 0,
    priorityAI: false,
  },
  starter: {
    autofill: 50,
    coverletter: 0,
    keywords: 0,
    customFields: 5,
    priorityAI: false,
  },
  pro: {
    autofill: 150,
    coverletter: 50,
    keywords: 50,
    customFields: Infinity,
    priorityAI: false,
  },
  power: {
    autofill: 500,
    coverletter: Infinity,
    keywords: Infinity,
    customFields: Infinity,
    priorityAI: true,
  },
};

export const PLAN_PRICING = {
  starter: { monthly: 9, annual: 79 },
  pro: { monthly: 19, annual: 149 },
  power: { monthly: 39, annual: 299 },
};

// Minimum plan required to access each feature
export const FEATURE_REQUIRED_PLAN = {
  autofill: 'free',
  coverletter: 'pro',
  keywords: 'pro',
  autoattach: 'starter',
};

export const PLAN_LABELS = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  power: 'Power',
};

export function hasTierAccess(userPlan, requiredPlan) {
  const userIdx = PLAN_TIERS.indexOf(userPlan || 'free');
  const reqIdx = PLAN_TIERS.indexOf(requiredPlan || 'free');
  return userIdx >= reqIdx;
}

export function getUpgradeTarget(currentPlan, feature) {
  const required = FEATURE_REQUIRED_PLAN[feature] || 'starter';
  if (hasTierAccess(currentPlan, required)) {
    // User has tier access but may be at limit — suggest next tier
    const idx = PLAN_TIERS.indexOf(currentPlan || 'free');
    return idx < PLAN_TIERS.length - 1 ? PLAN_TIERS[idx + 1] : null;
  }
  return required;
}
