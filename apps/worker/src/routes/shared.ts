import type { DocumentContent, SharedPaperResponse } from '@alvus-ai/shared';
import { Hono } from 'hono';
import { formatInTextCitation } from '../lib/citation';
import { createDb } from '../lib/db/client';
import { getOrCreateDocument } from '../lib/db/queries/documents';
import { getProjectById } from '../lib/db/queries/projects';
import { findShareLinkByToken, recordShareLinkAccess } from '../lib/db/queries/share-links';
import { listProjectSources } from '../lib/db/queries/sources';
import { AppError } from '../middleware/errors';

type Env = { Bindings: { DATABASE_URL: string } };

const shared = new Hono<Env>();

// Unauthenticated by design (docs/api.md's "share-link token" auth class) --
// possession of the token is the credential. Unknown token -> 404 (existence
// of a projectId isn't sensitive, token validity is); revoked/expired -> 410,
// distinct so the frontend can render "this link no longer works" instead of
// a generic not-found. Never returns anything beyond this one project's
// read-only view -- see docs/security.md's share-link resolution rule.
shared.get('/:token', async (c) => {
  const token = c.req.param('token');
  const db = createDb(c.env.DATABASE_URL);

  const link = await findShareLinkByToken(db, token);
  if (!link) throw new AppError(404, 'invalid_token', 'This share link does not exist');
  if (link.revokedAt) throw new AppError(410, 'link_revoked', 'This share link has been revoked');
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
    throw new AppError(410, 'link_revoked', 'This share link has expired');
  }

  const project = await getProjectById(db, link.projectId);
  if (!project) throw new AppError(404, 'invalid_token', 'This share link does not exist');

  await recordShareLinkAccess(db, { id: link.id, now: new Date() });

  const [doc, selected] = await Promise.all([
    getOrCreateDocument(db, project.id),
    listProjectSources(db, { projectId: project.id, state: 'selected' }),
  ]);

  const bibliography = selected
    .filter((row): row is typeof row & { citationString: string } => row.citationString !== null)
    .map((row) => ({
      source_id: row.id,
      citation_text: row.citationString,
      in_text_citation: formatInTextCitation(project.citationFormat, {
        authors: row.work?.authors ?? [],
        year: row.work?.publicationYear ?? null,
      }),
    }));

  const response: SharedPaperResponse = {
    project: { id: project.id, title: project.title, citation_format: project.citationFormat },
    bibliography,
    document: { content: doc.content as DocumentContent, updated_at: doc.updatedAt.toISOString() },
  };
  return c.json(response, 200);
});

export default shared;
