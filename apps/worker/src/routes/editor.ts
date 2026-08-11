import type { ProjectDocumentResponse, SaveDocumentResponse } from '@alvus-ai/shared';
import { Hono } from 'hono';
import { createDb } from '../lib/db/client';
import { getOrCreateDocument, saveDocumentContent, type ProjectDocumentRow } from '../lib/db/queries/documents';
import { authenticate, requireApproved, type AuthBindings, type AuthVariables } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { loadOwnedProject } from './projects';

type Env = { Bindings: AuthBindings; Variables: AuthVariables };

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

export default editor;
