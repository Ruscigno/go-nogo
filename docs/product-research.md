> **Amendment 2026-05-24 — Shared Mac stack pivot.** Sections below referring to Cloud Run / Cloud Scheduler / Supabase-cloud are SUPERSEDED by [ADR-0007](adr/0007-shared-mac-stack-supersedes.md). When implementation begins, Go/No-Go will run on the shared Mac stack ([portfolio architecture](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/portfolio-architecture.md)) — assigned subdomain `gng.tickerbeats.com` (frontend) + `gng-api.tickerbeats.com` (backend). The NWS Aviation Weather Center integration, R2, Stripe, and Resend are unchanged. The research below is preserved verbatim as the original source of truth.

---

# Go/No-Go — MVP V1 Development Plan & Architecture Blueprint

This document is the end-to-end build plan for a solo developer to ship
**Go/No-Go** — a personal-minimums and go/no-go decision aid for US
general-aviation pilots — over ~6 evenings/weekends-paced weeks, using
Google Cloud, Supabase free tiers, and the free public NWS Aviation
Weather Center APIs. It is opinionated, pragmatic, and biased toward
shipping over theoretical purity. It expands research §5 **Opportunity 8
— "Personal Minimums + Go/No-Go Decision Aid"**
(`/Users/sander/projects/2026/aviation/docs/ga_micro_saas_combined_research.md`)
into a concrete plan.

Every decision is constrained by one hard truth: **the user is one
person with a few hours a night, building for paying customers who are
time-poor pilots making a safety-of-flight decision before a flight.**
Boring tech wins. The product's defensible moat is **the personal-
minimums treatment and decision-aid simplicity** — not weather breadth.

> **This file is the sacred source of truth.** It is never edited after
> bootstrap. Every other doc cites it by section number. When a decision
> changes, write an ADR in `docs/adr/` that supersedes the specific row.

---

## 0. The product in three sentences

Go/No-Go is a stand-alone web app where a US GA pilot saves their own
**personal-minimums profile** (ceiling, surface visibility, maximum
crosswind component, maximum gust factor, an IFR-currency self-check, a
maximum time-since-last-flight); the app pulls the current **METAR and
TAF** for a departure and a destination airport from the **free public
NWS Aviation Weather Center APIs**, parses them, computes the crosswind
and headwind components against a chosen runway, and renders a plain
**green / yellow / red verdict** comparing the weather to *the pilot's
own numbers*. It produces a **printable risk-assessment summary** suited
to an FAA WINGS flight-risk record, and it **emails the pilot when a
saved trip's verdict changes** via a scheduled weather poll. It is an
**advisory decision aid** — fast, honest, and narrow — not a weather
product, not a flight planner, and not a currency tracker.

**What it does NOT do** (the V1 cut list — see §5.4): it does not make
the go/no-go decision for the pilot, it is not a weather product (no
radar, prog charts, winds aloft, NOTAMs, icing/turbulence forecasting),
it does no flight planning / routing / charts / weight-and-balance, it
does not manage the pilot's regulatory currency (that is the sibling
`currency-hub`), it does not track aircraft airworthiness, and V1 has no
SMS, no Web Push, no native app, and no ML/AI.

---

## 1. Executive Summary of Decisions

| Layer             | Recommendation                                                                                                  | Why (one line)                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Frontend          | **SvelteKit (Svelte 5 runes) + Tailwind CSS + Vite-PWA plugin**                                                  | Smallest bundles, full-stack in one repo, great for mobile/slow networks at the airport                         |
| Backend           | **Go 1.25 service on Cloud Run** — stdlib `net/http.ServeMux`, `pgx/v5` + `sqlc`, `golang-migrate`, `slog`       | NWS API polling + a weather-poll cron + verdict evaluation + PDF generation need a real server (ADR-0001)        |
| Weather source    | **NWS Aviation Weather Center APIs** (METAR/TAF) — free, public, keyless US-government data                      | No commercial weather licence; the research's stated source for this opportunity (ADR-0002)                      |
| Verdict engine    | **A pure-function Go package** (`backend/internal/verdict`) — `(parsedWeather, minimums) → verdict`, no clock/IO | The product's correctness moat; deterministic, table-tested; never defaults to green (ADR-0003)                  |
| Database          | **Supabase Postgres** (free tier, upgrade to Pro at first ~10 paying users)                                      | Real Postgres; data + Auth + RLS in one product                                                                 |
| Auth              | **Supabase Auth** (email/password + magic link + Google OAuth)                                                   | Free up to 50k MAU; the Go backend verifies its ES256 JWTs                                                       |
| Authorization     | **RLS (browser-direct CRUD) + Go-backend owner predicate** — two layers                                          | RLS gates `supabase-js` calls; the Go service scopes every query by the JWT `sub`                               |
| Alert pipeline    | **Cloud Scheduler → OIDC-authed `POST /cron/poll`**; dedupe is a DB UNIQUE constraint; channel is email (ADR-0004) | The cron is idempotent by construction; the constraint IS the at-most-once guarantee; email is the V1 channel  |
| Poll cadence      | **One fixed-interval Cloud Scheduler job**, polling only active-saved-trip airports, observation-cached (ADR-0005) | Bounds NWS request volume; keeps Cloud Scheduler at 1 of its 3 free jobs                                         |
| File storage      | **Cloudflare R2** (10 GB + zero egress free) for server-generated WINGS risk-assessment PDFs                     | Supabase Storage's egress would be exhausted; R2 has none                                                        |
| Payments          | **Stripe Checkout + Customer Portal + Billing** — `$6/mo`, `$39/yr` individual (ADR-0006)                        | Stripe-hosted means no PCI exposure                                                                             |
| Email             | **Resend** (3 000/mo free, 100/day cap) — transactional + the verdict-change alert fan-out                       | The alert fan-out is the binding free-tier constraint; watch it from the first 100 users                        |
| Hosting           | **Google Cloud Run** us-central1, scale-to-zero — two services (`gonogo-web`, `gonogo-api`)                      | 2M req free; both services scale to zero when idle                                                              |
| Monitoring        | **Sentry** (free 5k errors/mo, web + Go SDKs) + Cloud Run native logs                                            | Don't add a third observability tool                                                                            |
| Analytics         | **PostHog Cloud free tier** (1M events + session replay + flags)                                                 | Single tool covers behavioural analytics + replay + flags                                                       |
| Local dev         | **Supabase CLI (Docker)** + **air** (Go reload) + **Vite dev server**                                            | The CLI runs the whole Supabase stack locally                                                                   |
| CI/CD             | **Self-hosted Woodpecker** on the founder's Mac via Cloudflare Tunnel                                            | Free; runner infra lives in `iac-tickerbeats`. No GitHub Actions billing                                        |

The single most important architectural decision is **"SvelteKit web
tier + a Go backend service, split deliberately."** Unlike a pure-CRUD
sibling product, Go/No-Go has four things that genuinely need a server:
a **third-party API integration** (the NWS Aviation Weather Center), a
**scheduled weather poll** with a verdict-change alert fan-out, a
**verdict-evaluation engine** worth isolating and table-testing as a
pure function, and **server-side WINGS-PDF generation**. The founder's
portfolio rule assigns any such product a Go service on Cloud Run. The
web tier stays SvelteKit and does simple CRUD browser-direct; it calls
the Go backend for the weather, the engine, the alert-managed data, and
the PDF. There is no Python service — Go/No-Go has no ML component.

The second most important decision is a **safety invariant, not a stack
choice**: the verdict **never defaults to green**. Missing, stale, or
unparseable weather yields an explicit "weather unavailable" verdict.
Everything in the architecture and the rules protects that invariant.

