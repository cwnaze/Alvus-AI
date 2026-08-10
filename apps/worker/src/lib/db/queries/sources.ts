import { and, eq } from 'drizzle-orm';
import type { Db } from '../client';
import { externalWorks, projectSources, uploadedFiles, type KeyQuoteJson } from '../schema';

export type ExternalWorkRow = typeof externalWorks.$inferSelect;
export type UploadedFileRow = typeof uploadedFiles.$inferSelect;
export type ProjectSourceRow = typeof projectSources.$inferSelect;
export type ProjectSourceState = ProjectSourceRow['state'];
export type ProjectSourceWithWork = ProjectSourceRow & { work: ExternalWorkRow | null; uploadedFile: UploadedFileRow | null };

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

function withWork(row: {
  project_sources: ProjectSourceRow;
  external_works: ExternalWorkRow | null;
  uploaded_files: UploadedFileRow | null;
}): ProjectSourceWithWork {
  return { ...row.project_sources, work: row.external_works, uploadedFile: row.uploaded_files };
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
    .leftJoin(uploadedFiles, eq(projectSources.uploadedFileId, uploadedFiles.id))
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
    .leftJoin(uploadedFiles, eq(projectSources.uploadedFileId, uploadedFiles.id))
    .where(and(eq(projectSources.id, params.id), eq(projectSources.projectId, params.projectId)));
  return row ? withWork(row) : undefined;
}

export async function updateProjectSourceState(
  db: Db,
  params: { id: string; state: ProjectSourceState; selectedAt: Date | null; citationString?: string },
): Promise<ProjectSourceRow> {
  const [updated] = await db
    .update(projectSources)
    .set({
      state: params.state,
      selectedAt: params.selectedAt,
      ...(params.citationString !== undefined ? { citationString: params.citationString } : {}),
      updatedAt: new Date(),
    })
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

// Unlike a `discovered` source (candidate -> explicit analyze -> explicit
// select, three separate calls), an upload goes straight from bytes to a
// `selected` bibliography entry in one request (docs/api.md: "select/upload
// promotes to selected") -- analysis already ran synchronously by the time
// this is called, so there is no intermediate `candidate` state to pass
// through. One transaction: the `uploaded_files` row must exist before
// `project_sources` can reference it, and a failure partway through must not
// leave an orphaned file row with no source.
export async function createUploadedProjectSource(
  db: Db,
  params: {
    projectId: string;
    ownerId: string;
    title: string | null;
    storagePath: string;
    originalFilename: string;
    mimeType: 'application/pdf' | 'text/plain';
    fileSizeBytes: number;
    checksumSha256: string | null;
    citationString: string;
    strengthsSummary: string;
    weaknessesSummary: string;
    usefulnessScore: number;
    keyQuotes: KeyQuoteJson[];
    now: Date;
  },
): Promise<ProjectSourceWithWork> {
  return db.transaction(async (tx) => {
    const [file] = await tx
      .insert(uploadedFiles)
      .values({
        projectId: params.projectId,
        ownerId: params.ownerId,
        title: params.title,
        storagePath: params.storagePath,
        originalFilename: params.originalFilename,
        mimeType: params.mimeType,
        fileSizeBytes: params.fileSizeBytes,
        checksumSha256: params.checksumSha256,
        uploadStatus: 'processed',
      })
      .returning();
    if (!file) throw new Error('createUploadedProjectSource: uploaded_files insert returned no row');

    const [source] = await tx
      .insert(projectSources)
      .values({
        projectId: params.projectId,
        origin: 'uploaded',
        uploadedFileId: file.id,
        state: 'selected',
        citationString: params.citationString,
        strengthsSummary: params.strengthsSummary,
        weaknessesSummary: params.weaknessesSummary,
        usefulnessScore: params.usefulnessScore.toString(),
        keyQuotes: params.keyQuotes,
        fullTextAvailable: true,
        fullTextSource: 'uploaded',
        analyzedAt: params.now,
        selectedAt: params.now,
      })
      .returning();
    if (!source) throw new Error('createUploadedProjectSource: project_sources insert returned no row');

    return { ...source, work: null, uploadedFile: file };
  });
}
