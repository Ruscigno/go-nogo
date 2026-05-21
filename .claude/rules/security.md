# Security rules — "hacker-proof" posture

Operate as if a competent attacker will probe the service on day one. These controls are mandatory before any code reaches `main`. Failures here block merge.

## Threat modeling expectations

Every Phase 2 (Architecture) artifact carries a STRIDE pass against each trust boundary in the C4 Container diagram (browser ↔ web, browser ↔ Supabase, web ↔ Go backend, Go backend ↔ Supabase, Go backend ↔ NWS Aviation Weather Center, Go backend ↔ R2, Go backend ↔ Stripe, Go backend ↔ Resend, Cloud Scheduler ↔ Go backend). Phase 6 (Harden) revisits and produces `docs/06-security.md` with OWASP ASVS L2 evidence.

## The NWS weather API is a trust boundary AND an availability dependency

The NWS Aviation Weather Center API is a third-party data source — treat its responses as **untrusted input** and treat its availability as **outside our control**:

- **Validate on ingest.** Cap response body size, enforce a request timeout, and reject responses that are not the expected content type. A METAR/TAF string is parsed defensively — a malformed observation must never panic the parser, must never be rendered as HTML, and must never produce a green verdict by accident.
- **Sanitize before storage and display.** Raw observation strings are stored as text and rendered as text (Svelte auto-escaping; Go `html/template`). Never `{@html}`.
- **Degrade gracefully.** If NWS is slow, rate-limiting us (429), erroring (5xx), or returning nothing, the verdict surface shows an explicit "weather unavailable" state with the data's age — it never silently shows a stale verdict as current and never defaults to green.
- **Be a good citizen.** The fetch client sets a descriptive `User-Agent` (so NWS can contact the operator), batches station requests, caches observations by `(station, issued_at)`, and backs off on 429/5xx. There is no paid tier — over-requesting risks a block, which is a launch-availability risk tracked in the §risk register.

## AuthN / AuthZ

- **Supabase is the identity issuer.** Browser uses `@supabase/supabase-js` for sign-up / login / OAuth / magic-link; web SSR uses `@supabase/ssr`'s `createServerClient`.
- **The Go backend verifies Supabase ES256 JWTs** against the JWKS endpoint (fetched once at boot, cached, refresh on `kid` mismatch). HS256 tokens are rejected (algorithm pinning). `aud='authenticated'` enforced.
- **AuthZ is two-layered.** (1) RLS policies on every user-owned table key on `auth.uid()` — the browser-direct `supabase.from(...)` calls fire them automatically. (2) The Go backend additionally scopes every query by `owner_user_id = <jwt sub>` derived from the verified token. The cron path uses an app-admin role deliberately and is the only path that bypasses per-user scoping — it is allowlisted and audited.
- **Cross-tenant isolation is a regression-test contract**, not an optional check. The cross-tenant suite creates two users, signs in as user B, and asserts B reads zero of A's minimums profiles, saved trips, verdict snapshots, and WINGS-PDF records — through both the browser-direct path (RLS) and the Go API path (owner predicate).
- **Rate-limit `/cron/*`, `/webhooks/*`, and auth shims.** Auth endpoints are gated by Supabase's built-in rate limiter; the Go backend runs an in-process token bucket on the cron receiver and webhook receivers. The on-demand `/me/verdict` weather-fetch path is also rate-limited per user, so a user cannot turn Go/No-Go into an NWS-abuse amplifier.

## Input / output

- Server-side validation on every boundary — **Zod** at every SvelteKit server endpoint, explicit struct validation at every Go handler. No `any`-shaped or unvalidated request bodies.
- **Airport identifiers** are validated against a strict pattern (ICAO/FAA identifier shape) before they are ever interpolated into an NWS request URL — never pass a raw user string into an outbound request.
- **Parameterized queries only.** `sqlc` generates parameterized queries by construction; never hand-concatenate SQL. String-concatenated SQL is a CI failure.
- Output encoding: Svelte handles HTML escaping by default; for emails (Resend) escape at the template layer; the Go PDF/HTML renderer uses `html/template` (context-aware auto-escaping), never `text/template`, for any page that includes user-controlled or upstream-controlled strings (a raw METAR is upstream-controlled).
- Strict CSP with no inline scripts; HSTS preloaded; `frame-ancestors 'none'`.

