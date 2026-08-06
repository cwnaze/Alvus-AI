import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authUsers } from './auth';

// 1:1 profile extension of `auth.users`. Created immediately at signup (same
// transaction as `auth.users` and `waitlist_signups`) — approval gates access,
// not account existence. See docs/data-model.md and docs/security.md.
export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    displayName: text('display_name'),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),
    role: text('role', { enum: ['member', 'admin'] })
      .notNull()
      .default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('users_role_idx').on(table.role)],
);
