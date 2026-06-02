# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

The source of truth for scope, architecture, and sequencing is [docs/product-research.md](docs/product-research.md) — the full MVP V1 build plan for **Go/No-Go**, a personal-minimums and go/no-go decision aid for US general-aviation pilots. The product lets a pilot save their own weather minimums (ceiling, visibility, crosswind component, gust factor, IFR-currency self-check, time-since-last-flight); it pulls METAR/TAF for a departure and destination from the free public NWS Aviation Weather Center APIs, parses them, evaluates them against the pilot's stated minimums, and renders a green/yellow/red verdict plus a printable WINGS-style risk-assessment summary; and it emails the pilot when a saved trip's verdict changes. **That file is sacred** — it is never edited after bootstrap. When decisions change, write an ADR in [docs/adr/](docs/adr/) that links back and supersedes the specific row. The chain of supersession is the audit trail.

The repo is pre-implementation. This commit lands the Phase 0 scaffold (rules, subagents, CI, founder-action track, ADR template, Go-backend skeleton) **alongside draft Phase 1–4 artifacts** in `docs/`. **No founder approval is recorded for any phase** — `docs/01-discovery.md` through `docs/04-plan.md` and ADRs `0001`–`0006` are review drafts. Phase 1 (Discovery) is re-run / finalized via [prompts/01-discovery-kickoff.md](prompts/01-discovery-kickoff.md).

## Aviation Cortex platform integration

This gear ships as part of the Aviation Cortex portfolio. The platform contract that governs the gear's public surface is documented in [iac-tickerbeats ADR-0006](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/adr/0006-path-routing-and-web-component-shell.md) and the master [landing-pages brief](https://github.com/Ruscigno/aviation-cortex/blob/main/docs/landing-pages-brief.md). **This section is the current authority for the items below; conflicting bullets in [Architecture (one paragraph)](#architecture-one-paragraph) and [Load-bearing decisions](#load-bearing-decisions-do-not-re-litigate-without-cause) are tagged inline as `[SUPERSEDED by Aviation Cortex platform integration]` where they appear.** They are kept verbatim as historical record per the supersession-trail convention.

**Forward-looking guarantees gear code must respect:**

