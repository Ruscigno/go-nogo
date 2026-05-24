# 0007. Shared Mac stack supersedes per-product cloud (Go/No-Go)

- Status: proposed
- Date: 2026-05-24
- Deciders: founder
- Supersedes (in part): the load-bearing-decision bullets in `CLAUDE.md` that pin **Cloud Run us-central1** (two services) and **Cloud Scheduler** (the weather-poll cron transport) and **single-vendor Supabase cloud (Postgres + GoTrue Auth + RLS)**. The NWS Aviation Weather Center integration, Cloudflare R2, Stripe, Resend, and the Go backend / `pgx/v5` / `sqlc` / `golang-migrate` shape are unchanged.

## Context and problem statement

Go/No-Go's existing plan ships two Cloud Run services (`gonogo-web` and
`gonogo-api`) against a hosted Supabase project (Postgres + GoTrue), with
Cloud Scheduler firing the weather-poll cron, the NWS Aviation Weather Center
public API as the weather source, R2 for WINGS risk-assessment PDFs, Stripe
for billing, and Resend for the verdict-change alert fan-out.

The portfolio plan is 11 such products — repeating that account-creation and
token-management ceremony eleven times before any product has proven demand
is the wrong burn for a solo, pre-revenue founder.

The infra repo ([`iac-tickerbeats`](https://github.com/Ruscigno/iac-tickerbeats))
has been extended with a shared Mac stack ([its ADR-0003](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/adr/0003-shared-mac-stack.md))
that hosts Postgres + GoTrue + per-project Cloudflare-Tunnel ingress on the
founder's Mac. The full portfolio architecture is in
[`iac-tickerbeats/docs/portfolio-architecture.md`](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/portfolio-architecture.md).

Go/No-Go has not begun implementation. This ADR records what changes for
**Go/No-Go specifically** when its build begins on the shared stack instead
of cloud per product.

## Decision drivers

- Per-product setup cost approaches zero (one `make new-project` invocation).
- No new monthly cost. Cloudflare (DNS + Tunnel + R2) + Resend + Stripe are
  the only external services portfolio-wide — all already used. The NWS
  API is keyless public data.
- Customer identity unified — one GoTrue, parent-domain cookie.
- The Mac is a single point of failure for the whole portfolio; the trade-off
  is accepted at <100 paying users per product.

## Considered options

1. **Status quo** — keep Go/No-Go plan on Cloud Run + cloud Supabase + Cloud Scheduler.
2. **Pivot Go/No-Go to the shared Mac stack** — the iac-tickerbeats infra.

## Decision outcome

**Chosen: 2.** Go/No-Go will run on the shared Mac stack when implementation
begins. **No code lands in this ADR** — the repo is pre-implementation; this
is a planning-doc update only. The cloud-stack bullets in `CLAUDE.md` are
kept verbatim as historical record; this ADR is the supersession.

### What changes for Go/No-Go when implementation begins

- **Subdomain assignment.** `gng.tickerbeats.com` (SvelteKit web tier) +
  `gng-api.tickerbeats.com` (Go backend) per the portfolio's
  two-subdomain convention.
- **Both tiers host on the Mac** behind per-project Cloudflare Tunnels —
  no Cloud Run services, no Cloudflare Workers, no Vercel. The Go service
  runs as a Docker container alongside the SvelteKit container.
- **Postgres + GoTrue are the shared instances** at
  `host.docker.internal:5433` + `https://auth.tickerbeats.com`. The
  single-Supabase / RLS-primary shape is preserved — RLS still gates
  browser-direct `supabase-js` CRUD; only the GoTrue endpoint and the
  Postgres host change.
- **JWT verification** flips to HS256 against the shared
  `GOTRUE_JWT_SECRET` for the Mac-pivoted runtime; the asymmetric-keys
  path (ES256 + JWKS) is the V1.1 evolution when GoTrue ships that feature.
- **The weather-poll cron transport changes** from Cloud Scheduler OIDC
  to a Mac `launchd` plist invoking `POST /cron/poll` with a shared
  `X-Cron-Secret` header (constant-time compared in the Go handler).
  The per-recipient verdict-transition DB UNIQUE constraint (ADR-0004)
  is unchanged.
- **The NWS Aviation Weather Center integration is unchanged.** The Go
  backend still fetches METAR/TAF with a descriptive `User-Agent`,
  caches by `(station, issued_at)`, and respects the AWC fair-use rate
  — independent of where the Go backend runs.
- **R2 is unchanged.** WINGS risk-assessment PDFs stay on Cloudflare R2.
- **CI/CD shape is unchanged.** Woodpecker remains the CI; the deploy
  stage rewrites to `git fetch && git reset --hard origin/main &&
  docker compose up -d --build` on the Mac, replacing `gcloud run deploy`.
- **Stripe + Resend** are unaffected; only the success-URL hostname
  changes.

### What does NOT change

- The verdict-engine-as-pure-function (ADR-0003), the "never default to
  green" safety invariant, the NWS-as-trust-boundary posture (ADR-0002),
  the per-recipient alert dedupe (ADR-0004), the weather-poll cadence +
  cache (ADR-0005).
- `golang-migrate` migrations, `sqlc diff` in CI, the cross-tenant
  regression test.

### Phasing

- **Phase 1 — this ADR (docs only, today).** Annotates `CLAUDE.md`, amends
  `docs/product-research.md`, assigns subdomains in `.env.example`. No
  code, no migrations.
- **Phase 2 — at the start of implementation.** Phase 0 / Phase 1
  artifacts get cut against the Mac stack from the start; no
  intermediate cloud-deployment ever ships.

### Positive consequences

- Setup of project N+1 is `make new-project SLUG=gng …` — minutes, not hours.
- Customer can use one tickerbeats identity across every product.
- Free-tier discipline preserved — the Mac stack adds no monthly cost.

### Negative consequences

- **HS256 + shared `GOTRUE_JWT_SECRET`** across every backend's `.env`.
  Leaking one product's `.env` compromises portfolio-wide auth.
  Mitigations: `.env` 0600, gitleaks pre-commit, no `.env` in CI logs.
- **The Mac is a SPOF** for the whole portfolio. Acceptable at current
  scale; revisit per-product at ~100 paying users. The
  "weather-unavailable verdict surface" safety invariant from ADR-0002
  means a Mac outage degrades to "unavailable", never to "green".

## Links

- [iac-tickerbeats portfolio architecture](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/portfolio-architecture.md)
- [iac-tickerbeats ADR-0003 shared Mac stack](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/adr/0003-shared-mac-stack.md)
- ADR [0001. Go backend for weather polling](0001-go-backend-for-weather-polling.md) — unchanged in shape; only the host moves.
- ADR [0002. NWS Aviation Weather API](0002-nws-aviation-weather-api.md) — unaffected.
- ADR [0003. Verdict engine pure function](0003-verdict-engine-pure-function.md) — unaffected.
- ADR [0004. Alert dedupe and email channel](0004-alert-dedupe-and-email-channel.md) — DB UNIQUE constraint unchanged; only cron transport differs.
- ADR [0005. Weather poll cadence and caching](0005-weather-poll-cadence-and-caching.md) — unaffected.
