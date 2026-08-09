#!/usr/bin/env node
/**
 * Shared "was this a Claude quota/rate-limit death" detector.
 *
 * Two callers need the same answer from two different vantage points:
 *   - watchdog.mjs, after the fact, grepping `gh run view --log-failed` for a
 *     completed run.
 *   - pr-review.yml's verdict-application step, in the same job the Claude
 *     step just failed in, grepping the action's own `execution_file`.
 *
 * The execution file is the better source when it's available: the action's
 * console output is deliberately sanitized (base-action/src/run-claude-sdk.ts
 * suppresses every message except system-init and a stripped result summary,
 * to keep full review text out of CI logs), so a run that failed on a quota
 * error can complete with is_error:true and *nothing* quota-shaped anywhere
 * in the visible log — confirmed on PR #34 (2026-08-09): the log held exactly
 * `{type,subtype,is_error,duration_ms,num_turns,total_cost_usd,
 * permission_denials_count}` and nothing else between system-init and result.
 * The execution file holds the raw, unsanitized SDK message stream, and the
 * result message's own `result`/`errors` text within it is the only place
 * the real reason survives — see extractResultText below for why the file's
 * CLI mode narrows to just that message rather than matching the whole
 * stream. Same regexes either way; only the text they run against differs.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Each pattern must be specific enough to survive a long log of timestamps,
// SHAs and byte counts. A bare /429/ is not: it matched `12:28:51.5255429Z` on
// a max-turns failure and reported a five-hour quota outage that was never
// happening, which suppressed every dispatch the watchdog exists to make.
// Anchor numbers to the words around them, and prefer the provider's own
// error identifiers.
export const QUOTA_SIGNALS = [
  /usage limit reached/i,
  /quota exceeded/i,
  /rate_limit_error/i,
  /rate limit exceeded/i,
  /\b429\s+too many requests/i,
  /\b(?:status|statuscode|http)\b[^\n]{0,16}\b429\b/i,
];

// Deaths that are definitively not quota, checked first because a long log
// otherwise offers incidental digits to match against.
export const NON_QUOTA_SIGNALS = [/error_max_turns|Reached maximum number of turns/i];

/** @returns {RegExp|null} the first quota-shaped pattern found in `text`, or null. */
export function findQuotaSignal(text) {
  if (NON_QUOTA_SIGNALS.some((re) => re.test(text))) return null;
  return QUOTA_SIGNALS.find((re) => re.test(text)) ?? null;
}

/**
 * Given text that matched a quota signal, work out when the window reopens.
 * Claude reports its own reset time when it knows it ("limit will reset at
 * 3pm", or an epoch, or the CLI's own `reached|<epoch>` shorthand). Prefer
 * that over guessing at the window length.
 *
 * @param {string} text
 * @param {Date} since fallback anchor if no reset time is found in `text`
 * @param {number} windowHours fallback window length in hours
 */
export function extractResetTime(text, since, windowHours) {
  const epoch = text.match(/reset[^\n]*?(\d{10,13})/i) ?? text.match(/reached\|(\d{10,13})/i);
  if (epoch) {
    const ms = Number(epoch[1]);
    return new Date(ms < 1e12 ? ms * 1000 : ms);
  }
  const iso = text.match(/reset[^\n]*?(\d{4}-\d{2}-\d{2}T[\d:]+(?:\.\d+)?Z?)/i);
  if (iso) return new Date(iso[1]);

  return new Date(since.getTime() + windowHours * 3600_000);
}

/**
 * @param {string} text
 * @param {Date} since fallback anchor for extractResetTime
 * @param {number} windowHours fallback window length in hours
 * @returns {Date|null} when quota is expected back, or null if `text` shows no quota signal
 */
export function checkQuotaText(text, since, windowHours) {
  const hit = findQuotaSignal(text);
  if (!hit) return null;
  return extractResetTime(text, since, windowHours);
}

/**
 * Machine-readable marker for the reset time computed when a PR is labeled
 * `quota-blocked`, embedded in the comment pr-review.yml posts alongside the label.
 *
 * A label's `--description` is a repository-wide property of the label itself, not
 * per-issue, so it can't carry a per-PR timestamp — two PRs quota-blocked minutes
 * apart would stomp each other's reset time. A PR comment is per-PR, so
 * watchdog.mjs's recoverQuotaBlockedPrs() reads this marker back to gate its retry
 * on the exact window pr-review.yml computed, rather than re-deriving "still
 * blocked" through rateLimitedUntil()'s log scrape — which is structurally blind to
 * this signal (see the module docstring above).
 */
export function formatQuotaUntilMarker(until) {
  return `<!-- quota-until:${until.toISOString()} -->`;
}

/** @returns {Date|null} the reset time in `text`'s marker, or null if absent/invalid. */
export function parseQuotaUntilMarker(text) {
  const m = typeof text === 'string' ? text.match(/<!-- quota-until:(\S+) -->/) : null;
  if (!m) return null;
  const d = new Date(m[1]);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Narrow a raw execution_file down to the only text in it that's safe to run
 * a quota check against.
 *
 * The execution file is `JSON.stringify(messages, null, 2)` of the *entire*
 * unsanitized SDK message stream — every tool_use/tool_result verbatim,
 * including full file reads and `gh pr diff` output. Running findQuotaSignal
 * over that whole blob means the run's own tool calls can plant a false
 * match: this very script's QUOTA_SIGNALS regex literals are themselves
 * quota-shaped text, so a run that reads this file (any review of a PR that
 * touches it, this PR's own review included) embeds those exact strings into
 * the execution file regardless of what actually happened. Same for a
 * `gh pr diff` of a PR whose diff quotes them.
 *
 * The only structurally trustworthy text is the terminal `result`-type
 * message's own `result` (success) / `errors` (error) fields — that's the
 * SDK's own account of why the run ended, per SDKResultMessage in
 * @anthropic-ai/claude-agent-sdk. Anything else in the stream is the run's
 * *activity*, not its *outcome*.
 *
 * @param {string} json raw contents of the execution file
 * @returns {string} text to run quota checks against; empty string if the
 *   file isn't parseable JSON or holds no result message (treated as "no
 *   signal", not a match — a missed real quota hit falls back to
 *   needs-human, which is the safe direction to fail in)
 */
export function extractResultText(json) {
  let messages;
  try {
    messages = JSON.parse(json);
  } catch {
    return '';
  }
  if (!Array.isArray(messages)) return '';
  const result = [...messages].reverse().find((m) => m && m.type === 'result');
  if (!result) return '';
  return [result.result, ...(Array.isArray(result.errors) ? result.errors : [])]
    .filter((s) => typeof s === 'string')
    .join('\n');
}

// CLI mode: `node quota-signal.mjs <file> [sinceISO] [windowHours]`.
// Prints `blocked <ISO>` or `clear` on stdout so a bash step can branch on it
// without embedding JS. `file` is the Claude action's execution_file — parsed
// as JSON and narrowed to its terminal result message before checking, per
// extractResultText above, rather than matched against the raw file text.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , file, sinceArg, windowArg] = process.argv;
  if (!file) {
    console.error('Usage: quota-signal.mjs <file> [sinceISO] [windowHours]');
    process.exit(2);
  }
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`Could not read ${file}: ${e.message}`);
    console.log('clear');
    process.exit(0);
  }
  const text = extractResultText(raw);
  const since = sinceArg ? new Date(sinceArg) : new Date();
  const windowHours = windowArg ? Number(windowArg) : 5;
  const until = text ? checkQuotaText(text, since, windowHours) : null;
  console.log(until ? `blocked ${until.toISOString()}` : 'clear');
}