- **Frontend framework — not yet scaffolded**: per [iac-tickerbeats ADR-0004 §1](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/adr/0004-aviation-cortex-platform-shell.md), the platform-wide stack is **SvelteKit 2 + Svelte 5 (runes) + Tailwind v4 + pnpm 10**. This gear currently has no frontend scaffold on disk; the SvelteKit project will be created when the gear is brought under the Cortex umbrella.
- **Public URL**: `aviationcortex.com/gonogo/*` (path-based; this gear's slug is `go-nogo`, abbreviated `gng` in dense contexts). Routed via Cloudflared ingress to a local web process on port `3018`. **Open question**: the specific path segment (`/gonogo` vs `/gng` vs `/go-nogo`) is pending a portfolio-wide consistency decision raised in currency-hub PR #3 review — may change before launch.
- **Subscription**: covered by the single Cortex bundle subscription ($19/mo monthly, $108/yr founder's annual for the first 100 annual subscribers, $182/yr standard after the cap — landing-pages brief §7). No per-gear pricing. Paywall reads `cortex.users.access_until` from shared Postgres.
- **Auth**: shared GoTrue at `auth.aviationcortex.com` (HS256). Single first-party cookie on `aviationcortex.com`, no wildcard.
- **Shared chrome**: header, footer, gear switcher, locale switcher, account menu, `part of Cortex` badge, and loading skeleton are rendered by the Web Component shell `<aviation-cortex-shell>` loaded from `aviationcortex.com/assets/shell.js`. The gear does NOT re-implement any of those.
- **Locale propagation** (landing-pages brief §28.X): locale is shell-owned. Read from the `<aviation-cortex-shell>` reflected attribute + `cortex:locale-changed` event. **Once the gear is on SvelteKit**, the correct propagation pattern is: at root-component initialization (a `+layout.svelte` `<script>` block), create a reactive container — a Svelte 5 `$state` rune or a `writable` store — and register it with `setContext('locale', container)` exactly once. `setContext` runs only during component construction and CANNOT be called from a runtime event listener. The `cortex:locale-changed` listener then updates the *container's value* (e.g., `localeState.value = e.detail.locale` for a rune, or `localeStore.set(e.detail.locale)` for a store), which fires reactive re-renders in every consumer that reads via `getContext('locale')`. Gear code does NOT parse URL/cookie, does NOT call `navigator.language`, and does NOT render its own locale switcher.
- **Breadcrumb**: anchors at the gear's 3-letter abbreviation (`gng`) per landing-pages brief §4.7.4.

## How work proceeds

We work in named phases, each ending with a reviewable artifact. **Phase-artifact gates are stop-and-confirm — never auto-advance.** Per-ticket implementation work inside a milestone does NOT require per-PR founder approval; see [Working contract (cadence)](#working-contract-cadence) below. See [.claude/rules/engineering.md](.claude/rules/engineering.md#phase-gates) for the full SDLC.

@docs/working-contract.md
@.claude/rules/engineering.md
@.claude/rules/security.md
@.claude/rules/communication.md
@.claude/rules/journal.md

## Working contract (cadence)

The agent has **self-merge authority** for PRs that pass CI + auditor gates and do not touch any of the four founder-only categories below. The agent reports periodically (every 5–10 merged PRs, or at ≥10% overall progress) instead of seeking per-PR approval.

**Founder-only approval categories** (the only PR types gated):

1. **New external dependency** — any new npm/Go package, cloud service, MCP server, or third-party API beyond what's already pinned in [docs/product-research.md](docs/product-research.md) §1.
2. **New cost commitment > \$0** — any paid-service unlock or quota that costs money. V1 is free-tier-only per research §1.
3. **Schema-incompatible migration** — anything that breaks the data model implied by research §3 (minimums profiles, airports, saved trips, weather observations, verdict snapshots, alert audit, billing).
4. **Load-bearing-decision change** — touching any commitment in the [Load-bearing decisions](#load-bearing-decisions-do-not-re-litigate-without-cause) block, OR scope creep into the research §5.4 "cut from V1" list.

For any PR touching one of these, the agent opens the PR with a "FOUNDER APPROVAL REQUIRED — \<category\>" header and does not self-merge. For all other PRs: CI green + auditor PASS/CONCERN = self-merge, logged in `journal/decisions.md`.

**Reporting cadence:**
- **Batch report** every 5–10 merged PRs (≤300 words in chat).
- **Milestone report** at every ≥10% overall progress (in chat + `journal/milestones.md`).
- **Proactive blocker alert** immediately on foreseeing a blocker that needs founder attention.

## Architecture (one paragraph)

> **[SUPERSEDED by Aviation Cortex platform integration]** — Cloud Run deploy → Mac-stack per local ADR → path-routed under aviationcortex.com per iac-tickerbeats ADR-0006. ES256 + JWKS auth → HS256 GoTrue. Single-vendor Supabase → shared Postgres with `cortex.users`. Standalone Stripe Checkout → bundle subscription per landing-pages brief §7. Framework: see Cortex integration block above. **Kept verbatim below as historical record**; the paragraph is no longer the authority on these points.

Go/No-Go is **two deployables on Cloud Run (us-central1, scale-to-zero)**: a SvelteKit (Svelte 5 runes) PWA web tier (`web/`) and a **Go 1.25 backend service** (`backend/`). The web tier serves SSR pages, handles auth UI, and does simple user-owned CRUD browser-direct via `@supabase/supabase-js` (RLS gates it); for anything needing the weather fetch, the verdict engine, the poll cron, or PDF generation it calls the Go backend. The Go service ([ADR-0001](docs/adr/0001-go-backend-for-weather-polling.md)) owns the four things that genuinely need a server: the **NWS Aviation Weather Center integration** (fetch + parse METAR/TAF — [ADR-0002](docs/adr/0002-nws-aviation-weather-api.md)), the **verdict-evaluation engine** (a pure function — `(parsedWeather, minimums) → verdict` — per [ADR-0003](docs/adr/0003-verdict-engine-pure-function.md)), the **scheduled weather poll + verdict-change alert cron** (`POST /cron/poll`, OIDC-authed, called by Cloud Scheduler — [ADR-0005](docs/adr/0005-weather-poll-cadence-and-caching.md)), and **server-side WINGS-PDF generation**. The Go service uses stdlib `net/http.ServeMux`, `pgx/v5` + `sqlc`, `slog`, and verifies Supabase-issued ES256 JWTs against the JWKS endpoint — no chi/gin, no GORM. A **single Supabase project** hosts Postgres + GoTrue Auth + RLS + PostgREST; **Row-Level Security is the primary authorization layer for browser-direct CRUD**, and the Go backend additionally scopes every query by the JWT-derived `owner_user_id`. The alert cron's at-most-once guarantee is a **DB UNIQUE constraint**, per-recipient, on `alert_audit` keyed by the verdict-transition identity ([ADR-0004](docs/adr/0004-alert-dedupe-and-email-channel.md)) — not application logic; the alert channel is **email** ([ADR-0004](docs/adr/0004-alert-dedupe-and-email-channel.md)), since the portfolio cut Web Push from V1. Migrations use `golang-migrate` (sequential `db/migrations/NNNN_*`), shared by both tiers. Cloudflare R2 holds server-generated WINGS risk-assessment PDFs. Stripe Checkout + Customer Portal handle billing ([ADR-0006](docs/adr/0006-billing-model.md)). Resend sends transactional email and the verdict-change alert fan-out. PostHog + Sentry cover analytics and errors. There is **no Python service in V1** — Go/No-Go has no ML component.

## Load-bearing decisions (do not re-litigate without cause)

> **2026-05-24 — Shared Mac stack pivot ([ADR-0007](docs/adr/0007-shared-mac-stack-supersedes.md))** supersedes the cloud-hosting bullets below (Cloud Run us-central1 + Cloud Scheduler + single-vendor Supabase cloud — kept verbatim as historical record). When implementation begins, `gng.tickerbeats.com` (web) + `gng-api.tickerbeats.com` (backend) will run on the Mac via Cloudflare Tunnel against shared Postgres + shared GoTrue from [iac-tickerbeats](https://github.com/Ruscigno/iac-tickerbeats); the weather-poll cron transport flips to a Mac launchd plist + shared `X-Cron-Secret`; see [portfolio architecture](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/portfolio-architecture.md). The NWS-as-trust-boundary posture, the "never default to green" safety invariant, R2 + Stripe + Resend are unchanged.

These were chosen deliberately in [docs/product-research.md](docs/product-research.md). Each has reasoning in the cited section — read it before proposing a swap.

- **SvelteKit (Svelte 5) + Tailwind + Vite-PWA** for the web tier, not Next.js. Bundle size and TTI dominate the mobile-airport use case (research §2.3).
- **A Go backend service on Cloud Run** ([ADR-0001](docs/adr/0001-go-backend-for-weather-polling.md)). Go/No-Go has a scheduled weather-poll cron, a third-party API integration (NWS), a verdict-evaluation engine worth isolating, and server-side PDF generation — the founder's portfolio rule assigns any product with a scheduled job / third-party polling / notification fan-out / server-side document generation to a Go service on Cloud Run. Conventions mirror `tail-number-radar` and the sibling `currency-hub`: stdlib `net/http.ServeMux`, `pgx/v5` + `sqlc`, `golang-migrate`, `slog`. No chi/gin/echo/fiber, no GORM (research §2.1).
- **The weather source is the NWS Aviation Weather Center public APIs** ([ADR-0002](docs/adr/0002-nws-aviation-weather-api.md)). Free, public US-government METAR/TAF data — no commercial weather licence. The NWS API is treated as **both a trust boundary and an availability dependency**: responses are validated and sanitized on ingest, and a stale-or-unavailable upstream degrades gracefully (the verdict surface says "weather unavailable", never green by default).
- **The verdict-evaluation engine is a pure function** ([ADR-0003](docs/adr/0003-verdict-engine-pure-function.md)). All minimums-comparison logic lives in `backend/internal/verdict` with no clock, no DB, no network I/O — the parsed weather and the minimums profile are arguments. It is the most heavily unit-tested package in the repo (≥95% coverage target); every comparison rule has a table-driven test. The web tier never re-implements the rules in TypeScript — it calls the Go API.
- **[SUPERSEDED by Aviation Cortex platform integration]** **Single-vendor Supabase: Postgres + Auth + RLS.** Browser uses `@supabase/supabase-js` for both auth and simple CRUD; **RLS is the primary authorization layer** for browser-direct calls. The Go backend connects via `pgxpool`, verifies GoTrue JWTs, and scopes every query by `owner_user_id` (research §2.2 / §3).
- **Alert dedupe is a DB UNIQUE constraint** ([ADR-0004](docs/adr/0004-alert-dedupe-and-email-channel.md)), per-recipient, over the verdict-transition identity `(saved_trip_id, user_id, from_verdict, to_verdict, observation_id)` on `alert_audit`. The constraint **is** the at-most-once guarantee — not a select-then-insert in Go.
- **The verdict-change alert channel is email** ([ADR-0004](docs/adr/0004-alert-dedupe-and-email-channel.md)). No SMS, no Web Push in V1 — the portfolio cut Web Push from V1 over the iOS PWA limitation (research §5.4). iOS PWA install is an in-app instructions card.
- **The weather poll runs on a fixed cadence with a shared-observation cache** ([ADR-0005](docs/adr/0005-weather-poll-cadence-and-caching.md)). The poll cron fetches METAR/TAF only for airports referenced by an active saved trip, caches each observation by `(station, issued_at)`, and respects an NWS-friendly request rate. V1 uses a single Cloud Scheduler job; per-trip cadence tuning is a documented V1.1 evolution.
- **Cloudflare R2 for user-facing files**, not Supabase Storage. Zero egress, 10 GB free; WINGS risk-assessment PDF exports go here (research §2.7).
- **[SUPERSEDED by Aviation Cortex platform integration]** **Stripe Checkout + Customer Portal + Billing**, two prices: `price_monthly` ($6/mo), `price_annual` ($39/yr) ([ADR-0006](docs/adr/0006-billing-model.md)). Webhook idempotency is a UNIQUE constraint on the Stripe event ID, not application logic (research §2.5).
- **Resend for email**, free 100/day / 3 000/mo. The **verdict-change alert fan-out is the closest free-tier watch item** — alert volume scales with active-saved-trip count and weather volatility. SPF + DKIM + DMARC on the sender domain before launch (research §2.6).
- **Cloud Run us-central1, single region, scale-to-zero**, two services (`gonogo-web`, `gonogo-api`). Cloudflare proxied CNAME → Cloud Run for SSL/WAF (research §2 and §9).
- **`golang-migrate` for migrations**, sequential `db/migrations/NNNN_*.up.sql` / `*.down.sql`, shared by both tiers. CI runs a round-trip (up → down-all → up) on every migration-touching PR. `sqlc diff` in CI catches schema/query drift.
- **PWA with Vite-PWA plugin** (manifest + service worker + maskable icons). No native shell in V1.
- **CI runs on self-hosted Woodpecker** on the founder's Mac, reachable from GitHub via Cloudflare Tunnel. Pipelines live in `.woodpecker/*.yml`; runner infrastructure lives in the separate [`iac-tickerbeats`](https://github.com/Ruscigno/iac-tickerbeats) repo. Don't reintroduce `.github/workflows/` — doing so re-incurs GitHub Actions billing.
- **Single-author policy.** Every commit on every branch is authored by the founder. `Co-Authored-By:` trailers (Claude or otherwise) are rejected by pre-commit AND CI; do not bypass with `--no-verify`.

## Hard external constraints

- **Free-tier-only V1.** No paid service is authorized without a merged ADR. The §1 stack table is the approved list; everything else needs justification.
- **Supabase free tier:** 500 MB Postgres DB, 1 GB storage (unused — we use R2), 50k MAU on Auth, 2 active projects, **7-day inactivity pause**. Plan migration to Supabase Pro ($25/mo) when ~10 paying customers exist OR DB approaches 400 MB; until then, ping the staging project at least weekly.
- **Cloud Run us-central1 free tier:** 2M req + 180k vCPU-s + 360k GiB-s/month — shared across **two services now**. Set a $5 GCP budget alert during F-02.
- **Cloud Scheduler free tier: 3 jobs.** V1 uses 1 (the weather-poll cron). Per-trip cadence tuning would push toward more — deferred (ADR-0005).
- **NWS Aviation Weather Center APIs:** free and public, but **not unlimited** — they are a US-government service with no SLA and an implicit fair-use rate expectation. The poll cron must batch requests, cache observations by `(station, issued_at)`, set a descriptive `User-Agent`, and back off on 429/5xx. There is no paid tier and no contract — upstream unavailability is a graceful-degradation case, not a payable escape hatch (ADR-0002, ADR-0005).
- **Resend:** 100 emails/day, 3 000/month, 1 verified domain. **The verdict-change alert fan-out is the binding constraint** — send volume scales with active-saved-trip count × weather volatility; watch it from the first 100 users. SPF + DKIM + DMARC must land before launch.
- **R2 free tier:** 10 GB storage, 1M Class-A ops, 10M Class-B ops. Zero egress.
- **PWA on iOS:** Web Push requires Add-to-Home-Screen; cut from V1 — the alert channel is email. iOS install is an in-app card.
- **Refund policy must be visible before launch** (research §9).

## Aviation-domain disclaimer (calibrated firm — a safety-of-flight decision aid)

Go/No-Go's output is **decision support for a safety-of-flight decision**. A pilot who launches into weather below their minimums trusting a wrong or stale Go/No-Go verdict is exposed, and so are we. The disclaimer treatment is therefore **firm — closer to `currency-hub`'s middle-bar than `acsready`'s training-journal footnote**, and arguably the strongest disclaimer surface in the portfolio after `tail-number-radar`'s FAR 91.403 contract, because the verdict speaks directly to a flight that may or may not be safe to make. The core statement — "**Go/No-Go is an advisory aid. The pilot in command is solely responsible for the go/no-go decision. The verdict is computed from minimums you entered and from public weather data that may be stale, delayed, or incomplete. Obtain an official weather briefing before every flight.**" — must appear on: the signup flow (acknowledged checkbox, persisted + versioned), **every verdict surface (the dashboard verdict, any saved-trip verdict)**, every verdict-change alert email, the WINGS risk-assessment PDF, the public app footer, and adjacent to any "weather unavailable" / stale-data state. Missing it from signup or any verdict surface is a CONCERN; missing it everywhere is a launch-readiness defect tracked in the risk register. See [.claude/rules/security.md](.claude/rules/security.md#aviation-domain-risk--the-go-nogo-disclaimer-calibrated-firm).

## Boundary — do not duplicate sibling products

Go/No-Go is a **personal-minimums decision aid**: it evaluates a flight's current weather against thresholds the pilot set for themselves and renders a verdict. It is **not** a weather / flight-planning / charts product — research §3 explicitly warns against weather depth and against avionics-equivalent calculators where being wrong matters legally; Go/No-Go differentiates on **personal-minimums treatment and decision-aid simplicity**, not on weather breadth. It is **not** `currency-hub`: Go/No-Go reads "am I IFR-current?" as **one yes/no input** to the verdict, but it does **not** manage the pilot's regulatory currency (BFR/IPC, medical, landing/IFR-approach recency) — that is `currency-hub`'s job. It is **not** `tail-number-radar` (an aircraft's airworthiness deadlines). The go-nogo ↔ currency-hub boundary is stated explicitly in [docs/01-discovery.md](docs/01-discovery.md): Go/No-Go never *manages* currency; currency-hub never renders a weather verdict. A PR that drifts Go/No-Go toward weather-product depth, toward managing regulatory currency, or toward flight planning is scope creep — `spec-guardian` BLOCKs it.

## Working with the spec

- The week-by-week plan (§6) is the authoritative sequence. When asked to implement, locate the matching week first and stay inside its scope.
- The §1 stack table, §3 system diagram + data model, and §6 weekly milestones are concrete enough to code against directly — link to them, don't paraphrase.
- The "cut from V1" list in §5.4 is a refusal list, not a backlog. Adding any of them requires founder override + an ADR superseding the row.
- Every claim about how a minimums comparison works must trace to the pilot-entered minimums profile. The verdict engine never invents a threshold the pilot did not set; where a regulatory or industry default is used (e.g. FAA VFR minimums as a fallback), it must be explicit and cited.

## Subagents available locally

Defined in [.claude/agents/](.claude/agents/) — invoke with the Agent tool.

- **`spec-guardian`** — reviews any change for scope creep against `docs/product-research.md` (especially §1 stack table, §5.4 cut list, §6 weekly milestones), the load-bearing-decisions block above, and the sibling-product boundary. Returns `PASS / CONCERN / BLOCK`.
- **`weather-and-verdict-auditor`** — reviews any change to `backend/internal/weather/**`, `backend/internal/verdict/**`, or anything that parses a METAR/TAF or computes a verdict. Verifies the verdict engine stays a pure function, NWS responses are validated/sanitized on ingest, METAR/TAF parsing handles malformed input safely, crosswind/component math is correct, the verdict never defaults to green on missing data, every comparison rule has a table-driven test, and the aviation disclaimer surfaces.
- **`alert-pipeline-auditor`** — reviews any change to `backend/internal/alerts/**`, the poll cron handler, or alert tables. Verifies the cron is OIDC-authed, the dedupe is a DB UNIQUE constraint (per-recipient, keyed by the verdict transition), the email send is post-dedupe, the NWS request budget is respected, and no PII reaches the logs.
- **`rls-and-tenancy-auditor`** — reviews migrations and any code path touching user-owned data. Verifies RLS on every user-owned table, the Go backend's per-request owner predicate, and the WINGS-PDF / any share surface's snapshot-only exposure.

Invocation triggers documented in [.claude/rules/engineering.md](.claude/rules/engineering.md#subagent-invocation-triggers).

## Update cadence for this file

Update when:
- A new ADR is accepted that supersedes a prior decision (refresh the load-bearing block, link the ADR).
- A new external constraint is discovered (free-tier change, NWS rate-limit change).
- A new subagent is added.

**Don't** update just because implementation changed — `CLAUDE.md` carries invariants, not code state.
> **2026-06-01 — Aviation Cortex platform integration ([iac-tickerbeats ADR-0006](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/adr/0006-path-routing-and-web-component-shell.md))** further supersedes specific bullets below (Single-vendor Supabase → shared Postgres with `cortex.users`; per-gear Stripe pricing → single Cortex bundle subscription; framework assumption → see Cortex integration section above for the current scaffold-vs-target reconciliation). See the [Aviation Cortex platform integration](#aviation-cortex-platform-integration) section above for the current authority. Inline `[SUPERSEDED by Aviation Cortex platform integration]` tags mark the affected bullets below.

