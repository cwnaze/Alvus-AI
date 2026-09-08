# Code Health Findings — Whole-Repo Audit

Scope: dead code, cross-story duplication, error-handling consistency, TODO/FIXME sweep,
and architectural drift against `docs/tdd.md`. Findings-only pass; nothing in this
document has been fixed.

Overall assessment: this codebase is unusually well-factored for something assembled
across 30 independently-reviewed stories. Citation formatting, the AI client, and
metering/rate-limiting — the three areas most likely to have drifted into duplicates —
are each still single-sourced, and every route consistently uses the `AppError`
pattern. The findings below are real but mostly small.

## Must fix before launch

None found. No security-relevant, correctness-breaking, or user-facing-blank-screen
issues turned up in this pass. (Security-specific issues, if any, are out of scope for
this pass and covered by the separate security-audit pass.)

## Should fix soon

1. **Dead feature scaffolding: `projects.status` lifecycle is fully modeled but never
   transitioned or read.**
   - Files: `apps/worker/src/lib/db/schema/projects.ts:16-18` (enum column,
     `default('draft')`), `apps/worker/src/lib/db/schema/projects.ts:24`
     (`projects_status_idx`), `packages/shared/src/projects.ts:3-4`
     (`PROJECT_STATUSES`/`ProjectStatus`), `apps/worker/src/routes/projects.ts:27`
     (returned in every response), `docs/data-model.md:137`.
   - Description: the `draft | in_progress | completed | archived` enum is documented,
     stored, indexed, and shipped over the wire on every project response, but no route
     anywhere (`apps/worker/src/routes/projects.ts` has no status-mutating handler) ever
     changes it away from its `'draft'` default, and the frontend
     (`apps/web/src/pages/DashboardPage.tsx`, `ProjectPage.tsx`) never reads or displays
     it. `docs/api.md` documents no endpoint or trigger for the transition either — this
     isn't a case of "the API exists but the UI hasn't caught up," the transition logic
     itself was never built by any of the 30 stories.
   - Suggested fix: either implement the transition (e.g., derive `completed` from
     document/feedback activity, or add an explicit archive action) in a follow-up
     story, or remove the column/enum/index and the `status` field from the wire
     contract until there's a real use for it. Shipping an always-`'draft'` field is
     confusing API surface with no launch value either way.

2. **The 20MB upload limit is a magic number duplicated three times instead of a shared
   constant.**
   - Files: `apps/worker/src/routes/sources.ts:267`, `apps/worker/src/routes/sources.ts:280`
     (both `'Files must be 20MB or smaller'`), `apps/web/src/pages/ProjectPage.tsx:49`
     (`'That file is too large. Files must be 20MB or smaller.'`, hardcoded fallback
     text keyed off a bare `413` status check rather than any shared value).
   - Description: none of these three call sites reference a single constant — not even
     within `apps/worker` itself (the two `sources.ts` occurrences are separate literal
     strings), let alone via `packages/shared`. If the limit is ever changed
     server-side, the client's hardcoded copy silently goes stale and shows the wrong
     number to the user; nothing in `typecheck`/`lint`/`build` would catch it. Low
     severity because the enforcement itself is server-side and correct — this is a
     message-string staleness risk, not a security or correctness bug.
   - Suggested fix: define `MAX_UPLOAD_SIZE_BYTES` (or `_MB`) once in
     `packages/shared/src/sources.ts`, import it in `apps/worker/src/routes/sources.ts`
     for both the check and the error message, and have
     `apps/web/src/pages/ProjectPage.tsx`'s `uploadErrorMessage` interpolate the same
     constant instead of a literal `20`.

3. **`docs/tdd.md`'s directory layout no longer matches the actual route/file split.**
   - Files: `docs/tdd.md:54` (lists `routes/analysis.ts` as the file that owns
     "per-source AI analysis orchestration") vs. actual: analysis lives inside
     `apps/worker/src/routes/sources.ts` (`POST .../sources/:sourceId/analyze` at
     `sources.ts:406-492`, `POST .../sources/upload` at `sources.ts:242-361` — both call
     `lib/ai`/`lib/metering` directly, there is no `analysis.ts`). Also `docs/tdd.md:58`
     lists `routes/webhooks.ts`; the actual file is
     `apps/worker/src/routes/billing-webhook.ts`.
   - Description: functionally this is fine — request Flow 1's behavior in `tdd.md:90-106`
     is accurately implemented, just inside `sources.ts` rather than a dedicated
     `analysis.ts`, and the webhook receiver exists and is correctly Stripe-signature-
     verified, just under a different filename. This is pure documentation drift, not a
     code defect, but it will mislead the next person (human or agent) who greps for
     `routes/analysis.ts` or `routes/webhooks.ts` based on the design doc.
   - Suggested fix: update `docs/tdd.md`'s directory listing to match the real file
     names, or split `sources.ts`'s analyze/upload handlers into a real
     `routes/analysis.ts` if there's an independent reason to (it's gotten large —
     23.5KB / ~570 lines with tests at 41.6KB).

## Accepted with rationale

