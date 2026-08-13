import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { test, expect } from './demo';

// Same repeatable-against-shared-dev-Supabase pattern as e2e/us-021.spec.ts:
// delete-then-recreate the demo account fresh every run.
const DEMO_EMAIL = 'us022-demo@example.test';
const DEMO_PASSWORD = 'Fixture-Passw0rd!';
const FIXTURE_PASSWORD = 'Fixture-Passw0rd!';
const ADMIN_EMAIL = 'admin@example.test';
// Seeded by db/seed.ts with usage_events already at the free tier's
// source_analysis cap, so this demo doesn't need to burn 5 real analyses
// through the UI to show the at-limit state (docs/testing.md).
const AT_LIMIT_EMAIL = 'free-tier-at-limit@example.test';

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

test('US-022: usage dashboard and limit-exceeded UX', async ({ page, demo }) => {
  // 1. A dedicated demo account signs up and is approved by the admin (same
  // shortcut as e2e/us-021.spec.ts -- the approval UI itself is already
  // demo'd by US-011).
  await page.goto('/signup');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('status')).toContainText('pending admin approval');

  const demoUserId = await findAuthUserIdByEmail(supabaseAdmin, DEMO_EMAIL);
  if (!demoUserId) throw new Error('demo user was not created by signup');

  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Your projects')).toBeVisible();
  const adminToken = await page.evaluate(() => localStorage.getItem('alvus.accessToken'));
  if (!adminToken) throw new Error('admin session token was not set after login');

  const approve = await page.request.post(`/api/admin/waitlist/${demoUserId}/approve`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(approve.status()).toBe(200);
  await page.evaluate(() => localStorage.clear());

  // 2. The demo account signs in with no usage yet and opens the usage
  // dashboard from the "Usage" link on its own dashboard.
  await page.goto('/login');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText("You don't have any projects yet")).toBeVisible();

  await page.getByRole('link', { name: 'Usage' }).click();
  await expect(page).toHaveURL('/usage');

  // 3. The dashboard shows the account's plan tier and, for each metered
  // action, usage against the seeded v1 free-tier catalog (5 source
  // analyses, 3 feedback passes per month), plus when it resets.
  await expect(page.getByTestId('usage-tier')).toContainText('Free');
  await expect(page.getByTestId('usage-source_analysis')).toContainText('0 / 5 used');
  await expect(page.getByTestId('usage-feedback_pass')).toContainText('0 / 3 used');
  await expect(page.getByTestId('usage-source_analysis').getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('usage-resets-at')).toContainText('Usage resets on');
  await demo.step("The usage dashboard shows the account's plan tier and usage against each metered action's monthly limit");

  // 4. A different account whose source-analysis quota is already exhausted
  // sees that reflected on the dashboard with a clear upgrade-or-wait
  // message, not a generic error. `free-tier-at-limit` is a shared seeded
  // fixture account (db/seed.ts), not recreated per run.
  await page.evaluate(() => localStorage.clear());
  await page.goto('/login');
  await page.getByLabel('Email').fill(AT_LIMIT_EMAIL);
  await page.getByLabel('Password').fill(FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  // Wait for the login to actually land before navigating away -- otherwise
  // `goto` can race the in-flight login request and abort it mid-flight.
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();

  await page.getByRole('link', { name: 'Usage' }).click();
  await expect(page).toHaveURL('/usage');

  const sourceAnalysisRow = page.getByTestId('usage-source_analysis');
  await expect(sourceAnalysisRow).toContainText('5 / 5 used');
  await expect(sourceAnalysisRow.getByRole('alert')).toContainText("You've used all 5 source analyses");
  await expect(sourceAnalysisRow.getByRole('alert')).toContainText('Upgrade or wait until it resets');
  await demo.step("Once a metered action's monthly limit is exhausted, the dashboard shows a clear upgrade-or-wait message instead of a generic error");
});
