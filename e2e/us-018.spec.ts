import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { test, expect } from './demo';

// Same repeatable-against-shared-dev-Supabase pattern as e2e/us-014.spec.ts:
// delete-then-recreate the demo account fresh every run.
const DEMO_EMAIL = 'us018-demo@example.test';
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

test('US-018: load, edit, and autosave a document in the editor', async ({ page, demo }) => {
  // 1. A dedicated demo account signs up and is approved by the admin (same
  // shortcut as e2e/us-014.spec.ts -- the approval UI itself is already
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
  await page.getByLabel('Title').fill('The Rhetoric of Climate Policy');
  await page.getByLabel('Citation format').selectOption('apa');
  await page.getByRole('button', { name: 'Create project' }).click();

  const demoLogin = await page.request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const { access_token: demoToken } = (await demoLogin.json()) as { access_token: string };
  const projectsRes = await page.request.get('/api/projects', { headers: { Authorization: `Bearer ${demoToken}` } });
  const { projects } = (await projectsRes.json()) as { projects: Array<{ id: string; title: string }> };
  const projectId = projects[0]?.id;
  if (!projectId) throw new Error('created project did not appear in the list');

  // 3. Opening the project offers a way into the writing view, which loads a
  // brand-new (empty) document into the editor.
  await page.getByRole('link', { name: 'The Rhetoric of Climate Policy' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}`);
  await page.getByRole('link', { name: 'Start writing' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}/write`);

  const editor = page.getByTestId('document-editor');
  await expect(editor).toBeVisible();
  const saveStatus = page.getByTestId('save-status');
  await demo.step('Opening a project loads an empty document into the rich text editor');

  // A save is a debounced PUT, so waiting on the visible status text alone is
  // unreliable once a prior save has already left it reading "Saved" --
  // nothing would change to re-trigger that assertion. Anchor each wait to
  // the actual autosave request/response instead (state, not a fixed sleep).
  function waitForAutosave() {
    return page.waitForResponse(
      (res) => res.request().method() === 'PUT' && new URL(res.url()).pathname === `/api/projects/${projectId}/document`,
    );
  }

  // 4. Typing into the editor triggers a debounced autosave -- no explicit
  // save action required.
  const firstSave = waitForAutosave();
  await editor.click();
  await page.keyboard.type('Climate policy rhetoric has shifted markedly over the last decade.');
  await firstSave;
  await expect(saveStatus).toHaveText('Saved');
  await demo.step('Typing in the editor triggers an autosave with no explicit save action');

  // 5. Formatting (bold) applies through the toolbar, proving this is a rich
  // text editor, not a plain textarea -- and the change autosaves too. Every
  // keystroke and the bold toggle itself reschedule the same debounce timer,
  // so this whole burst collapses into exactly one further save.
  const secondSave = waitForAutosave();
  await page.keyboard.press('Enter');
  await page.keyboard.type('This sentence will be bold.');
  await page.keyboard.press('Home');
  await page.keyboard.down('Shift');
  for (let i = 0; i < 'This sentence will be bold.'.length; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('This sentence will be bold.');
  await secondSave;
  await expect(saveStatus).toHaveText('Saved');
  await demo.step('Formatting text as bold through the toolbar autosaves the change');

  // 6. Navigating away immediately after an edit -- before the 800ms debounce
  // fires -- must still flush the pending save. Otherwise the edit is silently
  // discarded, directly contradicting "so I never lose work" (this story's own
  // premise). No waitForAutosave() here: the point is that no debounce timer
  // ever fires on its own, so the assertion instead waits on the flush PUT that
  // navigating away must trigger directly.
  const flushSave = waitForAutosave();
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('Navigating away should not lose this.');
  await page.keyboard.press('Enter');
  await page.getByRole('link', { name: 'Sources & bibliography' }).click();
  await flushSave;
  await expect(page).toHaveURL(`/projects/${projectId}`);
  await page.getByRole('link', { name: 'Start writing' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}/write`);
  await expect(page.getByTestId('document-editor')).toContainText('Navigating away should not lose this.');
  await demo.step('Navigating away right after an edit still flushes the pending autosave');

  // 7. The autosaved content round-trips through the API exactly.
  const docRes = await page.request.get(`/api/projects/${projectId}/document`, {
    headers: { Authorization: `Bearer ${demoToken}` },
  });
  expect(docRes.status()).toBe(200);
  const savedDoc = (await docRes.json()) as { content: unknown; updated_at: string };
  expect(JSON.stringify(savedDoc.content)).toContain('Climate policy rhetoric has shifted markedly over the last decade.');
  expect(JSON.stringify(savedDoc.content)).toContain('This sentence will be bold.');
  expect(JSON.stringify(savedDoc.content)).toContain('Navigating away should not lose this.');

  // 8. Reloading the page loads the persisted document back into the editor
  // -- the edits actually survived, not just an in-memory autosave flag.
  await page.reload();
  await expect(page.getByTestId('document-editor')).toContainText('Climate policy rhetoric has shifted markedly over the last decade.');
  await expect(page.getByTestId('document-editor').locator('strong')).toHaveText('This sentence will be bold.');
  await demo.step('Reloading the page loads the autosaved document back into the editor');

  // 9. A different approved user cannot read or write this project's document.
  const otherLogin = await page.request.post('/api/auth/login', { data: { email: OTHER_USER_EMAIL, password: FIXTURE_PASSWORD } });
  const { access_token: otherToken } = (await otherLogin.json()) as { access_token: string };
  const forbiddenGet = await page.request.get(`/api/projects/${projectId}/document`, { headers: { Authorization: `Bearer ${otherToken}` } });
  expect(forbiddenGet.status()).toBe(403);
  const forbiddenPut = await page.request.put(`/api/projects/${projectId}/document`, {
    headers: { Authorization: `Bearer ${otherToken}` },
    data: { content: { type: 'doc', content: [] } },
  });
  expect(forbiddenPut.status()).toBe(403);
});
