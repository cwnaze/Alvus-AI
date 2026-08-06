import { integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

// Config table, seeded not migrated with app data (see US-003). Composite PK matches
// docs/data-model.md's `(tier, action_type)`; `monthly_limit: null` means unlimited
// (no v1 tier uses this).
export const tierLimits = pgTable(
  'tier_limits',
  {
    tier: text('tier', { enum: ['free', 'plus', 'pro'] }).notNull(),
    actionType: text('action_type', { enum: ['source_analysis', 'feedback_pass'] }).notNull(),
    monthlyLimit: integer('monthly_limit'),
  },
  (table) => [primaryKey({ columns: [table.tier, table.actionType] })],
);
