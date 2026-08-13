import type { DocumentContent, DocumentFormatResponse, ProjectDocumentResponse, SaveDocumentResponse, SuggestionsResponse } from '@alvus-ai/shared';
import { Hono } from 'hono';
import { AiProviderError, requestParagraphSuggestions, type AiEnv } from '../lib/ai';
import { formatInTextCitation } from '../lib/citation';
import { createDb } from '../lib/db/client';
import { getOrCreateDocument, saveDocumentContent, type ProjectDocumentRow } from '../lib/db/queries/documents';
import { listProjectSources } from '../lib/db/queries/sources';
import { isEmptyDocument, rerenderCitations } from '../lib/document/citations';
import { assertWithinSuggestionRateLimit, recordSuggestionRequestHit } from '../lib/rate-limit';
import { authenticate, requireApproved, type AuthBindings, type AuthVariables } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { loadOwnedProject } from './projects';

const MAX_CURSOR_CONTEXT_LENGTH = 4000;

export type EditorBindings = AuthBindings & AiEnv;
type Env = { Bindings: EditorBindings; Variables: AuthVariables };

function parseCursorContext(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw new AppError(400, 'invalid_cursor_context', 'cursor_context must be a string');
  if (value.length > MAX_CURSOR_CONTEXT_LENGTH) {
    throw new AppError(400, 'invalid_cursor_context', `cursor_context must be ${MAX_CURSOR_CONTEXT_LENGTH} characters or fewer`);
  }
  return value;
}

function toResponse(row: ProjectDocumentRow): ProjectDocumentResponse {
  return { content: row.content as ProjectDocumentResponse['content'], updated_at: row.updatedAt.toISOString() };
}

// A TipTap document is a JSON object with a `type: "doc"` root -- reject
// anything that isn't a plain object up front rather than letting an
// arbitrary JSON value (array, string, null) land in the `content` column.
function parseContent(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'invalid_content', 'content must be a TipTap document object');
  }
  return value as Record<string, unknown>;
}

const editor = new Hono<Env>();
editor.use('*', authenticate, requireApproved);

editor.get('/', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);
  const doc = await getOrCreateDocument(db, project.id);
  return c.json(toResponse(doc), 200);
});

editor.put('/', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const body = (await c.req.json().catch(() => null)) as { content?: unknown } | null;
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);
  const content = parseContent(body?.content);

  const saved = await saveDocumentContent(db, { projectId: project.id, content });
  const response: SaveDocumentResponse = { updated_at: saved.updatedAt.toISOString() };
  return c.json(response, 200);
});

// Not metered (docs/api.md: "citation re-render ... not separately metered")
// -- deterministic string formatting, no AI call, same reasoning as
// `lib/citation`'s bibliography formatter.
editor.post('/format', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);
  const doc = await getOrCreateDocument(db, project.id);
  const docContent = doc.content as DocumentContent;

  if (isEmptyDocument(docContent)) {
    throw new AppError(422, 'empty_document', 'Write something before rendering the full document');
  }

  const selected = await listProjectSources(db, { projectId: project.id, state: 'selected' });
  const bySourceId = new Map(selected.map((source) => [source.id, source]));

  const { content, danglingSourceIds } = rerenderCitations(docContent, (sourceId) => {
    const source = bySourceId.get(sourceId);
    if (!source) return undefined;
    return {
      text: formatInTextCitation(project.citationFormat, {
        authors: source.work?.authors ?? [],
        year: source.work?.publicationYear ?? null,
      }),
    };
  });

  const saved = await saveDocumentContent(db, { projectId: project.id, content });
  const response: DocumentFormatResponse = {
    content: saved.content as DocumentContent,
    dangling_citations: danglingSourceIds.map((source_id) => ({ source_id })),
  };
  return c.json(response, 200);
});

// Not metered (docs/api.md: "paragraph-start suggestions are not separately
// metered") but rate-limited (docs/tdd.md Flow 2 step 3) -- a lighter lib/ai
// call than /analyze, so it's guarded by lib/rate-limit instead of
// lib/metering. The rate-limit hit is recorded before the AI call so a burst
// of requests trips the limit even if the AI call itself keeps failing.
editor.post('/suggestions', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);

  const body = (await c.req.json().catch(() => ({}))) as { cursor_context?: unknown };
  const cursorContext = parseCursorContext(body.cursor_context);

  const now = new Date();
  await assertWithinSuggestionRateLimit(db, { userId: authUser.id, now });
  await recordSuggestionRequestHit(db, { userId: authUser.id });

  let result;
  try {
    result = await requestParagraphSuggestions(
      { cursorContext },
      {
        AI_PROVIDER_MODE: c.env.AI_PROVIDER_MODE,
        LITELLM_BASE_URL: c.env.LITELLM_BASE_URL,
        LITELLM_API_KEY: c.env.LITELLM_API_KEY,
        LITELLM_MODEL: c.env.LITELLM_MODEL,
      },
    );
  } catch (err) {
    if (err instanceof AiProviderError) {
      throw new AppError(502, 'ai_provider_unreachable', 'The suggestion service is currently unreachable. Please try again later.');
    }
    throw err;
  }

  const response: SuggestionsResponse = { suggestions: result.suggestions };
  return c.json(response, 200);
});

export default editor;
