import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { users } from './users';

// See docs/data-model.md. `token` is mapped onto the `token_hash` column name
// inherited from that doc's schema sketch, but stores the raw high-entropy
// token rather than a digest -- AC4 ("generating a link twice returns the
// existing active link") requires the plaintext to be retrievable on repeat
// GET/POST calls, which a hash-only column can't support. Entropy (256-bit
// random) plus revocation plus the read-only, single-project blast radius
// (docs/security.md's threat note) is the actual defense here, not at-rest
// hashing.
export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    token: text('token_hash').notNull().unique(),
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
