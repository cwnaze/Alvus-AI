import type { BibliographyResponse, Project, ProjectsResponse } from '@alvus-ai/shared';
import { CITATION_FORMATS } from '@alvus-ai/shared';
import { Hono } from 'hono';
import { createDb, type Db } from '../lib/db/client';
import {
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  renameProject,
  type ProjectRow,
} from '../lib/db/queries/projects';
import { listProjectSources } from '../lib/db/queries/sources';
import { authenticate, requireApproved, type AuthBindings, type AuthVariables } from '../middleware/auth';
import { AppError } from '../middleware/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE_LENGTH = 200;

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    owner_id: row.ownerId,
    title: row.title,
    citation_format: row.citationFormat,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function parseTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title) throw new AppError(400, 'invalid_title', 'A project title is required');
  if (title.length > MAX_TITLE_LENGTH) {
    throw new AppError(400, 'invalid_title', `Title must be ${MAX_TITLE_LENGTH} characters or fewer`);
  }
  return title;
}

function parseCursor(value: string | null): string | null {
  if (!value) return null;
  if (Number.isNaN(new Date(value).getTime())) {
    throw new AppError(400, 'invalid_cursor', 'cursor must be a valid ISO 8601 timestamp');
  }
  return value;
}

// Unauthorized project access is 403, not a leaky 404 -- see docs/api.md's
// cross-cutting rules. A malformed/nonexistent id is still 404: there is no
// row to be unauthorized *about*.
export async function loadOwnedProject(db: Db, projectId: string, ownerId: string): Promise<ProjectRow> {
  if (!UUID_RE.test(projectId)) throw new AppError(404, 'project_not_found', 'No such project');
  const project = await getProjectById(db, projectId);
  if (!project) throw new AppError(404, 'project_not_found', 'No such project');
  if (project.ownerId !== ownerId) throw new AppError(403, 'forbidden', 'You do not have access to this project');
  return project;
}

type Env = { Bindings: AuthBindings; Variables: AuthVariables };

const projects = new Hono<Env>();
projects.use('*', authenticate, requireApproved);

projects.post('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { title?: unknown; citation_format?: unknown } | null;
  const title = parseTitle(body?.title);
  const citationFormat = body?.citation_format;
  if (typeof citationFormat !== 'string' || !CITATION_FORMATS.includes(citationFormat as (typeof CITATION_FORMATS)[number])) {
    throw new AppError(400, 'invalid_citation_format', `citation_format must be one of ${CITATION_FORMATS.join(', ')}`);
  }

  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const created = await createProject(db, {
    ownerId: authUser.id,
    title,
    citationFormat: citationFormat as (typeof CITATION_FORMATS)[number],
  });
  return c.json(toProject(created), 201);
});

projects.get('/', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');
  const cursor = parseCursor(c.req.query('cursor') ?? null);

  const db = createDb(c.env.DATABASE_URL);
  const { projects: rows, nextCursor } = await listProjects(db, { ownerId: authUser.id, cursor });
  const response: ProjectsResponse = { projects: rows.map(toProject), next_cursor: nextCursor };
  return c.json(response, 200);
});

projects.get('/:projectId', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId'), authUser.id);
  return c.json(toProject(project), 200);
});

projects.patch('/:projectId', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const body = (await c.req.json().catch(() => null)) as { title?: unknown; citation_format?: unknown } | null;
  const project = await loadOwnedProject(db, c.req.param('projectId'), authUser.id);
  if (body?.citation_format !== undefined && body.citation_format !== project.citationFormat) {
    throw new AppError(422, 'citation_format_immutable', 'Citation format cannot be changed after creation');
  }
  const title = parseTitle(body?.title);

  const updated = await renameProject(db, { id: project.id, title });
  return c.json(toProject(updated), 200);
});

projects.get('/:projectId/bibliography', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId'), authUser.id);

  // Bibliography is a derived view over `selected` sources -- no separate
  // authoring step (docs/tdd.md's Flow 1 step 7).
  const rows = await listProjectSources(db, { projectId: project.id, state: 'selected' });
  const entries = rows
    .filter((row): row is typeof row & { citationString: string } => row.citationString !== null)
    .map((row) => ({ source_id: row.id, citation_text: row.citationString }));
  const response: BibliographyResponse = { citation_format: project.citationFormat, entries };
  return c.json(response, 200);
});

projects.delete('/:projectId', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId'), authUser.id);
  await deleteProject(db, project.id);
  return c.body(null, 204);
});

export default projects;
