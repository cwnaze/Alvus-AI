import { boolean, check, index, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { projects } from './projects';
import { externalWorks } from './external-works';
import { uploadedFiles } from './uploaded-files';

export type KeyQuoteJson = { quote: string; location: string; usage_suggestion: string };

// See docs/data-model.md.
export const projectSources = pgTable(
  'project_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    origin: text('origin', { enum: ['discovered', 'uploaded'] }).notNull(),
    externalWorkId: uuid('external_work_id').references(() => externalWorks.id),
    uploadedFileId: uuid('uploaded_file_id').references(() => uploadedFiles.id),
    state: text('state', { enum: ['candidate', 'selected', 'rejected'] })
      .notNull()
      .default('candidate'),
    citationString: text('citation_string'),
    strengthsSummary: text('strengths_summary'),
    weaknessesSummary: text('weaknesses_summary'),
    usefulnessScore: numeric('usefulness_score', { precision: 4, scale: 2 }),
    keyQuotes: jsonb('key_quotes').notNull().default([]).$type<KeyQuoteJson[]>(),
    fullTextAvailable: boolean('full_text_available').notNull().default(false),
    fullTextSource: text('full_text_source', { enum: ['open_access', 'uploaded', 'abstract_only'] }),
    analyzedAt: timestamp('analyzed_at', { withTimezone: true }),
    selectedAt: timestamp('selected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('project_sources_project_id_idx').on(table.projectId),
    index('project_sources_project_id_state_idx').on(table.projectId, table.state),
    index('project_sources_external_work_id_idx').on(table.externalWorkId),
    index('project_sources_uploaded_file_id_idx').on(table.uploadedFileId),
    check('project_sources_origin_external_work_id_check', sql`origin != 'discovered' or external_work_id is not null`),
    check('project_sources_origin_uploaded_file_id_check', sql`origin != 'uploaded' or uploaded_file_id is not null`),
  ],
);
