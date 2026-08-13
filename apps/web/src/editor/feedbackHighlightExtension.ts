import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { FeedbackCategory, FeedbackComment } from '@alvus-ai/shared';

const feedbackHighlightKey = new PluginKey('feedbackHighlight');

const CATEGORY_CLASS: Record<FeedbackCategory, string> = {
  wording: 'bg-amber-200/60 decoration-amber-500',
  phrasing: 'bg-sky-200/60 decoration-sky-500',
  grammar: 'bg-red-200/60 decoration-red-500',
  content: 'bg-violet-200/60 decoration-violet-500',
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    feedbackHighlight: {
      setFeedbackComments: (comments: FeedbackComment[]) => ReturnType;
    };
  }
  interface Storage {
    feedbackHighlight: { comments: FeedbackComment[] };
  }
}

// Renders feedback-pass comments as span highlights via ProseMirror
// Decorations, never as document content -- decorations are purely visual and
// never touch the TipTap JSON, so they can't trigger onUpdate/autosave or bump
// contentVersion (CLAUDE.md: "nothing is auto-applied to the document").
// Comments are handed in from React state (WritingPage) via the
// setFeedbackComments command rather than as a static option, since they
// arrive asynchronously after a feedback-pass request completes.
export const FeedbackHighlight = Extension.create({
  name: 'feedbackHighlight',

  addStorage() {
    return { comments: [] as FeedbackComment[] };
  },

  addCommands() {
    return {
      setFeedbackComments:
        (comments: FeedbackComment[]) =>
        ({ editor, tr, dispatch }) => {
          editor.storage.feedbackHighlight.comments = comments;
          tr.setMeta(feedbackHighlightKey, true);
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: feedbackHighlightKey,
        props: {
          decorations: (state) => {
            const comments = this.storage.comments;
            const docSize = state.doc.content.size;
            const decorations = comments
              .filter((c) => c.anchor.from >= 0 && c.anchor.to <= docSize && c.anchor.from < c.anchor.to)
              .map((c) =>
                Decoration.inline(c.anchor.from, c.anchor.to, {
                  class: `rounded underline decoration-2 ${CATEGORY_CLASS[c.category]}`,
                  'data-testid': `feedback-highlight-${c.id}`,
                }),
              );
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
