const TOKEN_BYTES = 32;
const IV_BYTES = 12;
const AES_ALGO = 'AES-GCM';

// 256-bit random hex token -- well above docs/security.md's "128-bit class"
// floor for the share-link credential. Uses the Web Crypto API (native to
// the Workers runtime), not Node's `crypto` module.
export function generateShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return toHex(bytes);
}

// One-way digest of the raw token, used to look up a share link by the token
// a visitor presents. An attacker with raw DB read access (leaked replica/
// backup, over-scoped support access) recovers only this hash, never the
// token itself -- see docs/security.md's share-link threat note.
export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

// Reversible encryption of the raw token under a server-held Worker secret
// (SHARE_LINK_ENCRYPTION_KEY) that never touches the DB -- lets the owner-
// authenticated routes redisplay the same link on a repeat POST/GET (AC4)
// without the plaintext token living at rest. A raw DB read recovers only
// ciphertext; recovering the token additionally requires the Worker secret.
export async function encryptShareToken(token: string, secretHex: string): Promise<string> {
  const key = await importEncryptionKey(secretHex);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt({ name: AES_ALGO, iv }, key, new TextEncoder().encode(token));
  return `${toHex(iv)}:${toHex(new Uint8Array(ciphertext))}`;
}

export async function decryptShareToken(encrypted: string, secretHex: string): Promise<string> {
  const [ivHex, ciphertextHex] = encrypted.split(':');
  if (!ivHex || !ciphertextHex) throw new Error('decryptShareToken: malformed ciphertext');
  const key = await importEncryptionKey(secretHex);
  const plaintext = await crypto.subtle.decrypt({ name: AES_ALGO, iv: fromHex(ivHex) }, key, fromHex(ciphertextHex));
  return new TextDecoder().decode(plaintext);
}

async function importEncryptionKey(secretHex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromHex(secretHex), AES_ALGO, false, ['encrypt', 'decrypt']);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
