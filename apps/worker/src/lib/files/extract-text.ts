import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';

export type UploadMimeType = 'application/pdf' | 'text/plain';

// Thrown when the file's bytes can't be parsed as the claimed type at all
// (corrupted/truncated PDF, garbage bytes) -- distinct from a parse that
// succeeds but yields no usable text.
export class UnparseableFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnparseableFileError';
  }
}

// Thrown when parsing succeeds but produces no meaningful text -- the
// scanned-image-only-PDF case (docs/security.md: "detect near-empty
// extraction, surface ... instead of an empty-content AI call").
export class EmptyExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyExtractionError';
  }
}

// Below this, treat extraction as "no usable text" rather than analyze
// whatever scraps came out (e.g. page numbers/headers from a scanned PDF's
// thin OCR-less text layer).
const MIN_EXTRACTED_CHARS = 20;

// Untrusted-input-facing parser (docs/security.md's "historic RCE/DoS in PDF
// libs" note) -- bound worst-case parse time so a pathological PDF can't hang
// the request indefinitely.
const PARSE_TIMEOUT_MS = 15_000;

// ...and cap the text handed downstream to the AI prompt, independent of how
// much a (still legitimate) PDF's raw text runs to -- keeps a full-length
// paper within a reasonable prompt/context budget for the LiteLLM model.
const MAX_EXTRACTED_CHARS = 50_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new UnparseableFileError(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  let text: string;
  try {
    // pdf.js takes ownership of the input buffer and may transfer/detach it
    // for performance -- copy first so the caller's own bytes (still needed
    // for a checksum and the Storage upload) are never silently zeroed out.
    const pdf = await withTimeout(getDocumentProxy(bytes.slice()), PARSE_TIMEOUT_MS, 'This PDF took too long to parse');
    const result = await withTimeout(extractPdfText(pdf, { mergePages: true }), PARSE_TIMEOUT_MS, 'This PDF took too long to parse');
    text = result.text.trim();
  } catch (err) {
    if (err instanceof UnparseableFileError) throw err;
    throw new UnparseableFileError(err instanceof Error ? err.message : 'This PDF could not be parsed');
  }
  return text;
}

function extractTxt(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes).trim();
  } catch {
    throw new UnparseableFileError('This file is not valid UTF-8 text');
  }
  return text;
}

// Returns extracted, trimmed, size-capped text -- throws `UnparseableFileError`
// for bytes that can't be parsed as the claimed type at all, or
// `EmptyExtractionError` for a file that parses but has no usable text
// (a scanned-image-only PDF, or a blank/whitespace-only TXT file).
export async function extractTextFromFile(bytes: Uint8Array, mimeType: UploadMimeType): Promise<string> {
  const text = mimeType === 'application/pdf' ? await extractPdf(bytes) : extractTxt(bytes);
  if (text.length < MIN_EXTRACTED_CHARS) {
    throw new EmptyExtractionError(
      mimeType === 'application/pdf'
        ? 'This PDF has no extractable text -- scanned-image-only PDFs are not supported yet'
        : 'This file has no text content',
    );
  }
  return text.length > MAX_EXTRACTED_CHARS ? text.slice(0, MAX_EXTRACTED_CHARS) : text;
}
