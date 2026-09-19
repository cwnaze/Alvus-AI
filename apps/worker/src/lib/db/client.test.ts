import { describe, expect, it, vi } from 'vitest';

const { postgres, drizzle } = vi.hoisted(() => ({ postgres: vi.fn(() => ({})), drizzle: vi.fn() }));

vi.mock('postgres', () => ({ default: postgres }));
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle }));

const { createDb } = await import('./client');

describe('createDb', () => {
  it('configures an explicit connect and statement timeout on the shared postgres client, matching fetch-with-retry.ts', () => {
    createDb('postgres://example');

    expect(postgres).toHaveBeenCalledWith(
      'postgres://example',
      expect.objectContaining({
        connect_timeout: expect.any(Number),
        connection: expect.objectContaining({ statement_timeout: expect.any(Number) }),
      }),
    );
  });

  it('keeps prepare: false, required for Supabase\'s pooled (pgbouncer transaction mode) connection string', () => {
    createDb('postgres://example');

    expect(postgres).toHaveBeenCalledWith('postgres://example', expect.objectContaining({ prepare: false }));
  });
});
