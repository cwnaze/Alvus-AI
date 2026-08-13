import type { DocumentContent } from '@alvus-ai/shared';

// Same minimal recursive shape as lib/document/citations.ts -- just enough of
// TipTap/ProseMirror JSON to walk it.
type TiptapNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
};

type TextSegment = { text: string; plainStart: number; pmStart: number };

export type ExtractedText = { text: string; segments: TextSegment[] };

// Node types with no `content` array that are still true ProseMirror leaf
// atoms (nodeSize 1) -- as opposed to an empty *container* like `{ type:
// 'paragraph' }` (nodeSize 2, open+close tokens with nothing between). Keep in
// sync with any atom nodes TipTap extensions register (currently just the
// `citation` node -- apps/web/src/editor/citationExtension.ts).
const LEAF_ATOM_TYPES = new Set(['citation', 'hardBreak', 'horizontalRule', 'image']);

// Block types get a paragraph-break separator in the plain-text rendering so
// an LLM reading it sees real paragraph structure -- purely cosmetic, these
// characters are never part of the position mapping (see mapOffset).
const BLOCK_TYPES = new Set(['paragraph', 'heading', 'listItem', 'blockquote']);

// Walks the document computing each text run's ProseMirror position
// alongside a plain-text rendering. This is what lets an AI-returned verbatim
// quote (the model has no notion of ProseMirror positions) be mapped back to
// a `{from, to}` anchor via locateQuote below.
export function extractPlainText(content: DocumentContent): ExtractedText {
  const segments: TextSegment[] = [];
  const parts: string[] = [];
  let plainOffset = 0;
  // Deferred rather than pushed immediately -- a block boundary only becomes a
  // real "\n\n" in the output if more text follows, so a document that ends
  // with (or is made entirely of) empty paragraphs never gets a trailing
  // separator with nothing after it.
  let pendingSeparator = false;

  function pushText(text: string, pmStart: number) {
    if (!text) return;
    if (pendingSeparator) {
      parts.push('\n\n');
      plainOffset += 2;
      pendingSeparator = false;
    }
    segments.push({ text, plainStart: plainOffset, pmStart });
    parts.push(text);
    plainOffset += text.length;
  }

  function markParagraphBreak() {
    if (plainOffset === 0) return;
    pendingSeparator = true;
  }

  function walk(node: TiptapNode, pos: number, isRoot: boolean): number {
    if (node.type === 'text') {
      const text = node.text ?? '';
      pushText(text, pos);
      return pos + text.length;
    }

    const children = node.content ?? [];

    if (isRoot) {
      let childPos = pos;
      for (const child of children) childPos = walk(child, childPos, false);
      return childPos;
    }

    if (children.length === 0) {
      const size = LEAF_ATOM_TYPES.has(node.type ?? '') ? 1 : 2;
      return pos + size;
    }

    let childPos = pos + 1;
    for (const child of children) childPos = walk(child, childPos, false);
    if (BLOCK_TYPES.has(node.type ?? '')) markParagraphBreak();
    return childPos + 1;
  }

  walk(content as TiptapNode, 0, true);
  return { text: parts.join(''), segments };
}

function mapOffset(segments: TextSegment[], offset: number): number | null {
  for (const seg of segments) {
    const segEnd = seg.plainStart + seg.text.length;
    if (offset >= seg.plainStart && offset <= segEnd) {
      return seg.pmStart + (offset - seg.plainStart);
    }
  }
  return null;
}

// Finds the first occurrence of `quote` in the extracted plain text and maps
// it back to a ProseMirror `{from, to}` range. `quote` comes from the AI
// response, not the document itself, so a missing or non-verbatim match is
// expected sometimes -- callers should drop the comment rather than fail the
// whole pass (docs/data-model.md: anchors are a best-effort v1 feature, "not
// re-validated against later edits" is the same acceptable limitation).
export function locateQuote(extracted: ExtractedText, quote: string): { from: number; to: number } | null {
  const trimmed = quote.trim();
  if (!trimmed) return null;
  const index = extracted.text.indexOf(trimmed);
  if (index === -1) return null;
  const from = mapOffset(extracted.segments, index);
  const to = mapOffset(extracted.segments, index + trimmed.length);
  if (from === null || to === null || from >= to) return null;
  return { from, to };
}
