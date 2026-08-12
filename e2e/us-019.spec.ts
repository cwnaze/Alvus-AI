import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { test, expect } from './demo';

// Same repeatable-against-shared-dev-Supabase pattern as e2e/us-018.spec.ts:
// delete-then-recreate the demo account fresh every run.
const DEMO_EMAIL = 'us019-demo@example.test';
const DEMO_PASSWORD = 'Fixture-Passw0rd!';
const FIXTURE_PASSWORD = 'Fixture-Passw0rd!';
const ADMIN_EMAIL = 'admin@example.test';

const CLIMATE_SOURCE_TITLE = 'Climate Policy Rhetoric in the 21st Century';

let supabaseAdmin: SupabaseClient;

type ApiProject = { id: string; title: string };
type ApiCandidate = { id: string; title: string };
type ApiBibliographyEntry = { source_id: string; citation_text: string; in_text_citation: string };

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

test('US-019: citation-format rendering: in-text citations, full-document re-render, dangling-citation detection', async ({
  page,
  demo,
}) => {
  // This flow drives more round trips than most demos (search, select, two
  // autosaves, two full re-renders, plus a second fixture project for the
  // cross-format check below) -- give it real headroom instead of racing the
  // default per-test timeout.
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

  // 2. The demo account signs in and creates an APA project.
  await page.goto('/login');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText("You don't have any projects yet")).toBeVisible();

  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Title').fill('Citation Rendering Paper');
  await page.getByLabel('Citation format').selectOption('apa');
  await page.getByRole('button', { name: 'Create project' }).click();

  const demoLogin = await page.request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const { access_token: demoToken } = (await demoLogin.json()) as { access_token: string };
  const authHeaders = { Authorization: `Bearer ${demoToken}` };
  const projectsRes = await page.request.get('/api/projects', { headers: authHeaders });
  const { projects } = (await projectsRes.json()) as { projects: ApiProject[] };
  const projectId = projects[0]?.id;
  if (!projectId) throw new Error('created project did not appear in the list');

  // 3. Search returns the deterministic fixture candidates (no live call to
  // Semantic Scholar/CrossRef/Unpaywall, see docs/testing.md) and selecting
  // one adds it straight to the bibliography.
  await page.getByRole('link', { name: 'Citation Rendering Paper' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}`);
  await page.getByRole('button', { name: 'Search for sources' }).click();
  const climateRow = page.locator('li[data-testid^="source-"]').filter({ hasText: CLIMATE_SOURCE_TITLE });
  await expect(climateRow).toBeVisible();
  await climateRow.getByRole('button', { name: 'Add to bibliography' }).click();
  await expect(page.getByTestId(/^bibliography-/)).toContainText(CLIMATE_SOURCE_TITLE);

  // 4. Opening the writing view shows the bibliography sidebar with an
  // "Insert citation" action for the newly selected source.
  await page.getByRole('link', { name: 'Start writing' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}/write`);
  const editor = page.getByTestId('document-editor');
  await expect(editor).toBeVisible();

  function waitForAutosave() {
    return page.waitForResponse(
      (res) => res.request().method() === 'PUT' && new URL(res.url()).pathname === `/api/projects/${projectId}/document`,
    );
  }

  const firstSave = waitForAutosave();
  await editor.click();
  await page.keyboard.type('Recent scholarship shows a shift in rhetorical strategy ');
  await firstSave;
  await demo.step('The writing view shows the bibliography sidebar alongside the editor');

  // 5. Inserting a citation from the bibliography renders it correctly
  // formatted for the project's APA citation style ("(Doe & Smith, 2020)").
  const bibliographyRes = await page.request.get(`/api/projects/${projectId}/bibliography`, { headers: authHeaders });
  const { entries } = (await bibliographyRes.json()) as { entries: ApiBibliographyEntry[] };
  const climateEntry = entries.find((e) => e.citation_text.includes('Doe'));
  if (!climateEntry) throw new Error('bibliography entry for the selected source was not found');
  expect(climateEntry.in_text_citation).toBe('(Doe & Smith, 2020)');

  const insertSave = waitForAutosave();
  await page.getByTestId(`insert-citation-${climateEntry.source_id}`).click();
  await expect(editor).toContainText('(Doe & Smith, 2020)');
  await insertSave;
  await demo.step("Inserting a citation from the bibliography renders it correctly formatted for the project's APA style");

  // 6. Triggering a full re-render assembles the complete formatted paper --
  // margins, a citation-format-labeled header, and an APA "References" page.
  await page.getByRole('button', { name: 'Render full document' }).click();
  const preview = page.getByTestId('document-preview');
  await expect(preview).toBeVisible();
  await expect(page.getByTestId('bibliography-page-heading')).toHaveText('References');
  await expect(preview.getByTestId(`preview-bibliography-${climateEntry.source_id}`)).toContainText('Doe');
  await expect(page.getByTestId('dangling-citations-warning')).toHaveCount(0);
  await preview.scrollIntoViewIfNeeded();
  await demo.step('Triggering a full re-render assembles the complete formatted paper with headers, margins, and a bibliography page');

  // 7. Removing the cited source from the bibliography and re-rendering
  // flags the now-dangling in-text citation, rather than silently leaving it
  // formatted as if the source were still there.
  await page.getByRole('link', { name: 'Sources & bibliography' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}`);
  await page.getByRole('button', { name: 'Remove from bibliography' }).click();
  await expect(page.getByTestId(/^bibliography-/)).toHaveCount(0);

  await page.getByRole('link', { name: 'Start writing' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}/write`);
  await page.getByRole('button', { name: 'Render full document' }).click();
  await expect(page.getByTestId('dangling-citations-warning')).toBeVisible();
  await expect(editor.locator('[data-citation][data-dangling="true"]')).toBeVisible();
  await demo.step('A re-render flags the in-text citation whose source is no longer in the bibliography as dangling');

  // 8. The same source's citation is visually distinct across formats --
  // proven end-to-end via one more fixture project (MLA), not just
  // formatInTextCitation's own unit tests (which also cover Chicago).
  const mlaProjectRes = await page.request.post('/api/projects', {
    headers: authHeaders,
    data: { title: 'Check mla', citation_format: 'mla' },
  });
  const mlaProject = (await mlaProjectRes.json()) as ApiProject;
  const mlaSearchRes = await page.request.post(`/api/projects/${mlaProject.id}/sources/search`, {
    headers: authHeaders,
    data: { query: CLIMATE_SOURCE_TITLE },
  });
  const { candidates: mlaCandidates } = (await mlaSearchRes.json()) as { candidates: ApiCandidate[] };
  const mlaCandidate = mlaCandidates.find((c) => c.title === CLIMATE_SOURCE_TITLE);
  if (!mlaCandidate) throw new Error('no MLA candidate found for the climate source');
  await page.request.post(`/api/projects/${mlaProject.id}/sources/${mlaCandidate.id}/select`, { headers: authHeaders });
  const mlaBibRes = await page.request.get(`/api/projects/${mlaProject.id}/bibliography`, { headers: authHeaders });
  const { entries: mlaEntries } = (await mlaBibRes.json()) as { entries: ApiBibliographyEntry[] };
  const mlaInText = mlaEntries[0]?.in_text_citation;

  expect(mlaInText).toBe('(Doe and Smith)');
  expect(mlaInText).not.toBe(climateEntry.in_text_citation);
});
