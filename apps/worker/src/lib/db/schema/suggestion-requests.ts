import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

// Append-only log backing the editor's paragraph/structure-suggestion rate
// limit (docs/api.md: "not separately metered" but still "rate-limited, not
// counted against tier usage limits" per docs/tdd.md Flow 2 step 3) -- same
// sum-at-read-time shape as usage_events, kept as its own table since a
// suggestion request has no tier/billing-period concept and must never be
// confused with a metered action.
export const suggestionRequests = pgTable(
  'suggestion_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('suggestion_requests_user_created_at_idx').on(table.userId, table.createdAt)],
);
