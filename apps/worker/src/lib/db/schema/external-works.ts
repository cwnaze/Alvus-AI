import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// See docs/data-model.md. Cross-project/cross-user cache of discovered
// bibliographic metadata, deduped by DOI (or `semantic_scholar_id` when a
// work has no DOI) so the same paper found by two different users' searches
// resolves to one row. Not sensitive -- public metadata, writes restricted to
// the service role (only ever written by `lib/sources`, never client input).
export const externalWorks = pgTable(
  'external_works',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doi: text('doi'),
    semanticScholarId: text('semantic_scholar_id'),
    title: text('title').notNull(),
    authors: jsonb('authors').notNull().default([]).$type<string[]>(),
    abstract: text('abstract'),
    publicationYear: integer('publication_year'),
    venue: text('venue'),
    externalIds: jsonb('external_ids'),
    oaStatus: text('oa_status', { enum: ['gold', 'green', 'hybrid', 'bronze', 'closed'] }),
    oaUrl: text('oa_url'),
    fullTextFetched: boolean('full_text_fetched').notNull().default(false),
    fullTextStoragePath: text('full_text_storage_path'),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('external_works_doi_idx').on(table.doi).where(sql`${table.doi} is not null`),
    uniqueIndex('external_works_semantic_scholar_id_idx')
      .on(table.semanticScholarId)
      .where(sql`${table.semanticScholarId} is not null`),
  ],
);
