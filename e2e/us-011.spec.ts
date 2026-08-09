import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { test, expect } from './demo';

// Persistent shared dev Supabase project (see CLAUDE.md's Local development
// section) -- this spec must be repeatable against it without accumulating
// state, so the demo account is deleted (if it exists from a prior run) and
// recreated fresh via the real signup form every time. The other two accounts
// this spec touches (`waitlist-pending@example.test`, `admin@example.test`)
// are reset to their fixed seed state by `npm run db:seed`, which must be run
// before this spec (see docs/testing.md's seed data list).
const DEMO_EMAIL = 'us011-demo@example.test';
const DEMO_PASSWORD = 'Fixture-Passw0rd!';
const FIXTURE_PASSWORD = 'Fixture-Passw0rd!';
const REJECTED_FIXTURE_EMAIL = 'waitlist-pending@example.test';
const ADMIN_EMAIL = 'admin@example.test';

test.beforeAll(async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required (see .env.example)');
  }
  const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const existingId = await findAuthUserIdByEmail(supabaseAdmin, DEMO_EMAIL);
  if (existingId) await supabaseAdmin.auth.admin.deleteUser(existingId);
});

test('US-011: waitlist signup, admin approval, and login', async ({ page, demo }) => {
  // 1. A visitor signs up and lands in the waitlist queue.
  await page.goto('/signup');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('status')).toContainText('pending admin approval');
  await demo.step('A visitor submits the waitlist signup form and sees the pending-approval confirmation');

  // 2. Logging in while pending shows a status screen, not the app.
  await page.goto('/login');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Pending approval' })).toBeVisible();
  await demo.step('Logging in while pending shows a status screen instead of the app');
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 3. The admin reviews the pending queue -- both the new signup and the
  // still-pending fixture account are in it.
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('link', { name: 'Waitlist admin' }).click();
  await expect(page).toHaveURL(/\/admin\/waitlist$/);
  const demoRow = page.getByRole('listitem').filter({ hasText: DEMO_EMAIL });
  const rejectedRow = page.getByRole('listitem').filter({ hasText: REJECTED_FIXTURE_EMAIL });
  await expect(demoRow).toBeVisible();
  await expect(rejectedRow).toBeVisible();
  await demo.step('The admin reviews the pending waitlist queue');

  // 4. The admin approves one entry and rejects the other.
  await demoRow.getByRole('button', { name: 'Approve' }).click();
  await expect(demoRow).not.toBeVisible();
  await rejectedRow.getByRole('button', { name: 'Reject' }).click();
  await expect(rejectedRow).not.toBeVisible();
  await expect(page.getByText('No pending signups.')).toBeVisible();
  await demo.step('The admin approves one entry and rejects the other; the queue empties');
  await page.getByRole('link', { name: 'Back to dashboard' }).click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 5. The rejected user sees "not approved" on login.
  await page.getByLabel('Email').fill(REJECTED_FIXTURE_EMAIL);
  await page.getByLabel('Password').fill(FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Not approved' })).toBeVisible();
  await demo.step('The rejected fixture account sees a "not approved" status screen on login');
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 6. Once approved, the same signed-up user reaches the app.
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText("You don't have any projects yet")).toBeVisible();
  await demo.step('Once approved, the same user logs in and reaches the projects dashboard empty state');

  const accessToken = await page.evaluate(() => localStorage.getItem('alvus.accessToken'));
  expect(accessToken).toBeTruthy();

  // A non-admin approved member is rejected server-side, not just hidden client-side.
  const forbidden = await page.request.get('/api/admin/waitlist', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(forbidden.status()).toBe(403);

  // 7. Logout clears the session -- the same token is rejected afterward.
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  const afterLogout = await page.request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(afterLogout.status()).toBe(401);
  await demo.step('Logging out clears the session; the same token is rejected with 401 on a protected route');
});
