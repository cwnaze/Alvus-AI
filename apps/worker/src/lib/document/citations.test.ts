import { describe, expect, it } from 'vitest';
import { isEmptyDocument, rerenderCitations } from './citations';

describe('isEmptyDocument', () => {
  it('treats a doc with no content as empty', () => {
    expect(isEmptyDocument({})).toBe(true);
    expect(isEmptyDocument({ type: 'doc', content: [] })).toBe(true);
  });

  it('treats a doc with only a blank paragraph as empty', () => {
    expect(isEmptyDocument({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
    expect(isEmptyDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }] })).toBe(true);
  });

  it('treats a doc with real text as non-empty', () => {
    expect(
      isEmptyDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] }),
    ).toBe(false);
  });

  it('treats a doc containing only a citation node as non-empty', () => {
    expect(
      isEmptyDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'citation', attrs: { sourceId: 's1' } }] }] }),
    ).toBe(false);
  });
});

type NodeLike = { type?: string; attrs?: Record<string, unknown>; content?: NodeLike[]; text?: string };

describe('rerenderCitations', () => {
  function doc(...nodes: unknown[]) {
    return { type: 'doc', content: [{ type: 'paragraph', content: nodes }] };
  }

  it('refreshes text for a citation whose source is still selected', () => {
    const content = doc({ type: 'text', text: 'a claim ' }, { type: 'citation', attrs: { sourceId: 's1', text: '(Stale)', dangling: false } });
    const { content: result, danglingSourceIds } = rerenderCitations(content, (id) => (id === 's1' ? { text: '(Doe, 2020)' } : undefined));

    expect(danglingSourceIds).toEqual([]);
    const citationNode = (result as NodeLike).content![0]!.content![1]!;
    expect(citationNode.attrs!.text).toBe('(Doe, 2020)');
    expect(citationNode.attrs!.dangling).toBe(false);
  });

  it('flags a citation whose source is no longer in the bibliography', () => {
    const content = doc({ type: 'citation', attrs: { sourceId: 'gone', text: '(Doe, 2020)', dangling: false } });
    const { content: result, danglingSourceIds } = rerenderCitations(content, () => undefined);

    expect(danglingSourceIds).toEqual(['gone']);
    const citationNode = (result as NodeLike).content![0]!.content![0]!;
    expect(citationNode.attrs!.dangling).toBe(true);
    // The last-known text is preserved so the flagged citation is still legible in place.
    expect(citationNode.attrs!.text).toBe('(Doe, 2020)');
  });

  it('does not mutate the input content', () => {
    const content = doc({ type: 'citation', attrs: { sourceId: 's1', text: '(Stale)', dangling: false } });
    const before = JSON.stringify(content);
    rerenderCitations(content, () => ({ text: '(Doe, 2020)' }));
    expect(JSON.stringify(content)).toBe(before);
  });

  it('leaves non-citation nodes untouched', () => {
    const content = doc({ type: 'text', text: 'plain text' });
    const { content: result, danglingSourceIds } = rerenderCitations(content, () => undefined);
    expect(danglingSourceIds).toEqual([]);
    expect(result).toEqual(content);
  });
});
