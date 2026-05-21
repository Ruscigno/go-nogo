# 0001. Go/No-Go gets a Go backend service, not a web-only stack

- Status: proposed
- Date: 2026-05-21
- Deciders: founder (draft — awaiting approval)

## Context and problem statement

The founder's portfolio default is the ACSReady stack: a SvelteKit PWA
on Cloud Run, a single Supabase project, with SvelteKit server routes
covering the handful of paths that need a server secret. That stack is
web-only — no separate backend service. It works for a pure-CRUD product
like ACSReady.

Go/No-Go is not pure-CRUD. It has four jobs that a request/response
SvelteKit-on-scale-to-zero runtime handles poorly or not at all:

1. **A third-party API integration.** The whole input is METAR/TAF
   fetched from the NWS Aviation Weather Center API. That fetch wants a
   timeout-bounded HTTP client, a descriptive `User-Agent`, 429/5xx
   backoff, response validation, and a defensive parser — server work.
2. **A scheduled weather poll with a verdict-change alert fan-out.** The
   product's retention mechanic is "we emailed you when your saved
   trip's verdict changed". Something must run on a schedule, fetch
   fresh weather for every active saved trip, re-evaluate, and email on
   change. SvelteKit on Cloud Run with `min-instances=0` is a
   request-driven runtime with no scheduler.
3. **A verdict-evaluation engine.** Go/No-Go's correctness is the
   correctness of the comparison between parsed weather and the pilot's
   minimums — a safety-of-flight decision aid. That deserves to be a
   pure, deterministic, exhaustively table-tested package — and to exist
   exactly once, not re-implemented in TypeScript.
4. **Server-side WINGS-PDF generation.** The risk-assessment PDF is
   rendered server-side from the engine + the weather snapshot.

The founder's stated portfolio rule: *any product needing scheduled
jobs, notification fan-out, server-side document generation, or
third-party API polling gets a Go service on Cloud Run, following
tail-number-radar's Go conventions.* Go/No-Go triggers that rule on all
four counts. This decision is **load-bearing** — it changes the
deployable count, the CI surface, and the architecture diagram — so it
must be settled before any code lands.

## Decision drivers

- **A third-party integration + a scheduler are needed.** Cloud
  Scheduler → an OIDC-authed endpoint on a scale-to-zero Go service
  costs \$0 idle and spins the container up on its cadence. The
  alternative — a SvelteKit service pinned at `min-instances=1` purely
  to host an in-process timer — is a recurring ~\$5/mo cost for an idle
  container.
- **The verdict engine wants isolation.** Go's `testing` package and
  table-driven tests are an excellent fit for exhaustively testing the
  comparison rules and the "never default to green" invariant (ADR-0003).
- **The NWS fetch is a trust boundary** (ADR-0002) — validation,
  sanitization, backoff, defensive parsing belong in a real server, not
  scattered across SvelteKit endpoints.
- **Portfolio consistency.** The siblings `tail-number-radar` and
  `currency-hub` already run a Go service on Cloud Run with exactly
  these conventions (stdlib `net/http.ServeMux`, `pgx/v5` + `sqlc`,
  `golang-migrate`, `slog`). Reusing them is one mental model, not two.
- **No ML component.** Go/No-Go has no AI/ML feature, so the portfolio's
  "ML → Python service" rule does not apply. Go covers the whole
  backend.
- **Free-tier discipline.** Two Cloud Run services both scale to zero;
  the combined free tier (2M req/mo) is far above V1 projections.

## Considered options

1. **Web-only — SvelteKit + Supabase, no separate service.** Host the
   poll as an in-process timer on a `min-instances=1` SvelteKit service;
   implement the NWS fetch, the parser, and the verdict engine in
   TypeScript inside `web/`.
2. **SvelteKit web tier + a Go backend service on Cloud Run.** The Go
   service owns the NWS integration, the verdict engine, the poll cron,
   and WINGS-PDF generation; the web tier does simple CRUD and proxies
   the rest.