## Webhooks

- **Stripe webhooks verify signature against the RAW request body bytes.** Never re-serialize JSON before verification.
- **Resend deliverability webhooks verify the provider HMAC** against the raw body.
- **Idempotency at the DB layer**: `INSERT INTO processed_webhook_events (provider, event_id, ...) ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`. Dispatch only if a row was returned.
- **Single transaction** for the dedupe insert + state mutation.
- **No retry-on-failure inside the handler.** Return 5xx and let the provider retry; the idempotency key absorbs replays.

## Weather-poll cron security

- **`POST /cron/poll` is OIDC-authed.** Cloud Scheduler signs the request with a Google-issued OIDC token; the Go backend verifies the token's audience matches the Cloud Run service URL and the issuer is Google. An unauthenticated POST to `/cron/poll` returns 401.
- **The cron is idempotent.** Re-firing the same poll must not double-send a verdict-change alert. The dedupe is a DB UNIQUE constraint keyed by the verdict-transition identity — see ADR-0004. Over-firing is safe by construction.
- **The cron respects the NWS request budget.** It polls only stations referenced by an active saved trip, deduplicates stations across trips, and backs off on upstream throttling. Logs the request count per poll.
- **No PII in cron logs.** Log saved-trip UUIDs, station identifiers, and verdict transitions, never the pilot's email.

## Rate limiting + abuse

- In-process token bucket on `/cron/*`, `/webhooks/*`, the on-demand verdict endpoint, and signup.
- 60 req/min/IP global default; tighter on auth (10/min/IP) and on the verdict endpoint (per-user, so on-demand fetches cannot amplify NWS load).
- Cloudflare WAF rules at the proxy layer if paying user count exceeds ~50.

## Secrets handling

- **No secrets in source tree.** `.env` is gitignored; `.env.example` is committed with placeholder names.
- **Production secrets** live in Google Secret Manager, injected into Cloud Run at runtime via `--update-secrets`.
- **`gitleaks`** runs as a pre-commit hook and in CI. Any finding blocks merge.
- **`PostToolUse` hook scans every edited file** before turn-end (`scripts/hooks/post-edit.sh`). Real `.env` files are gitignored, so the hook `git check-ignore`s first.
- **API keys never logged.** Structured loggers (`pino` in web, `slog` in Go) filter known key shapes; never log raw request bodies. (Note: the NWS API needs no key — it is keyless public data.)
- **Rotate `URL_SIGNING_SECRET`, Stripe keys, Resend, R2, Supabase service-role every 90 days** or immediately on suspected compromise.

## File uploads / generated files

- Go/No-Go's only V1 user-file surface is the **server-generated WINGS risk-assessment PDF**. The Go backend renders the PDF and writes it to R2; the pilot fetches it via a signed GET URL valid ≤ 1 hour. No public-bucket access.
- A WINGS PDF carries the pilot's minimums and the weather snapshot — it is scoped to the owning pilot's R2 key prefix and never enumerable.
- There is **no user upload path in V1.** If one is ever added (an attachment), presigned PUT URLs are scoped to `(user_id, content-type, max-size)` and short-lived.

## Logging

- Structured JSON: `pino` in web, `slog` in the Go backend.
- **No PII or secrets in logs.** Hash pilot email addresses if logging is necessary; log row UUIDs. **Saved-trip routes (departure/destination airport pairs) are mildly sensitive — they reveal travel patterns; log the trip UUID, not the airport pair, in cron/alert logs.**
- Immutable audit trail for: auth events, billing events (`processed_webhook_events`), verdict-change alert sends (`alert_audit`), WINGS-PDF generation.

## Backups + disaster recovery

- Supabase free tier offers daily backups with 7-day retention. Pre-launch, add a nightly `pg_dump` to a Cloud Storage bucket with 30-day lifecycle for "I deleted prod" coverage beyond Supabase's window.
- Restore is **tested before launch** — documented as part of `docs/07-runbook.md`.