1. **Citation formatting is not duplicated between web and worker — verified, not just
   assumed.** `packages/shared/src/citation.ts` holds only the `CitationFormat` enum;
   all MLA/APA/Chicago string-building logic lives solely in
   `apps/worker/src/lib/citation/index.ts` (`formatCitation`, `formatInTextCitation`).
   `apps/web/src/editor/citationExtension.ts`'s TipTap `Citation` node only *displays* a
   `text` field that arrives already formatted from the server
   (`apps/worker/src/routes/editor.ts:88-97` calls `formatInTextCitation` and passes the
   result down). This is explicitly called out and justified in
   `docs/tdd.md:111` ("one implementation instead of a client/server duplicate ... a
   stronger guarantee ... than sharing rules across two copies would be") and in a code
   comment at `apps/web/src/editor/citationExtension.ts:13-17`. No action needed.

2. **AI calls are single-sourced through `apps/worker/src/lib/ai/client.ts`.** Grepped
   every file under `apps/worker/src` for `LITELLM`/`OpenAI` — the only files touching
   the OpenAI SDK or LiteLLM env vars are `lib/ai/client.ts` itself and
   `lib/ai/types.ts` (the `AiEnv` type). `routes/sources.ts`, `routes/feedback.ts`, and
   `routes/editor.ts` all call into `requestSourceAnalysis`/`requestFeedbackPass`/
   `requestParagraphSuggestions` rather than constructing their own client, matching
   `docs/tdd.md:82`'s "Only `lib/ai` calls the LiteLLM proxy" rule exactly. No action
   needed.

3. **Metering and rate-limiting are invoked consistently at every metered/rate-limited
   call site, including the one added later than the others.** Both metered actions
   (`source_analysis` in `sources.ts:294-296,428-430`; `feedback_pass` in
   `feedback.ts:45-47`) call `assertWithinUsageLimit` + `assertWithinAiRateLimit` +
   `recordAiRateLimitHit` before the AI call and `recordUsage` after success. The
   non-metered-but-rate-limited suggestion endpoint
   (`editor.ts:112-146`) correctly uses the lighter `assertWithinSuggestionRateLimit`/
   `recordSuggestionRequestHit` pair instead, per the documented, deliberate distinction
   in `docs/tdd.md:112` and a code comment at `editor.ts:107-111`. The share-link lookup
   endpoint (`routes/shared.ts:29-30`) also correctly uses its own
   `assertWithinShareLinkLookupRateLimit`/`recordShareLinkLookupHit` pair (IP-based, not
   user-based, since it's an unauthenticated route). No gaps found — this is the
   category the task brief most expected to find drift in, and it didn't.

4. **Error handling is consistently funneled through `AppError`/`onError`.** Every route
   file (`admin.ts`, `auth.ts`, `billing.ts`, `billing-webhook.ts`, `editor.ts`,
   `feedback.ts`, `projects.ts`, `share-links.ts`, `shared.ts`, `sources.ts`) imports and
   throws `AppError` for every expected 4xx/402/409/410/413/415/422/502 case, and none
   of them construct an ad-hoc `c.json({...}, status)` error envelope by hand. The only
   raw `throw new Error(...)` call sites are "this should be structurally impossible"
   invariant checks after DB writes (e.g. `sources.ts:491`, and ~15 similar spots across
   `lib/db/queries/*.ts` like `subscriptions.ts:57`, `documents.ts:19,41`,
   `waitlist.ts:69,89`) — these intentionally fall through to `onError`'s generic 500
   path with a logged stack trace, which is the correct behavior for a should-never-
   happen state rather than a user-facing 4xx. The frontend's `apps/web/src/lib/api.ts`
   likewise has exactly one `request()` wrapper that all ~30 exported API functions
   route through, with one 401-refresh-and-retry path and one `ApiError` shape — no page
   does a raw `fetch()` that bypasses it (verified by grep). No action needed.

5. **`packages/shared`'s nested response-field types (`DanglingCitation`,
   `FeedbackAnchor`, `UsageLimitSummary`, `SharedProject`, etc.) initially looked unused
   when grepped in isolation** (they only appear inside their own definition file plus
   the `index.ts` re-export). On inspection they're all consumed structurally as fields
   of larger exported response types (`DocumentFormatResponse.dangling_citations`,
   `FeedbackComment.anchor`, `BillingStatusResponse.usage`,
   `SharedPaperResponse.project`) that are themselves imported and used in
   `apps/web/src/lib/api.ts` and various pages — this is normal type composition, not
   dead code. Flagging here only so a future pass doesn't waste time re-checking the
   same grep.

## Notes

- **TODO/FIXME/XXX/HACK sweep: zero results.** Ran
  `grep -rn "TODO\|FIXME\|XXX\|HACK"` across `apps/`, `packages/`, `db/`, `docs/`,
  `scripts/`, `tests/`, `e2e/` (excluding `node_modules`, `dist`, `graphify-out`) and
  found nothing. Either genuinely clean or (less likely) markers were scrubbed before
  merge by a prior story's review — either way, nothing to triage here.
- **No unused route handlers or unmounted pages found.** Every route file exported from
  `apps/worker/src/routes/` is mounted in `apps/worker/src/index.ts`; every page
  component in `apps/web/src/pages/` is wired into a `<Route>` in `apps/web/src/App.tsx`;
  every non-page component (`AuthLayout`, `DocumentPreview`, `feedbackHighlightExtension`)
  has a live importer.
- **No import cycles** per `graphify-out/GRAPH_REPORT.md`'s "Import Cycles" section
  (empty).
- Client-side validation is intentionally thin in a few spots (e.g. no `maxLength` on
  the project-title `<input>` in `apps/web/src/pages/DashboardPage.tsx`, relying on the
  server's `MAX_TITLE_LENGTH` 400 response surfaced via `ApiError.message`) — this is
  consistent with the "errors surface to the user meaningfully" convention rather than a
  gap, since the server error is shown, not swallowed. Noted but not flagged as a
  finding.
