import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { test, expect } from './demo';

// Persistent shared dev Supabase project (see CLAUDE.md's Local development
// section and e2e/us-011.spec.ts) -- this spec must be repeatable against it
// without accumulating state, so the demo account is deleted (if it exists
// from a prior run) and recreated fresh via the real signup form every time.
const DEMO_EMAIL = 'us014-demo@example.test';
const DEMO_PASSWORD = 'Fixture-Passw0rd!';
const FIXTURE_PASSWORD = 'Fixture-Passw0rd!';
const ADMIN_EMAIL = 'admin@example.test';
const OTHER_USER_EMAIL = 'waitlist-approved@example.test';

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

test('US-014: create, list, rename, and delete a project', async ({ page, demo }) => {
  // 1. A dedicated demo account signs up (real form) and waits on the queue.
  await page.goto('/signup');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('status')).toContainText('pending admin approval');

  const demoUserId = await findAuthUserIdByEmail(supabaseAdmin, DEMO_EMAIL);
  if (!demoUserId) throw new Error('demo user was not created by signup');

  // 2. The admin signs in and approves the demo account via the API (US-011
  // already demos the approval UI in full, so this spec's screenshots focus
  // on the projects dashboard itself).
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

  // 3. The demo account signs in and lands on the dashboard's empty state.
  await page.goto('/login');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText("You don't have any projects yet")).toBeVisible();
  await demo.step('A newly-approved user sees the empty projects dashboard');

  // 4. Creating a project with a title and citation format adds it to the list.
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Title').fill('The Rhetoric of Climate Policy');
  await page.getByLabel('Citation format').selectOption('apa');
  await page.getByRole('button', { name: 'Create project' }).click();

  const demoLogin = await page.request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const { access_token: demoToken } = (await demoLogin.json()) as { access_token: string };
  const listRes = await page.request.get('/api/projects', { headers: { Authorization: `Bearer ${demoToken}` } });
  const { projects } = (await listRes.json()) as { projects: Array<{ id: string; citation_format: string }> };
  const projectId = projects[0]?.id;
  if (!projectId) throw new Error('created project did not appear in the list');

  // A stable locator keyed on the project id -- the row's visible text
  // changes shape once rename swaps the title for an input, so filtering by
  // title text would stop matching mid-flow.
  const projectRow = page.getByTestId(`project-${projectId}`);
  await expect(projectRow).toContainText('The Rhetoric of Climate Policy');
  await expect(projectRow).toContainText('APA');
  await expect(projectRow).toContainText('draft');
  await demo.step('The user creates a project with a title and citation format (APA)');

  // 5. Citation format is immutable after creation -- the rename form never
  // exposes it, so this is exercised directly against the API, the same way
  // e2e/us-013.spec.ts covers server-side-only edge cases.
  const immutableAttempt = await page.request.patch(`/api/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${demoToken}` },
    data: { title: 'Renamed via API', citation_format: 'mla' },
  });
  expect(immutableAttempt.status()).toBe(422);
  const immutableBody = (await immutableAttempt.json()) as { error: { code: string } };
  expect(immutableBody.error.code).toBe('citation_format_immutable');

  // 6. A different approved user cannot view or modify this project.
  const otherLogin = await page.request.post('/api/auth/login', { data: { email: OTHER_USER_EMAIL, password: FIXTURE_PASSWORD } });
  const { access_token: otherToken } = (await otherLogin.json()) as { access_token: string };
  const forbiddenGet = await page.request.get(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${otherToken}` } });
  expect(forbiddenGet.status()).toBe(403);
  const forbiddenDelete = await page.request.delete(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${otherToken}` } });
  expect(forbiddenDelete.status()).toBe(403);

  // 7. The owner renames the project through the real UI.
  await projectRow.getByRole('button', { name: 'Rename' }).click();
  await projectRow.getByLabel('Title').fill('Climate Policy Rhetoric: A Survey');
  await projectRow.getByRole('button', { name: 'Save' }).click();
  await expect(projectRow).toContainText('Climate Policy Rhetoric: A Survey');
  await expect(projectRow).toContainText('APA');
  await demo.step('The user renames the project; the citation format stays APA');

  // 8. Deleting requires confirmation -- cancelling leaves the project intact.
  await projectRow.getByRole('button', { name: 'Delete' }).click();
  await expect(projectRow.getByText('Delete this project?')).toBeVisible();
  await projectRow.getByRole('button', { name: 'Cancel' }).click();
  await expect(projectRow).toBeVisible();

  await projectRow.getByRole('button', { name: 'Delete' }).click();
  await projectRow.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(projectRow).not.toBeVisible();
  await expect(page.getByText("You don't have any projects yet")).toBeVisible();
  await demo.step('Deleting requires confirmation; confirming removes the project and the empty state returns');
});
