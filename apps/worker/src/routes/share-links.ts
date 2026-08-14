import type { ShareLinkResponse } from '@alvus-ai/shared';
import { Hono } from 'hono';
import { createDb } from '../lib/db/client';
import { createShareLink, getActiveShareLinkByProject, revokeShareLink } from '../lib/db/queries/share-links';
import { decryptShareToken, encryptShareToken, generateShareToken, hashShareToken } from '../lib/share-links/token';
import { authenticate, requireApproved, type AuthBindings, type AuthVariables } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { loadOwnedProject } from './projects';

type Env = { Bindings: AuthBindings & { SHARE_LINK_ENCRYPTION_KEY: string }; Variables: AuthVariables };

function buildShareUrl(publicAppUrl: string, token: string): string {
  return `${publicAppUrl.replace(/\/$/, '')}/shared/${token}`;
}

const shareLink = new Hono<Env>();
shareLink.use('*', authenticate, requireApproved);

// Idempotent: a second call while a link is still active returns that same
// link rather than minting a new one (docs/api.md: "idempotent, 200 if
// exists"). The existing row only stores a hash (lookup) and an encrypted
// copy (redisplay) of the token, never the plaintext -- see share-links.ts
// schema's note -- so returning it back to the owner means decrypting
// `tokenEncrypted` with the Worker-held key.
shareLink.post('/', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);

  const existing = await getActiveShareLinkByProject(db, project.id);
  if (existing) {
    const token = await decryptShareToken(existing.tokenEncrypted, c.env.SHARE_LINK_ENCRYPTION_KEY);
    const response: ShareLinkResponse = { token, url: buildShareUrl(c.env.PUBLIC_APP_URL, token) };
    return c.json(response, 200);
  }

  const token = generateShareToken();
  const [tokenHash, tokenEncrypted] = await Promise.all([
    hashShareToken(token),
    encryptShareToken(token, c.env.SHARE_LINK_ENCRYPTION_KEY),
  ]);
  await createShareLink(db, { projectId: project.id, createdBy: authUser.id, tokenHash, tokenEncrypted });
  const response: ShareLinkResponse = { token, url: buildShareUrl(c.env.PUBLIC_APP_URL, token) };
  return c.json(response, 201);
});

shareLink.get('/', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);

  const existing = await getActiveShareLinkByProject(db, project.id);
  if (!existing) throw new AppError(404, 'no_active_link', 'This project has no active share link');

  const token = await decryptShareToken(existing.tokenEncrypted, c.env.SHARE_LINK_ENCRYPTION_KEY);
  const response: ShareLinkResponse = { token, url: buildShareUrl(c.env.PUBLIC_APP_URL, token) };
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