3. **SvelteKit web tier + the poll as a separate Cloud Run Job, no
   standing Go service.** A Cloud Run Job for the poll; the NWS fetch +
   parser + engine still in TypeScript in `web/`.

## Decision outcome

Chosen option: **Option 2 — a SvelteKit web tier plus a Go backend
service on Cloud Run** — because Go/No-Go triggers the founder's
portfolio backend rule on four independent counts (third-party API
integration, scheduled job + notification fan-out, server-side
computation worth isolating, server-side document generation), and a
dedicated Go service gives the verdict engine the isolated, table-tested
home its safety-relevant correctness demands.

### Positive consequences

- The poll is a clean OIDC-authed endpoint on a scale-to-zero service —
  \$0 idle.
- The verdict engine lives in one place, in Go, exhaustively testable as
  a pure function (ADR-0003). The web tier never re-derives a comparison.
- The NWS trust-boundary handling (validation, backoff, defensive parse)
  is concentrated in one well-tested server package.
- Conventions are shared with `tail-number-radar` and `currency-hub` —
  one Go mental model across the portfolio.
- Server secrets (Stripe, Resend, R2, the URL-signing key) concentrate
  in the Go service; the web tier's secret surface shrinks.

### Negative consequences

- **Two deployables instead of one.** Two Dockerfiles, two Cloud Run
  services, a slightly larger CI surface and Secret-Manager footprint.
  Mitigated by one `.woodpecker/deploy.yml` with path-gated steps.
- A web↔backend network hop for engine-backed calls. Acceptable —
  same-region Cloud Run, and the calls are not latency-critical.
- More to learn/maintain if the founder is more fluent in TS than Go —
  but `tail-number-radar` and `currency-hub` already establish the Go
  conventions.

## Pros and cons of each option

### Option 1 — web-only

- 👍 One deployable, simplest CI.
- 👍 No web↔backend hop.
- 👎 The poll needs `min-instances=1` → a recurring idle cost, OR an
  awkward external-trigger hack into a request runtime.
- 👎 The verdict engine and the METAR parser in TypeScript inside a UI
  repo are harder to isolate and table-test to the rigor a
  safety-of-flight decision aid demands.
- 👎 The NWS trust-boundary handling spreads across SvelteKit endpoints.
- 👎 Contradicts the founder's portfolio backend rule.

### Option 2 — SvelteKit web + Go backend (chosen)

- 👍 A real home for the poll cron (OIDC endpoint, scale-to-zero).
- 👍 The verdict engine isolated as a pure, table-tested Go package.
- 👍 The NWS integration concentrated behind one defensive boundary.
- 👍 Portfolio-consistent with `tail-number-radar` + `currency-hub`.
- 👎 Two deployables; larger CI + secret surface.

### Option 3 — web + a Cloud Run Job for the poll only

- 👍 The poll gets a proper scheduled runtime.
- 👍 One fewer standing service than Option 2.
- 👎 The verdict engine + the METAR parser + the NWS client are still in
  TypeScript in `web/` — the same isolation/testing weakness as Option 1.
- 👎 WINGS-PDF generation still has no clean server-side home.
- 👎 A Cloud Run Job plus a SvelteKit service plus the engine-in-TS is
  arguably *more* moving parts than one coherent Go service.

## Links

- Spec section: [docs/product-research.md](../product-research.md) §2.1
  (backend reasoning), §3 (architecture).
- Related ADRs: [0002](0002-nws-aviation-weather-api.md) (the weather
  source), [0003](0003-verdict-engine-pure-function.md) (the engine as a
  pure function), [0004](0004-alert-dedupe-and-email-channel.md) (the
  alert pipeline), [0005](0005-weather-poll-cadence-and-caching.md) (the
  poll cadence).
- Sibling-repo reference: `tail-number-radar` and `currency-hub` — Go
  services on Cloud Run, `net/http.ServeMux` + `pgx/v5` + `sqlc` +
  `golang-migrate`.
- External: [Cloud Run pricing](https://cloud.google.com/run/pricing),
  [Cloud Scheduler free tier](https://cloud.google.com/scheduler/pricing).
