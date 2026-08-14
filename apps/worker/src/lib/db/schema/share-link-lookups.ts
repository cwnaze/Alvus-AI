import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Append-only log backing the public share-link endpoint's rate limit
// (docs/security.md's "Share-link brute force/leak" threat note: "rate-limit
// lookups" alongside entropy and revocation) -- same sum-at-read-time shape
// as suggestion_requests, keyed by requester IP rather than user_id since
// this endpoint is deliberately unauthenticated.
export const shareLinkLookups = pgTable(
  'share_link_lookups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ipAddress: text('ip_address').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('share_link_lookups_ip_created_at_idx').on(table.ipAddress, table.createdAt)],
);
