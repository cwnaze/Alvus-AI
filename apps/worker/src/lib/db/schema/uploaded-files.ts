import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { projects } from './projects';
import { users } from './users';

// See docs/data-model.md. `ownerId` is denormalized from `projects.owner_id`
// so an object-level RLS policy (still scaffolding-only -- see
// supabase/migrations/20260806060000_source_uploads_bucket.sql) can check it
// directly without a join.
export const uploadedFiles = pgTable(
  'uploaded_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storageBucket: text('storage_bucket').notNull().default('source-uploads'),
    storagePath: text('storage_path').notNull().unique(),
    originalFilename: text('original_filename').notNull(),
    // User-supplied display title (the `title?` field in docs/api.md's upload
    // request) -- not in docs/data-model.md's original field list, added here
    // because `project_sources`/`external_works` have nowhere else to hold a
    // title for an origin='uploaded' row. Null means "derive from
    // originalFilename" at read time.
    title: text('title'),
    mimeType: text('mime_type', { enum: ['application/pdf', 'text/plain'] }).notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    checksumSha256: text('checksum_sha256'),
    uploadStatus: text('upload_status', { enum: ['pending', 'processed', 'failed'] })
      .notNull()
      .default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('uploaded_files_project_id_idx').on(table.projectId),
    index('uploaded_files_owner_id_idx').on(table.ownerId),
    // Matches docs/api.md's "PDF/TXT ≤20MB" and docs/security.md's "Size cap ~20MB/file".
    check('uploaded_files_file_size_bytes_check', sql`${table.fileSizeBytes} > 0 and ${table.fileSizeBytes} <= 20000000`),
  ],
);