---

## 2. Tech Stack Recommendation With Detailed Reasoning

### 2.1 Backend: a Go service, decided — not deferred

A pure-CRUD micro-SaaS can often skip a dedicated backend and let
SvelteKit server routes handle the few server-secret paths. **Go/No-Go
cannot**, for four reasons:

1. **A third-party API integration.** Go/No-Go's whole input is METAR
   and TAF fetched from the NWS Aviation Weather Center API. That fetch
   wants a timeout-bounded HTTP client, a descriptive `User-Agent`,
   429/5xx backoff, and a defensive parser — all of which belong in a
   real server, not scattered across SvelteKit endpoints. Treating the
   NWS API as a trust boundary (validate, sanitize, length-cap) is
   server work.

2. **A scheduled weather poll with a verdict-change alert fan-out.** The
   product's retention mechanic is the "we emailed you when your saved
   trip's verdict changed" alert. Something must run on a schedule, fetch
   fresh weather for every active saved trip's airports, re-evaluate each
   verdict, and email when the verdict changes. SvelteKit on Cloud Run
   scale-to-zero is a request/response runtime — it has no scheduler.
   Cloud Scheduler → an OIDC-authed endpoint on a scale-to-zero Go
   service is the clean answer: \$0 idle, the cron spins the container up
   on its cadence.

3. **A verdict-evaluation engine worth isolating.** The correctness of
   this product is the correctness of the comparison between parsed
   weather and the pilot's minimums — a safety-of-flight decision aid. A
   wrong verdict (especially a false green) is a catastrophic bug. That
   logic deserves to live in a pure, deterministic, exhaustively
   table-tested package with no clock and no I/O (see §3, ADR-0003). Go's
   `testing` package and table-driven tests are ideal. Putting it
   server-side also means there is exactly **one** implementation — the
   SvelteKit tier never re-derives a comparison rule in TypeScript.

4. **Server-side WINGS-PDF generation.** The printable risk-assessment
   summary is rendered server-side (PDF) from the same engine and weather
   snapshot, written to R2, fetched via a signed URL.

**Go vs Python.** Go. Go/No-Go is HTTP fetching + METAR/TAF parsing +
date/number comparison + a cron + PDF rendering — no ML, no
data-science libraries. Go compiles to a ~15 MB static binary,
cold-starts under 100 ms, uses 5–20 MB RAM per Cloud Run instance, and
deploys as a distroless image. Python's only edge (ML libraries) does
not apply. **A Python service is reserved for a future ML/AI component;
V1 has none.**

**Framework within Go.** Stdlib `net/http.ServeMux` (Go 1.22+ enhanced
patterns). The route surface is small and RESTful; the enhanced ServeMux
handles it without a framework. **No chi, gin, echo, fiber.** This
mirrors the sibling `tail-number-radar` and `currency-hub` repos exactly
— `pgx/v5` + `sqlc`, `golang-migrate`, `slog`, no GORM, no
`database/sql`. The outbound NWS fetch uses the stdlib `net/http.Client`
— no weather SDK.

The formal architecture call is recorded in
[ADR-0001](adr/0001-go-backend-for-weather-polling.md).

### 2.2 Weather source: the NWS Aviation Weather Center APIs

Go/No-Go's input data is METAR (current observations) and TAF (terminal
aerodrome forecasts). The chosen source is the **NWS Aviation Weather
Center (AWC) public data APIs** — the same source the research §5
Opportunity 8 names explicitly, and the reason the opportunity is
viable: it is **free, public, keyless US-government data, with no
commercial licence**. Research §3 and §7 disqualify weather-as-a-product
precisely because competitive weather depth requires paid SiriusXM /
commercial feeds — Go/No-Go sidesteps that entirely by being a *decision
aid over the free observation data*, not a weather product.

Why the AWC API is the right source and what it costs us:

- It is the authoritative US source for METAR/TAF, free, and needs no
  account or key. That keeps V1 inside the free-tier discipline.
- It has **no SLA and an implicit fair-use expectation.** It is treated
  as **both a trust boundary and an availability dependency** (ADR-0002):
  responses are validated and length-capped on ingest; the parser is
  defensive; the fetch client batches station requests, caches each
  observation by `(station, issued_at)`, sets a descriptive
  `User-Agent`, and backs off on 429/5xx.
- **There is no paid escape hatch.** Unlike Resend (Pro tier) or
  Supabase (Pro tier), an AWC outage or a rate-block is not something
  money fixes. The mitigation is graceful degradation — the verdict
  surface says "weather unavailable", never green — plus being a good
  API citizen so we are never the client that gets blocked.

The formal call is [ADR-0002](adr/0002-nws-aviation-weather-api.md). A
commercial weather API was rejected: it costs money (breaks the
free-tier discipline), and "more weather" is explicitly *not* the wedge
(research §3, §5 Opportunity 8 — differentiate on personal-minimums
treatment, not weather breadth).

### 2.3 Frontend: SvelteKit

The web tier is a mobile-first PWA a pilot opens before a flight, often
on cellular at the airport. Bundle size and time-to-interactive
dominate. **SvelteKit (Svelte 5 runes)** ships a ~15–25 KB JS payload vs
~80–90 KB for Next.js — on mid-tier Android over LTE that is the
difference between an instant verdict and a noticeable lag. Form Actions
give progressive enhancement for free. Tailwind, `@supabase/ssr`, and
`@vite-pwa/sveltekit` are first-class. Deploys to Cloud Run with
`@sveltejs/adapter-node` in a ~50 MB image. Next.js is rejected for the
same reasons it is across the portfolio — the React ecosystem matters
for a team, not a solo dev optimizing mobile shipping speed.

### 2.4 Auth: Supabase Auth

Email + password (verification on), magic link, Google OAuth. No
phone/SMS in V1. The browser uses `@supabase/supabase-js`; the web SSR
tier uses `@supabase/ssr`'s `createServerClient` + `safeGetSession()`;
the Go backend verifies the `Authorization: Bearer <jwt>` header on
every authenticated route — ES256, JWKS fetched once at boot and cached,
HS256 rejected, `aud='authenticated'` enforced.

### 2.5 Payments: Stripe

Stripe Checkout for sign-up, Customer Portal for self-service
cancellation, Billing for subscription state. Two prices (ADR-0006):

- `price_monthly` — $6/mo recurring, individual.
- `price_annual` — $39/yr recurring, individual.

Research §5 Opportunity 8 prices this at $5–7/mo; $6/mo is mid-band.
There is no club/org tier — Go/No-Go is a single-pilot decision aid, not
a roster product (unlike `currency-hub`, which has a club roll-up). No
lifetime deal — weather decision-support is an indefinite, recurring
need.

Webhook events handled (and only these): `checkout.session.completed`,
`invoice.paid`, `invoice.payment_failed`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`charge.refunded`. Idempotency: a `processed_webhook_events` table with
`UNIQUE (provider, event_id)`; the handler short-circuits duplicates.
Signature verified against the **raw** request body. The webhook
receiver lives on the Go backend (it already owns server secrets and the
DB pool).

### 2.6 Email: Resend

Resend free tier: 3 000 emails/month, 100/day, 1 verified domain. This
covers transactional email (verification, magic link, password reset)
**and the verdict-change alert fan-out**. The alert fan-out is the
binding constraint: alert volume scales with active-saved-trip count ×
weather volatility — a stormy day across many saved trips produces more
verdict transitions, and each transition is an email. At ~100 paying
users with a handful of saved trips each, the daily alert count stays
well under 100/day in typical weather, but this must be watched — the
§11 risk register tracks it, and Resend Pro ($20/mo for 50k) is the
escape hatch. SPF + DKIM + DMARC on the sender domain before launch. The
alert channel is **email only** in V1 (ADR-0004) — no SMS, no Web Push.

