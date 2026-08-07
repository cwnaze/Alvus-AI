import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createDb } from '../apps/worker/src/lib/db/client';
import { users, waitlistSignups } from '../apps/worker/src/lib/db/schema';
import { findAuthUserIdByEmail } from './lib/find-auth-user-id';

// Mints the first admin account outside the normal admin-approval flow, since that
// flow (docs/api.md's POST /admin/waitlist/:userId/approve) requires an admin to
// already exist. Deliberately a script run directly against DATABASE_URL, not an
// HTTP endpoint -- see README's "Production bootstrap" section.

const email = process.argv[2];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Usage: npm run db:bootstrap-admin -- <email>');
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

const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const db = createDb(databaseUrl);

async function main() {
  const authUserId = await findAuthUserIdByEmail(supabaseAdmin, email);
  if (!authUserId) {
    throw new Error(
      `No Supabase Auth account exists for ${email}. Create the account first (normal sign-up, or ` +
        `Supabase Studio), then re-run this script to promote it to admin.`,
    );
  }

  const now = new Date();

  await db
    .insert(users)
    .values({ id: authUserId, email, status: 'approved', role: 'admin' })
    .onConflictDoUpdate({
      target: users.id,
      set: { status: 'approved', role: 'admin' },
    });

  await db
    .insert(waitlistSignups)
    .values({
      userId: authUserId,
      email,
      status: 'approved',
      requestedAt: now,
      reviewedAt: now,
      notes: 'Promoted directly via db/bootstrap-admin.ts',
    })
    .onConflictDoUpdate({
      target: waitlistSignups.userId,
      set: { status: 'approved', reviewedAt: now },
    });

  console.log(`Promoted ${email} (${authUserId}) to role=admin, status=approved.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
