# 03 — Spec

> **Status: DRAFT — awaiting founder review. No founder approval is
> recorded.** User stories, acceptance criteria, and the API contract
> for Go/No-Go V1. The contract here is what Phase 4 (Plan) slices into
> tickets and what Phase 5 (Implement) tests against.
>
> Cross-references:
> [01-discovery.md](01-discovery.md) defines who and why.
> [02-architecture.md](02-architecture.md) defines the system shape.
> [api/openapi.yaml](api/openapi.yaml) is the formal API contract.

## 1. Authoring conventions

- Each user story has acceptance criteria with IDs `AC-NN` and a parent
  feature row from [01-discovery.md](01-discovery.md)'s in-scope table.
- Acceptance criteria are Given/When/Then — what the Phase 5 tests
  assert.
- Each `AC-NN` carries a **priority**: `P0` (V1 launch-blocker), `P1`
  (V1 nice-to-have, ship if cheap), `P2` (V1.1).
- Where the spec deviates from the research, the row carries
  `→ research §X` and a one-line justification.

## 2. User stories

### Feature 1 — Self-serve signup

> _As a pilot visiting Go/No-Go for the first time, I can create an
> account in under 60 seconds using whichever auth method matches my
> habits._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-01 | **Given** an unauthenticated visitor on `/signup`, **when** they submit a valid email + password, **then** Supabase Auth creates the user, sends the verification email via Resend, and the visitor lands on the email-verification waiting screen. | P0 |
| AC-02 | **Given** an unverified user with a valid verification link, **when** they click it within its TTL, **then** the email is marked verified and they land on `/app/onboarding`. | P0 |
| AC-03 | **Given** a returning user on `/login`, **when** they submit valid credentials, **then** they receive a `Secure; HttpOnly; SameSite=Lax` session cookie and land on `/app`. | P0 |
| AC-04 | **Given** a visitor on `/signup`, **when** they click "Send me a magic link", **then** Resend delivers a single-use link valid 1 hour, and clicking it lands them on `/app/onboarding` (or `/app` if already onboarded). | P0 |
| AC-05 | **Given** a visitor on `/signup`, **when** they click "Continue with Google", **then** Supabase's OAuth flow returns them to `/app/onboarding` with email + display name pre-filled. | P0 |
| AC-06 | **Given** a forgotten-password request, **when** the user submits their email, **then** the response is **identical** for known and unknown addresses (no enumeration), and a known-email user receives a Resend reset link. | P0 |
| AC-07 | **Given** any auth endpoint, **when** more than 10 requests arrive from the same IP within 1 minute, **then** further requests return 429 with `Retry-After`. | P0 |
| AC-08 | **Given** a successful signup, **when** the user has not yet confirmed age ≥ 13, **then** onboarding shows a required checkbox and persists the acknowledgement. | P0 |

### Feature 2 — Onboarding + the advisory-disclaimer acknowledgement

> _As a freshly signed-up pilot, I tell Go/No-Go the few things it needs,
> and I acknowledge that Go/No-Go is an advisory aid, not a decision._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-09 | **Given** an onboarded check on `/app`, **when** the `pilots` row has no `display_name`, **then** the user is redirected to `/app/onboarding`. | P0 |
| AC-10 | **Given** the onboarding form, **when** the user submits display name and (optionally) a home airport, **then** the `pilots` row is written. | P0 |
| AC-11 | **Given** the onboarding form, **when** the user accepts the advisory disclaimer ("Go/No-Go is an advisory aid; the pilot in command is solely responsible for the go/no-go decision; the verdict uses minimums you entered and public weather data that may be stale, delayed, or incomplete; obtain an official weather briefing before every flight"), **then** `disclaimer_acked_at` and `disclaimer_acked_version` are persisted. → `.claude/rules/security.md` | P0 |
| AC-12 | **Given** any authenticated API call, **when** `disclaimer_acked_at IS NULL` (or the version is below current), **then** the Go backend returns `403 disclaimer_required` with an `ack_url` and the web tier redirects to onboarding. | P0 |
| AC-13 | **Given** the onboarding form, **when** the user provides no home airport, **then** the form accepts the empty value. | P1 |

### Feature 3 — Personal-minimums profile

