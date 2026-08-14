import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CORRELATION_ID_HEADER, onError } from '../middleware/errors';
import type { AuthBindings, AuthVariables } from '../middleware/auth';

type ErrorEnvelope = { error: { code: string; message: string; correlationId: string } };

const {
  getUser,
  getUserById,
  getProjectById,
  getActiveShareLinkByProject,
  createShareLink,
  revokeShareLink,
  generateShareToken,
  hashShareToken,
  encryptShareToken,
  decryptShareToken,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserById: vi.fn(),
  getProjectById: vi.fn(),
  getActiveShareLinkByProject: vi.fn(),
  createShareLink: vi.fn(),
  revokeShareLink: vi.fn(),
  generateShareToken: vi.fn(),
  hashShareToken: vi.fn(),
  encryptShareToken: vi.fn(),
  decryptShareToken: vi.fn(),
}));

vi.mock('../lib/supabase/client', () => ({
  createSupabaseAdmin: () => ({ auth: { getUser } }),
}));
vi.mock('../lib/db/client', () => ({ createDb: () => ({}) }));
vi.mock('../lib/db/queries/waitlist', () => ({ getUserById }));
vi.mock('../lib/db/queries/projects', () => ({ getProjectById }));
vi.mock('../lib/db/queries/share-links', () => ({ getActiveShareLinkByProject, createShareLink, revokeShareLink }));
vi.mock('../lib/share-links/token', () => ({ generateShareToken, hashShareToken, encryptShareToken, decryptShareToken }));

const { default: shareLinkRoutes } = await import('./share-links');

const app = new Hono<{ Bindings: AuthBindings & { SHARE_LINK_ENCRYPTION_KEY: string }; Variables: AuthVariables }>();
app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
app.onError(onError);
app.route('/:projectId', shareLinkRoutes);

const ENV = {
  DATABASE_URL: 'unused',
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SECRET_KEY: 'secret',
  PUBLIC_APP_URL: 'http://localhost:8787',
  SHARE_LINK_ENCRYPTION_KEY: 'test-key',
};
const OWNER_ID = 'owner-1';
const OTHER_USER_ID = 'other-1';
const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const LINK_ID = '22222222-2222-2222-2222-222222222222';

