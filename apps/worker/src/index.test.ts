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

describe('POST /api/billing/webhook', () => {
  // billingRoutes and billingWebhookRoutes are both mounted at '/api/billing' in
  // this real, composed app -- billing.ts's authenticate/requireApproved middleware
  // must not leak onto the webhook route just because they share that base path.
  // Regression coverage for a bug where a `billing.use('*', ...)` wildcard did
  // exactly that; billing-webhook.test.ts alone can't catch it since it mounts the
  // webhook router in isolation.
  it('is reachable without an Authorization header, rejected only by its own signature check', async () => {
    const res = await app.request('/api/billing/webhook', { method: 'POST', body: '{}' }, { DATABASE_URL: 'unused' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_signature');
  });
});
