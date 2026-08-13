import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { test, expect } from './demo';

// Same repeatable-against-shared-dev-Supabase pattern as e2e/us-018.spec.ts:
// delete-then-recreate the demo account fresh every run.
const DEMO_EMAIL = 'us020-demo@example.test';
const DEMO_PASSWORD = 'Fixture-Passw0rd!';
const FIXTURE_PASSWORD = 'Fixture-Passw0rd!';
const ADMIN_EMAIL = 'admin@example.test';

// Matches tests/fixtures/litellm/suggestions.json's first entry -- fixture mode is
// selected by the absence of AI_PROVIDER_MODE=live (see docs/testing.md), the same
// determinism boundary US-016's analysis fixtures use.
const FIRST_FIXTURE_SUGGESTION = 'Open with a definition of the key term';

// lib/rate-limit's window ceiling (apps/worker/src/lib/rate-limit/index.ts).
const RATE_LIMIT_CEILING = 10;

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

test('US-020: paragraph and structure suggestions in the editor', async ({ page, demo }) => {
  // This flow drives a burst of rate-limit-probing requests on top of the usual
  // signup/approve/write round trips -- give it real headroom.
  test.slow();

  // 1. A dedicated demo account signs up and is approved by the admin (same
  // shortcut as e2e/us-018.spec.ts -- the approval UI itself is already
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
  await page.getByLabel('Title').fill('Suggestions Demo Paper');
  await page.getByLabel('Citation format').selectOption('apa');
  await page.getByRole('button', { name: 'Create project' }).click();

  const demoLogin = await page.request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const { access_token: demoToken } = (await demoLogin.json()) as { access_token: string };
  const authHeaders = { Authorization: `Bearer ${demoToken}` };
  const projectsRes = await page.request.get('/api/projects', { headers: authHeaders });
  const { projects } = (await projectsRes.json()) as { projects: Array<{ id: string; title: string }> };
  const projectId = projects[0]?.id;
  if (!projectId) throw new Error('created project did not appear in the list');

  await page.getByRole('link', { name: 'Suggestions Demo Paper' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}`);
  await page.getByRole('link', { name: 'Start writing' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}/write`);

  const editor = page.getByTestId('document-editor');
  await expect(editor).toBeVisible();

  // 3. Typing a paragraph, then requesting a suggestion, surfaces inline hints near
  // the editor -- the suggestion text is never inserted into the document itself.
  await editor.click();
  await page.keyboard.type('Recent scholarship on climate rhetoric has shifted its focus.');

  const suggestButton = page.getByRole('button', { name: 'Suggest a starting point' });
  const suggestionsRequest = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === `/api/projects/${projectId}/document/suggestions`,
  );
  await suggestButton.click();
  const suggestionsResponse = await suggestionsRequest;
  expect(suggestionsResponse.status()).toBe(200);

  const hints = page.getByTestId('suggestion-hints');
  await expect(hints).toBeVisible();
  await expect(hints).toContainText(FIRST_FIXTURE_SUGGESTION);
  await expect(editor).not.toContainText(FIRST_FIXTURE_SUGGESTION);
  await expect(editor).toContainText('Recent scholarship on climate rhetoric has shifted its focus.');
  await demo.step('Requesting a suggestion while writing shows an inline hint near the editor, never inserted into the document');

  // 4. Suggestions are not counted against the free tier's metered usage (the
  // free tier's source_analysis limit is 5 -- see db/seed.ts) -- repeating the
  // request well past that count still succeeds, right up to the rate-limit
  // ceiling, proving this call is unmetered.
  for (let i = 1; i < RATE_LIMIT_CEILING; i++) {
    const res = await page.request.post(`/api/projects/${projectId}/document/suggestions`, {
      headers: authHeaders,
      data: { cursor_context: `Paragraph ${i}` },
    });
    expect(res.status()).toBe(200);
  }
  await demo.step("Repeating the request well past the free tier's metered-action limit still succeeds -- suggestions are not metered");

  // 5. One more request past the rate-limit ceiling is throttled with a clear
  // 429 response and a Retry-After header, not silently dropped or treated as
  // a metering (402) failure.
  const throttled = await page.request.post(`/api/projects/${projectId}/document/suggestions`, {
    headers: authHeaders,
    data: { cursor_context: 'One request too many' },
  });
  expect(throttled.status()).toBe(429);
  expect(throttled.headers()['retry-after']).toBeTruthy();
  const throttledBody = (await throttled.json()) as { error: { code: string } };
  expect(throttledBody.error.code).toBe('rate_limited');
  await demo.step('A rapid burst of repeated requests is throttled with a clear 429 rate-limit response, not silently dropped');
});