function callerRow(overrides: Partial<{ id: string; status: string; role: string }> = {}) {
  return {
    id: overrides.id ?? OWNER_ID,
    email: 'owner@example.test',
    status: overrides.status ?? 'approved',
    role: overrides.role ?? 'member',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function asCaller(overrides?: Parameters<typeof callerRow>[0]) {
  getUser.mockResolvedValueOnce({ data: { user: { id: overrides?.id ?? OWNER_ID } }, error: null });
  getUserById.mockResolvedValueOnce(callerRow(overrides));
}

function request(path: string, init?: RequestInit) {
  return app.request(path, { ...init, headers: { Authorization: 'Bearer tok', ...init?.headers } }, ENV);
}

function projectRow(overrides: Partial<{ id: string; ownerId: string }> = {}) {
  return {
    id: overrides.id ?? PROJECT_ID,
    ownerId: overrides.ownerId ?? OWNER_ID,
    title: 'My Paper',
    citationFormat: 'mla',
    status: 'draft',
    createdAt: new Date('2026-01-02T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };
}

function linkRow(overrides: Partial<{ id: string; projectId: string; tokenHash: string; tokenEncrypted: string }> = {}) {
  return {
    id: overrides.id ?? LINK_ID,
    projectId: overrides.projectId ?? PROJECT_ID,
    tokenHash: overrides.tokenHash ?? 'hash-a',
    tokenEncrypted: overrides.tokenEncrypted ?? 'encrypted-a',
    createdBy: OWNER_ID,
    createdAt: new Date('2026-01-03T00:00:00Z'),
    expiresAt: null,
    revokedAt: null,
    lastAccessedAt: null,
    accessCount: 0,
  };
}

describe('POST /:projectId/', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a new share link when none is active', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getActiveShareLinkByProject.mockResolvedValueOnce(undefined);
    generateShareToken.mockReturnValueOnce('b'.repeat(64));
    hashShareToken.mockResolvedValueOnce('hash-b');
    encryptShareToken.mockResolvedValueOnce('encrypted-b');
    createShareLink.mockResolvedValueOnce(linkRow({ tokenHash: 'hash-b', tokenEncrypted: 'encrypted-b' }));

    const res = await request(`/${PROJECT_ID}`, { method: 'POST', body: '{}' });

    expect(res.status).toBe(201);
    expect(createShareLink).toHaveBeenCalledWith(expect.anything(), {
      projectId: PROJECT_ID,
      createdBy: OWNER_ID,
      tokenHash: 'hash-b',
      tokenEncrypted: 'encrypted-b',
    });
    expect(decryptShareToken).not.toHaveBeenCalled();
    const body = (await res.json()) as { token: string; url: string };
    expect(body.token).toBe('b'.repeat(64));
    expect(body.url).toBe(`http://localhost:8787/shared/${'b'.repeat(64)}`);
  });

  it('returns the existing active link instead of creating a second one (idempotent)', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getActiveShareLinkByProject.mockResolvedValueOnce(linkRow({ tokenEncrypted: 'encrypted-c' }));
    decryptShareToken.mockResolvedValueOnce('c'.repeat(64));

    const res = await request(`/${PROJECT_ID}`, { method: 'POST', body: '{}' });

    expect(res.status).toBe(200);
    expect(createShareLink).not.toHaveBeenCalled();
    expect(decryptShareToken).toHaveBeenCalledWith('encrypted-c', 'test-key');
    const body = (await res.json()) as { token: string; url: string };
    expect(body.token).toBe('c'.repeat(64));
  });

  it('403s a non-owner', async () => {
    asCaller({ id: OTHER_USER_ID });
    getProjectById.mockResolvedValueOnce(projectRow({ ownerId: OWNER_ID }));

    const res = await request(`/${PROJECT_ID}`, { method: 'POST', body: '{}' });

    expect(res.status).toBe(403);
  });

  it('404s a nonexistent project', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(undefined);

    const res = await request(`/${PROJECT_ID}`, { method: 'POST', body: '{}' });

    expect(res.status).toBe(404);
  });
});

describe('GET /:projectId/', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the active link', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getActiveShareLinkByProject.mockResolvedValueOnce(linkRow({ tokenEncrypted: 'encrypted-a' }));
    decryptShareToken.mockResolvedValueOnce('a'.repeat(64));

    const res = await request(`/${PROJECT_ID}`);

    expect(res.status).toBe(200);
    expect(decryptShareToken).toHaveBeenCalledWith('encrypted-a', 'test-key');
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe('a'.repeat(64));
  });

  it('404s when no active link exists', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getActiveShareLinkByProject.mockResolvedValueOnce(undefined);

    const res = await request(`/${PROJECT_ID}`);

    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('no_active_link');
  });

  it('403s a non-owner', async () => {
    asCaller({ id: OTHER_USER_ID });
    getProjectById.mockResolvedValueOnce(projectRow({ ownerId: OWNER_ID }));

    const res = await request(`/${PROJECT_ID}`);

    expect(res.status).toBe(403);
  });
});

describe('DELETE /:projectId/', () => {
  beforeEach(() => vi.clearAllMocks());

  it('revokes the active link', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getActiveShareLinkByProject.mockResolvedValueOnce(linkRow());

    const res = await request(`/${PROJECT_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(revokeShareLink).toHaveBeenCalledWith(expect.anything(), { id: LINK_ID });
  });

  it('404s when no active link exists', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getActiveShareLinkByProject.mockResolvedValueOnce(undefined);

    const res = await request(`/${PROJECT_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('no_active_link');
  });

  it('403s a non-owner', async () => {
    asCaller({ id: OTHER_USER_ID });
    getProjectById.mockResolvedValueOnce(projectRow({ ownerId: OWNER_ID }));

    const res = await request(`/${PROJECT_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(403);
  });
});

describe('auth gate', () => {
  it('401s an unauthenticated caller', async () => {
    const res = await app.request(`/${PROJECT_ID}`, undefined, ENV);
    expect(res.status).toBe(401);
  });
});
