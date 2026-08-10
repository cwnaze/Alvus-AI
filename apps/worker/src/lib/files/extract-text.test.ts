import { describe, expect, it } from 'vitest';
import fixtures from '../../../../../tests/fixtures/uploads/fixtures.base64.json';
import { EmptyExtractionError, extractTextFromFile, UnparseableFileError } from './extract-text';

// Statically imported (same pattern as lib/ai/fixtures.ts's litellm JSON
// import) rather than read from disk at test time -- the Workers runtime
// vitest-pool-workers tests against has no real filesystem to read from.
function bytesOf(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

describe('extractTextFromFile', () => {
  it('extracts text from a valid PDF', async () => {
    const text = await extractTextFromFile(bytesOf(fixtures.sample_pdf), 'application/pdf');
    expect(text.length).toBeGreaterThan(20);
    expect(text).toContain('Climate policy rhetoric');
  });

  it('extracts text from a valid TXT file', async () => {
    const text = await extractTextFromFile(bytesOf(fixtures.sample_txt), 'text/plain');
    expect(text).toContain('synthetic, public-domain sample source');
  });

  it('throws UnparseableFileError for a corrupted PDF', async () => {
    await expect(extractTextFromFile(bytesOf(fixtures.corrupt_pdf), 'application/pdf')).rejects.toBeInstanceOf(UnparseableFileError);
  });

  it('throws EmptyExtractionError for a scanned-image-only (no text layer) PDF', async () => {
    await expect(extractTextFromFile(bytesOf(fixtures.blank_pdf), 'application/pdf')).rejects.toBeInstanceOf(EmptyExtractionError);
  });

  it('throws EmptyExtractionError for an empty TXT file', async () => {
    await expect(extractTextFromFile(bytesOf(fixtures.empty_txt), 'text/plain')).rejects.toBeInstanceOf(EmptyExtractionError);
  });

  it('throws UnparseableFileError for a TXT file that is not valid UTF-8', async () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc, 0x00, 0x01, 0x02]);
    await expect(extractTextFromFile(bytes, 'text/plain')).rejects.toBeInstanceOf(UnparseableFileError);
  });
});
