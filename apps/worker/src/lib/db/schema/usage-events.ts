import { date, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { users } from './users';

// Append-only log backing tier limits and internal cost tracking (see
// docs/data-model.md). Limits are enforced by summing over a billing period at
// read time (lib/metering), not a mutable counter -- a row is only ever
// inserted, never updated. `billingPeriod` is the first-of-month UTC date the
// event counts toward, not `createdAt` itself, so the limit-check query never
// needs a date-range scan.
export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    actionType: text('action_type', { enum: ['source_analysis', 'feedback_pass'] }).notNull(),
    quantity: integer('quantity').notNull().default(1),
    tokenCostInput: integer('token_cost_input'),
    tokenCostOutput: integer('token_cost_output'),
    billingPeriod: date('billing_period', { mode: 'string' }).notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('usage_events_user_billing_period_action_idx').on(table.userId, table.billingPeriod, table.actionType),
    index('usage_events_created_at_idx').on(table.createdAt),
  ],
);
