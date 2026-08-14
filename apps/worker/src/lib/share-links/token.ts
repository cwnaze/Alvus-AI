const TOKEN_BYTES = 32;

// 256-bit random hex token -- well above docs/security.md's "128-bit class"
// floor for the share-link credential. Uses the Web Crypto API (native to
// the Workers runtime), not Node's `crypto` module.
export function generateShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