> _As a pilot, I record my own weather limits once, so the app can
> compare every flight against my numbers instead of generic minimums._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-14 | **Given** an onboarded pilot on `/app/minimums`, **when** they submit a minimums profile (minimum ceiling in ft, minimum visibility in SM, maximum crosswind component in kt, maximum gust factor in kt, IFR-current yes/no, maximum days-since-last-flight), **then** a `minimums_profiles` row is written scoped to their `owner_user_id`. → research §5.1 #3 | P0 |
| AC-15 | **Given** a pilot with a saved minimums profile, **when** they edit any value and save, **then** the row is updated and `updated_at` advances. | P0 |
| AC-16 | **Given** a pilot who has not yet saved a minimums profile, **when** they attempt to run a verdict, **then** they are routed to `/app/minimums` first — a verdict has no meaning without the pilot's numbers. | P0 |
| AC-17 | **Given** a second pilot, **when** they query minimums profiles, **then** they see only their own — never the first pilot's. _Cross-tenant contract — see AC-X01._ | P0 |
| AC-18 | **Given** the minimums form, **when** a value is out of a sane range (e.g. a negative ceiling, a crosswind above 60 kt), **then** the API rejects it with 400 and a field-level message. | P0 |

### Feature 4 — Airport + runway entry

> _As a pilot, I enter where I'm flying from and to, and which runway, so
> the app can fetch the right weather and do the right crosswind math._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-19 | **Given** the verdict form, **when** the pilot enters a departure and a destination airport identifier, **then** each is validated against the seeded `airports` reference table; an unknown identifier is rejected with a clear message. → research §5.1 #4 | P0 |
| AC-20 | **Given** a departure airport with known runways, **when** the pilot picks a runway, **then** the runway heading is resolved from the `airports` runway data and used for the crosswind computation. | P0 |
| AC-21 | **Given** the verdict form, **when** the pilot enters a runway heading manually (an airport whose runway data is incomplete), **then** the heading is accepted only if it is a valid 0–360° value. | P1 |
| AC-22 | **Given** any airport identifier entered, **when** it is sent to the Go backend, **then** it is validated against a strict ICAO/FAA identifier pattern **before** any outbound NWS request is built. → `.claude/rules/security.md` | P0 |

### Feature 5 — NWS weather fetch + METAR/TAF parsing

> _As a pilot, the app fetches the current weather for my airports and
> turns it into the fields the verdict needs — and never guesses._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-23 | **Given** a valid airport identifier, **when** the Go backend fetches its weather, **then** it requests the METAR and the TAF from the NWS Aviation Weather Center API with a descriptive `User-Agent`, a request timeout, and a response body-size cap. → research §3.4, ADR-0002 | P0 |
| AC-24 | **Given** a fetched METAR, **when** it is parsed, **then** the parser extracts ceiling (ft), surface visibility (SM), wind direction/speed/gust (kt), and the AWC flight category, and handles `CAVOK`, `SKC/CLR/NSC`, vertical visibility `VV###`, a missing ceiling group, `P6SM` / `M1/4SM` / fractional visibility, `VRB` winds, and gust groups. Each case has a table-driven test. | P0 |
| AC-25 | **Given** a malformed or unrecognized METAR/TAF, **when** the parser runs, **then** it does **not** panic, does **not** guess a value, and records the observation `parse_ok = false`. → research §7.1 | P0 |
| AC-26 | **Given** an observation already in `weather_observations` for `(station, kind, issued_at)`, **when** a fetch for the same station is needed, **then** the cached observation is reused rather than re-fetched. → ADR-0005 | P0 |
| AC-27 | **Given** the NWS API returns 429 or a 5xx, **when** the fetch client handles it, **then** it backs off and retries within a bounded budget; a persistent failure surfaces as "weather unavailable", not an error page. → ADR-0002 | P0 |
| AC-28 | **Given** the NWS API is unreachable or times out, **when** a verdict is requested, **then** the verdict for that input is `unknown` and the flow continues to the "weather unavailable" surface. → AC-35 | P0 |

### Feature 6 — The verdict-evaluation engine

