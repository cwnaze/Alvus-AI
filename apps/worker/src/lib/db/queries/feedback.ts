import { and, desc, eq, lt } from 'drizzle-orm';
import type { Db } from '../client';
import { feedbackPasses, type FeedbackCommentJson } from '../schema';

export type FeedbackPassRow = typeof feedbackPasses.$inferSelect;

const DEFAULT_PAGE_SIZE = 20;

export async function createFeedbackPass(
  db: Db,
  params: { projectId: string; comments: FeedbackCommentJson[] },
): Promise<FeedbackPassRow> {
  const [created] = await db.insert(feedbackPasses).values({ projectId: params.projectId, comments: params.comments }).returning();
  if (!created) throw new Error('createFeedbackPass: insert returned no row');
  return created;
}

// Newest-first history (docs/data-model.md: "one row per requested pass, not
// just latest") -- same cursor tradeoff as listProjects, but descending: the
// cursor is the createdAt of the last row returned, and the next page is
// everything older than it.
export async function listFeedbackPasses(
  db: Db,
  params: { projectId: string; cursor?: string | null; limit?: number },
): Promise<{ passes: FeedbackPassRow[]; nextCursor: string | null }> {
  const limit = params.limit ?? DEFAULT_PAGE_SIZE;
  const conditions = [eq(feedbackPasses.projectId, params.projectId)];
  if (params.cursor) conditions.push(lt(feedbackPasses.createdAt, new Date(params.cursor)));

  const rows = await db
    .select()
    .from(feedbackPasses)
    .where(and(...conditions))
    .orderBy(desc(feedbackPasses.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;
  const last = entries[entries.length - 1];
  const nextCursor = hasMore && last ? last.createdAt.toISOString() : null;
  return { passes: entries, nextCursor };
}

export async function getFeedbackPassById(db: Db, params: { id: string; projectId: string }): Promise<FeedbackPassRow | undefined> {
  const [row] = await db
    .select()
    .from(feedbackPasses)
    .where(and(eq(feedbackPasses.id, params.id), eq(feedbackPasses.projectId, params.projectId)));
  return row;
}
