import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { test, expect } from './demo';

// Same repeatable-against-shared-dev-Supabase pattern as e2e/us-015.spec.ts:
// delete-then-recreate the demo account fresh every run.
const DEMO_EMAIL = 'us016-demo@example.test';
const DEMO_PASSWORD = 'Fixture-Passw0rd!';
const FIXTURE_PASSWORD = 'Fixture-Passw0rd!';
const ADMIN_EMAIL = 'admin@example.test';
// Seeded by db/seed.ts with usage_events already at the free tier's
// source_analysis cap, so the limit demo doesn't need to burn 5 real
// analyses through the UI to get there (docs/testing.md).
const AT_LIMIT_EMAIL = 'free-tier-at-limit@example.test';

let supabaseAdmin: SupabaseClient;

function sourceRow(page: import('@playwright/test').Page, title: string) {
  return page.locator('li[data-testid^="source-"]').filter({ hasText: title });
}

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

test('US-016: analyze a candidate source and select or reject it', async ({ page, demo }) => {
  // 1. A dedicated demo account signs up and is approved by the admin (same
  // shortcut as e2e/us-015.spec.ts -- the approval UI itself is already
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
  await page.getByLabel('Title').fill('Rhetoric of Climate Policy');
  await page.getByLabel('Citation format').selectOption('mla');
  await page.getByRole('button', { name: 'Create project' }).click();

  const demoLogin = await page.request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const { access_token: demoToken } = (await demoLogin.json()) as { access_token: string };
  const listRes = await page.request.get('/api/projects', { headers: { Authorization: `Bearer ${demoToken}` } });
  const { projects } = (await listRes.json()) as { projects: Array<{ id: string; title: string }> };
  const projectId = projects[0]?.id;
  if (!projectId) throw new Error('created project did not appear in the list');

  await page.getByRole('link', { name: 'Rhetoric of Climate Policy' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}`);

  // 3. Search returns the deterministic fixture candidates (no live call to
  // Semantic Scholar/CrossRef/Unpaywall, see docs/testing.md).
  await page.getByRole('button', { name: 'Search for sources' }).click();
  await expect(page.getByText('Climate Policy Rhetoric in the 21st Century')).toBeVisible();
  await expect(page.getByText('Rhetorical Strategies in Environmental Advocacy')).toBeVisible();
  await expect(page.getByText('Discourse Analysis Methods in Policy Studies')).toBeVisible();
  await demo.step('Searching returns candidate sources ready for AI analysis');

  // 4. Analyzing an open-access candidate shows its AI-generated citation
  // fields, strengths/weaknesses summary, usefulness score, and key quotes.
  const climateRow = sourceRow(page, 'Climate Policy Rhetoric in the 21st Century');
  await climateRow.getByRole('button', { name: 'Analyze' }).click();
  await expect(climateRow.getByText('Strengths:')).toBeVisible();
  await expect(climateRow.getByText('Weaknesses:')).toBeVisible();
  await expect(climateRow.getByText(/Usefulness:/)).toBeVisible();
  await expect(climateRow.getByTestId('abstract-only-badge')).toHaveCount(0);
  await demo.step('Triggering AI analysis shows the generated citation, summary, usefulness score, and key quotes');

  // 5. A candidate with no accessible full text is analyzed from its
  // abstract and visibly flagged as abstract-only, not shown as an error.
  const discourseRow = sourceRow(page, 'Discourse Analysis Methods in Policy Studies');
  await discourseRow.getByRole('button', { name: 'Analyze' }).click();
  await expect(discourseRow.getByTestId('abstract-only-badge')).toBeVisible();
  await expect(discourseRow.getByRole('alert')).toHaveCount(0);
  await demo.step('A source lacking accessible full text is analyzed from its abstract and flagged as abstract-only');

  // 6. Selecting an analyzed source adds it to the project bibliography and
  // removes it from the candidate results.
  await climateRow.getByRole('button', { name: 'Add to bibliography' }).click();
  await expect(sourceRow(page, 'Climate Policy Rhetoric in the 21st Century')).toHaveCount(0);
  await expect(page.getByTestId(/^bibliography-/)).toContainText('Climate Policy Rhetoric in the 21st Century');
  await demo.step('Selecting an analyzed source adds it to the project bibliography');

  // 7. Selecting a candidate that was never analyzed must not silently drop
  // it -- it still needs a citation for the bibliography, computed from the
  // same source metadata `analyze` uses rather than left blank pending an AI
  // call that may never happen.
  const rhetoricalRow = sourceRow(page, 'Rhetorical Strategies in Environmental Advocacy');
  await expect(rhetoricalRow.getByText('Strengths:')).toHaveCount(0);
  await rhetoricalRow.getByRole('button', { name: 'Add to bibliography' }).click();
  await expect(sourceRow(page, 'Rhetorical Strategies in Environmental Advocacy')).toHaveCount(0);
  const rhetoricalEntry = page.getByTestId(/^bibliography-/).filter({ hasText: 'Rhetorical Strategies in Environmental Advocacy' });
  await expect(rhetoricalEntry).toBeVisible();
  await demo.step('Selecting a candidate adds it to the bibliography even without a prior analysis');

  // 8. Rejecting a candidate dismisses it from the results, and re-running
  // the same search never resurfaces it -- nor a source already selected
  // into the bibliography, which is equally decided, just the other way.
  await discourseRow.getByRole('button', { name: 'Reject' }).click();
  await expect(sourceRow(page, 'Discourse Analysis Methods in Policy Studies')).toHaveCount(0);

  await page.getByRole('button', { name: 'Search for sources' }).click();
  await expect(page.getByText('No matching sources found')).toBeVisible();
  await expect(sourceRow(page, 'Discourse Analysis Methods in Policy Studies')).toHaveCount(0);
  await expect(sourceRow(page, 'Rhetorical Strategies in Environmental Advocacy')).toHaveCount(0);
  await expect(sourceRow(page, 'Climate Policy Rhetoric in the 21st Century')).toHaveCount(0);
  await demo.step('Rejecting a candidate, or having already selected one, keeps it from reappearing on a later search');

  // 9. Deselecting a selected source removes it from the bibliography and
  // returns it to the candidate pool (state=candidate), rather than deleting
  // it -- "Rhetorical Strategies" staying selected shows this only affects
  // the one source being deselected.
  const climateEntry = page.getByTestId(/^bibliography-/).filter({ hasText: 'Climate Policy Rhetoric in the 21st Century' });
  await climateEntry.getByRole('button', { name: 'Remove from bibliography' }).click();
  await expect(climateEntry).toHaveCount(0);
  await expect(rhetoricalEntry).toBeVisible();
  const candidatesRes = await page.request.get(`/api/projects/${projectId}/sources?status=candidate`, {
    headers: { Authorization: `Bearer ${demoToken}` },
  });
  const { sources: candidateSources } = (await candidatesRes.json()) as { sources: Array<{ title: string; state: string }> };
  expect(candidateSources.some((s) => s.title === 'Climate Policy Rhetoric in the 21st Century' && s.state === 'candidate')).toBe(true);
  await demo.step('Deselecting a source removes it from the bibliography and returns it to the candidate pool');

  // 10. A different account whose tier quota is already exhausted gets a
  // clear limit-reached response instead of the analysis silently failing.
  // `free-tier-at-limit` is a shared seeded fixture account (db/seed.ts), not
  // recreated per run like the demo account above, so reuse its "At The
  // Limit" project across reruns instead of accumulating a new one each time.
  await page.evaluate(() => localStorage.clear());
  const atLimitLogin = await page.request.post('/api/auth/login', { data: { email: AT_LIMIT_EMAIL, password: FIXTURE_PASSWORD } });
  const { access_token: atLimitToken } = (await atLimitLogin.json()) as { access_token: string };
  const atLimitProjectsRes = await page.request.get('/api/projects', { headers: { Authorization: `Bearer ${atLimitToken}` } });
  const { projects: atLimitProjects } = (await atLimitProjectsRes.json()) as { projects: Array<{ id: string; title: string }> };
  let atLimitProjectId = atLimitProjects.find((p) => p.title === 'At The Limit')?.id;
  if (!atLimitProjectId) {
    const created = await page.request.post('/api/projects', {
      headers: { Authorization: `Bearer ${atLimitToken}` },
      data: { title: 'At The Limit', citation_format: 'apa' },
    });
    atLimitProjectId = ((await created.json()) as { id: string }).id;
  }

  await page.goto('/login');
  await page.getByLabel('Email').fill(AT_LIMIT_EMAIL);
  await page.getByLabel('Password').fill(FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  // Wait for the login to actually land (token persisted, dashboard rendered)
  // before navigating away -- otherwise `goto` can race the in-flight login
  // request and abort it mid-flight, landing on the project page unauthenticated.
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();
  await page.goto(`/projects/${atLimitProjectId}`);
  await expect(page.getByRole('heading', { name: 'At The Limit' })).toBeVisible();

  await page.getByRole('button', { name: 'Search for sources' }).click();
  await expect(page.getByText('Climate Policy Rhetoric in the 21st Century')).toBeVisible();
  await sourceRow(page, 'Climate Policy Rhetoric in the 21st Century')
    .getByRole('button', { name: 'Analyze' })
    .click();
  await expect(sourceRow(page, 'Climate Policy Rhetoric in the 21st Century').getByRole('alert')).toContainText(
    '5 source analyses',
  );
  await demo.step('Analysis is blocked with a clear limit-reached message once the tier quota is exhausted');
});
