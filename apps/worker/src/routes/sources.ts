import type {
  KeyQuote,
  ProjectSource,
  ProjectSourcesResponse,
  SourceAnalysis,
  SourceCandidate,
  SourceSearchResponse,
  SourceStateResponse,
} from '@alvus-ai/shared';
import { Hono } from 'hono';
import { AiProviderError, AiUnreadableSourceError, requestSourceAnalysis, type AiEnv } from '../lib/ai';
import { formatCitation } from '../lib/citation';
import { createDb } from '../lib/db/client';
import {
  createUploadedProjectSource,
  deleteProjectSource,
  findOrCreateProjectSource,
  getProjectSourceById,
  listProjectSources,
  saveProjectSourceAnalysis,
  updateProjectSourceState,
  upsertExternalWork,
  type ExternalWorkRow,
  type ProjectSourceRow,
  type ProjectSourceState,
  type ProjectSourceWithWork,
} from '../lib/db/queries/sources';
import { EmptyExtractionError, extractTextFromFile, UnparseableFileError, type UploadMimeType } from '../lib/files';
import { assertWithinUsageLimit, recordUsage } from '../lib/metering';
import { searchSources } from '../lib/sources';
import { StorageError, uploadSourceFile } from '../lib/storage';
import { createSupabaseAdmin } from '../lib/supabase/client';
import { authenticate, requireApproved, type AuthBindings, type AuthVariables } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { loadOwnedProject } from './projects';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const MIN_YEAR = 1000;
const MAX_YEAR = 3000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// docs/api.md: "multipart/form-data: file (PDF/TXT ≤20MB), title?"
const MAX_UPLOAD_BYTES = 20_000_000;
const MAX_UPLOAD_TITLE_LENGTH = 200;
const MIME_BY_EXTENSION: Record<string, UploadMimeType> = { '.pdf': 'application/pdf', '.txt': 'text/plain' };

