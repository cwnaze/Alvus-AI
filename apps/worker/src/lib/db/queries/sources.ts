import { and, eq } from 'drizzle-orm';
import type { Db } from '../client';
import { externalWorks, projectSources } from '../schema';

export type ExternalWorkRow = typeof externalWorks.$inferSelect;
export type ProjectSourceRow = typeof projectSources.$inferSelect;

export type ExternalWorkIdentity = {
  doi: string | null;
  semanticScholarId: string | null;
  title: string;
  authors: string[];
  abstract: string | null;
  publicationYear: number | null;
  venue: string | null;
  oaStatus: 'gold' | 'green' | 'hybrid' | 'bronze' | 'closed' | null;
  oaUrl: string | null;
};

async function findExternalWorkByIdentity(db: Db, params: Pick<ExternalWorkIdentity, 'doi' | 'semanticScholarId'>) {
  if (params.doi) {
    const [row] = await db.select().from(externalWorks).where(eq(externalWorks.doi, params.doi));
    if (row) return row;
  }
  if (params.semanticScholarId) {
    const [row] = await db.select().from(externalWorks).where(eq(externalWorks.semanticScholarId, params.semanticScholarId));
    if (row) return row;
  }
  return undefined;
}

// Cross-project/cross-user dedup cache (see docs/data-model.md's
// `external_works`) -- finds an existing row by DOI or Semantic Scholar id
// and refreshes its metadata, or inserts a new one. A tiny race window exists
// under two concurrent searches for the same brand-new paper (both could
// insert); acceptable for a discovery cache, not worth a locking scheme.
export async function upsertExternalWork(db: Db, params: ExternalWorkIdentity): Promise<ExternalWorkRow> {
  const existing = await findExternalWorkByIdentity(db, params);
  const now = new Date();
  if (existing) {
    const [updated] = await db
      .update(externalWorks)
      .set({ ...params, lastRefreshedAt: now })
      .where(eq(externalWorks.id, existing.id))
      .returning();
    if (!updated) throw new Error(`upsertExternalWork: external_work ${existing.id} vanished mid-update`);
    return updated;
  }

  const [created] = await db
    .insert(externalWorks)
    .values({ ...params, lastRefreshedAt: now })
    .returning();
  if (!created) throw new Error('upsertExternalWork: insert returned no row');
  return created;
}

// Idempotent per (project, external_work): a re-run search must not create
// duplicate candidate rows for a paper already surfaced to this project.
export async function findOrCreateProjectSource(
  db: Db,
  params: { projectId: string; externalWorkId: string },
): Promise<ProjectSourceRow> {
  const [existing] = await db
    .select()
    .from(projectSources)
    .where(and(eq(projectSources.projectId, params.projectId), eq(projectSources.externalWorkId, params.externalWorkId)));
  if (existing) return existing;

  const [created] = await db
    .insert(projectSources)
    .values({ projectId: params.projectId, origin: 'discovered', externalWorkId: params.externalWorkId, state: 'candidate' })
    .returning();
  if (!created) throw new Error('findOrCreateProjectSource: insert returned no row');
  return created;
}
