import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { test, expect } from './demo';

// Same repeatable-against-shared-dev-Supabase pattern as e2e/us-022.spec.ts:
// delete-then-recreate the demo account fresh every run.
const DEMO_EMAIL = 'us023-demo@example.test';
const DEMO_PASSWORD = 'Fixture-Passw0rd!';
const FIXTURE_PASSWORD = 'Fixture-Passw0rd!';
const ADMIN_EMAIL = 'admin@example.test';
// Seeded by db/seed.ts with a real Stripe test-mode customer + active Plus
// subscription (docs/testing.md's "paid-tier (fixture Stripe IDs)"), so the
// Billing Portal and duplicate-checkout-guard steps don't need to complete a
// real Checkout first.
const PAID_TIER_EMAIL = 'paid-tier@example.test';

// Stripe's own test card for a successful charge in test mode -- no real
// funds move (docs/testing.md: "Checkout Session creation is a real
// test-mode call ... the checkout demo drives it end-to-end with Stripe's
// test card").
const TEST_CARD_NUMBER = '4242424242424242';

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

test('US-023: Stripe Checkout and Billing Portal', async ({ page, demo }) => {
  // 1. A dedicated demo account signs up and is approved by the admin (same
  // shortcut as e2e/us-021.spec.ts and e2e/us-022.spec.ts).
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

  // 2. The demo account signs in on the free tier and opens the usage page,
  // where it sees an upgrade option for each paid tier and no "Manage
  // billing" button yet (no Stripe customer exists for it).
  await page.goto('/login');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText("You don't have any projects yet")).toBeVisible();

  await page.getByRole('link', { name: 'Usage' }).click();
  await expect(page).toHaveURL('/usage');
  await expect(page.getByTestId('usage-tier')).toContainText('Free');
  await expect(page.getByTestId('upgrade-plus')).toBeVisible();
  await expect(page.getByTestId('upgrade-pro')).toBeVisible();
  await expect(page.getByTestId('manage-billing')).toHaveCount(0);
  await demo.step('A free-tier account sees an upgrade option for each paid plan and no billing-portal link yet');

  // 3. Starting a Checkout for Plus redirects to a real Stripe test-mode
  // Checkout page. Completing it with Stripe's test card redirects back to
  // the usage page with the subscription already active.
  await page.getByTestId('upgrade-plus').click();
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 15_000 });
  await demo.step('Upgrading redirects to a real Stripe test-mode Checkout session');

  await page.getByLabel('Email').fill(DEMO_EMAIL);
  const cardNumberFrame = page.frameLocator('iframe[title="Secure card number input frame"]');
  await cardNumberFrame.getByPlaceholder('Card number').fill(TEST_CARD_NUMBER);
  await page.frameLocator('iframe[title="Secure expiration date input frame"]').getByPlaceholder('MM / YY').fill('12/34');
  await page.frameLocator('iframe[title="Secure CVC input frame"]').getByPlaceholder('CVC').fill('123');
  const nameField = page.getByLabel('Cardholder name');
  if (await nameField.isVisible().catch(() => false)) await nameField.fill('Demo Account');
  await page.getByTestId('hosted-payment-submit-button').click();

  await page.waitForURL(/\/usage(\?|$)/, { timeout: 30_000 });
  await expect(page.getByTestId('checkout-success')).toBeVisible();
  await expect(page.getByTestId('usage-tier')).toContainText('Plus');
  await demo.step("Completing Checkout with Stripe's test card returns to the app with the account upgraded to Plus");

  // 4. A user already on a tier cannot start a duplicate Checkout for that
  // same tier -- exercised directly against the API since the UI only ever
  // offers an upgrade to a *different* tier than the one already active.
  const dupToken = await page.evaluate(() => localStorage.getItem('alvus.accessToken'));
  const dup = await page.request.post('/api/billing/checkout-session', {
    headers: { Authorization: `Bearer ${dupToken}` },
    data: { tier: 'plus' },
  });
  expect(dup.status()).toBe(409);
  await demo.step('Starting a duplicate Checkout for the plan already active on the account is rejected with a clear error');

  // 5. A separate fixture account with an existing Stripe subscription
  // (db/seed.ts's `paid-tier`) can open the real Stripe Billing Portal to
  // manage or cancel it.
  await page.evaluate(() => localStorage.clear());
  await page.goto('/login');
  await page.getByLabel('Email').fill(PAID_TIER_EMAIL);
  await page.getByLabel('Password').fill(FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();

  await page.getByRole('link', { name: 'Usage' }).click();
  await expect(page).toHaveURL('/usage');
  await expect(page.getByTestId('usage-tier')).toContainText('Plus');
  await expect(page.getByTestId('upgrade-plus')).toHaveCount(0);

  await page.getByTestId('manage-billing').click();
  await page.waitForURL(/^https:\/\/billing\.stripe\.com\//, { timeout: 15_000 });
  await demo.step('An existing subscriber can open the real Stripe Billing Portal to manage or cancel their plan');
});