### 2.7 File storage: Cloudflare R2

Go/No-Go's only V1 user-file surface is the **WINGS risk-assessment
PDF** — the Go backend renders a PDF from the verdict + the weather
snapshot + the pilot's minimums and writes it to R2; the pilot fetches
it via a signed GET URL valid ≤ 1 hour. R2's free tier (10 GB storage,
1M Class-A ops, **zero egress**) is ample for small PDFs. Supabase
Storage's egress would be the first wall; R2 has none. There is no user
*upload* path in V1.

### 2.8 Weather-poll cron + scheduling

Cloud Scheduler (free tier: 3 jobs) fires on a fixed cadence, posting an
OIDC-authed request to the Go backend's `POST /cron/poll`. The backend
verifies the OIDC token (issuer = Google, audience = the Cloud Run
service URL), then: collects the distinct set of airports referenced by
*active* saved trips, fetches fresh METAR/TAF for each (one fetch per
station, shared via the observation cache keyed by `(station,
issued_at)`), re-evaluates each saved trip's verdict via the pure
engine, and — for each saved trip whose verdict *changed* — attempts an
`INSERT … ON CONFLICT DO NOTHING RETURNING id` into `alert_audit` keyed
by the verdict-transition identity. The email is sent only when the
INSERT won the dedupe. **The UNIQUE constraint is the at-most-once
guarantee** — re-running the poll is a safe no-op (ADR-0004). V1 uses a
**single fixed-interval job** (ADR-0005); per-trip cadence tuning is a
documented V1.1 evolution that keeps the cron count at 1.

### 2.9 Monitoring, error tracking, analytics

- **Sentry** — free 5k errors/mo; SDKs in both the SvelteKit tier
  (client + server) and the Go backend.
- **Cloud Run** — built-in metrics + Cloud Logging. $5 budget alert.
- **PostHog Cloud free** — 1M events, session replay, feature flags.
  Funnel: landing → signup → personal-minimums profile saved → first
  verdict run → first saved trip → paywall → paid.
- **UptimeRobot** free — synthetic checks on `/healthz` (both services)
  and the landing page.

### 2.10 Local dev environment

- **Supabase CLI** + Docker — runs Postgres + GoTrue + Studio +
  Inbucket locally.
- **mise** to pin Node 20, Go 1.25, pnpm, golang-migrate, the Supabase
  CLI.
- **pnpm** for the SvelteKit project; **air** for Go hot reload.
- `.env` (gitignored) holds local keys; `.env.example` is checked in.
  The NWS AWC API needs no key — only the `NWS_AWC_*` config.

Project layout:

```
/web              # SvelteKit app
  /src/lib
  /src/routes
  Dockerfile
/backend          # Go service: weather + verdict engine + cron + PDF
  /cmd/server     # main()
  /internal
    /weather      # NWS AWC fetch + METAR/TAF parser
    /verdict      # the pure-function verdict-evaluation engine
    /alerts       # the weather-poll cron + verdict-change alert fan-out
    /wings        # server-side WINGS risk-assessment PDF generation
    /db           # sqlc-generated queries
  sqlc.yaml
  Dockerfile
/db
  /migrations     # golang-migrate *.up.sql / *.down.sql (shared)
  /seeds
/.woodpecker
.env.example
```

---

## 3. Architecture Blueprint

### 3.1 System diagram (described)

```
   ┌──────────────────────────┐
   │   Pilot                  │  (PWA installable, mobile-first)
   │   Browser                │
   └────────────┬─────────────┘
                │ HTTPS
                ▼
   ┌──────────────────────────┐
   │   Cloudflare DNS + CDN   │  (free; caches static assets)
   └────────────┬─────────────┘
                │
       ┌────────┴──────────────────────────────┐
       ▼                                        ▼
   ┌──────────────────────────┐    ┌──────────────────────────────┐
   │  Cloud Run: web          │    │  Cloud Run: api (Go)         │
   │  SvelteKit adapter-node  │───►│  - NWS AWC fetch + parser    │
   │  - SSR pages             │REST│  - verdict-eval engine       │
   │  - auth UI               │JSON│    (pure function)           │
   │  - simple CRUD proxied   │    │  - POST /cron/poll (OIDC)    │
   │    or browser-direct     │    │  - WINGS-PDF generation      │
   └───────┬──────────────────┘    │  - Stripe webhook receiver   │
           │ supabase-js (anon     └──┬────────┬─────────┬────┬───┘
           │  key + user JWT)         │ pgxpool │ Resend  │ R2 │ NWS AWC
           ▼                          ▼         ▼         ▼    ▼ (METAR/TAF)
   ┌─────────────────┐       ┌─────────────┐ ┌────────┐ ┌────┐ ┌──────────┐
   │   Supabase       │◄──────┤  (Go reads  │ │ Resend │ │ R2 │ │ NWS      │
   │   ─ Postgres     │       │  + writes   │ └────────┘ └────┘ │ Aviation │
   │   ─ Auth (GoTrue)│       │  via pgx)   │                   │ Weather  │
   │   ─ RLS policies │       └─────────────┘                   │ Center   │
   └─────────────────┘                                          └──────────┘
                                      ▲
   ┌──────────────────┐               │ OIDC HTTP POST (fixed cadence)
   │  Cloud Scheduler │───────────────┘
   │  (weather poll)  │
   └──────────────────┘

   ┌──────────────────┐   ┌──────────────┐   ┌──────────────┐
   │  Cloudflare R2   │   │   PostHog    │   │   Sentry     │
   │  WINGS PDFs      │   │   analytics  │   │   errors     │
   └──────────────────┘   └──────────────┘   └──────────────┘
```

Notes:

- The browser does simple, user-owned CRUD **directly** against Supabase
  via `@supabase/supabase-js` — RLS authorizes it.
- Anything needing the NWS fetch, the verdict engine, the cron-managed
  data, privileged SQL, or the WINGS PDF goes to the **Go backend**.
- The Go backend is `--no-allow-unauthenticated` on Cloud Run; it
  verifies a JWT (pilot calls) or an OIDC token (the cron).
- The NWS Aviation Weather Center is an **outbound** dependency — the Go
  backend calls it; it never calls us.
- No load balancer, no Redis, no message queue — Cloud Run + Supabase +
  R2 + Cloud Scheduler + the NWS API cover everything.

### 3.2 API design

REST over JSON. The browser uses `@supabase/supabase-js` for simple
CRUD; the Go backend exposes a small additive surface (full contract in
`docs/api/openapi.yaml`):

| Method | Path                          | Purpose                                              | Auth                |
| ------ | ----------------------------- | ---------------------------------------------------- | ------------------- |
| GET    | `/healthz`                    | Liveness                                             | none                |
| GET/PUT | `/me/minimums`               | Read / save the pilot's personal-minimums profile    | JWT                 |
| POST   | `/me/verdict`                 | On-demand: fetch weather for a dep/dest pair, return the verdict | JWT      |
| GET/POST | `/me/trips`                 | List / create saved trips                            | JWT                 |
| GET    | `/me/trips/:id`               | A saved trip + its latest verdict snapshot           | JWT                 |
| DELETE | `/me/trips/:id`               | Delete a saved trip                                  | JWT                 |
| POST   | `/me/trips/:id/wings-pdf`     | Render the WINGS risk-assessment PDF to R2; return a signed URL | JWT       |
| POST   | `/cron/poll`                  | Scheduled weather poll + verdict-change alert fan-out | OIDC (Cloud Sched.)|
| POST   | `/webhooks/stripe`            | Stripe billing events                                | Stripe signature    |
| POST   | `/webhooks/resend`            | Resend deliverability events                         | Resend HMAC         |

