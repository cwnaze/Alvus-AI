import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { and, eq } from 'drizzle-orm';
import { createDb } from '../apps/worker/src/lib/db/client';
import { tierLimits, usageEvents, users, waitlistSignups } from '../apps/worker/src/lib/db/schema';
import { getSubscriptionByUserId, upsertSubscription } from '../apps/worker/src/lib/db/queries/subscriptions';
import { currentBillingPeriod } from '../apps/worker/src/lib/metering';
import { createStripeClient } from '../apps/worker/src/lib/stripe/client';
import { findAuthUserIdByEmail } from './lib/find-auth-user-id';

// Never run against a production database by accident. This is the only environment
// check available before US-007 stands up a real prod/dev split -- the deploy pipeline
// (docs/infra.md) never invokes this script itself, so this is a backstop for a
// developer/CI job pointing a shell at the wrong DATABASE_URL, not a hard boundary.
if (process.env.NODE_ENV === 'production') {
  throw new Error('db/seed.ts refuses to run with NODE_ENV=production -- seed data is for local dev/CI only.');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required (see .env.example)');
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required (see .env.example)');
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePriceIdPlus = process.env.STRIPE_PRICE_ID_PLUS;
if (!stripeSecretKey || !stripePriceIdPlus) {
  throw new Error('STRIPE_SECRET_KEY and STRIPE_PRICE_ID_PLUS are required (see .env.example)');
}

// Public, synthetic fixture credential for @example.test accounts on non-production
// Supabase projects only -- not a real secret, safe to read from source.
const FIXTURE_PASSWORD = 'Fixture-Passw0rd!';

const TIER_LIMITS: Array<{
  tier: 'free' | 'plus' | 'pro';
  actionType: 'source_analysis' | 'feedback_pass';
  monthlyLimit: number;
}> = [
  { tier: 'free', actionType: 'source_analysis', monthlyLimit: 5 },
  { tier: 'free', actionType: 'feedback_pass', monthlyLimit: 3 },
  { tier: 'plus', actionType: 'source_analysis', monthlyLimit: 60 },
  { tier: 'plus', actionType: 'feedback_pass', monthlyLimit: 30 },
  { tier: 'pro', actionType: 'source_analysis', monthlyLimit: 250 },
  { tier: 'pro', actionType: 'feedback_pass', monthlyLimit: 120 },
];

const FIXTURE_USERS: Array<{
  key: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  role: 'member' | 'admin';
}> = [
  { key: 'waitlist-pending', email: 'waitlist-pending@example.test', status: 'pending', role: 'member' },
  { key: 'waitlist-approved', email: 'waitlist-approved@example.test', status: 'approved', role: 'member' },
  { key: 'admin', email: 'admin@example.test', status: 'approved', role: 'admin' },
  // Every account is on the `free` tier by definition until billing (US-023/024)
  // lands (see lib/metering's resolveTier) -- this one exists purely so the
  // "hit a usage limit" demo doesn't have to burn 5 real analyses through the
  // UI to get there (docs/testing.md).
  { key: 'free-tier-at-limit', email: 'free-tier-at-limit@example.test', status: 'approved', role: 'member' },
  // A real Stripe test-mode customer + active subscription (see
  // seedPaidTierSubscription) -- exercises the Billing Portal and
  // duplicate-checkout-guard demos against a genuine `subscriptions` row
  // rather than a hand-inserted one, per docs/testing.md's "paid-tier
  // (fixture Stripe IDs)" fixture.
  { key: 'paid-tier', email: 'paid-tier@example.test', status: 'approved', role: 'member' },
];

const FREE_TIER_SOURCE_ANALYSIS_LIMIT = 5;

const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const db = createDb(databaseUrl);

async function seedTierLimits() {
  for (const row of TIER_LIMITS) {
    await db
      .insert(tierLimits)
      .values(row)
      .onConflictDoUpdate({
        target: [tierLimits.tier, tierLimits.actionType],
        set: { monthlyLimit: row.monthlyLimit },
      });
  }
  console.log(`Seeded ${TIER_LIMITS.length} tier_limits rows.`);
}

async function ensureAuthUser(email: string): Promise<string> {
  const existingId = await findAuthUserIdByEmail(supabaseAdmin, email);
  if (existingId) return existingId;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: FIXTURE_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function seedFixtureUsers() {
  for (const fixture of FIXTURE_USERS) {
    const authUserId = await ensureAuthUser(fixture.email);
    const reviewedAt = fixture.status === 'pending' ? null : new Date();

    await db
      .insert(users)
      .values({ id: authUserId, email: fixture.email, status: fixture.status, role: fixture.role })
      .onConflictDoUpdate({
        target: users.id,
        set: { status: fixture.status, role: fixture.role },
      });

    await db
      .insert(waitlistSignups)
      .values({
        userId: authUserId,
        email: fixture.email,
        status: fixture.status,
        requestedAt: new Date(),
        reviewedAt,
      })
      .onConflictDoUpdate({
        target: waitlistSignups.userId,
        set: { status: fixture.status, reviewedAt },
      });

    console.log(`Seeded fixture user "${fixture.key}" (${fixture.email}, status=${fixture.status}, role=${fixture.role}).`);
  }
}

async function seedUsageAtLimit() {
  const authUserId = await ensureAuthUser('free-tier-at-limit@example.test');
  const billingPeriod = currentBillingPeriod(new Date());

  // Delete-then-reinsert for idempotency (usage_events is append-only and has
  // no natural key to upsert against) -- always leaves exactly the cap's worth
  // of usage for the current billing period, however many times seed re-runs.
  await db
    .delete(usageEvents)
    .where(and(eq(usageEvents.userId, authUserId), eq(usageEvents.actionType, 'source_analysis'), eq(usageEvents.billingPeriod, billingPeriod)));
  await db.insert(usageEvents).values({
    userId: authUserId,
    actionType: 'source_analysis',
    quantity: FREE_TIER_SOURCE_ANALYSIS_LIMIT,
    billingPeriod,
  });

  console.log(`Seeded usage_events for "free-tier-at-limit" at the free tier's ${FREE_TIER_SOURCE_ANALYSIS_LIMIT}/mo source_analysis cap.`);
}

// Real Stripe test-mode customer + active Plus subscription (see
// docs/testing.md's "Stripe: Checkout Session creation is a real test-mode
// call" mocking boundary -- the same applies to fixture setup, so the
// Billing Portal and duplicate-checkout-guard demos exercise a genuine
// `subscriptions` row, not a hand-inserted one). Idempotent: does nothing if
// this user already has a Stripe subscription id recorded.
async function seedPaidTierSubscription() {
  const authUserId = await ensureAuthUser('paid-tier@example.test');
  const existing = await getSubscriptionByUserId(db, authUserId);
  if (existing?.stripeSubscriptionId) {
    console.log('Seeded subscription for "paid-tier" already exists -- skipping Stripe calls.');
    return;
  }

  const stripe = createStripeClient(stripeSecretKey as string);

  const found = await stripe.customers.search({ query: "email:'paid-tier@example.test'" });
  const customer = found.data[0] ?? (await stripe.customers.create({ email: 'paid-tier@example.test', metadata: { fixture: 'alvus-ai-seed' } }));

  const existingSubs = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 1 });
  let subscription = existingSubs.data[0];
  if (!subscription) {
    const paymentMethod = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: paymentMethod.id } });
    subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: stripePriceIdPlus as string }],
    });
  }

  const item = subscription.items.data[0];
  await upsertSubscription(db, {
    userId: authUserId,
    tier: 'plus',
    stripeCustomerId: customer.id,
    stripeSubscriptionId: subscription.id,
    status: subscription.status === 'active' ? 'active' : 'incomplete',
    currentPeriodStart: new Date(item.current_period_start * 1000),
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });

  console.log(`Seeded a Stripe test-mode subscription for "paid-tier" (customer ${customer.id}, subscription ${subscription.id}).`);
}

async function main() {
  await seedTierLimits();
  await seedFixtureUsers();
  await seedUsageAtLimit();
  await seedPaidTierSubscription();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
