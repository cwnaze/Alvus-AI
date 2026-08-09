import semanticScholarNormal from '../../../../../tests/fixtures/semantic-scholar/normal.json';
import semanticScholarEmpty from '../../../../../tests/fixtures/semantic-scholar/empty.json';
import semanticScholarError from '../../../../../tests/fixtures/semantic-scholar/error.json';
import crossrefNormal from '../../../../../tests/fixtures/crossref/normal.json';
import crossrefEmpty from '../../../../../tests/fixtures/crossref/empty.json';
import crossrefError from '../../../../../tests/fixtures/crossref/error.json';
import unpaywallOa from '../../../../../tests/fixtures/unpaywall/oa.json';
import type { SourcesEnv } from './types';

// Determinism boundary: nothing in the PR-gating suite may make a real call
// to Semantic Scholar/CrossRef/Unpaywall (see docs/testing.md). This project's
// CI and production Worker both materialize `.env` from the same repo-secret
// store (see .github/scripts/write-env.mjs), so an env var's mere presence
// can't distinguish "test" from "prod" the way it might elsewhere -- instead
// live calls require explicitly opting in with SOURCES_PROVIDER_MODE=live,
// which defaults to unset (fixture mode) everywhere until a human sets it.
export function isLiveMode(env: SourcesEnv): boolean {
  return env.SOURCES_PROVIDER_MODE === 'live';
}

// Fixture set selection matched by request shape -- the query text itself --
// per docs/testing.md's "recorded fixture sets (normal results, empty
// results, error/rate-limited)".
export type FixtureKind = 'normal' | 'empty' | 'error';

export function fixtureKindForQuery(query: string): FixtureKind {
  const q = query.toLowerCase();
  if (q.includes('zzz-error')) return 'error';
  if (q.includes('zzz-empty')) return 'empty';
  return 'normal';
}

export function semanticScholarFixture(kind: FixtureKind) {
  return { normal: semanticScholarNormal, empty: semanticScholarEmpty, error: semanticScholarError }[kind];
}

export function crossrefFixture(kind: FixtureKind) {
  return { normal: crossrefNormal, empty: crossrefEmpty, error: crossrefError }[kind];
}

export function unpaywallFixture() {
  return unpaywallOa;
}
