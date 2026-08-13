import type { DocumentContent, FeedbackComment, FeedbackPassResponse, FeedbackPassesResponse, FeedbackPassSummary } from '@alvus-ai/shared';
import { Hono } from 'hono';
import { AiProviderError, requestFeedbackPass, type AiEnv } from '../lib/ai';
import { createDb } from '../lib/db/client';
import { getOrCreateDocument } from '../lib/db/queries/documents';
import { createFeedbackPass, getFeedbackPassById, listFeedbackPasses, type FeedbackPassRow } from '../lib/db/queries/feedback';
import { isEmptyDocument } from '../lib/document/citations';
import { extractPlainText, locateQuote } from '../lib/document/feedback-anchors';
import { assertWithinUsageLimit, recordUsage } from '../lib/metering';
import { authenticate, requireApproved, type AuthBindings, type AuthVariables } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { loadOwnedProject } from './projects';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FeedbackBindings = AuthBindings & AiEnv;
type Env = { Bindings: FeedbackBindings; Variables: AuthVariables };

function toFeedbackPassResponse(row: FeedbackPassRow): FeedbackPassResponse {
  return { pass_id: row.id, created_at: row.createdAt.toISOString(), comments: row.comments as FeedbackComment[] };
}

function toFeedbackPassSummary(row: FeedbackPassRow): FeedbackPassSummary {
  return { pass_id: row.id, created_at: row.createdAt.toISOString(), comment_count: row.comments.length };
}

const feedback = new Hono<Env>();
feedback.use('*', authenticate, requireApproved);

feedback.post('/', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);

  const doc = await getOrCreateDocument(db, project.id);
  const docContent = doc.content as DocumentContent;
  if (isEmptyDocument(docContent)) {
    throw new AppError(422, 'empty_document', 'Write something before requesting feedback');
  }

  const now = new Date();
  await assertWithinUsageLimit(db, { userId: authUser.id, actionType: 'feedback_pass', now });

  const extracted = extractPlainText(docContent);

  let result;
  try {
    result = await requestFeedbackPass(
      { documentText: extracted.text },
      {
        AI_PROVIDER_MODE: c.env.AI_PROVIDER_MODE,
        LITELLM_BASE_URL: c.env.LITELLM_BASE_URL,
        LITELLM_API_KEY: c.env.LITELLM_API_KEY,
        LITELLM_MODEL: c.env.LITELLM_MODEL,
      },
    );
  } catch (err) {
    if (err instanceof AiProviderError) {
      throw new AppError(502, 'ai_provider_unreachable', 'The feedback service is currently unreachable. Please try again later.');
    }
    throw err;
  }

  // A draft whose quote can't be located in the document (paraphrased by the
  // model, or spans a gap extractPlainText doesn't bridge) is dropped rather
  // than failing the whole pass -- anchors are a best-effort v1 feature
  // (docs/data-model.md).
  const comments: FeedbackComment[] = [];
  for (const draft of result.comments) {
    const anchor = locateQuote(extracted, draft.quote);
    if (!anchor) continue;
    comments.push({ id: crypto.randomUUID(), anchor, category: draft.category, text: draft.text });
  }

  const created = await createFeedbackPass(db, { projectId: project.id, comments });

  // Recorded only after a successful pass, same as source analysis (docs/tdd.md
  // Flow 1 step 6c / Flow 3 step 6) -- a failed AI call above never counts
  // against the user's quota.
  await recordUsage(db, {
    userId: authUser.id,
    projectId: project.id,
    actionType: 'feedback_pass',
    now,
    tokenCostInput: result.tokenUsage.inputTokens,
    tokenCostOutput: result.tokenUsage.outputTokens,
  });

  return c.json(toFeedbackPassResponse(created), 201);
});

feedback.get('/', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);

  const cursor = c.req.query('cursor') ?? null;
  const { passes, nextCursor } = await listFeedbackPasses(db, { projectId: project.id, cursor });
  const response: FeedbackPassesResponse = { passes: passes.map(toFeedbackPassSummary), next_cursor: nextCursor };
  return c.json(response, 200);
});

feedback.get('/:passId', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);

  const passId = c.req.param('passId');
  if (!passId || !UUID_RE.test(passId)) throw new AppError(404, 'feedback_pass_not_found', 'No such feedback pass');
  const row = await getFeedbackPassById(db, { id: passId, projectId: project.id });
  if (!row) throw new AppError(404, 'feedback_pass_not_found', 'No such feedback pass');

  return c.json(toFeedbackPassResponse(row), 200);
});

export default feedback;
