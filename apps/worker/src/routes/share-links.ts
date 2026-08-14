import type { ShareLinkResponse } from '@alvus-ai/shared';
import { Hono } from 'hono';
import { createDb } from '../lib/db/client';
import { createShareLink, getActiveShareLinkByProject, revokeShareLink } from '../lib/db/queries/share-links';
import { generateShareToken } from '../lib/share-links/token';
import { authenticate, requireApproved, type AuthBindings, type AuthVariables } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { loadOwnedProject } from './projects';

type Env = { Bindings: AuthBindings; Variables: AuthVariables };

function buildShareUrl(publicAppUrl: string, token: string): string {
  return `${publicAppUrl.replace(/\/$/, '')}/shared/${token}`;
}

const shareLink = new Hono<Env>();
shareLink.use('*', authenticate, requireApproved);

// Idempotent: a second call while a link is still active returns that same
// link rather than minting a new one (docs/api.md: "idempotent, 200 if
// exists" -- see share-links.ts schema's note on why the token is
// retrievable rather than hash-only).
shareLink.post('/', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);

  const existing = await getActiveShareLinkByProject(db, project.id);
  if (existing) {
    const response: ShareLinkResponse = { token: existing.token, url: buildShareUrl(c.env.PUBLIC_APP_URL, existing.token) };
    return c.json(response, 200);
  }

  const token = generateShareToken();
  const created = await createShareLink(db, { projectId: project.id, createdBy: authUser.id, token });
  const response: ShareLinkResponse = { token: created.token, url: buildShareUrl(c.env.PUBLIC_APP_URL, created.token) };
  return c.json(response, 201);
});

shareLink.get('/', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);

  const existing = await getActiveShareLinkByProject(db, project.id);
  if (!existing) throw new AppError(404, 'no_active_link', 'This project has no active share link');

  const response: ShareLinkResponse = { token: existing.token, url: buildShareUrl(c.env.PUBLIC_APP_URL, existing.token) };
  return c.json(response, 200);
});

shareLink.delete('/', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);

  const existing = await getActiveShareLinkByProject(db, project.id);
  if (!existing) throw new AppError(404, 'no_active_link', 'This project has no active share link');

  await revokeShareLink(db, { id: existing.id });
  return c.body(null, 204);
});

export default shareLink;
