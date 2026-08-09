# Alvus AI — API Surface

Single Cloudflare Worker running Hono. The same Worker serves the built React/Vite
static assets *and* the API — everything under `/api/*` is Hono; everything else falls
through to static-asset serving. All routes below are relative to `/api`.

## Conventions

**Auth values**:
- **unauthenticated** — no `Authorization` header required.
- **authenticated** — `Authorization: Bearer <supabase-jwt>`, verified against Supabase
  Auth. Middleware loads the caller's `users` row and rejects (`403 waitlist_pending` /
  `403 waitlist_rejected`) unless `status = 'approved'`, except `GET /auth/me` and
  `POST /auth/logout`.
- **admin** — authenticated + `users.role = 'admin'`. Otherwise `403 forbidden`.
- **share-link token** — `/shared/:token`; no session. Middleware resolves the token
  against `share_links`, checks `revoked_at IS NULL` and expiry.

**Error envelope**: `{ "error": { "code": "snake_case_code", "message": "...", "correlationId": "..." } }`

**Correlation ID**: every request carries one — read from an incoming `X-Correlation-Id`
header if present (so a client-reported ID threads through), otherwise generated.
Echoed back on the `X-Correlation-Id` response header and included in both the error
envelope and the structured server-side log line for any unhandled error, so an incident
is debuggable from logs without needing to reproduce it.

**Status codes**: 400 validation, 401 auth, 402 usage/tier limit, 403 forbidden,
404 not found / unknown share token, 409 conflict, 410 share link revoked,
422 semantically invalid, 429 rate-limited, 502 upstream provider failure
(Semantic Scholar / CrossRef / Unpaywall / LiteLLM proxy / Stripe).

**Metered actions**: only *source analysis* and *feedback pass* count against tier
limits. Both check `usage_events` summed for the billing period against `tier_limits`
for the user's `subscriptions.tier` **before** the expensive work, and increment only
on success. Search, uploads-without-analysis, citation re-render, and paragraph-start
suggestions are not separately metered. Note: `users.status` is the waitlist gate, not
the billing tier — tier lives on `subscriptions`.

## Auth / Waitlist

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST | `/auth/signup` | unauthenticated | `{ email, password }` | `201 { message: "pending_approval" }` | `400`, `409` email exists, `429` |
| POST | `/auth/login` | unauthenticated | `{ email, password }` | `200 { access_token, refresh_token, user }` — always 200 for correct credentials regardless of waitlist status (Supabase issues the token before our app-level status applies); frontend branches on `user.status`. Token only works for `/auth/me`/`/auth/logout` until approved — middleware rejects everything else. | `401`, `429` |
| POST | `/auth/refresh` | unauthenticated (bears a refresh token, not an access token) | `{ refresh_token }` | `200 { access_token, refresh_token }` — rotates the refresh token | `401 invalid_refresh_token` |
| POST | `/auth/logout` | authenticated | — | `204` | `401` |
| POST | `/auth/password-reset/request` | unauthenticated | `{ email }` | `202 {}` (always) | `429` |
| POST | `/auth/password-reset/confirm` | unauthenticated | `{ token, new_password }` | `200 {}` | `400` |
| GET | `/auth/me` | authenticated (pending/rejected allowed) | — | `200 { id, email, status, role, tier, created_at }` | `401` |

