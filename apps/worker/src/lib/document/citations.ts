import type { DocumentContent } from '@alvus-ai/shared';

// TipTap/ProseMirror JSON is a recursive `{ type, attrs?, content?, text? }`
// tree -- this is the minimal shape needed to walk it looking for citation
// nodes, not a full ProseMirror schema.
type TiptapNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
};

function walk(node: TiptapNode, visit: (n: TiptapNode) => void): void {
  visit(node);
  if (Array.isArray(node.content)) {
    for (const child of node.content) walk(child, visit);
  }
}

// A doc is "empty" if it has no non-whitespace text and no citation --
// mirrors project_documents' default `{}`/an editor's default blank paragraph,
// which both round-trip to no real content.
export function isEmptyDocument(content: DocumentContent): boolean {
  let hasContent = false;
  walk(content as TiptapNode, (n) => {
    if (n.type === 'citation') hasContent = true;
    if (n.type === 'text' && typeof n.text === 'string' && n.text.trim() !== '') hasContent = true;
  });
  return !hasContent;
}

export type CitationLookup = (sourceId: string) => { text: string } | undefined;

// Re-renders every `citation` node's displayed text against the current
// bibliography and flags ones whose source is no longer `selected` --
// deleted, deselected, or rejected since the citation was inserted
// (docs/data-model.md: "in-text citation nodes reference project_sources.id").
// Returns a deep-rebuilt copy; the input is never mutated.
export function rerenderCitations(
  content: DocumentContent,
  lookup: CitationLookup,
): { content: DocumentContent; danglingSourceIds: string[] } {
  const dangling = new Set<string>();

  function transform(node: TiptapNode): TiptapNode {
    if (node.type === 'citation' && typeof node.attrs?.sourceId === 'string') {
      const sourceId = node.attrs.sourceId;
      const current = lookup(sourceId);
      if (!current) {
        dangling.add(sourceId);
        return { ...node, attrs: { ...node.attrs, dangling: true } };
      }
      return { ...node, attrs: { ...node.attrs, text: current.text, dangling: false } };
    }
    if (Array.isArray(node.content)) {
      return { ...node, content: node.content.map(transform) };
    }
    return node;
  }

  const rerendered = transform(content as TiptapNode) as DocumentContent;
  return { content: rerendered, danglingSourceIds: [...dangling] };
}