> _As a pilot, I trust that the app compares the weather to my exact
> minimums — and that it never tells me "go" when it does not know._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-29 | **Given** parsed weather where every checked field is present, the observation is fresh, and every value is within the pilot's minimum, **when** the engine evaluates, **then** the verdict is `go` (green). → research §3.3 | P0 |
| AC-30 | **Given** parsed weather where a checked value clearly exceeds a pilot minimum (e.g. ceiling below the minimum, crosswind above the maximum), **when** the engine evaluates, **then** the verdict is `no_go` (red), and the detail names which check failed. | P0 |
| AC-31 | **Given** parsed weather where a value is within the caution buffer of a minimum (per the yellow-band definition — Discovery Q1), **when** the engine evaluates, **then** the verdict is `caution` (yellow) and the detail names the close check. | P0 |
| AC-32 | **Given** parsed weather with a required field missing, an observation older than the freshness threshold, or `parse_ok = false`, **when** the engine evaluates, **then** the verdict is `unknown` — **never `go`**. This invariant has a dedicated table-driven test set. → research §3.3, ADR-0003 | P0 |
| AC-33 | **Given** a wind direction/speed and a runway heading, **when** the engine computes the crosswind and headwind components, **then** the result matches the standard trigonometric decomposition for a battery of known wind/runway pairs. | P0 |
| AC-34 | **Given** a gust value in the weather, **when** the engine evaluates, **then** the gust factor (gust − steady) is compared against the pilot's maximum gust factor as a check distinct from the steady-wind crosswind. | P0 |
| AC-35 | **Given** the pilot's IFR-currency self-check is `false` and the destination weather is IFR-or-worse, **when** the engine evaluates, **then** the verdict is at best `no_go` for that flight — a not-IFR-current pilot cannot get a `go` into IFR conditions. | P0 |
| AC-36 | **Given** the engine package `backend/internal/verdict`, **when** the code is inspected, **then** no function inside it calls `time.Now()`, opens a DB connection, performs network I/O, or reads the environment — the evaluation instant, the parsed weather, and the minimums are arguments (ADR-0003). | P0 |
| AC-37 | **Given** any comparison rule implemented in the engine, **when** the code is inspected, **then** a table-driven test exists covering boundary, below, within, caution-band, and missing-field cases. | P0 |
| AC-38 | **Given** the engine, **when** test coverage is measured, **then** `backend/internal/verdict` is ≥ 95% line-covered and `backend/internal/weather` is ≥ 90%. | P0 |

### Feature 7 — The "single screen" verdict view

> _As a pilot, one screen tells me green / yellow / red against my own
> numbers, with the weather and the math shown so I can sanity-check it._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-39 | **Given** an authenticated pilot on the verdict view with a saved minimums profile, **when** they submit a dep/dest pair + runway, **then** the view shows a single prominent green/yellow/red verdict, each per-check result (ceiling, visibility, crosswind, gust, IFR-currency gate, time-since-flight), and the parsed raw weather. → research §5.1 #7 | P0 |
| AC-40 | **Given** the verdict view, **when** it renders any verdict, **then** the advisory disclaimer is visible adjacent to the verdict — a pilot must never read a green verdict as authoritative or as a substitute for a weather briefing. → `.claude/rules/security.md` | P0 |
| AC-41 | **Given** the verdict is `unknown` (weather unavailable), **when** the view renders, **then** it shows an explicit "weather unavailable" state — never a green-by-default — with the age of any partial data and the disclaimer reinforced. → research §5.1 #13 | P0 |
| AC-42 | **Given** a raw METAR/TAF string from the NWS API, **when** it is displayed, **then** it is rendered as text (escaped) — never as HTML. → `.claude/rules/security.md` | P0 |
| AC-43 | **Given** the verdict view at 360px viewport width, **when** it renders, **then** there is no horizontal scroll and every interactive element has a ≥ 44×44px tap target. | P0 |
| AC-44 | **Given** the verdict view, **when** it loads on a simulated Slow 4G connection, **then** time-to-interactive is ≤ 1.5s. | P1 |

### Feature 8 — Crosswind / headwind component display

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-45 | **Given** a verdict for a runway, **when** the view renders, **then** it shows the computed crosswind component and headwind/tailwind component in knots, alongside the pilot's crosswind minimum. → research §5.1 #8 | P0 |
| AC-46 | **Given** the component display, **when** it is computed, **then** it derives from the same `backend/internal/verdict` helpers as the verdict — there is no parallel implementation. | P0 |

