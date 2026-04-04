require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3001;

const LS_API_KEY        = process.env.LEMONSQUEEZY_API_KEY;
const LS_STORE_ID       = process.env.LEMONSQUEEZY_STORE_ID;
const LS_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
const LS_BASE           = 'https://api.lemonsqueezy.com/v1';

// ─── Variant → Plan mapping ─────────────────────────────────────────────────
const VARIANT_IDS = {
  starter_monthly: process.env.LS_VARIANT_STARTER_MONTHLY,
  starter_annual:  process.env.LS_VARIANT_STARTER_ANNUAL,
  pro_monthly:     process.env.LS_VARIANT_PRO_MONTHLY,
  pro_annual:      process.env.LS_VARIANT_PRO_ANNUAL,
  power_monthly:   process.env.LS_VARIANT_POWER_MONTHLY,
  power_annual:    process.env.LS_VARIANT_POWER_ANNUAL,
};

// Reverse lookup: variant ID → plan tier
const VARIANT_PLAN_MAP = {};
Object.entries(VARIANT_IDS).forEach(([key, id]) => {
  if (id) VARIANT_PLAN_MAP[id] = key.split('_')[0]; // 'starter', 'pro', or 'power'
});

function resolveVariantId(plan, billing) {
  const key = `${plan}_${billing}`;
  return VARIANT_IDS[key] || null;
}

function lookupPlanFromVariant(variantId) {
  return VARIANT_PLAN_MAP[String(variantId)] || 'starter';
}

const lsHeaders = () => ({
  'Accept': 'application/vnd.api+json',
  'Content-Type': 'application/vnd.api+json',
  'Authorization': `Bearer ${LS_API_KEY}`,
});

// Lemon Squeezy webhooks need raw body — must be BEFORE express.json()
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const rawBody  = req.body;
  const signature = req.headers['x-signature'];

  if (LS_WEBHOOK_SECRET && signature) {
    const hmac   = crypto.createHmac('sha256', LS_WEBHOOK_SECRET);
    const digest = hmac.update(rawBody).digest('hex');
    if (digest !== signature) {
      console.error('Webhook signature mismatch');
      return res.status(400).send('Invalid signature');
    }
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const eventName = event.meta?.event_name;
  const attrs = event.data?.attributes;
  const variantId = attrs?.variant_id;
  const planTier = variantId ? lookupPlanFromVariant(variantId) : 'unknown';

  console.log(`LemonSqueezy webhook: ${eventName} | plan=${planTier}`);

  switch (eventName) {
    case 'subscription_created':
    case 'subscription_updated':
      console.log('Subscription active:', attrs?.user_email, `(${planTier})`);
      break;
    case 'subscription_cancelled':
    case 'subscription_expired':
      console.log('Subscription ended:', attrs?.user_email, `(${planTier})`);
      break;
    default:
      console.log(`Unhandled event: ${eventName}`);
  }

  res.json({ received: true });
});

app.use(cors());
app.use(express.json());

// Initialize Google Gemini SDK
const genAI = new GoogleGenerativeAI(process.env.CLAUDE_API_KEY || process.env.GEMINI_API_KEY);

// ─── Lemon Squeezy: Create Checkout ───────────────────────────────────────────
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { email, plan, billing } = req.body;
    const variantId = resolveVariantId(plan || 'starter', billing || 'monthly');

    if (!variantId) {
      return res.status(400).json({ error: `No variant configured for plan="${plan}" billing="${billing}"` });
    }

    console.log('--- LemonSqueezy Checkout ---');
    console.log(`Plan: ${plan}, Billing: ${billing}, Variant: ${variantId}`);

    const body = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: email ? { email } : {},
          product_options: {
            redirect_url: 'https://jobfill.ai/success',
          },
          checkout_options: {
            logo: true,
            desc: true,
            discount: true,
          },
        },
        relationships: {
          store: {
            data: { type: 'stores', id: String(LS_STORE_ID) },
          },
          variant: {
            data: { type: 'variants', id: String(variantId) },
          },
        },
      },
    };

    const response = await fetch(`${LS_BASE}/checkouts`, {
      method: 'POST',
      headers: lsHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('LS API Error Detail:', JSON.stringify(err, null, 2));
      throw new Error(JSON.stringify(err));
    }

    const data = await response.json();
    const url = data.data?.attributes?.url;
    res.json({ url, checkoutId: data.data?.id });
  } catch (error) {
    console.error('LS Checkout error:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout' });
  }
});

// ─── Lemon Squeezy: Verify Subscription ───────────────────────────────────────
app.post('/api/verify-subscription', async (req, res) => {
  try {
    const { email, subscriptionId } = req.body;

    // Direct lookup by subscription ID
    if (subscriptionId) {
      const r = await fetch(`${LS_BASE}/subscriptions/${subscriptionId}`, {
        headers: lsHeaders(),
      });
      if (r.ok) {
        const data = await r.json();
        const attrs = data.data?.attributes;
        const status = attrs?.status;
        if (status === 'active' || status === 'on_trial') {
          const variantId = attrs?.variant_id;
          return res.json({
            status: 'active',
            plan: lookupPlanFromVariant(variantId),
            subscriptionId: data.data?.id,
            customerId: attrs?.customer_id,
            currentPeriodEnd: attrs?.renews_at,
            email: attrs?.user_email,
          });
        }
      }
    }

    // Lookup by email
    if (email) {
      const url = `${LS_BASE}/subscriptions?filter[user_email]=${encodeURIComponent(email)}&page[size]=5`;
      const r = await fetch(url, { headers: lsHeaders() });

      if (!r.ok) throw new Error('Failed to query subscriptions');
      const data = await r.json();
      const subs = data.data || [];

      const active = subs.find(s =>
        s.attributes?.status === 'active' || s.attributes?.status === 'on_trial'
      );

      if (active) {
        const variantId = active.attributes?.variant_id;
        return res.json({
          status: 'active',
          plan: lookupPlanFromVariant(variantId),
          subscriptionId: active.id,
          customerId: active.attributes?.customer_id,
          currentPeriodEnd: active.attributes?.renews_at,
          email: active.attributes?.user_email,
        });
      }
    }

    res.json({ status: 'none' });
  } catch (error) {
    console.error('Verify subscription error:', error);
    res.status(500).json({ error: error.message || 'Failed to verify subscription' });
  }
});

// ─── Lemon Squeezy: Customer Portal URL ───────────────────────────────────────
app.post('/api/customer-portal', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    // Fetch subscription to get the customer portal URL
    const url = `${LS_BASE}/subscriptions?filter[user_email]=${encodeURIComponent(email)}&page[size]=1`;
    const r = await fetch(url, { headers: lsHeaders() });
    const data = await r.json();
    const sub = (data.data || [])[0];

    if (!sub) return res.status(404).json({ error: 'No subscription found' });

    // The Lemon Squeezy subscription has an "urls" object with customer_portal
    const portalUrl = sub.attributes?.urls?.customer_portal;
    res.json({ url: portalUrl || 'https://app.lemonsqueezy.com/my-orders' });
  } catch (error) {
    console.error('Portal error:', error);
    res.status(500).json({ error: error.message || 'Failed to get portal URL' });
  }
});

// ─── Gemini AI Proxy ───────────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, system, max_tokens, temperature } = req.body;

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
    res.json({ content: [{ text: responseText }] });
  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate response' });
  }
});

app.listen(port, () => {
  console.log(`JobFill AI Server running on port ${port}`);
});
