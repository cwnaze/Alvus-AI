import { index, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { projects } from './projects';

export type FeedbackAnchorJson = { from: number; to: number };
export type FeedbackCommentJson = { id: string; anchor: FeedbackAnchorJson; category: string; text: string };

// See docs/data-model.md. One row per requested pass, not just the latest --
// `comments` is a JSONB array on the row itself (mirrors project_sources'
// key_quotes JSONB pattern) rather than a child table, since a pass's
// comments are never queried independently of their pass.
export const feedbackPasses = pgTable(
  'feedback_passes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    comments: jsonb('comments').notNull().default([]).$type<FeedbackCommentJson[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('feedback_passes_project_id_created_at_idx').on(table.projectId, table.createdAt)],
);
