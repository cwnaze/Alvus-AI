import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail } from '../db/lib/find-auth-user-id';
import { test, expect } from './demo';

// Same repeatable-against-shared-dev-Supabase pattern as e2e/us-016.spec.ts:
// delete-then-recreate the demo account fresh every run.
const DEMO_EMAIL = 'us017-demo@example.test';
const DEMO_PASSWORD = 'Fixture-Passw0rd!';
const FIXTURE_PASSWORD = 'Fixture-Passw0rd!';
const ADMIN_EMAIL = 'admin@example.test';

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/uploads');
const fixturePath = (name: string) => path.join(FIXTURES_DIR, name);

let supabaseAdmin: SupabaseClient;

function bibliographyEntry(page: import('@playwright/test').Page, title: string) {
  return page.getByTestId(/^bibliography-/).filter({ hasText: title });
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

test('US-017: upload your own PDF/TXT source', async ({ page, demo }) => {
  // 1. A dedicated demo account signs up and is approved by the admin (same
  // shortcut as e2e/us-016.spec.ts -- the approval UI itself is already
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
  await page.getByLabel('Title').fill('Uploaded Sources Paper');
  await page.getByLabel('Citation format').selectOption('mla');
  await page.getByRole('button', { name: 'Create project' }).click();

  const demoLogin = await page.request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const { access_token: demoToken } = (await demoLogin.json()) as { access_token: string };
  const projectsRes = await page.request.get('/api/projects', { headers: { Authorization: `Bearer ${demoToken}` } });
  const { projects } = (await projectsRes.json()) as { projects: Array<{ id: string; title: string }> };
  const projectId = projects[0]?.id;
  if (!projectId) throw new Error('created project did not appear in the list');

  await page.getByRole('link', { name: 'Uploaded Sources Paper' }).click();
  await expect(page).toHaveURL(`/projects/${projectId}`);

  // 3. Uploading a PDF within the size limit is analyzed automatically and
  // lands straight in the bibliography -- no separate "select" step, unlike
  // a discovered candidate.
  await page.getByLabel('Source file').setInputFiles(fixturePath('sample.pdf'));
  await page.getByLabel('Title (optional)').fill('Climate Policy Notes');
  await page.getByRole('button', { name: 'Upload source' }).click();
  await expect(bibliographyEntry(page, 'Climate Policy Notes')).toBeVisible();
  await demo.step('Uploading a PDF is analyzed automatically and added straight to the bibliography');

  // 4. A TXT upload works the same way, and with no title given falls back
  // to the file name.
  await page.getByLabel('Source file').setInputFiles(fixturePath('sample.txt'));
  await page.getByRole('button', { name: 'Upload source' }).click();
  await expect(bibliographyEntry(page, 'sample')).toBeVisible();
  await demo.step('A TXT upload with no title given falls back to the file name');

  // 5. An unsupported file type is rejected with a clear, specific error --
  // and nothing is added to the bibliography.
  await page.getByLabel('Source file').setInputFiles(fixturePath('unsupported.png'));
  await page.getByRole('button', { name: 'Upload source' }).click();
  await expect(page.getByRole('alert')).toContainText('Only PDF and TXT files are supported');
  await demo.step('An unsupported file type is rejected with a clear error');

  // 6. An oversized file is rejected before any analysis is attempted --
  // built in-memory, no fixture file needed for 20MB+ of content.
  await page.getByLabel('Source file').setInputFiles({
    name: 'oversized.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(20_000_001, 'a'),
  });
  await page.getByRole('button', { name: 'Upload source' }).click();
  await expect(page.getByRole('alert')).toContainText('20MB or smaller');
  await demo.step('An oversized file is rejected with a clear error');

  // 7. A corrupted/unparseable PDF fails gracefully with a clear error, not
  // a crash or a silent empty analysis.
  await page.getByLabel('Source file').setInputFiles(fixturePath('corrupt.pdf'));
  await page.getByRole('button', { name: 'Upload source' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await demo.step('A corrupted PDF fails gracefully with a clear error instead of crashing');

  // 8. A scanned-image-only PDF (no extractable text layer) is flagged as
  // such rather than analyzed on empty content.
  await page.getByLabel('Source file').setInputFiles(fixturePath('blank.pdf'));
  await page.getByRole('button', { name: 'Upload source' }).click();
  await expect(page.getByRole('alert')).toContainText('no extractable text');
  await demo.step('A scanned-image-only PDF is flagged as having no extractable text, not silently analyzed empty');

  // 9. None of the rejected uploads made it into the bibliography -- only
  // the two successful ones from steps 3-4.
  const entriesRes = await page.request.get(`/api/projects/${projectId}/bibliography`, {
    headers: { Authorization: `Bearer ${demoToken}` },
  });
  const { entries } = (await entriesRes.json()) as { entries: Array<{ citation_text: string }> };
  expect(entries).toHaveLength(2);
});
