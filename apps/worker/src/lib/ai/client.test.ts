import { beforeEach, describe, expect, it, vi } from 'vitest';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

const { requestSourceAnalysis } = await import('./client');
const { AiProviderError, AiUnreadableSourceError } = await import('./types');

const INPUT = { title: 'Climate Policy Rhetoric in the 21st Century', authors: ['Jane Doe'], abstract: 'An abstract.' };
const LIVE_ENV = { AI_PROVIDER_MODE: 'live', LITELLM_BASE_URL: 'https://litellm.test', LITELLM_API_KEY: 'key', LITELLM_MODEL: 'model' };

function chatResponse(content: string, usage?: { prompt_tokens: number; completion_tokens: number }) {
  return { choices: [{ message: { content } }], usage };
}

describe('requestSourceAnalysis (fixture mode)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the normalized normal fixture with no token usage', async () => {
    const result = await requestSourceAnalysis(INPUT, {});
    expect(result.tokenUsage).toEqual({ inputTokens: null, outputTokens: null });
    expect(result.analysis.strengths).toBeTruthy();
    expect(result.analysis.weaknesses).toBeTruthy();
    expect(result.analysis.usefulnessScore).toBeGreaterThan(0);
    expect(result.analysis.keyQuotes.length).toBeGreaterThan(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('throws AiProviderError for a title matching the zzz-ai-error marker', async () => {
    await expect(requestSourceAnalysis({ ...INPUT, title: 'zzz-ai-error paper' }, {})).rejects.toBeInstanceOf(AiProviderError);
  });

  it('throws AiUnreadableSourceError for a title matching the zzz-ai-unreadable marker', async () => {
    await expect(requestSourceAnalysis({ ...INPUT, title: 'zzz-ai-unreadable paper' }, {})).rejects.toBeInstanceOf(
      AiUnreadableSourceError,
    );
  });
});

describe('requestSourceAnalysis (live mode)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws AiProviderError when the proxy is not configured', async () => {
    await expect(requestSourceAnalysis(INPUT, { AI_PROVIDER_MODE: 'live' })).rejects.toBeInstanceOf(AiProviderError);
    expect(create).not.toHaveBeenCalled();
  });

  it('parses a valid JSON response and reports token usage', async () => {
    create.mockResolvedValueOnce(
      chatResponse(
        JSON.stringify({
          strengths: 'Strong methodology.',
          weaknesses: 'Small sample.',
          usefulness_score: 8,
          key_quotes: [{ quote: 'A quote.', location: 'p. 3', usage_suggestion: 'Support the thesis.' }],
        }),
        { prompt_tokens: 120, completion_tokens: 40 },
      ),
    );

    const result = await requestSourceAnalysis(INPUT, LIVE_ENV);
    expect(result.analysis).toEqual({
      strengths: 'Strong methodology.',
      weaknesses: 'Small sample.',
      usefulnessScore: 8,
      keyQuotes: [{ quote: 'A quote.', location: 'p. 3', usageSuggestion: 'Support the thesis.' }],
    });
    expect(result.tokenUsage).toEqual({ inputTokens: 120, outputTokens: 40 });
  });

  it('clamps an out-of-range usefulness_score into 0-10', async () => {
    create.mockResolvedValueOnce(chatResponse(JSON.stringify({ strengths: 'x', weaknesses: 'y', usefulness_score: 42, key_quotes: [] })));
    const result = await requestSourceAnalysis(INPUT, LIVE_ENV);
    expect(result.analysis.usefulnessScore).toBe(10);
  });

  it('throws AiUnreadableSourceError on malformed JSON', async () => {
    create.mockResolvedValueOnce(chatResponse('not json'));
    await expect(requestSourceAnalysis(INPUT, LIVE_ENV)).rejects.toBeInstanceOf(AiUnreadableSourceError);
  });

  it('throws AiUnreadableSourceError on an empty response', async () => {
    create.mockResolvedValueOnce({ choices: [{ message: { content: null } }] });
    await expect(requestSourceAnalysis(INPUT, LIVE_ENV)).rejects.toBeInstanceOf(AiUnreadableSourceError);
  });

  it('throws AiUnreadableSourceError when the response has no analyzable content', async () => {
    create.mockResolvedValueOnce(chatResponse(JSON.stringify({ strengths: '', weaknesses: '', usefulness_score: 0, key_quotes: [] })));
    await expect(requestSourceAnalysis(INPUT, LIVE_ENV)).rejects.toBeInstanceOf(AiUnreadableSourceError);
  });

  it('throws AiProviderError when the LiteLLM call itself fails', async () => {
    create.mockRejectedValueOnce(new Error('network error'));
    await expect(requestSourceAnalysis(INPUT, LIVE_ENV)).rejects.toBeInstanceOf(AiProviderError);
  });
});
