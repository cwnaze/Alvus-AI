# Alvus AI — Security Model

## Authentication

- Supabase Auth, email/password. JWT verified in Hono middleware on every protected
  request — the Worker is the trust boundary.
- Waitlist state lives in `public.users` (id → `auth.users.id`), NOT in Supabase
  Auth itself: `status: pending | approved | rejected`, `role: member | admin`. Created
  immediately at signup (same transaction as `auth.users` and an admin-facing audit row
  in `waitlist_signups`) — approval gates access, not account existence.
- Sign-up creates the `users` row as `status = pending`. Only an admin endpoint
  (`role = admin`) can flip status (on both `users` and `waitlist_signups`). A valid,
  signed-in JWT with `status != approved` must still be rejected (403) — checked on
  **every** request, not just login, so a still-valid access token can't outrun an
  admin revoking/rejecting the account.
- Access tokens ~1hr, auto-refreshed via rotating refresh tokens. Admin revocation
  invalidates refresh immediately; outstanding access tokens are caught by the
  per-request `users.status` check, not by token invalidation.

## Authorization per resource

| Resource | Owner | Share-link holder | Other users | Admin |
|---|---|---|---|---|
| Projects | full CRUD | read-only, that one project only | none | none by default |
| Sources/uploads | full CRUD, scoped to owning project | read-only (that project's sources) | none | none |
| Billing/usage | read own | no | no | full |
| Admin endpoints | n/a | n/a | no | full |
| Share-link endpoint | n/a | token validated → read-only render | n/a | n/a |

**anon-key + RLS** (RLS is the enforcement): all user-initiated project/source CRUD via
`supabase-js` with the user's own JWT. Policies: `auth.uid() = owner_id` AND
`users.status = 'approved'`.

**service-role + manual checks required** (RLS bypassed — API must replicate it):
- Admin/waitlist endpoints → handler must verify caller's own `users.role = 'admin'`.
- Stripe webhook handler → authorized by signature verification, not RLS.
- Server-side academic-source fetch/write on a user's behalf → handler must verify
  caller owns the target project before the service-role write.
- Share-link resolution → requester is unauthenticated (RLS can't apply); handler
  must check token valid/unrevoked/unexpired, return only that one paper, no write
  route exists on this path at all, never expose the owner's other projects.

Rule: any new table/endpoint must state which path it uses. Service-role without a
matching manual check is a bug.

## Secret classification

| Secret | Class | May appear in frontend bundle? | May appear in repo? |
|---|---|---|---|
| `wrangler login` / `supabase login` session | Dev-tooling (local OAuth) | No | No |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | CI secret | No | No |
| `SUPABASE_ACCESS_TOKEN` | CI secret | No | No |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | App runtime (Worker-only; frontend never calls Supabase directly) | No | No (env-sourced) |
| `SUPABASE_SECRET_KEY` | App runtime (sensitive) | **Never** | No |
| `DATABASE_URL` | App runtime (sensitive) | Never | No |
| `LITELLM_API_KEY` | App runtime (sensitive) | Never | No |
| `STRIPE_SECRET_KEY` | App runtime (sensitive) | Never | No |
| `STRIPE_WEBHOOK_SECRET` | App runtime (sensitive) | Never | No |
| `SEMANTIC_SCHOLAR_API_KEY` (optional) | App runtime (sensitive) | Never | No |

App runtime secrets are set per-environment via `wrangler secret put`, never as
plaintext `vars` in `wrangler.toml`. `SUPABASE_SECRET_KEY` leak = full RLS
bypass = treat as a full data breach.

## Input validation boundaries

- **Uploads:** PDF/TXT only, check MIME **and** extension, reject others (400). Size
  cap ~20MB/file (tune later, not specified in intake). Malformed/corrupted PDF → fail
  parse gracefully, clear user-facing error, never pass garbage bytes to the LiteLLM proxy.
  Scanned-image-only PDF (no text layer) → detect near-empty extraction, surface "no
  extractable text — OCR not supported at v1" instead of an empty-content AI call.
- **Citation format:** enum `mla | apa | chicago` only, validated at API boundary
  (400 on else) and as a DB check constraint (both layers, not one).
- **Stripe webhooks:** verify signature against `STRIPE_WEBHOOK_SECRET` over the
  **raw** request body (route must not JSON-parse before verifying) before any DB
  write; invalid/missing signature → 400, nothing downstream runs.
- **General request bodies:** schema-validate (e.g. Zod) on every mutating route;
  reject unknown/malformed fields. Every mutating endpoint requires a valid
  approved-user JWT except the share-link read path (token validation) and the Stripe
  webhook (signature validation).

## Threat notes

- **AI-cost abuse:** metered endpoints (source analysis, feedback passes) — enforce
  quota check server-side before calling the LiteLLM proxy, hard per-account ceiling, edge
  rate limiting as a first layer.
- **Share-link brute force/leak:** high-entropy token (128-bit class), optional
  expiry + owner revocation, rate-limit lookups; blast radius scoped to one
  read-only paper by design. Also not stored in plaintext: the DB holds a
  one-way hash (lookup) and a copy encrypted under a Worker-held secret
  (redisplay), so a narrower DB-read exposure (leaked replica/backup,
  over-scoped support access) short of a full secret/DB-credential compromise
  doesn't hand over live tokens either — see `docs/data-model.md`'s
  `share_links` entry.
- **Malicious upload / PDF parsing:** parser is untrusted-input-facing code (historic
  RCE/DoS in PDF libs) — parse timeouts, output size caps, never execute embedded
  content, keep dependency patched.
- **Cross-project leakage via RLS bug:** every anon-key-reachable table must ship
  RLS-enabled with an explicit policy from day one; missing RLS = full data leak, not
  degraded UX.
- **Prompt injection from source/upload content:** external/uploaded text is
  untrusted data, not instructions, once in the LLM's context — structurally
  separate system instructions from quoted source text; instruction-like text inside
  a source is just text to summarize, never something the app acts on.
