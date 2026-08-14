import { describe, expect, it } from 'vitest';
import { decryptShareToken, encryptShareToken, generateShareToken, hashShareToken } from './token';

const SECRET_HEX = '1af1819ce0454b073a627c4690f7d71431d762225ada33a42989a0c64f304021';

describe('generateShareToken', () => {
  it('returns a 256-bit (64 hex char) random token', () => {
    const token = generateShareToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never repeats across calls', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateShareToken()));
    expect(tokens.size).toBe(20);
  });
});

describe('hashShareToken', () => {
  it('is deterministic for the same input', async () => {
    const token = generateShareToken();
    expect(await hashShareToken(token)).toBe(await hashShareToken(token));
  });

  it('produces different hashes for different tokens', async () => {
    expect(await hashShareToken(generateShareToken())).not.toBe(await hashShareToken(generateShareToken()));
  });

  it('never reproduces the raw token in its output', async () => {
    const token = generateShareToken();
    expect(await hashShareToken(token)).not.toContain(token);
  });
});

describe('encryptShareToken / decryptShareToken', () => {
  it('round-trips the raw token', async () => {
    const token = generateShareToken();
    const encrypted = await encryptShareToken(token, SECRET_HEX);
    expect(await decryptShareToken(encrypted, SECRET_HEX)).toBe(token);
  });

  it('produces ciphertext that never contains the raw token', async () => {
    const token = generateShareToken();
    const encrypted = await encryptShareToken(token, SECRET_HEX);
    expect(encrypted).not.toContain(token);
  });

  it('produces different ciphertext for the same token on repeat calls (random IV)', async () => {
    const token = generateShareToken();
    const first = await encryptShareToken(token, SECRET_HEX);
    const second = await encryptShareToken(token, SECRET_HEX);
    expect(first).not.toBe(second);
  });

  it('fails to decrypt with the wrong key', async () => {
    const token = generateShareToken();
    const encrypted = await encryptShareToken(token, SECRET_HEX);
    const wrongKey = '0'.repeat(64);
    await expect(decryptShareToken(encrypted, wrongKey)).rejects.toThrow();
  });
});
