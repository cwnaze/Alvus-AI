import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { assertFocusVisible, assertNoAccessibilityViolations, assertNoHorizontalOverflow, DESKTOP_VIEWPORT, MOBILE_VIEWPORT } from './a11y';
import { test, expect } from './demo';

// Same repeatable-against-shared-dev-Supabase pattern as e2e/us-025.spec.ts:
// delete-then-recreate the demo account fresh every run.
const DEMO_EMAIL = 'us029-demo@example.test';
const DEMO_PASSWORD = 'Fixture-Passw0rd!';
const FIXTURE_PASSWORD = 'Fixture-Passw0rd!';
const ADMIN_EMAIL = 'admin@example.test';

// The exact paragraph e2e/us-021.spec.ts uses -- it contains every verbatim
// "quote" excerpt tests/fixtures/litellm/feedback.json anchors against, so a
// fixture-mode feedback pass reliably produces comments to interact with here.
const DRAFT_PARAGRAPH =
  'The utilization of said methodology in this context are important for understanding climate discourse.';

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

test('US-029: accessibility and responsive-layout hardening', async ({ page, demo }) => {
  // A long round trip across six flows, each checked for a11y violations,
  // keyboard operability, and mobile-width rendering -- same reasoning as
  // e2e/us-021.spec.ts's and e2e/us-025.spec.ts's test.slow().
  test.slow();
  await page.setViewportSize(DESKTOP_VIEWPORT);

  // 1. Signup, completed via keyboard alone: Tab reaches each field and the
  // submit button in visual order, every stop has a visible focus indicator,
  // and the page itself has no WCAG 2 A/AA violations.
  await page.goto('/signup');
  await assertNoAccessibilityViolations(page);

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email')).toBeFocused();
  await assertFocusVisible(page);
  await page.keyboard.type(DEMO_EMAIL);

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password')).toBeFocused();
  await assertFocusVisible(page);
  await page.keyboard.type(DEMO_PASSWORD);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Sign up' })).toBeFocused();
  await assertFocusVisible(page);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('pending admin approval');
  await demo.step('Signup is completable via keyboard alone, with a visible focus indicator at every stop and no accessibility violations');

  // 2. Approve the demo account (same admin shortcut as prior stories -- the
  // approval UI itself is already demo'd by US-011).
  const demoUserId = await findAuthUserIdByEmail(supabaseAdmin, DEMO_EMAIL);
  if (!demoUserId) throw new Error('demo user was not created by signup');

  await page.goto('/login');
  await assertNoAccessibilityViolations(page);
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

  // 3. Project creation, completed via keyboard alone: Tab from a fresh page
  // load reaches "New project", Enter opens the form, and the rest of the
  // form (title, citation-format select, submit) is filled and submitted
  // without a mouse.
  await page.goto('/login');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText("You don't have any projects yet")).toBeVisible();
  await assertNoAccessibilityViolations(page);

  // Tab order on a fresh page load: the "Usage" link, then "Log out", then
  // "New project" -- the empty-state copy in between has nothing focusable.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Usage' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Log out' })).toBeFocused();
  await page.keyboard.press('Tab');
  const newProjectButton = page.getByRole('button', { name: 'New project' });
  await expect(newProjectButton).toBeFocused();
  await assertFocusVisible(page);
  await page.keyboard.press('Enter');

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Title')).toBeFocused();
  await page.keyboard.type('Accessibility Demo Paper');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Citation format')).toBeFocused();
  await page.keyboard.press('ArrowDown'); // mla -> apa
  await page.keyboard.press('Tab');
  const createButton = page.getByRole('button', { name: 'Create project' });
  await expect(createButton).toBeFocused();
  await assertFocusVisible(page);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Accessibility Demo Paper' })).toBeVisible();
  await demo.step('A project is created via keyboard alone: Tab reaches "New project" and every form field in order, Enter submits');

  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Accessibility Demo Paper' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await demo.step('The dashboard renders usably at a mobile viewport width, with no horizontal scrolling');
  await page.setViewportSize(DESKTOP_VIEWPORT);

  const demoLogin = await page.request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const { access_token: demoToken } = (await demoLogin.json()) as { access_token: string };
  const authHeaders = { Authorization: `Bearer ${demoToken}` };
  const projectsRes = await page.request.get('/api/projects', { headers: authHeaders });
  const { projects } = (await projectsRes.json()) as { projects: Array<{ id: string; title: string }> };
  const projectId = projects[0]?.id;
  if (!projectId) throw new Error('created project did not appear in the list');

  // 4. Source review: search, analyze, and select a candidate into the
  // bibliography, each control reachable and operable by keyboard (focus +
  // Enter/Space, not just a mouse click), with no a11y violations on the page.
  await page.goto(`/projects/${projectId}`);
  await assertNoAccessibilityViolations(page);

  const searchButton = page.getByRole('button', { name: 'Search for sources' });
  await searchButton.focus();
  await expect(searchButton).toBeFocused();
  await page.keyboard.press('Enter');

  const firstCandidate = page.locator('[data-testid^="source-"]').first();
  await expect(firstCandidate).toBeVisible();
  const analyzeButton = firstCandidate.getByRole('button', { name: 'Analyze' });
  await analyzeButton.focus();
  await expect(analyzeButton).toBeFocused();
  await analyzeButton.press('Enter');
  await expect(firstCandidate.getByText('Strengths:')).toBeVisible();

  const selectButton = firstCandidate.getByRole('button', { name: 'Add to bibliography' });
  await selectButton.focus();
  await selectButton.press('Enter');
  const bibliographyEntry = page.locator('[data-testid^="bibliography-"]').first();
  await expect(bibliographyEntry).toBeVisible();
  await demo.step('Searching, analyzing, and selecting a source into the bibliography are all keyboard-operable, with no accessibility violations');

  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.reload();
  await expect(bibliographyEntry).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await demo.step('The source review page renders usably at a mobile viewport width, with no horizontal scrolling');
  await page.setViewportSize(DESKTOP_VIEWPORT);

  // 5. Editor + feedback: the ProseMirror document region has a visible focus
  // indicator of its own (it deliberately suppresses the native outline for
  // its own styling, so it needs a replacement), and requesting a feedback
  // pass surfaces comments that are themselves keyboard-selectable.
  await page.getByRole('link', { name: 'Start writing' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}/write`);
  await assertNoAccessibilityViolations(page);

  const editor = page.getByTestId('document-editor');
  await editor.click();
  await assertFocusVisible(page);
  await page.keyboard.type(DRAFT_PARAGRAPH);
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  const feedbackButton = page.getByTestId('request-feedback');
  await feedbackButton.focus();
  await feedbackButton.press('Enter');
  const feedbackPanel = page.getByTestId('feedback-panel');
  await expect(feedbackPanel).toBeVisible();

  const firstComment = feedbackPanel.getByRole('button').first();
  await firstComment.focus();
  await expect(firstComment).toBeFocused();
  await firstComment.press('Enter');
  await demo.step('The editor has a visible focus indicator, and requesting/reading feedback comments is keyboard-operable, with no accessibility violations');

  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.reload();
  await expect(page.getByTestId('document-editor')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await demo.step('The editor and its bibliography/feedback sidebar stack usably at a mobile viewport width, with no horizontal scrolling');
  await page.setViewportSize(DESKTOP_VIEWPORT);

  // 6. Checkout: the upgrade button is keyboard-operable and, once activated,
  // launches the real Stripe Checkout flow (completing the purchase itself is
  // e2e/us-023.spec.ts's job, not this story's).
  await page.goto('/usage');
  await assertNoAccessibilityViolations(page);

  const upgradeButton = page.getByTestId('upgrade-plus');
  await upgradeButton.focus();
  await expect(upgradeButton).toBeFocused();
  await upgradeButton.press('Enter');
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 15_000 });
  await demo.step('The checkout entry point is keyboard-operable: Enter on the upgrade button launches real Stripe Checkout, with no accessibility violations on the usage page');

  await page.goto('/usage');
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.reload();
  await expect(page.getByTestId('usage-tier')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await demo.step('The usage/checkout page renders usably at a mobile viewport width, with no horizontal scrolling');
});
