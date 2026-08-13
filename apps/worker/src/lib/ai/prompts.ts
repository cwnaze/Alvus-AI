import type { AnalysisInput, FeedbackInput, SuggestionInput } from './types';

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

// Structural pointers only, never prose to insert (CLAUDE.md: "never generating
// prose itself") -- a suggestion names a move ("open with a definition of X")
// rather than writing the sentence itself, and the frontend renders these as
// hints the user can act on, never as inserted text.
const SUGGESTION_SYSTEM_PROMPT = `You are helping a student get started writing the next part of their academic paper. Given the text immediately before their cursor, respond with strict JSON only, matching exactly this shape:
{"suggestions": string[]}
Provide 2-4 short suggestions (one sentence each) for how to start the next paragraph or structure the upcoming section -- e.g. "Open with a definition of the key term" or "Transition by contrasting this source with the previous paragraph's claim". Never write or suggest full sentences or paragraphs the user could paste directly into their paper -- only structural/starting-point guidance.`;

export function buildSuggestionPrompt(input: SuggestionInput): Array<{ role: 'system' | 'user'; content: string }> {
  const context = input.cursorContext.trim() || '(the document is currently empty)';
  return [
    { role: 'system', content: SUGGESTION_SYSTEM_PROMPT },
    { role: 'user', content: `Text immediately before the cursor:\n${context}` },
  ];
}

// Commentary only, same "never write or suggest prose" boundary as the other
// two prompts (CLAUDE.md) -- this is feedback on writing already done, not
// generation. "quote" must be copied verbatim so the route can locate it in
// the document and turn it into a position-anchored comment
// (lib/document/feedback-anchors.ts); a quote the route can't find is simply
// dropped, so the prompt asks for short, exact excerpts to maximize the odds
// of a match.
const FEEDBACK_SYSTEM_PROMPT = `You are a writing tutor giving a student comment-style feedback on a draft of their academic paper, after they have finished writing it. Respond with strict JSON only, matching exactly this shape:
{"comments": [{"category": "wording"|"phrasing"|"grammar"|"content", "text": string, "quote": string}]}
"category" is one of: "wording" (word choice), "phrasing" (sentence construction/flow), "grammar" (mechanical errors), or "content" (argument/evidence issues). "text" is the comment itself, explaining the issue and what to consider -- never a rewritten replacement sentence. "quote" is a short (a few words to one sentence) excerpt copied EXACTLY, character-for-character, from the draft below, identifying what the comment refers to. Provide 2-6 comments covering a mix of categories where the draft has issues to raise. Never write or suggest replacement prose for the student's paper -- only commentary on what is already there.`;

export function buildFeedbackPrompt(input: FeedbackInput): Array<{ role: 'system' | 'user'; content: string }> {
  const documentText = input.documentText.trim() || '(the document is currently empty)';
  return [
    { role: 'system', content: FEEDBACK_SYSTEM_PROMPT },
    { role: 'user', content: `Draft:\n${documentText}` },
  ];
}
