import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { test, expect } from './demo';

// Same repeatable-against-shared-dev-Supabase pattern as e2e/us-021.spec.ts:
// delete-then-recreate the demo account fresh every run.
const DEMO_EMAIL = 'us025-demo@example.test';
const DEMO_PASSWORD = 'Fixture-Passw0rd!';
const FIXTURE_PASSWORD = 'Fixture-Passw0rd!';
const ADMIN_EMAIL = 'admin@example.test';

const DRAFT_PARAGRAPH = 'This paper is shared read-only with a reviewer who never needs an account.';

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

test('US-025: read-only share link', async ({ page, demo }) => {
  // A longer round trip than most specs: signup/approve/login, project setup,
  // writing a draft, generating a link, then a visitor context and a revoked
  // context on top -- same reasoning as e2e/us-021.spec.ts's test.slow().
  test.slow();

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

  // 2. The demo account signs in, creates a project, and selects a source
  // into the bibliography -- so the shared view below has something to
  // actually show beyond an empty paper.
  await page.goto('/login');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText("You don't have any projects yet")).toBeVisible();

  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Title').fill('Share Link Demo Paper');
  await page.getByLabel('Citation format').selectOption('apa');
  await page.getByRole('button', { name: 'Create project' }).click();

  const demoLogin = await page.request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const { access_token: demoToken } = (await demoLogin.json()) as { access_token: string };
  const authHeaders = { Authorization: `Bearer ${demoToken}` };
  const projectsRes = await page.request.get('/api/projects', { headers: authHeaders });
  const { projects } = (await projectsRes.json()) as { projects: Array<{ id: string; title: string }> };
  const projectId = projects[0]?.id;
  if (!projectId) throw new Error('created project did not appear in the list');

  await page.getByRole('link', { name: 'Share Link Demo Paper' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}`);

  await page.getByRole('button', { name: 'Search for sources' }).click();
  const firstCandidate = page.locator('[data-testid^="source-"]').first();
  await expect(firstCandidate).toBeVisible();
  await firstCandidate.getByRole('button', { name: 'Add to bibliography' }).click();
  const bibliographyEntry = page.locator('[data-testid^="bibliography-"]').first();
  await expect(bibliographyEntry).toBeVisible();
  const citationText = (await bibliographyEntry.locator('span').first().textContent())?.trim();
  if (!citationText) throw new Error('bibliography entry has no citation text');
  await demo.step('The owner creates a project and selects a source into the bibliography');

  // 3. Writing a short draft and leaving the editor flushes the autosave, so
  // the shared view below reflects real, persisted document content.
  await page.getByRole('link', { name: 'Start writing' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}/write`);
  const editor = page.getByTestId('document-editor');
  await editor.click();
  await page.keyboard.type(DRAFT_PARAGRAPH);
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  await page.getByRole('link', { name: 'Sources & bibliography' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}`);
  await demo.step('The owner writes a short draft, which autosaves before navigating away');

  // 4. Generating a share link surfaces a working, copyable URL. Calling the
  // same endpoint again returns the *same* link rather than minting a
  // second one (AC: "generating a link twice returns the existing active
  // link").
  await page.getByTestId('generate-share-link').click();
  const shareUrlInput = page.getByTestId('share-link-url');
  await expect(shareUrlInput).toBeVisible();
  const shareUrl = await shareUrlInput.inputValue();
  if (!shareUrl) throw new Error('share link URL was not populated');
  await demo.step('The owner generates a read-only share link for the project');

  const secondCreate = await page.request.post(`/api/projects/${projectId}/share-link`, { headers: authHeaders, data: {} });
  const secondBody = (await secondCreate.json()) as { token: string };
  expect(secondBody.token).toBe(shareUrl.split('/shared/')[1]);

  const shareToken = new URL(shareUrl).pathname.replace(/^\/shared\//, '');

  // 5. Visiting the link with no session -- a separate browser context, with
  // no localStorage/cookies from the owner's session at all -- shows the
  // paper's title, bibliography, and content, read-only, with no editing
  // affordances. The owner's own page/session is left untouched, so revoking
  // below doesn't need a second login.
  const visitorContext = await page.context().browser()!.newContext();
  const visitorPage = await visitorContext.newPage();
  await visitorPage.goto(`/shared/${shareToken}`);
  await expect(visitorPage.getByTestId('document-preview')).toBeVisible();
  await expect(visitorPage.getByTestId('document-preview')).toContainText('Share Link Demo Paper');
  await expect(visitorPage.getByTestId('document-preview')).toContainText(citationText);
  await expect(visitorPage.getByTestId('document-preview')).toContainText(DRAFT_PARAGRAPH);
  await expect(visitorPage.getByTestId('document-editor')).toHaveCount(0);
  await expect(visitorPage.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
  await demo.step('A visitor with no account or login sees the shared paper read-only, with no editing controls', visitorPage);
  await visitorContext.close();

  // 6. Revoking the link (still the same owner session/page as step 4 --
  // no re-login needed), then revisiting it (or any unknown token) from a
  // fresh visitor context, shows a clear "no longer works" state -- not an
  // error page or a peek at the owner's other projects.
  await page.getByTestId('revoke-share-link').click();
  await expect(page.getByTestId('generate-share-link')).toBeVisible();
  await demo.step('The owner revokes the share link');

  const revokedContext = await page.context().browser()!.newContext();
  const revokedPage = await revokedContext.newPage();
  await revokedPage.goto(`/shared/${shareToken}`);
  await expect(revokedPage.getByTestId('share-link-invalid')).toContainText('This link no longer works.');

  await revokedPage.goto('/shared/this-token-was-never-issued');
  await expect(revokedPage.getByTestId('share-link-invalid')).toContainText('This link no longer works.');
  await demo.step(
    'Revoking the link (or visiting an unknown token) shows a clear "no longer works" state instead of an error or the owner\'s data',
    revokedPage,
  );
  await revokedContext.close();
});
