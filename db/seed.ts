import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { and, eq } from 'drizzle-orm';
import { createDb } from '../apps/worker/src/lib/db/client';
import { tierLimits, usageEvents, users, waitlistSignups } from '../apps/worker/src/lib/db/schema';
import { currentBillingPeriod } from '../apps/worker/src/lib/metering';
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

async function main() {
  await seedTierLimits();
  await seedFixtureUsers();
  await seedUsageAtLimit();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
