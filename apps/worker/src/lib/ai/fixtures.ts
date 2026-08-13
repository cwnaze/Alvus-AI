import normalAnalysis from '../../../../../tests/fixtures/litellm/normal.json';
import normalSuggestions from '../../../../../tests/fixtures/litellm/suggestions.json';
import type { AiEnv } from './types';

// Same determinism boundary as lib/sources/fixtures.ts: nothing in the
// PR-gating suite may make a real call to the LiteLLM proxy (docs/testing.md).
// Live calls require explicitly opting in with AI_PROVIDER_MODE=live.
export function isLiveMode(env: AiEnv): boolean {
  return env.AI_PROVIDER_MODE === 'live';
}

export type FixtureKind = 'normal' | 'error' | 'unreadable';

// Matched by request shape (title + abstract), same pattern as
// fixtureKindForQuery -- a magic substring in the source's own metadata
// selects the fixture, so a demo spec can deterministically exercise the
// 502/422 paths without a live provider.
export function fixtureKindForSource(text: string): FixtureKind {
  const t = text.toLowerCase();
  if (t.includes('zzz-ai-error')) return 'error';
  if (t.includes('zzz-ai-unreadable')) return 'unreadable';
  return 'normal';
}

export function analysisFixture(): unknown {
  return normalAnalysis;
}

// Suggestions have no "unreadable" state (docs/api.md lists only 429/502 for
// this endpoint, no 422) -- just normal vs. a provider outage.
export type SuggestionFixtureKind = 'normal' | 'error';

export function fixtureKindForSuggestion(text: string): SuggestionFixtureKind {
  return text.toLowerCase().includes('zzz-ai-error') ? 'error' : 'normal';
}

export function suggestionsFixture(): unknown {
  return normalSuggestions;
}
