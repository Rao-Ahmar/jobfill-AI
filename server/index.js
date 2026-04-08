require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const Stripe = require('stripe');
const db = require('./db');
const { PLAN_LIMITS, FEATURE_REQUIRED_PLAN, hasTierAccess } = require('./plans');

const app = express();
const port = process.env.PORT || 3001;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-dev-secret-change-me';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ─── Price → Plan mapping ────────────────────────────────────────────────────
const PRICE_IDS = {
  starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
  starter_annual:  process.env.STRIPE_PRICE_STARTER_ANNUAL,
  pro_monthly:     process.env.STRIPE_PRICE_PRO_MONTHLY,
  pro_annual:      process.env.STRIPE_PRICE_PRO_ANNUAL,
  power_monthly:   process.env.STRIPE_PRICE_POWER_MONTHLY,
  power_annual:    process.env.STRIPE_PRICE_POWER_ANNUAL,
};

// Reverse lookup: price ID → plan tier
const PRICE_PLAN_MAP = {};
Object.entries(PRICE_IDS).forEach(([key, id]) => {
  if (id) PRICE_PLAN_MAP[id] = key.split('_')[0]; // 'starter', 'pro', or 'power'
});

function resolvePriceId(plan, billing) {
  const key = `${plan}_${billing}`;
  return PRICE_IDS[key] || null;
}

function lookupPlanFromPriceId(priceId) {
  return PRICE_PLAN_MAP[String(priceId)] || 'starter';
}

// Serialize usage limits for JSON (Infinity → null)
function serializeLimit(val) {
  return val === Infinity ? null : val;
}

function buildUsageResponse(email) {
  const user = db.getUser(email);
  if (!user) return null;
  const usage = db.getUsage(email);
  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  return {
    plan: user.plan,
    usage: {
      autofill: usage.autofill,
      coverletter: usage.coverletter,
      keywords: usage.keywords,
    },
    limits: {
      autofill: serializeLimit(limits.autofill),
      coverletter: serializeLimit(limits.coverletter),
      keywords: serializeLimit(limits.keywords),
    },
    resetDate: usage.resetDate,
  };
}

// ─── Google Sign-In verification ─────────────────────────────────────────────
async function verifyGoogleCredential(credential) {
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload.email_verified) {
    throw new Error('Email not verified by Google');
  }
  return { email: payload.email, name: payload.name, picture: payload.picture };
}

// ─── Session Token helpers ────────────────────────────────────────────────────
function generateSessionToken(email) {
  return jwt.sign({ email }, SESSION_SECRET, { expiresIn: '30d' });
}

function verifySessionToken(token) {
  return jwt.verify(token, SESSION_SECRET); // throws on invalid/expired
}

// ─── Stripe Webhook (raw body — must be BEFORE express.json()) ──────────────
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Stripe webhook: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const email = session.customer_email || session.customer_details?.email;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (email && subscriptionId) {
          // Retrieve subscription to get price/plan
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items?.data?.[0]?.price?.id;
          const planTier = priceId ? lookupPlanFromPriceId(priceId) : 'starter';

          db.upsertUser({
            email,
            plan: planTier,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
          });
          console.log(`DB: upserted user ${email} → plan=${planTier}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const priceId = sub.items?.data?.[0]?.price?.id;
        const planTier = priceId ? lookupPlanFromPriceId(priceId) : 'unknown';
        const customerId = sub.customer;

        if (sub.status === 'active' || sub.status === 'trialing') {
          // Try to find user by customer ID and update plan
          const user = db.getUserByCustomerId(customerId);
          if (user) {
            db.updatePlan({
              email: user.email,
              plan: planTier,
              stripeCustomerId: customerId,
              stripeSubscriptionId: sub.id,
            });
            console.log(`DB: updated ${user.email} → plan=${planTier}`);
          } else {
            // Fetch customer email from Stripe
            const customer = await stripe.customers.retrieve(customerId);
            if (customer.email) {
              db.upsertUser({
                email: customer.email,
                plan: planTier,
                stripeCustomerId: customerId,
                stripeSubscriptionId: sub.id,
              });
              console.log(`DB: upserted ${customer.email} → plan=${planTier}`);
            }
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = sub.customer;

        const user = db.getUserByCustomerId(customerId);
        if (user) {
          db.updatePlan({
            email: user.email,
            plan: 'free',
            stripeCustomerId: customerId,
            stripeSubscriptionId: null,
          });
          db.resetUsageForUser(user.email);
          console.log(`DB: downgraded ${user.email} → free, usage reset`);
        }
        break;
      }

      default:
        console.log(`Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
  }

  res.json({ received: true });
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ─── Config endpoint (exposes Google Client ID to frontend) ─────────────────
app.get('/api/config', (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID || '' });
});

