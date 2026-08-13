import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { test, expect } from './demo';

// Same repeatable-against-shared-dev-Supabase pattern as e2e/us-020.spec.ts:
// delete-then-recreate the demo account fresh every run.
const DEMO_EMAIL = 'us021-demo@example.test';
const DEMO_PASSWORD = 'Fixture-Passw0rd!';
const FIXTURE_PASSWORD = 'Fixture-Passw0rd!';
const ADMIN_EMAIL = 'admin@example.test';

// A single paragraph containing all three of tests/fixtures/litellm/feedback.json's
// verbatim "quote" excerpts, so a fixture-mode pass produces comments the route can
// anchor back into the document (see lib/document/feedback-anchors.ts).
const DRAFT_PARAGRAPH =
  'The utilization of said methodology in this context are important for understanding climate discourse.';

// db/seed.ts's TIER_LIMITS: free tier's feedback_pass/mo cap.
const FREE_TIER_FEEDBACK_LIMIT = 3;

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

test('US-021: post-writing feedback pass', async ({ page, demo }) => {
  // A quota-exhausting loop on top of the usual signup/approve/write round trips.
  test.slow();

  // 1. A dedicated demo account signs up and is approved by the admin (same
  // shortcut as e2e/us-020.spec.ts -- the approval UI itself is already
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

  // 2. The demo account signs in and creates a project.
  await page.goto('/login');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText("You don't have any projects yet")).toBeVisible();

  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Title').fill('Feedback Demo Paper');
  await page.getByLabel('Citation format').selectOption('apa');
  await page.getByRole('button', { name: 'Create project' }).click();

  const demoLogin = await page.request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const { access_token: demoToken } = (await demoLogin.json()) as { access_token: string };
  const authHeaders = { Authorization: `Bearer ${demoToken}` };
  const projectsRes = await page.request.get('/api/projects', { headers: authHeaders });
  const { projects } = (await projectsRes.json()) as { projects: Array<{ id: string; title: string }> };
  const projectId = projects[0]?.id;
  if (!projectId) throw new Error('created project did not appear in the list');

  await page.getByRole('link', { name: 'Feedback Demo Paper' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}`);
  await page.getByRole('link', { name: 'Start writing' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}/write`);

  const editor = page.getByTestId('document-editor');
  await expect(editor).toBeVisible();

  // 3. Requesting a feedback pass on the still-empty document is rejected with a
  // clear error instead of an empty/nonsensical pass.
  const feedbackButton = page.getByTestId('request-feedback');
  await feedbackButton.click();
  await expect(page.getByTestId('feedback-error')).toContainText('Write something before requesting feedback');
  await demo.step('Requesting a feedback pass on an empty document returns a clear error, not an empty pass');

  // 4. Writing a draft, then requesting a pass, surfaces wording/grammar/content
  // comments as margin-style annotations anchored to spans in the editor -- nothing
  // is auto-applied to the document itself.
  await editor.click();
  await page.keyboard.type(DRAFT_PARAGRAPH);

  const feedbackRequest = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === `/api/projects/${projectId}/document/feedback`,
  );
  await feedbackButton.click();
  const feedbackResponse = await feedbackRequest;
  expect(feedbackResponse.status()).toBe(201);

  const panel = page.getByTestId('feedback-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Consider a simpler, more direct word');
  await expect(panel).toContainText('Subject-verb agreement');
  await expect(panel).toContainText('This claim is broad');
  await expect(page.locator('[data-testid^="feedback-highlight-"]')).toHaveCount(3);
  await expect(editor).toContainText(DRAFT_PARAGRAPH);
  await demo.step('A feedback pass surfaces wording/grammar/content comments as margin annotations anchored to the draft, without changing the document');

  // 5. The pass is recorded in the project's feedback history and can be reopened.
  await page.getByTestId('toggle-feedback-history').click();
  const historyList = page.getByTestId('feedback-history');
  await expect(historyList).toBeVisible();
  await expect(historyList).toContainText('3 comments');

  const reopenButton = page.locator('[data-testid^="reopen-feedback-"]').first();
  const reopenRequest = page.waitForResponse(
    (res) => res.request().method() === 'GET' && /\/api\/projects\/[^/]+\/document\/feedback\/[^/]+$/.test(new URL(res.url()).pathname),
  );
  await reopenButton.click();
  const reopenResponse = await reopenRequest;
  expect(reopenResponse.status()).toBe(200);
  await expect(panel).toContainText('Consider a simpler, more direct word');
  await demo.step('Past feedback passes are listed in the project history and can be reopened');

  // 6. Feedback is metered -- the free tier's feedback_pass limit (db/seed.ts) is 3/mo,
  // one of which this run already spent through the UI above. Spending the rest
  // through the API and then requesting one more is blocked with a clear
  // limit-reached response, not a silent failure or an unmetered pass.
  for (let i = 2; i <= FREE_TIER_FEEDBACK_LIMIT; i++) {
    const res = await page.request.post(`/api/projects/${projectId}/document/feedback`, { headers: authHeaders, data: {} });
    expect(res.status()).toBe(201);
  }
  const overLimit = await page.request.post(`/api/projects/${projectId}/document/feedback`, { headers: authHeaders, data: {} });
  expect(overLimit.status()).toBe(402);
  const overLimitBody = (await overLimit.json()) as { error: { code: string } };
  expect(overLimitBody.error.code).toBe('usage_limit_exceeded');
  await demo.step("Once the free tier's monthly feedback-pass limit is reached, requesting another pass is blocked with a clear limit-reached response");
});
