import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { users } from './users';

// See docs/data-model.md. `tokenHash` is a one-way SHA-256 digest of the raw
// token, used to look up a link by the token a visitor presents -- a raw DB
// read recovers only this hash, never the token. `tokenEncrypted` is a
// separate, reversible AES-GCM encryption of the same raw token under a
// server-held Worker secret (SHARE_LINK_ENCRYPTION_KEY, never stored in the
// DB), which is what AC4 ("generating a link twice returns the existing
// active link") actually needs: the app can recover the plaintext to
// redisplay it, but a raw DB read alone cannot. See lib/share-links/token.ts.
export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    tokenEncrypted: text('token_encrypted').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    accessCount: integer('access_count').notNull().default(0),
  },
  (table) => [index('share_links_project_id_idx').on(table.projectId)],
);
