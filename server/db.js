const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'jobfill.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// ─── Schema ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    email                  TEXT UNIQUE NOT NULL,
    plan                   TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id     TEXT,
    stripe_subscription_id TEXT,
    usage_autofill         INTEGER NOT NULL DEFAULT 0,
    usage_coverletter      INTEGER NOT NULL DEFAULT 0,
    usage_keywords         INTEGER NOT NULL DEFAULT 0,
    usage_reset_date       TEXT NOT NULL,
    created_at             TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNextResetDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}

// ─── Prepared Statements ─────────────────────────────────────────────────────

const stmts = {
  getByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),

  upsert: db.prepare(`
    INSERT INTO users (email, plan, stripe_customer_id, stripe_subscription_id, usage_reset_date)
    VALUES (@email, @plan, @stripeCustomerId, @stripeSubscriptionId, @usageResetDate)
    ON CONFLICT(email) DO UPDATE SET
      plan = @plan,
      stripe_customer_id = COALESCE(@stripeCustomerId, stripe_customer_id),
      stripe_subscription_id = COALESCE(@stripeSubscriptionId, stripe_subscription_id),
      updated_at = datetime('now')
  `),

  ensureUser: db.prepare(`
    INSERT INTO users (email, plan, usage_reset_date)
    VALUES (@email, 'free', @usageResetDate)
    ON CONFLICT(email) DO NOTHING
  `),

  incrementUsage: {
    autofill: db.prepare('UPDATE users SET usage_autofill = usage_autofill + 1, updated_at = datetime(\'now\') WHERE email = ?'),
    coverletter: db.prepare('UPDATE users SET usage_coverletter = usage_coverletter + 1, updated_at = datetime(\'now\') WHERE email = ?'),
    keywords: db.prepare('UPDATE users SET usage_keywords = usage_keywords + 1, updated_at = datetime(\'now\') WHERE email = ?'),
  },

  resetUsage: db.prepare(`
    UPDATE users SET
      usage_autofill = 0,
      usage_coverletter = 0,
      usage_keywords = 0,
      usage_reset_date = @resetDate,
      updated_at = datetime('now')
    WHERE email = @email
  `),

  updatePlan: db.prepare(`
    UPDATE users SET
      plan = @plan,
      stripe_customer_id = COALESCE(@stripeCustomerId, stripe_customer_id),
      stripe_subscription_id = COALESCE(@stripeSubscriptionId, stripe_subscription_id),
      updated_at = datetime('now')
    WHERE email = @email
  `),

  updatePlanByCustomerId: db.prepare(`
    UPDATE users SET
      plan = @plan,
      stripe_subscription_id = COALESCE(@stripeSubscriptionId, stripe_subscription_id),
      updated_at = datetime('now')
    WHERE stripe_customer_id = @stripeCustomerId
  `),

  getByCustomerId: db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?'),
};

// ─── Public API ──────────────────────────────────────────────────────────────

function getUser(email) {
  return stmts.getByEmail.get(email) || null;
}

function getUserByCustomerId(customerId) {
  return stmts.getByCustomerId.get(customerId) || null;
}

function upsertUser({ email, plan = 'free', stripeCustomerId = null, stripeSubscriptionId = null }) {
  stmts.upsert.run({
    email,
    plan,
    stripeCustomerId,
    stripeSubscriptionId,
    usageResetDate: getNextResetDate(),
  });
  return stmts.getByEmail.get(email);
}

// Create user if not exists — does NOT overwrite existing plan
function ensureUser(email) {
  stmts.ensureUser.run({ email, usageResetDate: getNextResetDate() });
  return stmts.getByEmail.get(email);
}

function resetUsageIfNeeded(email) {
  const user = stmts.getByEmail.get(email);
  if (!user) return null;

  const now = new Date();
  const resetDate = new Date(user.usage_reset_date);

  if (now >= resetDate) {
    stmts.resetUsage.run({ email, resetDate: getNextResetDate() });
    return stmts.getByEmail.get(email);
  }

  return user;
}

function getUsage(email) {
  const user = resetUsageIfNeeded(email);
  if (!user) return null;

  return {
    autofill: user.usage_autofill,
    coverletter: user.usage_coverletter,
    keywords: user.usage_keywords,
    resetDate: user.usage_reset_date,
  };
}

function incrementUsage(email, feature) {
  const stmt = stmts.incrementUsage[feature];
  if (!stmt) throw new Error(`Unknown feature: ${feature}`);

  // Ensure user exists and usage is reset if needed
  resetUsageIfNeeded(email);

  stmt.run(email);
  const user = stmts.getByEmail.get(email);

  return {
    autofill: user.usage_autofill,
    coverletter: user.usage_coverletter,
    keywords: user.usage_keywords,
    resetDate: user.usage_reset_date,
  };
}

function resetUsageForUser(email) {
  stmts.resetUsage.run({ email, resetDate: getNextResetDate() });
  return stmts.getByEmail.get(email);
}

function updatePlan({ email, plan, stripeCustomerId = null, stripeSubscriptionId = null }) {
  stmts.updatePlan.run({ email, plan, stripeCustomerId, stripeSubscriptionId });
  return stmts.getByEmail.get(email);
}

function updatePlanByCustomerId({ stripeCustomerId, plan, stripeSubscriptionId = null }) {
  stmts.updatePlanByCustomerId.run({ stripeCustomerId, plan, stripeSubscriptionId });
  return stmts.getByCustomerId.get(stripeCustomerId);
}

module.exports = {
  getUser,
  getUserByCustomerId,
  upsertUser,
  ensureUser,
  getUsage,
  incrementUsage,
  resetUsageIfNeeded,
  resetUsageForUser,
  updatePlan,
  updatePlanByCustomerId,
};
