import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { test, expect } from './demo';

// Persistent shared dev Supabase project (see CLAUDE.md's Local development
// section and e2e/us-011.spec.ts) -- this spec must be repeatable against it
// without accumulating state, so the demo account is deleted (if it exists
// from a prior run) and recreated fresh via the real signup form every time.
const DEMO_EMAIL = 'us012-demo@example.test';
const OLD_PASSWORD = 'Fixture-Passw0rd!';
const NEW_PASSWORD = 'New-Fixture-Passw0rd!1';
const ADMIN_EMAIL = 'admin@example.test';
const ADMIN_PASSWORD = 'Fixture-Passw0rd!';

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

test('US-012: password reset flow', async ({ page, demo }) => {
  // 1. Create and approve a dedicated demo account -- signup via the real
  // form, approval via the admin API (US-011 already demos that UI in full).
  await page.goto('/signup');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(OLD_PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('status')).toContainText('pending admin approval');

  const userId = await findAuthUserIdByEmail(supabaseAdmin, DEMO_EMAIL);
  if (!userId) throw new Error('demo user was not created by signup');

  const adminLogin = await page.request.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const { access_token: adminToken } = (await adminLogin.json()) as { access_token: string };
  const approve = await page.request.post(`/api/admin/waitlist/${userId}/approve`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(approve.status()).toBe(200);

  // 2. Requesting a reset shows the same generic confirmation regardless of
  // whether the email exists -- see docs/api.md's no-enumeration contract.
  // The backend's own resetPasswordForEmail call (and its no-enumeration/429
  // handling) is exhaustively covered by mocked unit tests in
  // apps/worker/src/routes/auth.test.ts; this one network call is stubbed
  // here rather than hitting Supabase for real, because this spec re-runs on
  // every future PR (docs/testing.md's regression gate) and Supabase's
  // project-wide auth-email send quota does not reset fast enough to survive
  // that -- confirmed by hand: two real calls during development were enough
  // to 429 the shared dev project for the rest of the hour.
  await page.route('**/api/auth/password-reset/request', (route) =>
    route.fulfill({ status: 202, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText("we've sent a link");
  await demo.step('Requesting a password reset shows a generic confirmation screen');
  await page.unroute('**/api/auth/password-reset/request');

  // 3. An invalid/expired token is rejected with a clear error, not a crash
  // or a silent success.
  await page.goto('/reset-password?token=not-a-real-token');
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByRole('alert')).toContainText('invalid or has expired');
  await demo.step('An invalid reset token is rejected with a clear error');

  // 4. Following the real reset link (its token minted the same way the
  // email's link is, via the Supabase Admin API -- Playwright can't read a
  // real inbox deterministically) lets the user set a new password.
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: DEMO_EMAIL,
  });
  if (linkError || !linkData) throw new Error(`generateLink failed: ${linkError?.message}`);
  const token = linkData.properties.hashed_token;

  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByRole('status')).toContainText('Your password has been reset');
  await demo.step('A valid reset token lets the user set a new password');

  // 5. The user can log in with the new password and reach the app -- the
  // old password no longer works.
  await page.getByRole('link', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(OLD_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await page.getByLabel('Password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText("You don't have any projects yet")).toBeVisible();
  await demo.step('Logging in with the new password reaches the app; the old password no longer works');
});
