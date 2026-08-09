import { and, eq } from 'drizzle-orm';
import type { Db } from '../client';
import { externalWorks, projectSources, type KeyQuoteJson } from '../schema';

export type ExternalWorkRow = typeof externalWorks.$inferSelect;
export type ProjectSourceRow = typeof projectSources.$inferSelect;
export type ProjectSourceState = ProjectSourceRow['state'];
export type ProjectSourceWithWork = ProjectSourceRow & { work: ExternalWorkRow | null };

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

function withWork(row: { project_sources: ProjectSourceRow; external_works: ExternalWorkRow | null }): ProjectSourceWithWork {
  return { ...row.project_sources, work: row.external_works };
}

export async function listProjectSources(
  db: Db,
  params: { projectId: string; state?: ProjectSourceState },
): Promise<ProjectSourceWithWork[]> {
  const conditions = [eq(projectSources.projectId, params.projectId)];
  if (params.state) conditions.push(eq(projectSources.state, params.state));

  const rows = await db
    .select()
    .from(projectSources)
    .leftJoin(externalWorks, eq(projectSources.externalWorkId, externalWorks.id))
    .where(and(...conditions));
  return rows.map(withWork);
}

export async function getProjectSourceById(
  db: Db,
  params: { id: string; projectId: string },
): Promise<ProjectSourceWithWork | undefined> {
  const [row] = await db
    .select()
    .from(projectSources)
    .leftJoin(externalWorks, eq(projectSources.externalWorkId, externalWorks.id))
    .where(and(eq(projectSources.id, params.id), eq(projectSources.projectId, params.projectId)));
  return row ? withWork(row) : undefined;
}

export async function updateProjectSourceState(
  db: Db,
  params: { id: string; state: ProjectSourceState; selectedAt: Date | null },
): Promise<ProjectSourceRow> {
  const [updated] = await db
    .update(projectSources)
    .set({ state: params.state, selectedAt: params.selectedAt, updatedAt: new Date() })
    .where(eq(projectSources.id, params.id))
    .returning();
  if (!updated) throw new Error(`updateProjectSourceState: project_source ${params.id} vanished mid-update`);
  return updated;
}

export async function saveProjectSourceAnalysis(
  db: Db,
  params: {
    id: string;
    citationString: string;
    strengthsSummary: string;
    weaknessesSummary: string;
    usefulnessScore: number;
    keyQuotes: KeyQuoteJson[];
    fullTextAvailable: boolean;
    fullTextSource: 'open_access' | 'abstract_only';
    analyzedAt: Date;
  },
): Promise<ProjectSourceRow> {
  const [updated] = await db
    .update(projectSources)
    .set({
      citationString: params.citationString,
      strengthsSummary: params.strengthsSummary,
      weaknessesSummary: params.weaknessesSummary,
      usefulnessScore: params.usefulnessScore.toString(),
      keyQuotes: params.keyQuotes,
      fullTextAvailable: params.fullTextAvailable,
      fullTextSource: params.fullTextSource,
      analyzedAt: params.analyzedAt,
      updatedAt: new Date(),
    })
    .where(eq(projectSources.id, params.id))
    .returning();
  if (!updated) throw new Error(`saveProjectSourceAnalysis: project_source ${params.id} vanished mid-update`);
  return updated;
}

export async function deleteProjectSource(db: Db, params: { id: string }): Promise<void> {
  await db.delete(projectSources).where(eq(projectSources.id, params.id));
}
