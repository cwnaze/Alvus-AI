import { mergeAttributes, Node } from '@tiptap/core';

export type CitationAttrs = { sourceId: string; text: string; dangling?: boolean };

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    citation: {
      insertCitation: (attrs: CitationAttrs) => ReturnType;
    };
  }
}

// An in-text citation inserted from the bibliography (docs/data-model.md: "in-text
// citation nodes reference project_sources.id"). `text` is the already-formatted
// parenthetical string computed server-side (apps/worker/src/lib/citation) --
// this node just displays it and carries the sourceId re-render/dangling-detection
// need. Atom: the user edits it as a single unit, not as editable text.
export const Citation = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      sourceId: { default: null },
      text: { default: '' },
      dangling: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-citation]',
        getAttrs: (el) => {
          if (typeof el === 'string') return false;
          return {
            sourceId: el.getAttribute('data-source-id'),
            text: el.textContent ?? '',
            dangling: el.getAttribute('data-dangling') === 'true',
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const dangling = Boolean(node.attrs.dangling);
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-citation': '',
        'data-source-id': node.attrs.sourceId,
        'data-dangling': dangling ? 'true' : 'false',
        class: dangling
          ? 'rounded bg-red-100 px-1 text-red-700 underline decoration-wavy decoration-red-500'
          : 'rounded bg-brand/10 px-1 text-brand',
      }),
      String(node.attrs.text ?? ''),
    ];
  },

  addCommands() {
    return {
      insertCitation:
        (attrs: CitationAttrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { dangling: false, ...attrs } }),
    };
  },
});