export type SourcesBindings = AuthBindings &
  AiEnv & {
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

function toNumber(value: string | null): number {
  return value === null ? 0 : Number(value);
}

function toKeyQuotes(row: ProjectSourceRow): KeyQuote[] {
  return row.keyQuotes.map((q) => ({ quote: q.quote, location: q.location, usage_suggestion: q.usage_suggestion }));
}

// `null` unless analysis has actually completed (`analyzedAt` set) -- absence
// distinguishes "not yet analyzed" from an analysis that happened to produce
// empty text.
function toSourceAnalysisResponse(row: ProjectSourceRow): SourceAnalysis | null {
  if (!row.analyzedAt || row.citationString === null) return null;
  const fullTextStatus = row.fullTextSource === 'open_access' || row.fullTextSource === 'uploaded' ? row.fullTextSource : 'abstract_only';
  return {
    citation: row.citationString,
    summary: { strengths: row.strengthsSummary ?? '', weaknesses: row.weaknessesSummary ?? '' },
    usefulness_score: toNumber(row.usefulnessScore),
    key_quotes: toKeyQuotes(row),
    full_text_status: fullTextStatus,
    analyzed_at: row.analyzedAt.toISOString(),
  };
}

// An uploaded file has no user-editable title field to speak of beyond what
// was given at upload time (docs/api.md's `title?` upload field) -- fall back
// to the original filename, stripped of its extension, rather than the
// generic "(untitled)" reserved for a row with neither.
function titleForUploadedFile(file: { title: string | null; originalFilename: string }): string {
  if (file.title) return file.title;
  const dot = file.originalFilename.lastIndexOf('.');
  return dot > 0 ? file.originalFilename.slice(0, dot) : file.originalFilename;
}

function toProjectSource(row: ProjectSourceWithWork): ProjectSource {
  return {
    id: row.id,
    title: row.work?.title ?? (row.uploadedFile ? titleForUploadedFile(row.uploadedFile) : '(untitled)'),
    authors: row.work?.authors ?? [],
    year: row.work?.publicationYear ?? null,
    venue: row.work?.venue ?? null,
    oa_status: row.work?.oaStatus ?? null,
    state: row.state,
    analysis: toSourceAnalysisResponse(row),
  };
}

type Env = { Bindings: SourcesBindings; Variables: AuthVariables };

const sources = new Hono<Env>();
sources.use('*', authenticate, requireApproved);

async function loadProjectSource(
  db: ReturnType<typeof createDb>,
  projectId: string,
  sourceId: string | undefined,
): Promise<ProjectSourceWithWork> {
  if (!sourceId || !UUID_RE.test(sourceId)) throw new AppError(404, 'source_not_found', 'No such source');
  const source = await getProjectSourceById(db, { id: sourceId, projectId });
  if (!source) throw new AppError(404, 'source_not_found', 'No such source');
  return source;
}

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
    // A previously rejected candidate stays dismissed across re-searches
    // (docs/api.md: "not re-suggested on later search") -- findOrCreateProjectSource
    // returns the existing row as-is, so this is the one place that has to
    // filter it. A `selected` source is already in the bibliography, shown
    // below with its own "Remove from bibliography" action, so it's excluded
    // here for the same reason -- it's already decided, not a fresh candidate.
    if (projectSource.state === 'rejected' || projectSource.state === 'selected') continue;
    candidates.push(toSourceCandidate(projectSource.id, work));
  }

  const response: SourceSearchResponse = { candidates, count: candidates.length };
  return c.json(response, 200);
});

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Unlike discovery (candidate -> explicit analyze -> explicit select, three
// separate calls), an upload is one request: parse -> analyze -> store ->
// select (docs/api.md: "select/upload promotes to selected", "analysis runs
// synchronously"). Validation cheapest-first: request shape, then file
// type/size (free), then text extraction (local compute), then the metered
// AI call, then Storage -- so a bad upload never burns quota or a Storage
// write.
sources.post('/upload', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);

  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    throw new AppError(400, 'invalid_upload', 'Expected a multipart/form-data request with a file field');
  }

  let form: Awaited<ReturnType<typeof c.req.parseBody>>;
  try {
    form = await c.req.parseBody();
  } catch {
    throw new AppError(400, 'invalid_upload', 'Could not parse the upload request');
  }

  const file = form.file;
  if (!(file instanceof File) || !file.name) {
    throw new AppError(400, 'missing_file', 'A file is required');
  }
  if (file.size === 0) {
    throw new AppError(400, 'empty_file', 'The uploaded file is empty');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AppError(413, 'file_too_large', 'Files must be 20MB or smaller');
  }

  const requestedTitle = typeof form.title === 'string' && form.title.trim() ? form.title.trim().slice(0, MAX_UPLOAD_TITLE_LENGTH) : null;

  // Check MIME **and** extension, not either alone (docs/security.md).
  const mimeType = MIME_BY_EXTENSION[extensionOf(file.name)];
  if (!mimeType || file.type !== mimeType) {
    throw new AppError(415, 'unsupported_file_type', 'Only PDF and TXT files are supported');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new AppError(413, 'file_too_large', 'Files must be 20MB or smaller');
  }

  let extractedText: string;
  try {
    extractedText = await extractTextFromFile(bytes, mimeType);
  } catch (err) {
    if (err instanceof EmptyExtractionError || err instanceof UnparseableFileError) {
      throw new AppError(422, 'unreadable_upload', err.message);
    }
    throw err;
  }

  const now = new Date();
  await assertWithinUsageLimit(db, { userId: authUser.id, actionType: 'source_analysis', now });

  const effectiveTitle = requestedTitle ?? titleForUploadedFile({ title: null, originalFilename: file.name });

  let result;
  try {
    result = await requestSourceAnalysis(
      { title: effectiveTitle, authors: [], abstract: extractedText },
      {
        AI_PROVIDER_MODE: c.env.AI_PROVIDER_MODE,
        LITELLM_BASE_URL: c.env.LITELLM_BASE_URL,
        LITELLM_API_KEY: c.env.LITELLM_API_KEY,
        LITELLM_MODEL: c.env.LITELLM_MODEL,
      },
    );
  } catch (err) {
    if (err instanceof AiUnreadableSourceError) throw new AppError(422, 'unreadable_upload', err.message);
    if (err instanceof AiProviderError) {
      throw new AppError(502, 'ai_provider_unreachable', 'The analysis service is currently unreachable. Please try again later.');
    }
    throw err;
  }

  const citation = formatCitation(project.citationFormat, { authors: [], title: effectiveTitle, year: null, venue: null });
  const checksum = await sha256Hex(bytes);
  const storagePath = `${authUser.id}/${project.id}/${crypto.randomUUID()}${extensionOf(file.name)}`;

  const supabase = createSupabaseAdmin(c.env.SUPABASE_URL, c.env.SUPABASE_SECRET_KEY);
  try {
    await uploadSourceFile(supabase, { path: storagePath, data: bytes, contentType: mimeType });
  } catch (err) {
    if (err instanceof StorageError) {
      throw new AppError(502, 'storage_unreachable', 'Could not store the uploaded file. Please try again.');
    }
    throw err;
  }

  const created = await createUploadedProjectSource(db, {
    projectId: project.id,
    ownerId: authUser.id,
    title: requestedTitle,
    storagePath,
    originalFilename: file.name,
    mimeType,
    fileSizeBytes: bytes.byteLength,
    checksumSha256: checksum,
    citationString: citation,
    strengthsSummary: result.analysis.strengths,
    weaknessesSummary: result.analysis.weaknesses,
    usefulnessScore: result.analysis.usefulnessScore,
    keyQuotes: result.analysis.keyQuotes.map((q) => ({ quote: q.quote, location: q.location, usage_suggestion: q.usageSuggestion })),
    now,
  });

  // Recorded only after a successful analysis, same as /analyze -- see that
  // route's comment.
  await recordUsage(db, {
    userId: authUser.id,
    projectId: project.id,
    actionType: 'source_analysis',
    now,
    tokenCostInput: result.tokenUsage.inputTokens,
    tokenCostOutput: result.tokenUsage.outputTokens,
  });

  return c.json(toProjectSource(created), 201);
});

