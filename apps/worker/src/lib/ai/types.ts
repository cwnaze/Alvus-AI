export type AiEnv = {
  LITELLM_BASE_URL?: string;
  LITELLM_API_KEY?: string;
  LITELLM_MODEL?: string;
  AI_PROVIDER_MODE?: string;
};

export type KeyQuote = {
  quote: string;
  location: string;
  usageSuggestion: string;
};

export type SourceAnalysis = {
  strengths: string;
  weaknesses: string;
  usefulnessScore: number;
  keyQuotes: KeyQuote[];
};

export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export type AnalysisInput = {
  title: string;
  authors: string[];
  abstract: string | null;
};

export type SuggestionInput = {
  cursorContext: string;
};

// Thrown when the LiteLLM proxy itself is unreachable/erroring -- maps to the
// route's 502 (docs/api.md: "Upstream provider down -> always 502").
export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderError';
  }
}

// Thrown when the model's response can't be turned into a usable analysis
// (empty/malformed JSON, no analyzable content) -- maps to the route's
// 422 unreadable_source, distinct from a provider outage.
export class AiUnreadableSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnreadableSourceError';
  }
}