The weather *fetch* and the verdict *computation* are server-side and
authoritative; the browser never re-implements a parse or a comparison.

### 3.3 The verdict-evaluation engine — a pure function

This is the heart of the product and the reason for ADR-0003.
`backend/internal/verdict` is a deterministic package:

```
Evaluate(weather ParsedWeather, minimums Minimums, asOf time.Time) Verdict
```

- **No clock inside.** `asOf` is an argument — used only to judge
  observation freshness (is this METAR too old to trust?). Tests pass
  fixed dates.
- **No DB, no network, no I/O.** Parsed weather and minimums come in;
  a `Verdict` comes out. The NWS fetch + parse happens in the *caller*.
- **The verdict NEVER defaults to green.** This is the load-bearing
  safety invariant. If a required weather field is missing, the
  observation is stale, or the METAR/TAF was unparseable, the verdict for
  that input is **`unknown` / "weather unavailable"** — never `go`.
  `green` requires every checked field present, fresh, and within the
  pilot's minimum. `red` is a clear exceedance. `yellow` is a caution
  band (close to a minimum, or partial data).
- Each comparison is its own function with the minimum it checks:
  - ceiling vs the pilot's minimum ceiling
  - surface visibility vs the pilot's minimum visibility
  - computed crosswind component vs the pilot's maximum crosswind
  - gust factor (gust − steady) vs the pilot's maximum gust factor
  - the pilot's IFR-currency self-check (a yes/no input that gates
    whether IFR conditions are even eligible for a `go`)
  - time-since-last-flight vs the pilot's maximum
- **Crosswind / wind-component math is explicit and tested.** Crosswind
  = wind speed × sin(wind angle − runway heading); headwind = wind speed
  × cos(...). Runway-number → magnetic heading conversion is explicit.
- The on-demand `/me/verdict` and the cron's saved-trip re-evaluation
  both call this same function — no parallel implementation. The
  SvelteKit web tier never re-implements a comparison in TypeScript — it
  calls the Go API.

The `weather-and-verdict-auditor` subagent enforces all of this.

### 3.4 Weather ingestion — the NWS boundary

`backend/internal/weather` owns the NWS Aviation Weather Center
integration. It is a **trust boundary** (ADR-0002):

```
FetchObservation(ctx, station)  -> raw METAR/TAF (validated, length-capped)
ParseMETAR(raw)                 -> ParsedWeather  (defensive; never panics)
ParseTAF(raw)                   -> ParsedForecast (defensive; never panics)
```

- The fetch client: timeout-bounded, descriptive `User-Agent`,
  body-size cap, 429/5xx backoff. The airport identifier is validated
  against a strict ICAO/FAA pattern *before* the request URL is built.
- The parser: handles the documented METAR/TAF format and its sharp
  edges (`CAVOK`, `SKC/CLR/NSC`, vertical visibility `VV###`, missing
  ceiling group, `P6SM` / fractional visibility, `VRB` winds, gust
  groups, `AUTO`, `RMK`). Malformed input degrades to "unparseable →
  the verdict is `unknown`", never a guess and never a panic.
- Observations are cached by `(station, issued_at)` so one poll fetches
  each station once even when several saved trips share an airport, and
  an on-demand verdict reuses a fresh cached observation.

### 3.5 The verdict-change alert pipeline

```
Cloud Scheduler  ──OIDC POST──►  POST /cron/poll  (Go backend)
                                      │
                                      │ verify OIDC (issuer + audience)
                                      ▼
                  collect distinct airports of ACTIVE saved trips
                  for each station: FetchObservation (cache-aware, backoff)
                  for each active saved trip:
                    weather  := parsed observation(s) for its airports
                    verdict  := verdict.Evaluate(weather, trip.minimums, now)
                    if verdict != trip.last_verdict:
                      INSERT INTO alert_audit
                        (... ON CONFLICT
                          (saved_trip_id, user_id, from_verdict,
                           to_verdict, observation_id) DO NOTHING)
                        RETURNING id
                      if row returned → Resend.send(verdict-change email)
                      else            → skip (already alerted)
                      update trip.last_verdict + write the verdict snapshot
```

Invariants: the cron is OIDC-authed; the dedupe is the UNIQUE constraint
(ADR-0004), per-recipient and keyed by the verdict transition so a later
*different* transition legitimately alerts again; the email send fires
only post-dedupe; provider failure marks the audit row `status='failed'`
(retry with backoff); re-running the poll is a safe no-op. The channel
is email (ADR-0004).

### 3.6 Critical flows

- **Signup.** Supabase Auth (email/password + magic link + Google
  OAuth) → on first authenticated call the Go backend lazily creates the
  `pilots` row → onboarding asks display name + home airport (optional)
  + shows the **advisory-disclaimer checkbox** (persisted, versioned).
- **Saving personal minimums.** The pilot fills the minimums profile
  form (ceiling, visibility, max crosswind, max gust factor,
  IFR-current yes/no, max time-since-last-flight) → `PUT /me/minimums`.
- **On-demand verdict (the hot path).** The pilot enters a departure +
  destination airport (and a runway) → the dashboard calls
  `POST /me/verdict` → the Go backend fetches METAR/TAF, parses them,
  runs `verdict.Evaluate(...)` → returns the green/yellow/red verdict,
  the parsed weather, the component math, and the disclaimer.
- **Saving a trip + the alert.** The pilot saves the dep/dest pair as a
  trip → the poll cron watches it → on a verdict change the pilot gets
  the alert email. As §3.5.
- **WINGS risk-assessment PDF.** The pilot requests a PDF for a trip →
  the Go backend renders it (weather snapshot + minimums + verdict + a
  PAVE-checklist section) → writes to R2 → returns a signed GET URL.

### 3.7 STRIDE threat boundaries (enumerated in docs/02-architecture.md)

Trust boundaries the Phase 2 STRIDE pass walks: browser ↔ web,
browser ↔ Supabase, web ↔ Go backend, Go backend ↔ Supabase, **Go
backend ↔ NWS Aviation Weather Center** (the third-party data boundary),
Go backend ↔ R2, Go backend ↔ Stripe, Go backend ↔ Resend, and Cloud
Scheduler ↔ Go backend.

---

## 4. Data Model Deep Dive

### 4.1 Schema overview

```
pilots                     (one per auth.user — profile + disclaimer ack)
minimums_profiles          (the pilot's saved personal minimums)
airports                   (reference: identifier, name, runways/headings —
                            a small seeded reference table, not user-owned)
saved_trips                (a dep/dest pair + runway the pilot watches)
weather_observations       (cache: parsed METAR/TAF by (station, issued_at) —
                            shared public data, NOT user-owned)
verdict_snapshots          (a computed verdict for a saved trip at a time)
alert_audit                (one row per verdict-change alert — the dedupe contract)
wings_pdfs                 (a generated WINGS risk-assessment PDF record)
subscriptions              (Stripe subscription state)
processed_webhook_events   (Stripe + Resend webhook idempotency)
```

The model separates **what the pilot owns** (`minimums_profiles`,
`saved_trips`, `verdict_snapshots`, `wings_pdfs`) from **shared public
data** (`airports`, `weather_observations`). The shared tables are NOT
RLS-per-user — a METAR for KXYZ is the same METAR for everyone. The
user-owned tables get RLS. A `verdict_snapshot` joins a public
observation to a *specific pilot's* minimums and saved trip — it is
user-owned.

### 4.2 Effective schema (formal migrations land in Phase 5)