## Admin

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/admin/waitlist` | admin | `?status=&cursor=` | `200 { entries[], next_cursor }` | `403` |
| POST | `/admin/waitlist/:userId/approve` | admin | — | `200 { userId, status: "approved" }` | `404`, `409` |
| POST | `/admin/waitlist/:userId/reject` | admin | `{ reason? }` | `200 { userId, status: "rejected" }` | `404`, `409` |
| GET | `/admin/users` | admin | `?q=&status=&tier=&cursor=` | `200 { users[], next_cursor }` | `403` |
| POST | `/admin/users/:userId/revoke` | admin | `{ reason? }` | `200 { userId, status: "rejected" }` — only an `approved` user | `403`, `404`, `409 not_approved` |

## Projects

Citation format is set at creation and immutable thereafter.

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST | `/projects` | authenticated | `{ title, citation_format: "mla"\|"apa"\|"chicago" }` | `201 <project>` | `400`, `402` project-count limit |
| GET | `/projects` | authenticated | `?cursor=` | `200 { projects[], next_cursor }` | `401` |
| GET | `/projects/:projectId` | authenticated | — | `200 <project>` | `403` not owner, `404` |
| PATCH | `/projects/:projectId` | authenticated | `{ title }` | `200 <project>` | `403`, `404`, `422 citation_format_immutable` |
| DELETE | `/projects/:projectId` | authenticated | — | `204` (cascades sources, document, feedback, share links) | `403`, `404` |

## Source discovery

Search (Semantic Scholar/CrossRef + Unpaywall OA resolution) returns raw metadata only
— not metered. AI analysis per candidate is a separate, explicit, metered step.

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST | `/projects/:projectId/sources/search` | authenticated | `{ query?, year_range?, open_access_only?, limit? }` | `200 { candidates[], count }` (empty is valid) | `403`, `404`, `429`, `502` all providers unreachable |
| GET | `/projects/:projectId/sources` | authenticated | `?status=candidate\|selected` | `200 { sources[] }` | `403`, `404` |
| GET | `/projects/:projectId/sources/:sourceId` | authenticated | — | `200 <source incl. analysis if present>` | `403`, `404` |
| POST | `/projects/:projectId/sources/:sourceId/analyze` | authenticated, **metered** | `{ force_refresh? }` | `200 { citation, summary: {strengths, weaknesses}, usefulness_score, key_quotes[], full_text_status, analyzed_at }` | `402`, `403`, `404`, `422 unreadable_source`, `502` |
| GET | `/projects/:projectId/sources/:sourceId/analysis` | authenticated | — | `200 <analysis>` or `404 not_yet_analyzed` | `403`, `404` |

## Source management

Search/upload results start as `candidate`; select/upload promotes to `selected`
(bibliography membership).

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST | `/projects/:projectId/sources/:sourceId/select` | authenticated | — | `200 { state: "selected" }` | `403`, `404`, `409` |
| POST | `/projects/:projectId/sources/:sourceId/deselect` | authenticated | — | `200 { state: "candidate" }` | `403`, `404`, `409` |
| POST | `/projects/:projectId/sources/:sourceId/reject` | authenticated | — | `200 { state: "rejected" }` — soft dismissal, not re-suggested on later search | `403`, `404`, `409` already selected |
| DELETE | `/projects/:projectId/sources/:sourceId` | authenticated | — | `204` (hard delete — `selected` source or upload only; reject a `candidate` instead) | `403`, `404` |
| POST | `/projects/:projectId/sources/upload` | authenticated, **metered** | `multipart/form-data`: `file` (PDF/TXT ≤20MB), `title?` | `201 <source, status: "selected">` (analysis runs synchronously) | `400`, `403`, `404`, `413`, `415`, `422 unreadable_upload`, `402` |
| GET | `/projects/:projectId/bibliography` | authenticated | — | `200 { citation_format, entries: [{source_id, citation_text}] }` | `403`, `404` |

## Editor

Document is one row per project holding TipTap JSON.

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/projects/:projectId/document` | authenticated | — | `200 { content, updated_at }` | `403`, `404` |
| PUT | `/projects/:projectId/document` | authenticated | `{ content }` | `200 { updated_at }` | `400`, `403`, `404` |
| POST | `/projects/:projectId/document/format` | authenticated | `{}` | `200 { content, dangling_citations[] }` | `403`, `404`, `422` empty doc |
| POST | `/projects/:projectId/document/suggestions` | authenticated | `{ cursor_context }` | `200 { suggestions[] }` | `403`, `404`, `429`, `502` |
| POST | `/projects/:projectId/document/feedback` | authenticated, **metered** | `{}` | `201 { pass_id, comments: [{id, anchor, category, text}] }` | `402`, `403`, `404`, `422 empty_document`, `502` |
| GET | `/projects/:projectId/document/feedback` | authenticated | `?cursor=` | `200 { passes[], next_cursor }` | `403`, `404` |
| GET | `/projects/:projectId/document/feedback/:passId` | authenticated | — | `200 <pass, comments[]>` | `403`, `404` |

## Billing

Stripe is the subscription source of truth; webhook syncs `subscriptions.tier`/`status`
(distinct from `users.status`, the waitlist gate). Usage counters are our own DB, reset
on the Stripe billing-period boundary.

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST | `/billing/checkout-session` | authenticated | `{ tier: "plus"\|"pro" }` | `200 { url }` (uses `STRIPE_PRICE_ID_PLUS`/`STRIPE_PRICE_ID_PRO`) | `400`, `409` already subscribed |
| POST | `/billing/portal-session` | authenticated | `{}` | `200 { url }` | `404 no_stripe_customer` |
| GET | `/billing/status` | authenticated | — | `200 { tier, subscription_status, usage: {...}, renews_at }` | `401` |
| POST | `/billing/webhook` | unauthenticated, `Stripe-Signature` verified | raw event | `200 { received: true }` | `400 invalid_signature`, `500` (Stripe retries) |

## Share links

Read-only, revocable, no edit capability.

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST | `/projects/:projectId/share-link` | authenticated (owner) | `{}` | `201 { token, url }` (idempotent, `200` if exists) | `403`, `404` |
| DELETE | `/projects/:projectId/share-link` | authenticated (owner) | — | `204` | `403`, `404 no_active_link` |
| GET | `/projects/:projectId/share-link` | authenticated (owner) | — | `200 { token, url }` or `404` | `403` |
| GET | `/shared/:token` | share-link token | — | `200 { project, bibliography[], document }` — read-only, no analysis internals | `404 invalid_token`, `410 link_revoked` |

## Cross-cutting rules

- Unauthorized project access → `403` (not a leaky `404`); share-link tokens use `404`
  for unknown tokens deliberately (existence of a `projectId` isn't sensitive; token
  validity is).
- Tier limit exceeded → always `402`, body includes `{ code: "usage_limit_exceeded",
  meta: { limit, used, resets_at } }`.
- Rate-limited → always `429` with `Retry-After`.
- Upstream provider down → always `502`, never a generic `500`.
- No accessible full text → not an error; `analyze` succeeds with
  `full_text_status: "abstract_only"`.
- Malformed upload → `422 unreadable_upload`, distinct from `415` (wrong type) and
  `413` (too large).
- Invalid/expired share link → `404` unknown, `410` revoked.
