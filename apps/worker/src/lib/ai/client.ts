import OpenAI from 'openai';
import { analysisFixture, fixtureKindForSource, fixtureKindForSuggestion, isLiveMode, suggestionsFixture } from './fixtures';
import { buildAnalysisPrompt, buildSuggestionPrompt } from './prompts';
import {
  AiProviderError,
  AiUnreadableSourceError,
  type AiEnv,
  type AnalysisInput,
  type SourceAnalysis,
  type SuggestionInput,
  type TokenUsage,
} from './types';

const MAX_SCORE = 10;
const MIN_SCORE = 0;

function normalizeAnalysis(raw: unknown): SourceAnalysis {
  if (!raw || typeof raw !== 'object') throw new AiUnreadableSourceError('Analysis response was not valid JSON');
  const r = raw as Record<string, unknown>;

  const strengths = typeof r.strengths === 'string' ? r.strengths.trim() : '';
  const weaknesses = typeof r.weaknesses === 'string' ? r.weaknesses.trim() : '';
  const rawScore = typeof r.usefulness_score === 'number' && Number.isFinite(r.usefulness_score) ? r.usefulness_score : null;
  const usefulnessScore = rawScore === null ? 0 : Math.min(MAX_SCORE, Math.max(MIN_SCORE, rawScore));

  const rawQuotes = Array.isArray(r.key_quotes) ? r.key_quotes : [];
  const keyQuotes = rawQuotes
    .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object')
    .map((q) => ({
      quote: typeof q.quote === 'string' ? q.quote.trim() : '',
      location: typeof q.location === 'string' ? q.location.trim() : '',
      usageSuggestion: typeof q.usage_suggestion === 'string' ? q.usage_suggestion.trim() : '',
    }))
    .filter((q) => q.quote.length > 0);

  if (!strengths && !weaknesses && keyQuotes.length === 0) {
    throw new AiUnreadableSourceError('Analysis produced no usable content for this source');
  }

  return { strengths, weaknesses, usefulnessScore, keyQuotes };
}

// Only this module calls the LiteLLM proxy (docs/tdd.md's "Only lib/ai calls
// the LiteLLM proxy"). Fixture-mode short-circuits before any client
// construction so a missing LITELLM_* env var never breaks the PR-gating
// suite (see docs/testing.md).
export async function requestSourceAnalysis(
  input: AnalysisInput,
  env: AiEnv,
): Promise<{ analysis: SourceAnalysis; tokenUsage: TokenUsage }> {
  if (!isLiveMode(env)) {
    const kind = fixtureKindForSource(`${input.title} ${input.abstract ?? ''}`);
    if (kind === 'error') throw new AiProviderError('LiteLLM proxy is unreachable');
    if (kind === 'unreadable') throw new AiUnreadableSourceError('Source content could not be analyzed');
    return { analysis: normalizeAnalysis(analysisFixture()), tokenUsage: { inputTokens: null, outputTokens: null } };
  }

  if (!env.LITELLM_BASE_URL || !env.LITELLM_API_KEY || !env.LITELLM_MODEL) {
    throw new AiProviderError('LiteLLM proxy is not configured');
  }

  const client = new OpenAI({ baseURL: env.LITELLM_BASE_URL, apiKey: env.LITELLM_API_KEY });

  let content: string | null | undefined;
  try {
    const completion = await client.chat.completions.create({
      model: env.LITELLM_MODEL,
      messages: buildAnalysisPrompt(input),
      response_format: { type: 'json_object' },
    });
    content = completion.choices[0]?.message.content;
    if (!content) throw new AiUnreadableSourceError('The analysis model returned an empty response');

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new AiUnreadableSourceError('The analysis model returned malformed JSON');
    }

    return {
      analysis: normalizeAnalysis(parsed),
      tokenUsage: {
        inputTokens: completion.usage?.prompt_tokens ?? null,
        outputTokens: completion.usage?.completion_tokens ?? null,
      },
    };
  } catch (err) {
    if (err instanceof AiUnreadableSourceError) throw err;
    throw new AiProviderError(err instanceof Error ? err.message : 'LiteLLM request failed');
  }
}

const MAX_SUGGESTIONS = 4;

function normalizeSuggestions(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') throw new AiProviderError('Suggestion response was not valid JSON');
  const r = raw as Record<string, unknown>;
  const rawSuggestions = Array.isArray(r.suggestions) ? r.suggestions : [];
  const suggestions = rawSuggestions
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, MAX_SUGGESTIONS);
  if (suggestions.length === 0) throw new AiProviderError('Suggestion response contained no usable suggestions');
  return suggestions;
}

// docs/api.md's suggestions endpoint has no 422 -- unlike source analysis, a
// malformed/empty model response here is treated the same as a provider
// outage (502), not a distinct semantic-failure code.
export async function requestParagraphSuggestions(input: SuggestionInput, env: AiEnv): Promise<{ suggestions: string[] }> {
  if (!isLiveMode(env)) {
    const kind = fixtureKindForSuggestion(input.cursorContext);
    if (kind === 'error') throw new AiProviderError('LiteLLM proxy is unreachable');
    return { suggestions: normalizeSuggestions(suggestionsFixture()) };
  }

  if (!env.LITELLM_BASE_URL || !env.LITELLM_API_KEY || !env.LITELLM_MODEL) {
    throw new AiProviderError('LiteLLM proxy is not configured');
  }

  const client = new OpenAI({ baseURL: env.LITELLM_BASE_URL, apiKey: env.LITELLM_API_KEY });

  try {
    const completion = await client.chat.completions.create({
      model: env.LITELLM_MODEL,
      messages: buildSuggestionPrompt(input),
      response_format: { type: 'json_object' },
    });
    const content = completion.choices[0]?.message.content;
    if (!content) throw new AiProviderError('The suggestion model returned an empty response');

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new AiProviderError('The suggestion model returned malformed JSON');
    }

    return { suggestions: normalizeSuggestions(parsed) };
  } catch (err) {
    if (err instanceof AiProviderError) throw err;
    throw new AiProviderError(err instanceof Error ? err.message : 'LiteLLM request failed');
  }
}