sources.get('/', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);

  const status = c.req.query('status');
  if (status !== undefined && status !== 'candidate' && status !== 'selected') {
    throw new AppError(400, 'invalid_status', 'status must be "candidate" or "selected"');
  }

  const rows = await listProjectSources(db, { projectId: project.id, state: status as ProjectSourceState | undefined });
  const response: ProjectSourcesResponse = { sources: rows.map(toProjectSource) };
  return c.json(response, 200);
});

sources.get('/:sourceId', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);
  const source = await loadProjectSource(db, project.id, c.req.param('sourceId'));
  return c.json(toProjectSource(source), 200);
});

sources.get('/:sourceId/analysis', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);
  const source = await loadProjectSource(db, project.id, c.req.param('sourceId'));

  const analysis = toSourceAnalysisResponse(source);
  if (!analysis) throw new AppError(404, 'not_yet_analyzed', 'This source has not been analyzed yet');
  return c.json(analysis, 200);
});

sources.post('/:sourceId/analyze', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);
  const source = await loadProjectSource(db, project.id, c.req.param('sourceId'));

  const body = (await c.req.json().catch(() => ({}))) as { force_refresh?: unknown };
  const forceRefresh = body.force_refresh === true;

  if (!forceRefresh) {
    const cached = toSourceAnalysisResponse(source);
    if (cached) return c.json(cached, 200);
  }

  // Every project_source produced today is `origin: 'discovered'`, which the
  // DB check constraint guarantees has an external_work_id -- `work` should
  // never be null here. Guard anyway rather than assume, since a future
  // `uploaded` origin (US-017) would hit this same path without one.
  if (!source.work) throw new AppError(422, 'unreadable_source', 'This source has no analyzable content');
  const work = source.work;

  const now = new Date();
  await assertWithinUsageLimit(db, { userId: authUser.id, actionType: 'source_analysis', now });

  let result;
  try {
    result = await requestSourceAnalysis(
      { title: work.title, authors: work.authors, abstract: work.abstract },
      {
        AI_PROVIDER_MODE: c.env.AI_PROVIDER_MODE,
        LITELLM_BASE_URL: c.env.LITELLM_BASE_URL,
        LITELLM_API_KEY: c.env.LITELLM_API_KEY,
        LITELLM_MODEL: c.env.LITELLM_MODEL,
      },
    );
  } catch (err) {
    if (err instanceof AiUnreadableSourceError) throw new AppError(422, 'unreadable_source', err.message);
    if (err instanceof AiProviderError) {
      throw new AppError(502, 'ai_provider_unreachable', 'The analysis service is currently unreachable. Please try again later.');
    }
    throw err;
  }

  // No full-text fetch/extraction pipeline exists yet (nothing populates
  // `external_works.full_text_storage_path` -- see that schema file's
  // comment); "fetching full text where legally available" for a discovered
  // source is therefore approximated by whether Unpaywall resolved an OA
  // link, and the model is given the abstract either way. Real content
  // extraction lands with US-017's upload story, which needs a PDF parser
  // regardless.
  const fullTextSource: 'open_access' | 'abstract_only' = work.oaUrl ? 'open_access' : 'abstract_only';

  const citation = formatCitation(project.citationFormat, {
    authors: work.authors,
    title: work.title,
    year: work.publicationYear,
    venue: work.venue,
  });

  const updated = await saveProjectSourceAnalysis(db, {
    id: source.id,
    citationString: citation,
    strengthsSummary: result.analysis.strengths,
    weaknessesSummary: result.analysis.weaknesses,
    usefulnessScore: result.analysis.usefulnessScore,
    keyQuotes: result.analysis.keyQuotes.map((q) => ({ quote: q.quote, location: q.location, usage_suggestion: q.usageSuggestion })),
    fullTextAvailable: fullTextSource === 'open_access',
    fullTextSource,
    analyzedAt: now,
  });

  // Recorded only after a successful analysis (docs/tdd.md Flow 1 step 6c) --
  // a failed AI call above never reaches here, so it never counts against quota.
  await recordUsage(db, {
    userId: authUser.id,
    projectId: project.id,
    actionType: 'source_analysis',
    now,
    tokenCostInput: result.tokenUsage.inputTokens,
    tokenCostOutput: result.tokenUsage.outputTokens,
  });

  const response = toSourceAnalysisResponse(updated);
  if (!response) throw new Error('analyze: saved analysis did not round-trip into a response');
  return c.json(response, 200);
});

