import { describe, expect, it, vi } from 'vitest';
import { CORRELATION_ID_HEADER } from './middleware/errors';

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

  it('carries a correlation ID on every response, propagated from the request header', async () => {
    execute.mockResolvedValueOnce(undefined);
    const res = await app.request(
      '/api/health',
      { headers: { [CORRELATION_ID_HEADER]: 'test-correlation-id' } },
      { DATABASE_URL: 'unused' },
    );
    expect(res.headers.get(CORRELATION_ID_HEADER)).toBe('test-correlation-id');
  });

  it('returns 503 and logs the cause when the database is unreachable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dbError = new Error('connection refused');
    execute.mockRejectedValueOnce(dbError);
    const res = await app.request('/api/health', undefined, { DATABASE_URL: 'unused' });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'error', db: 'error' });
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('/api/health'), dbError);
    consoleError.mockRestore();
  });
});