## Privacy

- Data inventory in `docs/06-security.md`. PII fields explicitly enumerated (email, display name, home airport, saved-trip airport pairs, the pilot's personal minimums — the minimums themselves are mildly sensitive because they describe risk tolerance, and saved-trip routes reveal travel patterns).
- Retention policy: minimums profiles + saved trips kept for the account lifetime; deleted on account delete. Weather observations are cached, not user-owned, and aged out (the cache is purged on a rolling window). Verdict snapshots are retained for the saved trip's lifetime. WINGS PDFs in R2 expire on a rolling window or on account delete. Alert audit anonymized after 365 days. Stripe + Resend events kept indefinitely (small footprint, audit value).
- DSR (data subject request) flow: export endpoint produces a JSON dump; delete endpoint cascades through all owned rows AND deletes the pilot's WINGS PDFs from R2.
- Cookie banner only if PostHog's auto-detect flags an EU visitor; PostHog has it built-in.
- COPPA: signup requires age ≥ 13 confirmation (certificated pilots are ≥ 16 by regulation anyway, but cover yourself).

## Pre-deploy gate (Phase 6)

Before any deploy to `prod`:

1. OWASP ZAP baseline scan against staging (web + Go API).
2. OWASP ASVS L2 walkthrough — sign off in `docs/06-security.md` with pass/fail/N-A per item.
3. Threat model reviewed if any new external boundary was added since last deploy.
4. All `high`/`critical` Sentry issues from the last 7 days resolved or accepted with rationale.
5. Cross-tenant isolation test green in the most recent CI run (both RLS and Go-API layers).
6. Backup-restore dry run completed within last 30 days.
7. Cron OIDC verification tested — an unauthenticated `POST /cron/poll` returns 401.
8. NWS-degradation test green — with the upstream stubbed to time out / 429 / return garbage, the verdict surface shows "weather unavailable" and never a green-by-default.

## Aviation-domain risk — the go/no-go disclaimer (calibrated firm)

Go/No-Go's output is **decision support for a safety-of-flight decision**. A pilot who launches into weather below their minimums trusting a wrong, stale, or incomplete Go/No-Go verdict is exposed — and so are we. This is a **real liability surface**, treated **more firmly than `currency-hub`'s middle-bar and far more firmly than `acsready`'s training-journal footnote**: a go/no-go verdict speaks directly to whether a flight is safe to make, where currency math only describes regulatory recency the pilot can self-check. It is calibrated just below `tail-number-radar`'s launch-blocking FAR 91.403 contract.

The core statement — **"Go/No-Go is an advisory aid. The pilot in command is solely responsible for the go/no-go decision. The verdict is computed from minimums you entered and from public weather data that may be stale, delayed, or incomplete. Obtain an official weather briefing before every flight."** — must appear on:

- **The signup / onboarding flow** — a checkbox acknowledgement, persisted as `disclaimer_acked_at` on the profile (one-time; re-ack only on material text change, versioned). Missing it from signup is a **CONCERN-level** finding.
- **Every verdict surface** — the dashboard verdict and every saved-trip verdict carry a persistent, visible note adjacent to the green/yellow/red status. This is the highest-stakes surface; a pilot must never read a green verdict as authoritative or as a substitute for a weather briefing. Missing it here is a **CONCERN**.
- **Every verdict-change alert email** — one line in the footer. The alert email is itself a decision prompt; the disclaimer must ride with it.
- **The WINGS risk-assessment PDF** — the PDF is a record the pilot may show or file; it states clearly that the assessment is self-completed and advisory.
- **Any "weather unavailable" / stale-data state** — the disclaimer is reinforced wherever data quality is degraded.
- **The app footer** — present on every authenticated page.

Missing the disclaimer from the signup flow or any verdict surface is a **CONCERN** that the `weather-and-verdict-auditor` flags. Missing it everywhere is a launch-readiness defect tracked in `docs/04-plan.md`'s risk register — it must be closed before M-launch. Marketing copy must never imply Go/No-Go "tells you if it's safe to fly" — it compares weather to *your* numbers and *you* decide.
