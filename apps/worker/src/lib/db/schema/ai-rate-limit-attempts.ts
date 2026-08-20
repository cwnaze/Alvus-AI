import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

// Append-only log backing the AI-metered endpoints' (analyze, feedback) per-user
// rate limit (US-027) -- a burst guard layered *in addition to* the tier-quota
// check in lib/metering, same sum-at-read-time shape as suggestion_requests.
// `actionType` mirrors usage_events' discriminator so the two action types
// never share a window.
export const aiRateLimitAttempts = pgTable(
  'ai_rate_limit_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actionType: text('action_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ai_rate_limit_attempts_user_action_created_at_idx').on(table.userId, table.actionType, table.createdAt)],
);
