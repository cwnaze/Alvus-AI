import { pgSchema, uuid } from 'drizzle-orm/pg-core';

// Reference-only stub: `auth.users` is created and owned by Supabase Auth, never by
// a Drizzle migration. This lets `users.id` declare a real FK for drizzle-kit's
// dependency graph while `schemaFilter: ['public']` in drizzle.config.ts keeps
// `auth.*` out of generated migrations entirely.
export const authSchema = pgSchema('auth');

export const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
});
