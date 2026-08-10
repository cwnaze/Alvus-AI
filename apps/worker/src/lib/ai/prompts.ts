import type { AnalysisInput } from './types';

// Commentary only, never prose generation (see CLAUDE.md: "never generating
// prose itself"), and strict-JSON so the response can be parsed without a
// second round trip.
const SYSTEM_PROMPT = `You are an academic research assistant helping a student evaluate a candidate source for their paper. Analyze the given source and respond with strict JSON only, matching exactly this shape:
{"strengths": string, "weaknesses": string, "usefulness_score": number (0-10), "key_quotes": [{"quote": string, "location": string, "usage_suggestion": string}]}
"strengths" and "weaknesses" are short prose summaries of the source's argument, evidence, and credibility. "usefulness_score" rates how useful this source is likely to be for an academic paper on this topic, from 0 (not useful) to 10 (highly useful). "key_quotes" are 1-3 short, verbatim quotes from the provided content, each with where it appears and a suggestion for how it could be used. Never write or suggest prose for the user's own paper -- only commentary on the source.`;

export function buildAnalysisPrompt(input: AnalysisInput): Array<{ role: 'system' | 'user'; content: string }> {
  const content = input.abstract?.trim() || '(no abstract or full text is available for this source)';
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Title: ${input.title}\nAuthors: ${input.authors.length ? input.authors.join(', ') : 'Unknown'}\n\nContent:\n${content}`,
    },
  ];
}