### Feature 9 — Saved trips

> _As a pilot, I save the flight I'm planning so the app watches it and
> tells me when its verdict changes._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-47 | **Given** a pilot who has run a verdict, **when** they save the dep/dest pair (and runway, and an optional planned departure time) as a trip, **then** a `saved_trips` row is created with `is_active = true`, scoped to their `owner_user_id`. → research §5.1 #9 | P0 |
| AC-48 | **Given** a pilot on `/app/trips`, **when** the list loads, **then** it shows each saved trip with its most recent verdict and when it was last evaluated. | P0 |
| AC-49 | **Given** a pilot deletes a saved trip, **when** the row is removed, **then** its `verdict_snapshots` and `alert_audit` rows cascade-delete. | P0 |
| AC-50 | **Given** a pilot deactivates a saved trip, **when** the poll cron next runs, **then** that trip's airports are no longer fetched and no alert fires. | P1 |
| AC-51 | **Given** a per-account saved-trip cap, **when** a pilot tries to exceed it, **then** the API rejects the create with a clear message. | P1 |

### Feature 10 — The weather-poll cron + verdict-change alerts

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-52 | **Given** `POST /cron/poll`, **when** the request carries no valid OIDC token (wrong issuer or audience, or absent), **then** the endpoint returns 401 and does nothing. → research §3.5, ADR-0005 | P0 |
| AC-53 | **Given** a valid OIDC-authed `POST /cron/poll`, **when** it runs, **then** it collects the distinct airports of all `is_active` saved trips, fetches each station once (cache-aware), re-evaluates each active trip's verdict, and for a trip whose verdict changed attempts `INSERT … ON CONFLICT DO NOTHING RETURNING id` into `alert_audit`. | P0 |
| AC-54 | **Given** the poll's dedupe INSERT returns a row, **when** the handler proceeds, **then** it sends the verdict-change alert email via Resend and updates the audit row's `status` and `provider_message_id`. | P0 |
| AC-55 | **Given** the poll's dedupe INSERT conflicts, **when** the handler proceeds, **then** it sends nothing — this verdict transition over this observation was already alerted. → ADR-0004 | P0 |
| AC-56 | **Given** the poll is run twice over the same observation, **when** both runs complete, **then** each verdict transition produces exactly one `alert_audit` row and exactly one email. _Idempotency contract — see AC-X02._ | P0 |
| AC-57 | **Given** a saved trip whose verdict changes again to a new value, **when** the next poll runs, **then** a second, legitimate alert fires — the dedupe does not suppress a genuinely new transition. | P0 |
| AC-58 | **Given** a poll run, **when** several active trips share an airport, **then** that station's weather is fetched exactly once. → ADR-0005 | P0 |
| AC-59 | **Given** a Resend send fails (5xx), **when** the poll handles it, **then** the audit row is updated to `status='failed'` (retried with backoff), and the row is not deleted. | P0 |
| AC-60 | **Given** the NWS API is unavailable during a poll, **when** the poll handles it, **then** affected trips' verdicts become `unknown`, the poll backs off, and no green-by-default verdict is written or alerted. | P0 |

### Feature 11 — The verdict-change alert email

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-61 | **Given** a verdict-change alert email, **when** it is rendered, **then** it names the trip (departure → destination), the old and new verdict, and a short summary of what changed, and links back to the trip in the app. → research §5.1 #11 | P0 |
| AC-62 | **Given** a verdict-change alert email, **when** it is rendered, **then** its footer carries the advisory disclaimer one-liner. → `.claude/rules/security.md` | P0 |
| AC-63 | **Given** an alert email, **when** it is sent, **then** the alert channel is email only — there is no SMS or Web Push send path in V1. → research §5.4, ADR-0004 | P0 |

