import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

// Admin-facing audit/queue record, not a pre-account gate — `users`/`auth.users` are
// created immediately at signup. `status` mirrors `users.status` (both written by the
// same admin approve/reject handler); `users.status` is what request middleware
// actually checks. See docs/data-model.md.
export const waitlistSignups = pgTable(
  'waitlist_signups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),
    requestedAt: timestamp('requested_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    notes: text('notes'),
  },
  (table) => [
    uniqueIndex('waitlist_signups_user_id_idx').on(table.userId),
    index('waitlist_signups_status_idx').on(table.status),
  ],
);
