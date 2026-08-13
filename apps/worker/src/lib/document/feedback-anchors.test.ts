import { describe, expect, it } from 'vitest';
import type { DocumentContent } from '@alvus-ai/shared';
import { extractPlainText, locateQuote } from './feedback-anchors';

function doc(content: unknown[]): DocumentContent {
  return { type: 'doc', content } as DocumentContent;
}

describe('extractPlainText', () => {
  it('renders a single paragraph as plain text with the text run at its ProseMirror position', () => {
    const content = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }]);
    const { text, segments } = extractPlainText(content);
    expect(text).toBe('Hello world');
    // doc -> paragraph open (pos 0 -> 1) -> text starts at pos 1
    expect(segments).toEqual([{ text: 'Hello world', plainStart: 0, pmStart: 1 }]);
  });

  it('separates paragraphs with a blank line in the plain text but keeps positions contiguous', () => {
    const content = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
    ]);
    const { text, segments } = extractPlainText(content);
    expect(text).toBe('First\n\nSecond');
    // First paragraph: open(1) + "First"(5) + close(1) = pos 0..7. Second paragraph starts at pos 7, text at pos 8.
    expect(segments).toEqual([
      { text: 'First', plainStart: 0, pmStart: 1 },
      { text: 'Second', plainStart: 7, pmStart: 8 },
    ]);
  });

  it('accounts for an atomic citation node consuming one position with no plain text', () => {
    const content = doc([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'A claim ' },
          { type: 'citation', attrs: { sourceId: 'src-1', text: '(Doe)' } },
          { type: 'text', text: ' continues.' },
        ],
      },
    ]);
    const { text, segments } = extractPlainText(content);
    expect(text).toBe('A claim  continues.');
    // "A claim " at pos 1 (len 8, ends at pos 9), citation atom at pos 9 (size 1), " continues." starts at pos 10
    expect(segments).toEqual([
      { text: 'A claim ', plainStart: 0, pmStart: 1 },
      { text: ' continues.', plainStart: 8, pmStart: 10 },
    ]);
  });

  it('accounts for an empty paragraph consuming open+close tokens, not a single atom position', () => {
    const content = doc([{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'Text' }] }]);
    const { segments } = extractPlainText(content);
    // Empty paragraph: pos 0 -> open(1) -> close(1) -> pos 2. Second paragraph opens at pos 2 -> text at pos 3.
    expect(segments).toEqual([{ text: 'Text', plainStart: 0, pmStart: 3 }]);
  });

  it('returns empty text and no segments for a document with no text', () => {
    const content = doc([{ type: 'paragraph' }]);
    const { text, segments } = extractPlainText(content);
    expect(text).toBe('');
    expect(segments).toEqual([]);
  });
});

describe('locateQuote', () => {
  it('locates a quote within a single text run', () => {
    const content = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'The quick brown fox' }] }]);
    const extracted = extractPlainText(content);
    expect(locateQuote(extracted, 'quick brown')).toEqual({ from: 5, to: 16 });
  });

  it('locates a quote in the second paragraph, offset by the first paragraph and separator', () => {
    const content = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second point' }] },
    ]);
    const extracted = extractPlainText(content);
    const anchor = locateQuote(extracted, 'Second');
    expect(anchor).toEqual({ from: 8, to: 14 });
  });

  it('returns null for a quote that does not appear verbatim', () => {
    const content = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'The quick brown fox' }] }]);
    const extracted = extractPlainText(content);
    expect(locateQuote(extracted, 'the slow fox')).toBeNull();
  });

  it('returns null for an empty or whitespace-only quote', () => {
    const content = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'Some text' }] }]);
    const extracted = extractPlainText(content);
    expect(locateQuote(extracted, '   ')).toBeNull();
  });

  it('locates a quote spanning two adjacent text runs (e.g. across a mark boundary)', () => {
    const content = doc([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'plain ' },
          { type: 'text', marks: [{ type: 'bold' }], text: 'bold text' },
        ],
      },
    ]);
    const extracted = extractPlainText(content);
    expect(extracted.text).toBe('plain bold text');
    expect(locateQuote(extracted, 'plain bold')).toEqual({ from: 1, to: 11 });
  });
});
