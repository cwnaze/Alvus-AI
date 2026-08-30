import { fetchWithRetry } from '../net/fetch-with-retry';
import { isLiveMode, unpaywallFixture } from './fixtures';
import type { OaStatus, SourcesEnv } from './types';

const API_BASE = 'https://api.unpaywall.org/v2';

type UnpaywallResponse = {
  is_oa?: boolean;
  oa_status?: OaStatus;
  best_oa_location?: { url?: string } | null;
};

export type OaInfo = { status: OaStatus; url: string | null } | null;

// Resolves OA status for a single DOI. Best-effort: a failure here should
// never fail the whole search (the candidate just keeps `oa_status: null`),
// so this returns `null` rather than throwing on any error path.
export async function resolveOaStatus(doi: string, env: SourcesEnv): Promise<OaInfo> {
  if (!isLiveMode(env)) {
    const fixture = unpaywallFixture();
    if (!fixture.is_oa || !fixture.oa_status) return null;
    return { status: fixture.oa_status as OaStatus, url: fixture.best_oa_location?.url ?? null };
  }

  const url = new URL(`${API_BASE}/${encodeURIComponent(doi)}`);
  if (env.UNPAYWALL_CONTACT_EMAIL) url.searchParams.set('email', env.UNPAYWALL_CONTACT_EMAIL);

  try {
    // Shorter timeout/retry budget than search: this runs once per
    // DOI-bearing candidate (lib/sources/index.ts maps over the merged
    // list), so a slow provider here shouldn't multiply into a long tail
    // across a whole search response.
    const res = await fetchWithRetry(url, {}, { timeoutMs: 4000, maxRetries: 1 });
    if (!res.ok) return null;
    const body = (await res.json()) as UnpaywallResponse;
    if (!body.is_oa || !body.oa_status) return null;
    return { status: body.oa_status, url: body.best_oa_location?.url ?? null };
  } catch {
    return null;
  }
}
