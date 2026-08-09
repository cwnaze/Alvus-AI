import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

// See docs/data-model.md. `citationFormat` is set at creation and immutable
// thereafter (enforced at the route layer, not the DB) -- keeps in-text
// citation rendering and the bibliography consistent for the life of the paper.
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    citationFormat: text('citation_format', { enum: ['mla', 'apa', 'chicago'] }).notNull(),
    status: text('status', { enum: ['draft', 'in_progress', 'completed', 'archived'] })
      .notNull()
      .default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('projects_owner_id_idx').on(table.ownerId),
    index('projects_status_idx').on(table.status),
    index('projects_updated_at_idx').on(table.updatedAt),
  ],
);
