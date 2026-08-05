# Alvus AI — Testing Strategy

Three tiers: unit (Vitest) → Worker/API integration (Vitest + `@cloudflare/vitest-pool-workers`, real Workers runtime, local Supabase Postgres) → Playwright demo specs (real `wrangler dev`, seeded fixture data). One Playwright spec per user-facing story; every prior spec re-runs on every later PR as the regression gate. **Nothing in the PR-gating suite makes a real call to Anthropic, Semantic Scholar, CrossRef, Unpaywall, or Stripe webhooks.**

## Playwright demo specs (one per story)

- Waitlist signup → admin approval → login
- Project creation with citation format
- Source discovery results list (incl. empty/error state)
- Selecting a source into the bibliography
- Uploading a user's own PDF
- Editor's live citation formatting
- Post-writing feedback comments appearing
- Subscription checkout (real Stripe **test mode**, test card, allowed per-PR)
- Hitting a free-tier usage limit
- Read-only share link view

Assert on stable selectors/roles, not text of AI-generated content (that content is fixture data). Keep specs independent — seed/use a dedicated fixture project each.

## Unit / integration tests (no browser)

| Logic | Type |
|---|---|
| Citation-string formatting per style (MLA/APA/Chicago) | Unit — enumerate author/date/edition edge cases |
| Usefulness-score computation | Unit — pure math |
| Usage-metering / tier-limit math | Unit — boundary conditions, rollover |
| RLS policy behavior | Worker/API integration against local `supabase start` Postgres, real roles/JWTs |
| Stripe webhook signature verification | Unit/integration — construct signed fixture event with Stripe SDK, POST directly to Worker route, no network |

## Seed data (all synthetic, `@example.test` addresses, no real content)

**Users**: `waitlist-pending`, `waitlist-approved`, `admin`, `free-tier` (partial usage), `free-tier-at-limit` (usage == cap, dedicated so the limit demo doesn't depend on other specs), `paid-tier` (fixture Stripe IDs).

**Projects**:
- Project A (MLA, free-tier) — discovered-but-unselected fixture sources → discovery/selection demos.
- Project B (APA, paid-tier) — selected sources, fixture citations/summaries/scores, share link on → citation-formatting + share-link demos.
- Project C (Chicago, paid-tier) — one uploaded synthetic/public-domain PDF, draft with fixture feedback comments already attached → upload + feedback demos.

Upload fixtures must be synthetic/public-domain, never real or paywalled content.

## Determinism / mocking boundary

**Anthropic** (summaries, scores, quotes, feedback comments): mocked in CI/PR via recorded fixtures in `tests/fixtures/anthropic/*.json`, matched by request shape. Real calls limited to a small scheduled/manual smoke suite asserting response *shape* only (non-empty, score in range) — never gates a PR.

**Semantic Scholar / CrossRef / Unpaywall**: mocked in CI/PR via recorded fixture sets (normal results, empty results, error/rate-limited). Real calls limited to a couple of stable queries on the same scheduled/manual basis, shape-check only.

**Stripe**: Checkout Session creation *is* a real test-mode call, allowed per-PR (free, deterministic, low version-risk) — the checkout demo drives it end-to-end with Stripe's test card. Real webhook *delivery* is NOT relied on in any automated test (too async/flaky); webhook handling is proven by constructing a signed fixture event and POSTing it directly to the Worker route. Real end-to-end delivery is checked manually via `stripe trigger` against staging when the handler changes.

## What "no regressions" means

**Catches**: UI/flow breakage, state-management regressions (bibliography, citation formatting, usage gating), frontend↔Worker API contract breakage, auth/routing/access-control regressions, Stripe Checkout integration breakage.

**Does not catch**: AI output quality drift or discovery-relevance drift — all AI/academic-API content in the regression suite is pinned fixture data, so prompt regressions or model swaps won't fail any test here.

**Instead**: a separate, small, human-reviewed eval set of real inputs run against the real Anthropic/academic APIs, on a manual/slow-schedule basis, explicitly out of scope for the automated PR-gating suite. Future automated LLM-as-judge eval harness is out of scope for now.
