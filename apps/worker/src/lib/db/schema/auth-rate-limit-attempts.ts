import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Append-only log backing the public auth endpoints' per-IP rate limit
// (US-027: signup/login/password-reset request must not let a script run
// faster than a human) -- same sum-at-read-time shape as share_link_lookups,
// keyed by requester IP since these endpoints are unauthenticated by
// definition. `endpoint` keeps each route's window independent so a burst of
// login attempts can't also lock the same IP out of signup.
export const authRateLimitAttempts = pgTable(
  'auth_rate_limit_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ipAddress: text('ip_address').notNull(),
    endpoint: text('endpoint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('auth_rate_limit_attempts_ip_endpoint_created_at_idx').on(table.ipAddress, table.endpoint, table.createdAt)],
);
