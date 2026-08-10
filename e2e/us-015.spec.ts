import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { test, expect } from './demo';

// Same repeatable-against-shared-dev-Supabase pattern as e2e/us-014.spec.ts:
// delete-then-recreate the demo account fresh every run.
const DEMO_EMAIL = 'us015-demo@example.test';
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

test('US-015: source discovery search', async ({ page, demo }) => {
  // 1. A dedicated demo account signs up and is approved by the admin (same
  // shortcut as e2e/us-014.spec.ts -- the approval UI itself is already
  // demo'd by US-011, this spec's screenshots focus on source discovery).
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
  await page.getByLabel('Title').fill('Climate Policy Rhetoric');
  await page.getByLabel('Citation format').selectOption('mla');
  await page.getByRole('button', { name: 'Create project' }).click();

  const demoLogin = await page.request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const { access_token: demoToken } = (await demoLogin.json()) as { access_token: string };
  const listRes = await page.request.get('/api/projects', { headers: { Authorization: `Bearer ${demoToken}` } });
  const { projects } = (await listRes.json()) as { projects: Array<{ id: string; title: string }> };
  const projectId = projects[0]?.id;
  if (!projectId) throw new Error('created project did not appear in the list');

  // 3. Opening the project lands on its source-discovery view.
  await page.getByRole('link', { name: 'Climate Policy Rhetoric' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}`);
  await expect(page.getByRole('heading', { name: 'Climate Policy Rhetoric' })).toBeVisible();
  await demo.step('Opening a project shows its source-discovery view');

  // 4. Triggering a search returns candidate results with title, authors,
  // year, venue, and OA status (served from the deterministic fixture set --
  // no live call to Semantic Scholar/CrossRef/Unpaywall, see docs/testing.md).
  await page.getByRole('button', { name: 'Search for sources' }).click();
  await expect(page.getByText('Climate Policy Rhetoric in the 21st Century')).toBeVisible();
  await expect(page.getByText('Jane Doe, John Smith · 2020 · Journal of Environmental Communication')).toBeVisible();
  await expect(page.getByText('Open access (gold)')).toBeVisible();
  await expect(page.getByText('Rhetorical Strategies in Environmental Advocacy')).toBeVisible();
  await expect(page.getByText('Open access (green)')).toBeVisible();
  await expect(page.getByText('Discourse Analysis Methods in Policy Studies')).toBeVisible();
  await demo.step('Searching returns candidate sources with title, authors, year, venue, and OA status');

  // 5. A query with no matches shows a clear empty state offering the
  // manual-upload path instead of a blank screen.
  await page.getByLabel('Search query').fill('zzz-empty query');
  await page.getByRole('button', { name: 'Search for sources' }).click();
  await expect(page.getByText('No matching sources found')).toBeVisible();
  // The manual-upload path (US-017) is always available, not just here -- the
  // empty state's copy points at it rather than duplicating a second control.
  await expect(page.getByRole('heading', { name: 'Upload your own PDF or TXT' })).toBeVisible();
  await demo.step('An empty result set shows a clear empty state offering the manual-upload path');

  // 6. An upstream provider outage shows a clear error state, not a blank
  // screen or raw error.
  await page.getByLabel('Search query').fill('zzz-error query');
  await page.getByRole('button', { name: 'Search for sources' }).click();
  await expect(page.getByRole('alert')).toContainText("couldn't reach the source-search providers");
  await demo.step('An upstream provider outage shows a clear error state');

  // 7. A different approved user cannot search this project.
  const otherLogin = await page.request.post('/api/auth/login', { data: { email: OTHER_USER_EMAIL, password: FIXTURE_PASSWORD } });
  const { access_token: otherToken } = (await otherLogin.json()) as { access_token: string };
  const forbiddenSearch = await page.request.post(`/api/projects/${projectId}/sources/search`, {
    headers: { Authorization: `Bearer ${otherToken}` },
    data: {},
  });
  expect(forbiddenSearch.status()).toBe(403);
});
