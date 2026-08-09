import { and, asc, eq, gt } from 'drizzle-orm';
import type { CitationFormat } from '@alvus-ai/shared';
import type { Db } from '../client';
import { projects } from '../schema';

export type ProjectRow = typeof projects.$inferSelect;

const DEFAULT_PAGE_SIZE = 20;

export async function createProject(
  db: Db,
  params: { ownerId: string; title: string; citationFormat: CitationFormat },
): Promise<ProjectRow> {
  const [created] = await db
    .insert(projects)
    .values({ ownerId: params.ownerId, title: params.title, citationFormat: params.citationFormat })
    .returning();
  if (!created) throw new Error('createProject: insert returned no row');
  return created;
}

// Same simple cursor tradeoff as listUsers/listWaitlistEntries -- cursor is the
// ISO created_at of the last row returned.
export async function listProjects(
  db: Db,
  params: { ownerId: string; cursor?: string | null; limit?: number },
): Promise<{ projects: ProjectRow[]; nextCursor: string | null }> {
  const limit = params.limit ?? DEFAULT_PAGE_SIZE;
  const conditions = [eq(projects.ownerId, params.ownerId)];
  if (params.cursor) conditions.push(gt(projects.createdAt, new Date(params.cursor)));

  const rows = await db
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(asc(projects.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;
  const last = entries[entries.length - 1];
  const nextCursor = hasMore && last ? last.createdAt.toISOString() : null;
  return { projects: entries, nextCursor };
}

export async function getProjectById(db: Db, id: string): Promise<ProjectRow | undefined> {
  const [row] = await db.select().from(projects).where(eq(projects.id, id));
  return row;
}

export async function renameProject(db: Db, params: { id: string; title: string }): Promise<ProjectRow> {
  const [updated] = await db
    .update(projects)
    .set({ title: params.title, updatedAt: new Date() })
    .where(eq(projects.id, params.id))
    .returning();
  if (!updated) throw new Error(`renameProject: project ${params.id} vanished mid-update`);
  return updated;
}

export async function deleteProject(db: Db, id: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id));
}
