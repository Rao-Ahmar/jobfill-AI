// Server-side copy of plan limits (CommonJS)

const PLAN_TIERS = ['free', 'starter', 'pro', 'power'];

const PLAN_LIMITS = {
  free: {
    autofill: 3,
    coverletter: 0,
    keywords: 0,
  },
  starter: {
    autofill: 50,
    coverletter: 0,
    keywords: 0,
  },
  pro: {
    autofill: 150,
    coverletter: 50,
    keywords: 50,
  },
  power: {
    autofill: 500,
    coverletter: Infinity,
    keywords: Infinity,
  },
};

const FEATURE_REQUIRED_PLAN = {
  autofill: 'free',
  coverletter: 'pro',
  keywords: 'pro',
};

function hasTierAccess(userPlan, requiredPlan) {
  const userIdx = PLAN_TIERS.indexOf(userPlan || 'free');
  const reqIdx = PLAN_TIERS.indexOf(requiredPlan || 'free');
  return userIdx >= reqIdx;
}

module.exports = { PLAN_TIERS, PLAN_LIMITS, FEATURE_REQUIRED_PLAN, hasTierAccess };