This is illustrative — the binding DDL is the `db/migrations/` files
written in Phase 5. Every user-owned table gets `enable row level
security` + own-read/own-write policies in the same migration.

```sql
-- pilots: identity bridge + profile + disclaimer ack -------------
create table pilots (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  email           citext not null,
  display_name    text not null,
  home_airport    text,
  disclaimer_acked_at      timestamptz,
  disclaimer_acked_version smallint not null default 0,
  created_at      timestamptz not null default now()
);

-- minimums_profiles: the pilot's saved personal minimums ---------
create table minimums_profiles (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references pilots(user_id) on delete cascade
                    default auth.uid(),
  label           text not null default 'My personal minimums',
  -- VFR-side weather minimums
  min_ceiling_ft         int  not null,    -- e.g. 1500
  min_visibility_sm      numeric(4,2) not null,  -- statute miles, e.g. 3.00
  -- wind
  max_crosswind_kt       int  not null,    -- demonstrated/comfort crosswind
  max_gust_factor_kt     int  not null,    -- gust minus steady wind
  -- non-weather decision inputs
  is_ifr_current         boolean not null default false,  -- pilot self-check
  max_days_since_flight  int  not null,    -- time-since-last-flight limit
  -- the verdict yellow-band buffers (Discovery Q — small fixed defaults)
  ceiling_caution_buffer_ft int not null default 500,
  visibility_caution_buffer_sm numeric(4,2) not null default 1.00,
  crosswind_caution_buffer_kt  int not null default 3,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- airports: reference data (seeded, not user-owned) -------------
create table airports (
  identifier   text primary key,        -- ICAO/FAA, e.g. 'KORL'
  name         text not null,
  latitude     numeric(8,5),
  longitude    numeric(8,5),
  -- runways as a small JSONB array: [{ "id":"07/25","heading_deg":68 }, ...]
  runways      jsonb not null default '[]'::jsonb
);

-- saved_trips: a dep/dest pair the pilot watches ----------------
create table saved_trips (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references pilots(user_id) on delete cascade
                    default auth.uid(),
  minimums_profile_id uuid not null references minimums_profiles(id),
  departure_ident text not null references airports(identifier),
  destination_ident text not null references airports(identifier),
  runway_heading_deg int,                  -- the runway the pilot plans
  planned_departure_at timestamptz,        -- optional; used to pick a TAF window
  is_active       boolean not null default true,  -- poll only active trips
  last_verdict    text,                    -- 'go' | 'caution' | 'no_go' | 'unknown'
  last_evaluated_at timestamptz,
  created_at      timestamptz not null default now()
);

-- weather_observations: the parsed-METAR/TAF cache (public) ------
create table weather_observations (
  id            uuid primary key default gen_random_uuid(),
  station       text not null,
  kind          text not null,            -- 'metar' | 'taf'
  issued_at     timestamptz not null,     -- the observation's own timestamp
  raw_text      text not null,            -- the raw METAR/TAF, stored as text
  -- parsed fields (nullable — a missing group is null, never a guess)
  ceiling_ft       int,
  visibility_sm    numeric(5,2),
  wind_dir_deg     int,
  wind_speed_kt    int,
  wind_gust_kt     int,
  flight_category  text,                  -- 'VFR'|'MVFR'|'IFR'|'LIFR' (AWC-provided)
  parse_ok         boolean not null,      -- false → treat as unparseable
  fetched_at       timestamptz not null default now(),
  unique (station, kind, issued_at)
);

-- verdict_snapshots: a computed verdict for a saved trip --------
create table verdict_snapshots (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references pilots(user_id) on delete cascade
                    default auth.uid(),
  saved_trip_id   uuid not null references saved_trips(id) on delete cascade,
  verdict         text not null,          -- 'go' | 'caution' | 'no_go' | 'unknown'
  departure_observation_id uuid references weather_observations(id),
  destination_observation_id uuid references weather_observations(id),
  -- the per-check detail the dashboard + PDF render
  detail          jsonb not null,         -- {ceiling:{...},visibility:{...},...}
  evaluated_at    timestamptz not null default now()
);

-- alert_audit: one row per verdict-change alert — the dedupe ----
create type alert_status as enum ('sent', 'failed');

create table alert_audit (
  id                 uuid primary key default gen_random_uuid(),
  saved_trip_id      uuid not null references saved_trips(id) on delete cascade,
  user_id            uuid not null references pilots(user_id) on delete cascade,
  from_verdict       text not null,
  to_verdict         text not null,
  observation_id     uuid references weather_observations(id),
  address            text not null,
  status             alert_status not null default 'sent',
  provider_message_id text,
  error_msg          text,
  sent_at            timestamptz not null default now(),
  -- ADR-0004: per-recipient dedupe keyed by the verdict transition.
  -- A later, DIFFERENT transition legitimately alerts again; a re-run of
  -- the same poll over the same observation is a safe no-op.
  unique (saved_trip_id, user_id, from_verdict, to_verdict, observation_id)
);

-- wings_pdfs: a generated WINGS risk-assessment PDF -------------
create table wings_pdfs (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references pilots(user_id) on delete cascade
                  default auth.uid(),
  saved_trip_id uuid references saved_trips(id) on delete set null,
  r2_key        text not null,            -- prefixed per pilot, non-enumerable
  verdict_snapshot_id uuid references verdict_snapshots(id),
  created_at    timestamptz not null default now()
);

-- billing -------------------------------------------------------
create type sub_status as enum
  ('trialing','active','past_due','canceled','incomplete','unpaid');

create table subscriptions (
  user_id              uuid primary key references pilots(user_id) on delete cascade,
  stripe_customer_id   text unique,
  stripe_subscription_id text unique,
  plan                 text,        -- 'monthly' | 'annual'
  status               sub_status not null,
  current_period_end   timestamptz,
  trial_ends_at        timestamptz,
  updated_at           timestamptz not null default now()
);

create table processed_webhook_events (
  provider     text not null,       -- 'stripe' | 'resend'
  event_id     text not null,
  event_type   text not null,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);
```

### 4.3 Row-Level Security

Every **user-owned** table (`pilots`, `minimums_profiles`,
`saved_trips`, `verdict_snapshots`, `wings_pdfs`, `subscriptions`) gets
RLS enabled with own-read / own-write policies keyed on `auth.uid()`, in
the same migration that creates the table. The **shared public** tables
(`airports`, `weather_observations`) are deliberately NOT RLS-per-user —
they hold no pilot identity; a read-for-all policy (or RLS off with a
grant) is correct. `alert_audit` and `processed_webhook_events` are
written by the cron / webhook app-admin path; `alert_audit` gets an
own-read policy so a pilot can see their alert history. The Go backend
additionally scopes every user-data query by the JWT-derived
`owner_user_id`; RLS + the owner predicate are belt-and-suspenders. The
`rls-and-tenancy-auditor` enforces this.

### 4.4 Seed data

Go/No-Go needs one real seed: the `airports` reference table. V1 seeds a
US public-airport list (identifier, name, lat/long, runway headings)
from a public dataset (e.g. the FAA's published airport data or the
OurAirports open dataset — both public; the chosen source is confirmed
in Phase 2 and is reference data, not a third-party *runtime* API, so it
is not a free-tier or licensing concern). `db/seeds/` carries a small
fixture (one pilot, a minimums profile, a saved trip, a cached
observation) for local dev and integration tests. The verdict thresholds
and the caution-band buffer defaults live in the engine / the minimums
profile, not in a seed.

### 4.5 Migration strategy

