import { describe, expect, it, vi } from 'vitest';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('./lib/db/client', () => ({
  createDb: () => ({ execute }),
}));

const { default: app } = await import('./index');

describe('GET /api/health', () => {
  it('returns 200 with a live DB round-trip when the database is reachable', async () => {
    execute.mockResolvedValueOnce(undefined);
    const res = await app.request('/api/health', undefined, { DATABASE_URL: 'unused' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok' });
  });

  it('returns 503 when the database is unreachable', async () => {
    execute.mockRejectedValueOnce(new Error('connection refused'));
    const res = await app.request('/api/health', undefined, { DATABASE_URL: 'unused' });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'error', db: 'error' });
  });
});