### Feature 12 — WINGS risk-assessment PDF export

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-64 | **Given** a pilot requests a WINGS PDF for a saved trip, **when** the Go backend renders it, **then** the PDF contains the weather snapshot, the pilot's minimums, the verdict, and a PAVE-checklist section, is written to R2 under a per-pilot key prefix, and the pilot receives a signed GET URL valid ≤ 1 hour. → research §5.1 #12 | P0 |
| AC-65 | **Given** the rendered WINGS PDF, **when** it is inspected, **then** it carries the advisory disclaimer and an "as of" timestamp, and states the assessment is self-completed and advisory. | P0 |
| AC-66 | **Given** a pilot requests a WINGS PDF for a trip they do not own, **when** the backend handles it, **then** it returns 403/404 and never generates or signs a URL for another pilot's data. _Tenancy contract — see AC-X01._ | P0 |

### Feature 13 — Billing

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-67 | **Given** a pilot on `/app/upgrade`, **when** they choose "Monthly — $6" or "Annual — $39", **then** the server creates a Stripe Checkout Session with the matching price and returns the session URL. → ADR-0006 | P0 |
| AC-68 | **Given** a subscriber, **when** they click "Manage billing", **then** the server creates a Customer Portal session and the browser redirects. | P0 |
| AC-69 | **Given** any Stripe webhook at `/webhooks/stripe`, **when** it is handled, **then** `processed_webhook_events` is upserted `ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`, and the subscription mutates only if a row was returned. | P0 |
| AC-70 | **Given** the Stripe webhook, **when** the signature is missing or fails verification against the **raw** body, **then** the handler returns 400 and writes nothing. | P0 |
| AC-71 | **Given** `checkout.session.completed`, **when** handled, **then** `subscriptions` is upserted with `status='active'`, the `plan`, and `current_period_end`. | P0 |
| AC-72 | **Given** the same Stripe event arrives twice, **when** both are processed, **then** the subscription state changes exactly once. _Replay-safety — see AC-X03._ | P0 |

### Feature 14 — Paywall

> _Subject to Discovery Q3 — the draft assumes a 14-day trial._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-73 | **Given** a pilot within their 14-day trial and with no active subscription, **when** they use the app, **then** all features work and no paywall appears. → ADR-0006 | P0 |
| AC-74 | **Given** a pilot whose trial has expired with no active subscription, **when** their next page-load happens, **then** they are redirected to `/app/upgrade` and `paywall.hit` is emitted to PostHog. | P0 |
| AC-75 | **Given** a pilot with an active subscription, **when** they navigate the app, **then** the paywall is a no-op. | P0 |

### Feature 15 — PWA + responsive

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-76 | **Given** an Android Chrome user meeting PWA install criteria, **when** they land on the site, **then** an in-app "Install Go/No-Go" banner appears. | P0 |
| AC-77 | **Given** an iOS Safari user, **when** they tap a static "How do I install this?" card, **then** the card shows the Share → Add to Home Screen steps. | P0 |
| AC-78 | **Given** the manifest, **when** Lighthouse audits `/app`, **then** the PWA category score is ≥ 90 and Performance ≥ 85. | P0 |

### Feature 16 — Legal + the disclaimer surfaces

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-79 | **Given** every page footer, **when** rendered, **then** links to `/legal/terms`, `/legal/privacy`, `/legal/refund` are present and the advisory-disclaimer one-liner is visible. | P0 |
| AC-80 | **Given** the advisory disclaimer, **when** the app is audited, **then** it appears on: the signup/onboarding flow, every verdict surface, every verdict-change alert email, the WINGS PDF, any "weather unavailable" state, and the app footer. → `.claude/rules/security.md` | P0 |
| AC-81 | **Given** any marketing or UI copy, **when** it is reviewed, **then** it never implies Go/No-Go decides whether a flight is safe — it compares weather to the pilot's own minimums and the pilot decides. | P0 |

## 3. Cross-cutting acceptance criteria

These don't map to a single feature but block launch.