`golang-migrate`, sequential `db/migrations/NNNN_<name>.up.sql` /
`*.down.sql`, shared by both tiers. CI runs `up → down-all → up` on
every migration-touching PR, and `sqlc diff` asserts the Go queries
still match the schema. Never edit a committed migration.

---

## 5. MVP Feature Scope — In, Out, Deferred

### 5.1 V1 (must ship to charge money)

| #   | Feature                                                       | Notes                                                              |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Self-serve signup (email/password, magic link, Google)        | Supabase Auth, email verification on                               |
| 2   | Onboarding (display name, home airport) + advisory-disclaimer ack | The disclaimer checkbox is persisted + versioned               |
| 3   | Personal-minimums profile editor                              | Ceiling, visibility, max crosswind, max gust factor, IFR-current self-check, max time-since-last-flight |
| 4   | Airport + runway entry (departure + destination)              | Validated against the seeded `airports` reference table            |
| 5   | NWS weather fetch — METAR + TAF for the entered airports       | Go backend, defensive parse, observation cache (ADR-0002)          |
| 6   | The verdict-evaluation engine                                 | Pure Go function; green/yellow/red; never defaults to green (ADR-0003) |
| 7   | The "single screen" verdict view                              | Green / yellow / red + the per-check detail + parsed weather + the disclaimer |
| 8   | Crosswind / headwind component display                        | Computed against the chosen runway heading                         |
| 9   | Save a trip (a dep/dest pair the pilot wants to watch)        | Up to a sensible per-account cap                                   |
| 10  | Scheduled weather poll + verdict-change alert email           | Cloud Scheduler → OIDC `/cron/poll` → Resend; email-only (ADR-0004) |
| 11  | Verdict-change alert email                                    | "Your trip KXYZ→KABC went red → green" with the disclaimer footer  |
| 12  | WINGS risk-assessment PDF export                              | Server-rendered to R2; weather snapshot + minimums + verdict + PAVE section |
| 13  | "Weather unavailable" graceful-degradation state              | When NWS is down/slow/garbled — never a green-by-default           |
| 14  | Stripe Checkout (monthly + annual) + Customer Portal          | Two prices; self-service cancellation                              |
| 15  | Paywall                                                       | After a 14-day trial (exact trigger confirmed in Phase 1)          |
| 16  | PWA installability                                            | Manifest + service worker; iOS install instructions card           |
| 17  | Mobile-responsive everything                                  | One layout that works at 360px width                               |
| 18  | Legal pages (Terms, Privacy, Refund) + the disclaimer surfaces | Disclaimer on signup, every verdict surface, alert email, WINGS PDF, footer, unavailable state |

### 5.2 V1.1 (within ~6 weeks of launch)

