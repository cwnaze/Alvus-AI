import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { describe, expect, it, vi } from 'vitest';
import { CORRELATION_ID_HEADER, onError, type ErrorVariables } from './errors';

type ErrorEnvelope = { error: { code: string; message: string; correlationId: string } };

function buildApp() {
  const app = new Hono<{ Variables: ErrorVariables }>();
  app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
  app.onError(onError);
  app.get('/boom', () => {
    throw new Error('kaboom');
  });
  app.get('/boom-with-user', (c) => {
    c.set('userId', 'user-123');
    throw new Error('kaboom');
  });
  return app;
}

describe('global error handler', () => {
  it('returns the standard error envelope with a generated correlation ID, never a raw stack trace', async () => {
    const app = buildApp();
    const res = await app.request('/boom');

    expect(res.status).toBe(500);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.code).toBe('internal_error');
    expect(body.error.message).toBe('Internal server error');
    expect(typeof body.error.correlationId).toBe('string');
    expect(body.error.correlationId.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain('kaboom');
    expect(res.headers.get(CORRELATION_ID_HEADER)).toBe(body.error.correlationId);
  });

  it('propagates an incoming correlation ID instead of generating a new one', async () => {
    const app = buildApp();
    const res = await app.request('/boom', { headers: { [CORRELATION_ID_HEADER]: 'client-supplied-id' } });

    expect(res.headers.get(CORRELATION_ID_HEADER)).toBe('client-supplied-id');
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.correlationId).toBe('client-supplied-id');
  });

  it('logs route, correlation ID, and user ID (when authenticated) for debugging without reproduction', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = buildApp();
    await app.request('/boom-with-user', { headers: { [CORRELATION_ID_HEADER]: 'client-supplied-id' } });

    expect(consoleError).toHaveBeenCalledTimes(1);
    const call = consoleError.mock.calls[0];
    if (!call) throw new Error('expected console.error to have been called');
    const logged = JSON.parse(call[0] as string);
    expect(logged).toMatchObject({
      level: 'error',
      correlationId: 'client-supplied-id',
      method: 'GET',
      route: '/boom-with-user',
      userId: 'user-123',
      message: 'kaboom',
    });
    expect(typeof logged.stack).toBe('string');
    consoleError.mockRestore();
  });

  it('logs userId as null when the request is unauthenticated', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = buildApp();
    await app.request('/boom');

    const call = consoleError.mock.calls[0];
    if (!call) throw new Error('expected console.error to have been called');
    const logged = JSON.parse(call[0] as string);
    expect(logged.userId).toBeNull();
    consoleError.mockRestore();
  });
});