| ID     | Criterion                                                                                                                                                                                                                                                                                                          | Priority |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-X01 | **Cross-tenant isolation** — for every user-owned table (`pilots`, `minimums_profiles`, `saved_trips`, `verdict_snapshots`, `wings_pdfs`, `subscriptions`), an integration test creates two pilots, writes pilot A's data, queries as pilot B through **both** the browser-direct RLS path **and** the Go API owner-predicate path, and asserts zero rows. Extended: pilot B cannot fetch pilot A's WINGS PDF via a guessed R2 key. **The single most important test in the suite.** If it flakes, the suite halts. | P0 |
| AC-X02 | **Poll idempotency** — an integration test fires `POST /cron/poll` twice over the same observation and asserts each verdict transition produces exactly one `alert_audit` row and one email; then mutates the observation so the verdict transitions again and asserts a second, legitimate alert. | P0 |
| AC-X03 | **Stripe replay safety** — an integration test posts the same Stripe event ID twice and asserts the subscription mutates exactly once. | P0 |
| AC-X04 | **Cron OIDC** — an integration test asserts an unauthenticated (and a wrong-audience) `POST /cron/poll` returns 401. | P0 |
| AC-X05 | **No PII in logs** — a CI grep step asserts no log call site (in `web/src` or `backend/`) references `email`, `password`, JWT, or a saved-trip route as a human string. | P0 |
| AC-X06 | **JWT verification** — a unit test asserts the Go backend's verifier rejects `alg=HS256`, expired `exp`, wrong `aud`, wrong `iss`, and tampered signatures. | P0 |
| AC-X07 | **Migration round-trip** — CI runs `migrate up → down-all → up` on an ephemeral Postgres for every PR touching `db/migrations/**`; `sqlc diff` asserts no schema/query drift. | P0 |
| AC-X08 | **CSP + HSTS headers** — an integration test against `/` asserts `Content-Security-Policy` with no `unsafe-inline`, `Strict-Transport-Security`, `X-Frame-Options: DENY`. | P0 |
| AC-X09 | **Rate limiting** — integration tests assert 429 on the 11th request/min to auth endpoints, the 61st/min to `/webhooks/*`, and a per-user limit on the on-demand `/me/verdict` weather-fetch path. | P0 |
| AC-X10 | **Health check** — a smoke test asserts `GET /healthz` returns 200 on both services. | P0 |
| AC-X11 | **The verdict never defaults to green** — a dedicated integration + unit test set asserts that with the NWS upstream stubbed to time out, to return 429, or to return garbage, the verdict is `unknown` and the verdict view shows "weather unavailable" — never `go`/green. Restates AC-32 / AC-60 as a launch gate. | P0 |
| AC-X12 | **The verdict engine is the test priority** — `backend/internal/verdict` is ≥ 95% covered and `backend/internal/weather` ≥ 90% (restating AC-38 as a launch gate). | P0 |

## 4. API contract

The formal contract is [api/openapi.yaml](api/openapi.yaml). This
section summarizes it narratively.

### 4.1 Authentication conventions

- The web tier's `/api/*` server routes require a valid Supabase session
  cookie (`Secure; HttpOnly; SameSite=Lax`).