// ─── Google Auth: Verify + lookup subscription ──────────────────────────────
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'credential is required' });

    const { email, name, picture } = await verifyGoogleCredential(credential);

    // Reuse the same Stripe lookup logic as verify-subscription
    let activeSub = null;

    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length > 0) {
      const customer = customers.data[0];
      const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 5 });
      const trialingSubs = await stripe.subscriptions.list({ customer: customer.id, status: 'trialing', limit: 5 });
      const allActive = [...subs.data, ...trialingSubs.data];

      const nonCancelling = allActive.filter(s => !s.cancel_at_period_end);
      activeSub = nonCancelling[0] || allActive[0] || null;
    }

    let status, plan;
    if (activeSub && activeSub.cancel_at_period_end) {
      status = 'cancelled';
      plan = 'free';
    } else if (activeSub) {
      status = 'active';
      const priceId = activeSub.items?.data?.[0]?.price?.id;
      plan = priceId ? lookupPlanFromPriceId(priceId) : 'starter';
    } else {
      status = 'none';
      plan = 'free';
    }

    // Sync DB
    db.ensureUser(email);
    db.updatePlan({
      email,
      plan,
      stripeCustomerId: activeSub?.customer || null,
      stripeSubscriptionId: activeSub?.id || null,
    });

    const sessionToken = generateSessionToken(email);
    const result = { status, plan, email, name, picture, sessionToken };

    if (activeSub) {
      const periodEnd = activeSub.items?.data?.[0]?.current_period_end;
      result.currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
      if (status === 'cancelled') {
        result.cancelAt = activeSub.cancel_at ? new Date(activeSub.cancel_at * 1000).toISOString() : null;
      }
    }

    console.log(`Google Auth: ${email} → status=${status}, plan=${plan}`);
    res.json(result);
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ error: error.message || 'Authentication failed' });
  }
});

// ─── Session Restore: Validate session token + fetch fresh Stripe status ─────
app.post('/api/session', async (req, res) => {
  try {
    const { sessionToken } = req.body;
    if (!sessionToken) return res.status(400).json({ error: 'sessionToken is required' });

    let payload;
    try {
      payload = verifySessionToken(sessionToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const email = payload.email;

    // Fetch fresh subscription status from Stripe
    let activeSub = null;
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length > 0) {
      const customer = customers.data[0];
      const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 5 });
      const trialingSubs = await stripe.subscriptions.list({ customer: customer.id, status: 'trialing', limit: 5 });
      const allActive = [...subs.data, ...trialingSubs.data];

      const nonCancelling = allActive.filter(s => !s.cancel_at_period_end);
      activeSub = nonCancelling[0] || allActive[0] || null;
    }

    let status, plan;
    if (activeSub && activeSub.cancel_at_period_end) {
      status = 'cancelled';
      plan = 'free';
    } else if (activeSub) {
      status = 'active';
      const priceId = activeSub.items?.data?.[0]?.price?.id;
      plan = priceId ? lookupPlanFromPriceId(priceId) : 'starter';
    } else {
      status = 'none';
      plan = 'free';
    }

    // Sync DB
    db.ensureUser(email);
    db.updatePlan({
      email,
      plan,
      stripeCustomerId: activeSub?.customer || null,
      stripeSubscriptionId: activeSub?.id || null,
    });

    const result = { status, plan, email };

    if (activeSub) {
      const periodEnd = activeSub.items?.data?.[0]?.current_period_end;
      result.currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
      if (status === 'cancelled') {
        result.cancelAt = activeSub.cancel_at ? new Date(activeSub.cancel_at * 1000).toISOString() : null;
      }
    }

    console.log(`Session restore: ${email} → status=${status}, plan=${plan}`);
    res.json(result);
  } catch (error) {
    console.error('Session restore error:', error);
    res.status(500).json({ error: error.message || 'Session restore failed' });
  }
});

// Initialize Google Gemini SDK
const genAI = new GoogleGenerativeAI(process.env.CLAUDE_API_KEY || process.env.GEMINI_API_KEY);

// ─── Success / Cancel pages ──────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || `http://localhost:${port}`;

