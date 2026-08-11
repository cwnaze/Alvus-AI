import { eq, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { projectDocuments } from '../schema';

export type ProjectDocumentRow = typeof projectDocuments.$inferSelect;

// Every project implicitly has a document from creation, but the row is
// created lazily on first access rather than in the same transaction as
// `createProject` -- keeps project creation from knowing about the editor.
export async function getOrCreateDocument(db: Db, projectId: string): Promise<ProjectDocumentRow> {
  const [existing] = await db.select().from(projectDocuments).where(eq(projectDocuments.projectId, projectId));
  if (existing) return existing;

  const [created] = await db.insert(projectDocuments).values({ projectId }).onConflictDoNothing().returning();
  if (created) return created;

  // Lost the create race to a concurrent first-load -- the winner's row exists now.
  const [row] = await db.select().from(projectDocuments).where(eq(projectDocuments.projectId, projectId));
  if (!row) throw new Error(`getOrCreateDocument: project_documents row for ${projectId} vanished after insert race`);
  return row;
}

// Upsert rather than update: a save can race a project that has never been
// loaded into the editor yet (no row created by getOrCreateDocument).
export async function saveDocumentContent(
  db: Db,
  params: { projectId: string; content: unknown },
): Promise<ProjectDocumentRow> {
  const [saved] = await db
    .insert(projectDocuments)
    .values({ projectId: params.projectId, content: params.content })
    .onConflictDoUpdate({
      target: projectDocuments.projectId,
      set: {
        content: params.content,
        contentVersion: sql`${projectDocuments.contentVersion} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!saved) throw new Error(`saveDocumentContent: upsert for project ${params.projectId} returned no row`);
  return saved;
}