- Per-trip alert cadence tuning (ADR-0005's documented evolution).
- A pilot-configurable yellow-band buffer (instead of the fixed default).
- Multiple named minimums profiles (e.g. "day VFR", "night", "with
  passengers") and picking one per trip.
- TAF-aware "go window" — the earliest/latest time today the trip is a
  go, derived from the TAF forecast groups.
- SMS alerts (Twilio — requires A2P 10DLC, a multi-week external lead).
- A density-altitude / performance caution input (carefully — must not
  become an avionics-equivalent calculator; research §3).
- Web Push for installed PWAs (the portfolio-wide constraint may lift).

### 5.3 V2 (the roadmap, not a promise)

- Native mobile shell wrapping the PWA.
- A simple shareable "verdict snapshot" link (read-only, for a CFI or a
  passenger) — modeled on `currency-hub`'s share link.
- Deeper WINGS-program integration.
- Optional NWS-source enrichment (PIREPs, AIRMETs/SIGMETs as *advisory
  context*, never as the verdict input — would need an ADR, and risks
  the §3 weather-depth trap).

### 5.4 Features that look important but are cut from V1

This is a **refusal list**, not a backlog. Adding any of these in V1
requires a founder override + an ADR superseding the row.

| Cut                                            | Reason                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| Weather-product depth — radar, satellite, prog charts, winds aloft, icing/turbulence forecasting, PIREPs as a feature | Research §3 / §7: weather depth needs paid feeds and is ForeFlight/EZWxBrief territory. Go/No-Go differentiates on personal-minimums treatment, not weather breadth |
| NOTAMs, TFRs, airspace                         | Not weather; a separate data domain; ForeFlight/Garmin territory                        |
| Flight planning — route, fuel, navlog, charts, moving map | Go/No-Go is a decision aid, not an EFB or a flight planner                        |
| Weight-and-balance / performance as the product | Research §3 explicitly: avionics-equivalent calculators where being wrong matters legally are a crowded, high-liability trap |
| Managing the pilot's regulatory currency       | Go/No-Go reads "am I IFR-current?" as ONE verdict input; it does not track BFR/medical/landing recency — that is the sibling `currency-hub` |
| Aircraft airworthiness tracking (annual / AD-SB / transponder) | That attaches to a *tail number*, not a pilot — a different product (`tail-number-radar`) |
| Making the go/no-go decision FOR the pilot      | Go/No-Go is advisory; the PIC decides. This is a liability + scope refusal, not a feature gap |
| A commercial / paid weather API                | Costs money (breaks free-tier discipline); "more weather" is not the wedge (ADR-0002)   |
| SMS notifications                              | Twilio A2P 10DLC is a multi-week external dependency; email-only in V1 (ADR-0004)       |
| Web Push                                       | The portfolio cut Web Push from V1 over the iOS PWA limitation; email is the channel    |
| Native iOS / Android app                       | PWA covers 95% of the need; native is a multi-week distraction                          |
| ML / AI features                               | No ML component → no Python service in V1; an AI wrapper is not a product               |
| Real-time ADS-B / live traffic                 | Requires paid data feeds; against the no-data-feeds discipline                          |
| A social feed / community / shared minimums library | The founder cannot moderate it; r/flying already exists                            |
| Lifetime billing                               | Monthly + annual is the model; weather decision-support is an indefinite recurring need |

---

## 6. Week-by-Week Development Plan (~6 weeks)

Assumes ~12–15 hours/week. Compress if you can do more. Each week ends
with one deployable artifact. Maps to the milestones in `docs/04-plan.md`.

### Week 0 — Pre-flight

- Domain + Cloudflare DNS (F-01). Create GCP project, $5 budget alert
  (F-02). Create Supabase project (F-03). Create Stripe test account,
  Resend, R2, PostHog, Sentry. Settle the NWS `User-Agent` (F-15).
  Install Node 20, Go 1.25, Supabase CLI, golang-migrate, Docker, mise.

### Week 1 — Skeleton + auth + the airports seed

- Scaffold `web/` (SvelteKit, TS, ESLint, Prettier, Vitest, Playwright)
  and `backend/` (Go module, `net/http.ServeMux`, `pgxpool`, `sqlc`).
- First migrations: `pilots` + RLS, `airports` (seeded reference data).
  Signup / login / magic link / Google OAuth. Mobile-responsive shell.
- The advisory-disclaimer checkbox on onboarding (persisted, versioned).

### Week 2 — The weather fetch + the verdict engine

- `backend/internal/weather` — the NWS AWC fetch client (timeout,
  `User-Agent`, backoff, identifier validation) + the METAR/TAF parser,
  with table-driven tests for the edge cases (CAVOK, VV, P6SM, VRB,
  gusts, AUTO, RMK, malformed input).
- `backend/internal/verdict` — the pure engine. Every comparison rule
  (ceiling, visibility, crosswind component, gust factor, IFR-currency,
  time-since-flight) with a table-driven test (boundary / below / within
  / missing-field-→-unknown). The crosswind/headwind component math.
- `weather_observations` cache migration.

### Week 3 — The verdict view + minimums + first deploy

- `minimums_profiles` migration + the personal-minimums editor.
- `POST /me/verdict` wired: airport entry → fetch → parse → evaluate.
- The green/yellow/red "single screen" verdict view with the per-check
  detail, the component display, the disclaimer on the verdict surface,
  and the "weather unavailable" state.
- Dockerfiles for both services; first Cloud Run staging deploy of both
  `gonogo-web` and `gonogo-api`. Sentry + PostHog wired.

### Week 4 — Saved trips + the alert pipeline

- `saved_trips`, `verdict_snapshots`, `alert_audit` migrations (with the
  per-recipient verdict-transition UNIQUE constraint).
- Save-a-trip flow + the trip list.
- `POST /cron/poll` — OIDC verification, the active-trip station scan,
  the cache-aware fetch, the re-evaluate, the dedupe-INSERT, the Resend
  fan-out. Cloud Scheduler job (F-04).
- The verdict-change alert email template (with the disclaimer footer).

### Week 5 — WINGS PDF + payments

- `wings_pdfs` migration + `backend/internal/wings` — the server-side
  WINGS risk-assessment PDF (weather snapshot + minimums + verdict +
  PAVE-checklist section), written to R2, signed GET URL.
- `subscriptions`, `processed_webhook_events` migrations. Stripe
  Checkout (2 prices) + Customer Portal + the webhook receiver +
  idempotency. Paywall (14-day trial).

### Week 6 — PWA, polish, beta, launch

- Vite-PWA config (manifest, icons, service worker). iOS install card.
- Empty states, loading skeletons, error boundaries, 404/500.
- The NWS-degradation test path (stub the upstream to time out / 429 /
  return garbage → assert "weather unavailable", never green).
- Legal pages; the disclaimer on all required surfaces. SPF/DKIM/DMARC.
- Lighthouse audit. Beta with ~10–15 pilots from the founder's network.
- Production cutover; r/flying + AOPA-forum launch post.

---

## 7. Testing Strategy

Solo-dev testing obeys one rule: **only write tests that catch bugs that
would cost you customers — or hurt one.** For Go/No-Go the highest-value
tests are in the verdict engine and the METAR parser — a wrong verdict
is a customer-losing, trust-destroying, and potentially safety-relevant
bug.

### 7.1 Unit tests — the verdict engine + the parser are the priority

- **`backend/internal/verdict` targets ≥95% coverage.** Every comparison
  rule has a table-driven test covering: the boundary (exactly at the
  minimum → defined behavior), just-below (red), comfortably-within
  (green), the caution-band case (yellow), and the **missing-field case
  (→ unknown, never green)**. The "verdict never defaults to green on
  missing/stale/unparseable weather" invariant has its own dedicated
  test set.
- **`backend/internal/weather` targets ≥90% coverage.** The METAR/TAF
  parser has a table-driven test per documented format edge: `CAVOK`,
  `SKC/CLR/NSC`, `VV###`, missing ceiling, `P6SM` / `M1/4SM` /
  fractional visibility, `VRB` winds, gust groups, `AUTO`, `RMK`, and a
  battery of real-world malformed observations that must degrade to
  `parse_ok=false`, never panic.
- The crosswind/headwind component math has its own table test (known
  wind/runway pairs → known components).
- Other pure logic: the cron's verdict-transition detection, the Stripe
  event dispatcher, the WINGS-PDF field mapping.
- Web: Vitest for component logic that has real branching.

### 7.2 Integration tests

- Spin up local Supabase in CI; run migrations + seed; exercise:
  - **Cross-tenant isolation** — create two pilots, write pilot A's
    minimums + saved trip + verdict snapshot + WINGS-PDF record, query
    as pilot B (both via anon `supabase-js`/RLS and via the Go API with
    B's JWT), assert zero rows. Assert B cannot fetch A's WINGS PDF via a
    guessed R2 key. **This is the single most important test in the
    suite.**
  - **Alert dedupe** — fire `/cron/poll` twice over the same observation,
    assert each verdict transition produces exactly one `alert_audit`
    row and exactly one email; then change the observation so the verdict
    transitions again, assert a second, legitimate alert.
  - **Cron OIDC** — an unauthenticated `POST /cron/poll` returns 401.
  - **NWS degradation** — with the upstream stubbed to time out / 429 /
    return garbage, assert the verdict is `unknown` ("weather
    unavailable"), never `go`, and the poll backs off.
  - **Stripe webhook replay** — post the same event twice, assert the
    subscription mutates once.

### 7.3 End-to-end tests (Playwright)

Three happy paths: (1) signup → onboarding → save personal minimums →
run a verdict for a dep/dest pair → see green/yellow/red; (2) save a
trip → it appears on the trip list; (3) request a WINGS PDF → a signed
URL returns a PDF. Two sad paths: (4) NWS unavailable → the verdict view
shows "weather unavailable", not green; (5) the paywall blocks after the
trial.

### 7.4 Manual + monitoring

Lighthouse before any prod deploy; real-device test each weekly deploy;
spot-check verdicts against a few real airports with known weather;
Sentry + PostHog replay catch the rest.

---

## 8. CI/CD Pipeline (self-hosted Woodpecker)

CI runs on a self-hosted Woodpecker server on the founder's Mac,
reachable from GitHub via Cloudflare Tunnel — no GitHub Actions billing.
Pipelines live in `.woodpecker/`.

- **`.woodpecker/pr.yml`** — every PR + push to main. Always-on gates:
  gitleaks secret scan, semgrep SAST, single-author check, PII-in-logs
  check, spec-guard heuristic. Path-gated: the `web` step (pnpm lint /
  check / test / build / audit), the `backend` step (gofmt / vet /
  golangci-lint / `sqlc diff` / `go test -race` / govulncheck), and the
  `db` step (golang-migrate `up → down-all → up` against ephemeral
  Postgres).
- **`.woodpecker/deploy.yml`** — push to main only. Applies migrations
  to the production Supabase Postgres first, then deploys both Cloud Run
  services (Go API + SvelteKit web) blue/green with a `/healthz` smoke
  test before promoting traffic.

---

## 9. Cloud + Launch Plan

### 9.1 Hosting

Two Cloud Run services in us-central1, both scale-to-zero, min-instances
0. Cloudflare proxied CNAME → Cloud Run for SSL + WAF. Cloud Scheduler
(1 of 3 free jobs) drives the weather-poll cron. Secrets in Google
Secret Manager, injected at runtime. Staging = a second Supabase project
+ `-staging` Cloud Run services.

### 9.2 Cost by user count

Go/No-Go's data is small (numbers, dates, short text). Its compute is
bursty (a verdict run, a poll cycle, a PDF render). The NWS API is free.
At 0 users: \$0. At ~100 paying users: ~\$0 (within every free tier; the
verdict-change alert fan-out stays under Resend's 100/day in typical
weather). At ~500 paying users: ~\$25/mo (Supabase Pro) + the alert
volume may cross into Resend Pro ($20/mo) on volatile-weather days — the
§11 risk register tracks the crossover. Gross margin stays above 80%.
The one cost-shaped *risk* that money cannot fix is an NWS rate-block —
mitigated by being a well-behaved API citizen (ADR-0002, ADR-0005).

### 9.3 Launch plan

- **Distribution** (research §5 Opportunity 8 first-50 plan): r/flying,
  AOPA forums, Pilots of America, and **CFIs who teach risk management**
  — the personal-minimums framing is exactly what risk-management CFIs
  preach. Build-in-public framing: "I built the personal-minimums tool I
  wished existed — set your numbers once, get an honest go/no-go."
- **Pre-launch**: a landing page with a one-sentence promise and an
  email waitlist. If a single well-targeted r/flying post can't collect
  ~50 emails, revisit the pitch.
- **Beta**: ~10–15 pilots from the founder's network on a free code.
- **Launch**: a public r/flying post (Sunday evening Eastern), a
  90-second demo video, monitor Sentry + PostHog + Stripe for 72 hours.

### 9.4 Pricing

$6/mo or $39/yr individual (ADR-0006). Inside the research §5
Opportunity 8 $5–7/mo band, mid-point — $5 attracts non-buyers, $7 is
the top of the band. No club tier (Go/No-Go is a single-pilot decision
aid). No lifetime deal (a weather decision-support service is a
recurring need).

---

## 10. Strategic Recommendations

### 10.1 Why this product, briefly

Research §5 Opportunity 8 sizes the addressable market as the entire
active-pilot population (~887,000). The pain is real and documented: the
FAA's FITS / Personal and Weather Risk Assessment Guide demonstrates the
intended workflow, EZWxBrief's progressive web app proves demand for a
web-delivered weather decision tool, and a 2025 Pilots of America thread
explicitly asks for a "Decision Assist Go/NoGo App" with a push when
conditions match the pilot's criteria. ForeFlight's weather is excellent
but it does **not** evaluate against *your* personal minimums — pilots
set minimums once on a paper FAA form and forget them. The whitespace is
precisely a **personal-minimums-first, decision-aid-simple** product
that does one thing: compare the current weather to *your* numbers and
say go / caution / no-go.

### 10.2 The moat

- **The personal-minimums treatment.** EZWxBrief and ForeFlight show
  *the weather*; Go/No-Go evaluates the weather *against the pilot's own
  stated thresholds* and renders a verdict. That framing — and the
  WINGS-aligned risk-assessment artifact — is the differentiator
  (research §5 Opportunity 8: "differentiate on personal minimums
  treatment and decision-aid simplicity, not weather depth").
- **Correct, honest verdict logic.** A pure, exhaustively-tested engine
  that never defaults to green. A competitor that shows a falsely
  reassuring result loses a pilot's trust permanently.
- **Daily-engagement + WINGS alignment.** A pre-flight check is a daily
  habit; the WINGS artifact gives a recurring reason to generate a
  record. Switching cost grows once a pilot's minimums and saved trips
  are in.

### 10.3 Stay-narrow discipline

Research §3 is blunt: avoid flight planning / weather / charts as a
product, and avoid avionics-equivalent calculators where being wrong
matters legally. Go/No-Go survives only by refusing to become a weather
product. Every feature request that pulls toward "show me the radar" or
"add winds aloft" or "plan my route" is a step toward ForeFlight's
graveyard for indie weather apps. Go/No-Go compares weather to *the
pilot's minimums* — one segment (the active pilot making a go/no-go
call), one workflow (the verdict), one trigger (the verdict-change
alert). Ship that.

### 10.4 Three principles to refer back to

1. **If it isn't on the §5.1 V1 list and a paying user hasn't asked for
   it twice, it isn't real.** Ship the list, then read the support inbox.
2. **The verdict is the product, and it never defaults to green.** Its
   correctness is a safety matter, not a quality metric — spend the test
   budget there.
3. **Boring tech compounds.** SvelteKit + a Go service + Supabase +
   Cloud Run + Stripe + the free NWS API is boring on purpose.
   Excitement is for V2.

---

## 11. Risk Assessment

| Risk                                                                                   | Likelihood | Impact       | Mitigation                                                                                                       |
| -------------------------------------------------------------------------------------- | ---------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| The verdict engine ships a wrong verdict — especially a **false green**                | Medium     | Catastrophic | The pure-function engine + a table-driven test per comparison rule + a dedicated "never green on missing data" test set; `weather-and-verdict-auditor` gate; ≥95% coverage |
| A pilot launches into below-minimums weather trusting a wrong/stale verdict → liability | Low        | Catastrophic | The calibrated-firm advisory disclaimer on every verdict surface / alert / PDF / signup; the verdict never defaults to green; "weather unavailable" surfacing |
| The NWS Aviation Weather Center API is down, slow, or rate-limits us                    | Medium     | High         | Graceful degradation — the verdict shows "weather unavailable", never green; the poll backs off; observation cache cushions short outages; well-behaved client (UA, batching) avoids a block |
| The METAR/TAF parser mishandles a real-world observation                               | Medium     | High         | A defensive parser that degrades to `parse_ok=false` (→ verdict `unknown`), never panics; a large table-test battery of real + malformed observations; the `weather-and-verdict-auditor` gate |
| The verdict-change alert fan-out exceeds Resend's 100/day free cap on a stormy day      | Medium     | Medium       | Watch alert volume from the first 100 users; one alert per *transition*, deduped; Resend Pro ($20/mo) is the escape hatch                                              |
| The poll cron silently fails to fire (Cloud Scheduler / OIDC misconfig)                | Medium     | High         | UptimeRobot or a synthetic "did the poll run" check; the `alert_audit` + `verdict_snapshots` tables make a missed run visible                                          |
| Alert dedupe is subtly wrong → alert spam or a silent miss                              | Medium     | High         | The DB UNIQUE constraint keyed by the verdict transition is the contract (ADR-0004); a replay integration test; `alert-pipeline-auditor`                              |
| An RLS / owner-predicate bug leaks one pilot's minimums or saved trips to another       | Medium     | Catastrophic | Two-layer authz; cross-tenant regression test covering both layers + the WINGS-PDF R2-key case                                                                        |
| Scope creep toward a weather product (radar, winds aloft, NOTAMs)                       | Medium     | High         | `spec-guardian` BLOCKs §5.4 cut-list hits; research §3 is the refusal authority; the product positioning is "decision aid, not weather"                               |
| Supabase free project auto-pauses after 7 days inactivity                              | High (dev) | Medium       | Move to Pro at first paying-customer testing; ping staging weekly                                                                                                    |
| Two Cloud Run services double the deploy + secret surface                              | Low        | Low          | One `.woodpecker/deploy.yml` with path-gated steps; shared Secret Manager                                                                                            |
| Cloud Run cold-start latency hurts the verdict-view TTI                                 | Medium     | Low-Medium   | The web tier may need `min-instances=1` (~$5/mo) — flag as a paid-service decision at M3 deploy time                                                                  |
| EZWxBrief / ForeFlight bundle a personal-minimums verdict                               | Medium     | Medium       | Personal-minimums-first + decision-aid simplicity + the WINGS artifact is the wedge; do not try to out-weather them                                                   |
| Solo-developer fatigue over a ~6-week build                                            | Medium     | High         | Narrow V1; the §6 plan is paced; weekly 15-minute ops ritual                                                                                                         |

---

## 12. Closing Notes

Go/No-Go has a real audience (the whole ~887,000 active-pilot
population), a real recurring pain (personal minimums set once and
forgotten; no tool evaluates weather against *your* numbers), and a
defensible moat (the personal-minimums treatment + decision-aid
simplicity + a WINGS-aligned artifact). The riskiest single factor is a
wrong verdict — specifically a false green — which is why the verdict
engine is a pure function tested to ≥95%, why the parser is defensive
and degrades to "unparseable" rather than guessing, and why the
architecture pays the cost of a dedicated Go service to make the NWS
integration, the engine, and the poll cron first-class.

Refer back to three things whenever a decision feels hard: **(1)** if it
pulls toward being a weather product, refuse it — Go/No-Go is a decision
aid; **(2)** the verdict is the product and it never defaults to green —
its correctness is a safety matter; **(3)** boring tech compounds. Ship
the §5.1 list, in the §6 order, and read the support inbox.