app.get('/success', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment Successful — JobFill AI</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#0f0b1e 0%,#1a1145 50%,#0f0b1e 100%);color:#fff}
  .card{text-align:center;max-width:440px;padding:48px 32px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:24px;backdrop-filter:blur(20px)}
  .icon{width:72px;height:72px;margin:0 auto 24px;background:linear-gradient(135deg,#22c55e,#16a34a);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:36px;box-shadow:0 0 40px rgba(34,197,94,.3)}
  h1{font-size:24px;font-weight:700;margin-bottom:8px}
  p{color:rgba(255,255,255,.7);font-size:15px;line-height:1.6;margin-bottom:24px}
  .steps{text-align:left;background:rgba(255,255,255,.04);border-radius:12px;padding:20px 24px;margin-bottom:24px}
  .steps li{color:rgba(255,255,255,.8);font-size:14px;margin-bottom:10px;padding-left:4px}
  .steps li:last-child{margin-bottom:0}
  .badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:rgba(255,255,255,.5);margin-top:16px}
  .badge svg{width:14px;height:14px}
</style></head>
<body><div class="card">
  <div class="icon">&#10003;</div>
  <h1>Payment Successful!</h1>
  <p>Your JobFill AI subscription is now active. You're all set to supercharge your job applications.</p>
  <ol class="steps">
    <li>Open the <strong>JobFill AI</strong> extension in Chrome</li>
    <li>Go to the <strong>Subscription</strong> tab</li>
    <li>Click <strong>Verify Existing Subscription</strong> with your email</li>
  </ol>
  <p style="font-size:13px">You can close this tab now.</p>
  <div class="badge">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    Secured by Stripe
  </div>
</div></body></html>`);
});

// ─── Stripe: Create Checkout Session ─────────────────────────────────────────
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { email, plan, billing } = req.body;
    const priceId = resolvePriceId(plan || 'starter', billing || 'monthly');

    if (!priceId) {
      return res.status(400).json({ error: `No price configured for plan="${plan}" billing="${billing}"` });
    }

    console.log('--- Stripe Checkout ---');
    console.log(`Plan: ${plan}, Billing: ${billing}, Price: ${priceId}`);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email || undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${BASE_URL}/success`,
      cancel_url: `${BASE_URL}/success`,
    });

    res.json({ url: session.url, checkoutId: session.id });
  } catch (error) {
    console.error('Stripe Checkout error:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout' });
  }
});

// ─── Stripe: Verify Subscription ─────────────────────────────────────────────
// Stripe is the SINGLE source of truth for plan status.
// DB is only used for usage counters — plan is always derived from Stripe.
app.post('/api/verify-subscription', async (req, res) => {
  try {
    const { email, subscriptionId } = req.body;

    let activeSub = null;
    let customerEmail = email;

    // 1. Find subscription directly from Stripe (source of truth)
    if (subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        if (sub.status === 'active' || sub.status === 'trialing') {
          activeSub = sub;
          const customer = await stripe.customers.retrieve(sub.customer);
          customerEmail = customer.email || email;
        }
      } catch (e) { /* subscription not found or deleted */ }
    }

    if (!activeSub && email) {
      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length > 0) {
        const customer = customers.data[0];
        const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 5 });
        const trialingSubs = await stripe.subscriptions.list({ customer: customer.id, status: 'trialing', limit: 5 });
        const allActive = [...subs.data, ...trialingSubs.data];

        // Debug: log all subscriptions found
        console.log(`Stripe: found ${allActive.length} active sub(s) for ${email}`);
        allActive.forEach((s, i) => {
          console.log(`  sub[${i}]: ${s.id}, status=${s.status}, cancel_at_period_end=${s.cancel_at_period_end}`);
        });

        // Pick the best subscription:
        // - Prefer truly active (not cancelling) over cancelling
        // - If ALL are cancelling, use the first one (will be reported as cancelled)
        const nonCancelling = allActive.filter(s => !s.cancel_at_period_end);
        activeSub = nonCancelling[0] || allActive[0] || null;
        if (activeSub) customerEmail = customer.email || email;
      }
    }

    // 2. Derive plan + status purely from Stripe (never from DB)
    let status, plan;

    if (activeSub && activeSub.cancel_at_period_end) {
      status = 'cancelled';
      plan = 'free';
    } else if (activeSub) {
      status = 'active';
      const priceId = activeSub.items?.data?.[0]?.price?.id;
      plan = priceId ? lookupPlanFromPriceId(priceId) : 'starter';
    } else {
      status = 'none';
      plan = 'free';
    }

    // 3. Sync DB to match Stripe (DB is just a cache)
    if (customerEmail) {
      db.ensureUser(customerEmail);
      db.updatePlan({
        email: customerEmail,
        plan,
        stripeCustomerId: activeSub?.customer || null,
        stripeSubscriptionId: activeSub?.id || null,
      });
    }

    // 4. Get usage counters from DB (usage tracking is fine in DB)
    const usageData = customerEmail ? buildUsageResponse(customerEmail) : null;

    // 5. Build response — plan comes from Stripe, usage from DB
    const result = { status, plan, email: customerEmail };

    if (activeSub) {
      const periodEnd = activeSub.items?.data?.[0]?.current_period_end;
      result.subscriptionId = activeSub.id;
      result.customerId = activeSub.customer;
      result.currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
      if (status === 'cancelled') {
        result.cancelAt = activeSub.cancel_at ? new Date(activeSub.cancel_at * 1000).toISOString() : null;
      }
    }

    if (usageData) result.serverUsage = usageData;

    console.log(`Verify: ${customerEmail} → status=${status}, plan=${plan}`);
    res.json(result);
  } catch (error) {
    console.error('Verify subscription error:', error);
    res.status(500).json({ error: error.message || 'Failed to verify subscription' });
  }
});

