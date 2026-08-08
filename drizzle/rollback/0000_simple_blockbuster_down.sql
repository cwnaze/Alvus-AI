-- Hand-written down-migration for drizzle/migrations/0000_simple_blockbuster.sql.
--
-- Drizzle Kit only generates forward migrations (see docs/infra.md's Rollback
-- plan) -- this file is a manual, break-glass step for the emergency case
-- where a bad forward migration must be undone against a live database. It is
-- NOT tracked in drizzle/migrations/meta/_journal.json and `drizzle-kit
-- migrate` will never apply it. Run it by hand against DATABASE_URL:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/rollback/0000_simple_blockbuster_down.sql
--
-- Drops in FK-safe order (dependents before the tables they reference).
-- Destructive: this deletes all rows in these tables, not just the schema.
DROP TABLE IF EXISTS "waitlist_signups";
--> statement-breakpoint
DROP TABLE IF EXISTS "tier_limits";
--> statement-breakpoint
DROP TABLE IF EXISTS "users";
