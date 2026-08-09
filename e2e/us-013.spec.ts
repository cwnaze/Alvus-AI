import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { test, expect } from './demo';

// Persistent shared dev Supabase project (see CLAUDE.md's Local development
// section and e2e/us-011.spec.ts) -- this spec must be repeatable against it
// without accumulating state, so the demo account is deleted (if it exists
// from a prior run) and recreated fresh via the real signup form every time.
const DEMO_EMAIL = 'us013-demo@example.test';
const DEMO_PASSWORD = 'Fixture-Passw0rd!';
const FIXTURE_PASSWORD = 'Fixture-Passw0rd!';
const ADMIN_EMAIL = 'admin@example.test';
const NON_ADMIN_EMAIL = 'waitlist-approved@example.test';

let supabaseAdmin: SupabaseClient;

test.beforeAll(async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required (see .env.example)');
  }
  supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const existingId = await findAuthUserIdByEmail(supabaseAdmin, DEMO_EMAIL);
  if (existingId) await supabaseAdmin.auth.admin.deleteUser(existingId);
});

test('US-013: admin user directory', async ({ page, demo }) => {
  // 1. A dedicated demo account signs up (real form) and waits on the queue.
  await page.goto('/signup');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('status')).toContainText('pending admin approval');

  const demoUserId = await findAuthUserIdByEmail(supabaseAdmin, DEMO_EMAIL);
  if (!demoUserId) throw new Error('demo user was not created by signup');

  // 2. The admin signs in once through the real UI -- every later admin
  // action in this spec (the approval below, then the directory itself)
  // reuses this one session/token rather than logging in again, to keep
  // this spec's load on the shared dev Supabase project's auth rate limits
  // low (see e2e/us-012.spec.ts's note on the same project's quotas).
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('User directory')).toBeVisible();
  const adminToken = await page.evaluate(() => localStorage.getItem('alvus.accessToken'));
  if (!adminToken) throw new Error('admin session token was not set after login');

  // 3. Approve the demo account via the API (US-011 already demos the
  // approval UI in full) so this spec's screenshots focus on the new
  // directory.
  const approve = await page.request.post(`/api/admin/waitlist/${demoUserId}/approve`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(approve.status()).toBe(200);

  // 4. Capture the demo user's own access token while still approved, to
  // prove later that revoking blocks its *next* request rather than merely
  // hiding the account from the UI.
  const demoLogin = await page.request.post('/api/auth/login', {
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  const { access_token: demoToken } = (await demoLogin.json()) as { access_token: string };

  // 5. Open the user directory from the still-signed-in admin session.
  await page.getByRole('link', { name: 'User directory' }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);

  // 6. Searching and filtering surfaces the demo user with their status,
  // role, and tier -- every account is `free` until billing (a later story)
  // exists, so tier filtering is exercised against that.
  await page.getByLabel('Search by email').fill(DEMO_EMAIL);
  await page.getByLabel('Status').selectOption('approved');
  const demoRow = page.getByRole('listitem').filter({ hasText: DEMO_EMAIL });
  await expect(demoRow).toContainText('approved');
  await expect(demoRow).toContainText('member');
  await expect(demoRow).toContainText('free');
  await demo.step("The admin searches and filters the directory, and views the user's status, role, and tier");

  await page.getByLabel('Tier').selectOption('plus');
  await expect(page.getByText('No users match these filters.')).toBeVisible();
  await demo.step('Filtering by a paid tier returns nobody -- no account can be on a paid plan before billing ships');

  // 7. The admin revokes the demo user's access; the directory reflects it
  // immediately.
  await page.getByLabel('Tier').selectOption('');
  await expect(demoRow).toBeVisible();
  await demoRow.getByRole('button', { name: 'Revoke access' }).click();
  // The status filter is still "approved" -- revoking flips the user to
  // "rejected" server-side, so it now correctly falls out of that filtered
  // view. Clear the filter to see the updated row.
  await expect(demoRow).not.toBeVisible();
  await page.getByLabel('Status').selectOption('');
  await expect(demoRow).toContainText('rejected');
  await expect(demoRow.getByRole('button', { name: 'Revoke access' })).toBeDisabled();
  await demo.step("The admin revokes the user's access; their status flips to rejected in the directory");

  // A non-admin approved member is rejected server-side, not just hidden
  // client-side.
  const nonAdminLogin = await page.request.post('/api/auth/login', {
    data: { email: NON_ADMIN_EMAIL, password: FIXTURE_PASSWORD },
  });
  const { access_token: nonAdminToken } = (await nonAdminLogin.json()) as { access_token: string };
  const forbidden = await page.request.get('/api/admin/users', {
    headers: { Authorization: `Bearer ${nonAdminToken}` },
  });
  expect(forbidden.status()).toBe(403);

  // The revoked user's still-valid access token is now denied by the
  // per-request status check, not just cosmetically removed from the list.
  const deniedAfterRevoke = await page.request.get('/api/admin/users', {
    headers: { Authorization: `Bearer ${demoToken}` },
  });
  expect(deniedAfterRevoke.status()).toBe(403);
  const deniedBody = (await deniedAfterRevoke.json()) as { error: { code: string } };
  expect(deniedBody.error.code).toBe('waitlist_rejected');
});