// ─── Stripe: Customer Portal ─────────────────────────────────────────────────
app.post('/api/customer-portal', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) {
      return res.status(404).json({ error: 'No customer found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customers.data[0].id,
      return_url: `${BASE_URL}/success`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Portal error:', error);
    res.status(500).json({ error: error.message || 'Failed to get portal URL' });
  }
});

// ─── Stripe: Cancel Subscription ─────────────────────────────────────────────
app.post('/api/cancel-subscription', async (req, res) => {
  try {
    const { credential, sessionToken, email: rawEmail } = req.body;

    // Prefer Google credential → session token → raw email (extension compat)
    let email;
    if (credential) {
      const verified = await verifyGoogleCredential(credential);
      email = verified.email;
    } else if (sessionToken) {
      const payload = verifySessionToken(sessionToken);
      email = payload.email;
    } else {
      email = rawEmail;
    }

    if (!email) return res.status(400).json({ error: 'email or credential is required' });

    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) {
      return res.status(404).json({ error: 'No customer found with this email' });
    }

    const customer = customers.data[0];
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 5 });
    const trialingSubs = await stripe.subscriptions.list({ customer: customer.id, status: 'trialing', limit: 5 });
    const allActive = [...subs.data, ...trialingSubs.data];

    if (allActive.length === 0) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // Cancel all active subscriptions at period end
    for (const sub of allActive) {
      await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
      console.log(`Cancelled subscription ${sub.id} for ${email} (at period end)`);
    }

    // Update DB
    db.updatePlan({
      email,
      plan: 'free',
      stripeCustomerId: customer.id,
      stripeSubscriptionId: null,
    });

    res.json({ success: true, message: 'Subscription cancelled. Access continues until end of billing period.' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel subscription' });
  }
});

// ─── Usage Endpoint ──────────────────────────────────────────────────────────
app.post('/api/usage', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    // Ensure user exists (does not overwrite existing plan)
    db.ensureUser(email);
    const usageData = buildUsageResponse(email);

    res.json(usageData);
  } catch (error) {
    console.error('Usage endpoint error:', error);
    res.status(500).json({ error: error.message || 'Failed to get usage' });
  }
});

// ─── Gemini AI Proxy (with server-side usage enforcement) ────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, system, max_tokens, temperature, email, feature } = req.body;

    // ── Usage enforcement ──
    if (email && feature) {
      // Ensure user exists (does not overwrite existing plan)
      db.ensureUser(email);
      let user = db.getUser(email);

      // Reset usage if needed
      db.resetUsageIfNeeded(email);
      user = db.getUser(email);

      const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
      const requiredPlan = FEATURE_REQUIRED_PLAN[feature] || 'starter';

      // Check tier access
      if (!hasTierAccess(user.plan, requiredPlan)) {
        return res.status(403).json({
          error: `Feature "${feature}" requires a higher plan.`,
          code: 'TIER_BLOCKED',
          requiredPlan,
          currentPlan: user.plan,
        });
      }

      // Check usage limit
      const limit = limits[feature];
      const usageKey = `usage_${feature}`;
      const used = user[usageKey] || 0;

      if (limit !== undefined && limit !== Infinity && used >= limit) {
        return res.status(403).json({
          error: `Monthly ${feature} limit reached (${used}/${limit}).`,
          code: 'LIMIT_REACHED',
          used,
          limit: serializeLimit(limit),
          feature,
          plan: user.plan,
        });
      }
    }

    // ── Call Gemini ──
    const generativeModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: system,
    });

    const generationConfig = {
      temperature: temperature || 0.7,
      maxOutputTokens: max_tokens || 8192,
      responseMimeType: 'application/json',
    };

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });

    const responseText = result.response.text();

    // ── Increment usage after successful generation ──
    let serverUsage = null;
    if (email && feature) {
      serverUsage = db.incrementUsage(email, feature);
    }

    res.json({
      content: [{ text: responseText }],
      _serverUsage: serverUsage,
    });
  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate response' });
  }
});

app.listen(port, () => {
  console.log(`JobFill AI Server running on port ${port}`);
  console.log(`SQLite database at: ${require('path').join(__dirname, 'data', 'jobfill.db')}`);
});
