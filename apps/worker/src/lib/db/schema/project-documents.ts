import { integer, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { projects } from './projects';

// See docs/data-model.md. 1:1 with `projects`, split out for write-frequency/
// payload-size -- `projectId` is the PK, not a surrogate id.
export const projectDocuments = pgTable('project_documents', {
  projectId: uuid('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  content: jsonb('content').notNull().default({}),
  contentVersion: integer('content_version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