- The Go backend's authenticated routes require `Authorization: Bearer
  <jwt>` — the SvelteKit server forwards the pilot's Supabase JWT
  (Architecture Q2). The backend verifies ES256 against the JWKS.
- `/cron/poll` requires a Google OIDC token (Cloud Scheduler).
- `/webhooks/stripe` and `/webhooks/resend` require a provider signature.
- Failures: 401 (missing/invalid credential), 403 (valid but lacks the
  scope, or the disclaimer is not acknowledged), 400 (validation),
  429 (rate-limited), 502/503 (NWS upstream unavailable — surfaced as a
  verdict `unknown`, not as a raw error to the pilot).

### 4.2 Error envelope

All non-2xx JSON responses follow:

```json
{
  "error": {
    "code": "string",
    "message": "human-readable summary",
    "fields": { "field_name": ["error message"] }
  }
}
```

`fields` is present only for validation failures (400).

### 4.3 Go backend surface (`gonogo-api`)

| Method | Path                          | Purpose                                              | Auth                | Source AC      |
| ------ | ----------------------------- | ---------------------------------------------------- | ------------------- | -------------- |
| GET    | `/healthz`                    | Liveness probe                                       | none                | AC-X10         |
| GET/PUT | `/me/minimums`               | Read / save the personal-minimums profile            | JWT                 | AC-14, AC-15   |
| POST   | `/me/verdict`                 | On-demand: fetch weather for a dep/dest pair, return the verdict | JWT      | AC-23–AC-46    |
| GET/POST | `/me/trips`                 | List / create saved trips                            | JWT                 | AC-47, AC-48   |
| GET    | `/me/trips/:id`               | A saved trip + its latest verdict snapshot           | JWT                 | AC-48          |
| DELETE | `/me/trips/:id`               | Delete a saved trip                                  | JWT                 | AC-49          |
| PATCH  | `/me/trips/:id`               | Activate / deactivate a saved trip                   | JWT                 | AC-50          |
| POST   | `/me/trips/:id/wings-pdf`     | Render the WINGS PDF to R2; return a signed URL       | JWT                 | AC-64–AC-66    |
| POST   | `/billing/checkout`           | Create a Stripe Checkout Session                     | JWT                 | AC-67          |
| POST   | `/billing/portal`             | Create a Customer Portal session                     | JWT                 | AC-68          |
| POST   | `/webhooks/stripe`            | Stripe billing events                                | Stripe signature    | AC-69–AC-72    |
| POST   | `/webhooks/resend`            | Resend deliverability events                         | Resend HMAC         | —              |
| POST   | `/cron/poll`                  | Scheduled weather poll + verdict-change alert fan-out | OIDC               | AC-52–AC-60    |

### 4.4 Web tier page routes (`gonogo-web`)

| Method   | Path                  | Purpose                          | Source AC           |
| -------- | --------------------- | -------------------------------- | ------------------- |
| GET      | `/`                   | Marketing landing                | —                   |
| GET/POST | `/signup`             | Signup form / form action        | AC-01, AC-04, AC-05 |
| GET/POST | `/login`              | Login form / form action         | AC-03               |
| GET      | `/auth/callback`      | Magic-link / OAuth callback       | AC-02, AC-04, AC-05 |
| GET/POST | `/forgot-password`    | Password-reset request           | AC-06               |
| GET      | `/app`                | The verdict view                 | AC-39–AC-46         |
| GET/POST | `/app/onboarding`     | Onboarding + disclaimer ack       | AC-09–AC-13         |
| GET/POST | `/app/minimums`       | Personal-minimums profile editor  | AC-14–AC-18         |
| GET      | `/app/trips`          | Saved-trip list                  | AC-48               |
| GET      | `/app/trips/:id`      | Saved-trip detail + WINGS-PDF CTA | AC-48, AC-64        |
| GET      | `/app/upgrade`        | Paywall / pricing                | AC-67               |
| GET      | `/legal/terms`        | Terms of service                 | AC-79               |
| GET      | `/legal/privacy`      | Privacy policy                   | AC-79               |
| GET      | `/legal/refund`       | Refund policy                    | AC-79               |

## 5. Out of scope (spec-level cuts)

Reiterating the Discovery / research §5.4 cuts for spec clarity. These
have refusal criteria, not acceptance criteria. Asking for any of them
in a Phase 5 PR triggers `spec-guardian` → BLOCK without a superseding
ADR: weather-product depth (radar, prog charts, winds aloft, NOTAMs,
PIREPs-as-a-feature), flight planning / routing / charts / W&B, managing
the pilot's regulatory currency, aircraft airworthiness tracking, a
commercial weather API, SMS, Web Push, native apps, ML/AI, real-time
ADS-B, a social feed, lifetime billing.

## 6. Open questions for the founder

Carried from Discovery + Architecture, all still open and all affecting
the spec:

- **Q1 (yellow-band definition)** — AC-31 assumes a small fixed caution
  buffer. The exact buffer is a founder call.
- **Q2 (WINGS-PDF fidelity)** — AC-64 / AC-65 assume a clean WINGS-suitable
  summary, not a pixel-exact FAA FRAT clone.
- **Q3 (free tier vs trial; paywall trigger)** — Feature 14 assumes a
  14-day time-based trial. An activity-based trigger would change
  AC-73 / AC-74.
- **Q4 (poll cadence)** — Feature 10 assumes a single 30-minute poll.
- **Architecture Q3 (`airports` data source)** — AC-19 / AC-20 assume a
  seeded `airports` table; the source affects the seed migration.

Spec is otherwise unblocked: these are configuration-shaped decisions,
not structural ones.

---

**Phase 3 status: DRAFT — not founder-approved.** Phase 4 (Plan) draft
exists alongside this one. Phase 3 is not complete until the founder
approves this artifact and resolves the carried-forward questions.