sources.post('/:sourceId/select', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);
  const source = await loadProjectSource(db, project.id, c.req.param('sourceId'));

  // Bibliography membership must not silently depend on a prior /analyze call
  // (docs/tdd.md Flow 1 step 7 treats it as a derived view over `selected`
  // sources with no separate authoring step). Citation fields for a
  // discovered source already come from external_works metadata rather than
  // the LLM, so compute the citation here too instead of leaving
  // `citationString` null -- and therefore invisible from the bibliography --
  // until analysis happens to have run first.
  const citationString =
    source.citationString ??
    (source.work
      ? formatCitation(project.citationFormat, {
          authors: source.work.authors,
          title: source.work.title,
          year: source.work.publicationYear,
          venue: source.work.venue,
        })
      : undefined);

  const updated = await updateProjectSourceState(db, { id: source.id, state: 'selected', selectedAt: new Date(), citationString });
  const response: SourceStateResponse = { state: updated.state };
  return c.json(response, 200);
});

sources.post('/:sourceId/deselect', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);
  const source = await loadProjectSource(db, project.id, c.req.param('sourceId'));

  if (source.state !== 'selected') {
    throw new AppError(409, 'not_selected', 'This source is not currently selected');
  }
  const updated = await updateProjectSourceState(db, { id: source.id, state: 'candidate', selectedAt: null });
  const response: SourceStateResponse = { state: updated.state };
  return c.json(response, 200);
});

sources.post('/:sourceId/reject', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);
  const source = await loadProjectSource(db, project.id, c.req.param('sourceId'));

  if (source.state === 'selected') {
    throw new AppError(409, 'already_selected', 'Deselect this source before rejecting it');
  }
  const updated = await updateProjectSourceState(db, { id: source.id, state: 'rejected', selectedAt: source.selectedAt });
  const response: SourceStateResponse = { state: updated.state };
  return c.json(response, 200);
});

sources.delete('/:sourceId', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const project = await loadOwnedProject(db, c.req.param('projectId') ?? '', authUser.id);
  const source = await loadProjectSource(db, project.id, c.req.param('sourceId'));

  if (source.state !== 'selected') {
    throw new AppError(409, 'delete_requires_selected', 'Reject a candidate instead of deleting it');
  }
  await deleteProjectSource(db, { id: source.id });
  return c.body(null, 204);
});

export default sources;
