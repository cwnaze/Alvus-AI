import type { SourceCandidate, SourceSearchResponse } from '@alvus-ai/shared';
import { Hono } from 'hono';
import { createDb } from '../lib/db/client';
import { findOrCreateProjectSource, upsertExternalWork, type ExternalWorkRow } from '../lib/db/queries/sources';
import { searchSources } from '../lib/sources';
import { authenticate, requireApproved, type AuthBindings, type AuthVariables } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { loadOwnedProject } from './projects';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const MIN_YEAR = 1000;
const MAX_YEAR = 3000;

type SourcesBindings = AuthBindings & {
  SOURCES_PROVIDER_MODE?: string;
  SEMANTIC_SCHOLAR_API_KEY?: string;
  CROSSREF_CONTACT_EMAIL?: string;
  UNPAYWALL_CONTACT_EMAIL?: string;
};

type SearchBody = {
  query?: unknown;
  year_range?: unknown;
  open_access_only?: unknown;
  limit?: unknown;
};

function parseYearRange(value: unknown): [number, number] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= MIN_YEAR && v <= MAX_YEAR)
  ) {
    throw new AppError(400, 'invalid_year_range', 'year_range must be [fromYear, toYear] with both years as integers');
  }
  const [from, to] = value as [number, number];
  if (from > to) throw new AppError(400, 'invalid_year_range', 'year_range must have from <= to');
  return [from, to];
}

function parseLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new AppError(400, 'invalid_limit', `limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  return value;
}

function parseOpenAccessOnly(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new AppError(400, 'invalid_open_access_only', 'open_access_only must be a boolean');
  return value;
}

function toSourceCandidate(sourceId: string, work: ExternalWorkRow): SourceCandidate {
  return {
    id: sourceId,
    title: work.title,
    authors: work.authors,
    year: work.publicationYear,
    venue: work.venue,
    oa_status: work.oaStatus,
  };
}

type Env = { Bindings: SourcesBindings; Variables: AuthVariables };

const sources = new Hono<Env>();
sources.use('*', authenticate, requireApproved);

sources.post('/search', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);

  const body = (await c.req.json().catch(() => ({}))) as SearchBody;
  const query = typeof body.query === 'string' && body.query.trim() ? body.query.trim() : project.title;
  const yearRange = parseYearRange(body.year_range);
  const openAccessOnly = parseOpenAccessOnly(body.open_access_only);
  const limit = parseLimit(body.limit);

  const result = await searchSources(
    { query, yearRange, openAccessOnly, limit },
    {
      SOURCES_PROVIDER_MODE: c.env.SOURCES_PROVIDER_MODE,
      SEMANTIC_SCHOLAR_API_KEY: c.env.SEMANTIC_SCHOLAR_API_KEY,
      CROSSREF_CONTACT_EMAIL: c.env.CROSSREF_CONTACT_EMAIL,
      UNPAYWALL_CONTACT_EMAIL: c.env.UNPAYWALL_CONTACT_EMAIL,
    },
  );

  if (result.providersUnreachable) {
    throw new AppError(502, 'sources_providers_unreachable', 'Source providers are currently unreachable. Please try again later.');
  }

  const candidates: SourceCandidate[] = [];
  for (const candidate of result.candidates) {
    const work = await upsertExternalWork(db, {
      doi: candidate.doi,
      semanticScholarId: candidate.semanticScholarId,
      title: candidate.title,
      authors: candidate.authors,
      abstract: candidate.abstract,
      publicationYear: candidate.year,
      venue: candidate.venue,
      oaStatus: candidate.oaStatus,
      oaUrl: candidate.oaUrl,
    });
    const projectSource = await findOrCreateProjectSource(db, { projectId: project.id, externalWorkId: work.id });
    candidates.push(toSourceCandidate(projectSource.id, work));
  }

  const response: SourceSearchResponse = { candidates, count: candidates.length };
  return c.json(response, 200);
});

export default sources;
