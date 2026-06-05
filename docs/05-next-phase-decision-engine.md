# Phase 5 — Next phase: the go/no-go decision engine + dashboard first vertical slice

> Status: **implemented in this PR** (stacked on `feat/web-app-platform-integration`).
> Phase 1 (engine + dashboard) and Phase 2 (real Postgres persistence of the
> pilot's personal minimums — see §7) both land on this branch.
> Authority for scope: [`docs/product-research.md`](product-research.md) §0, §3.3, §3.4, §3.6, §4.2, §4.3, §6 (rows 3, 6–8).
> This document details the next phase and records the architectural choices
> and trade-offs made delivering it.

## 1. Where the gear was

The open scaffold PR (`feat/web-app-platform-integration`, #6) landed an empty
SvelteKit app under `web/`: locale resolution, the Cortex access guard, a
`+layout` that requires active access, and a placeholder home page whose body
literally read _"Product surface lands here."_ No product logic existed and the
`web/**` CI lane could not pass — `web/` had no committed lockfile, so
`pnpm install --frozen-lockfile` failed before any check ran.

## 2. What "next phase" means here

Go/No-Go's load-bearing decision is that **the verdict-evaluation engine is a
pure function** (`product-research.md` §3.3, ADR-0003): `(parsedWeather,
minimums) → verdict`, no clock, no DB, no network I/O, every comparison its own
table-tested rule, and — the safety invariant — **never defaults to green**.
That engine is the product's correctness moat, so the natural first vertical
slice after an empty shell is:

1. the **decision engine** itself, as pure TypeScript in the web tier;
2. its **table-driven test suite**, one case per factor and per verdict band;
3. a **repository seam** so the engine's inputs have a swappable source; and
4. the **dashboard** — the home route — rendering real per-factor + overall
   verdicts through that seam, with the calibrated-firm disclaimer.

This slice deliberately renders a working verdict surface **without** fetching
live weather (that is research §3.4 / §3.5, a later phase — the factors are
passed in) and without the still-in-flight Cortex backend.

> **Phase 2 update — real Postgres persistence.** The first slice shipped the
> engine + dashboard against an in-memory seed. This PR now also persists the
> pilot's **personal minimums** (the configurable per-factor limits the engine
> evaluates against) in the shared Cortex Postgres, behind the same repository
> seam. See [§7 Persistence](#7-persistence-phase-2). The two documented
> architectural boundaries — **the engine is pure TypeScript in the web tier,
> not Go** (§4) and **there is no live weather fetch** (§4) — stand unchanged:
> only the *minimums input* became durable; the weather factors are still
> transient seeded inputs.

## 3. What this PR delivers

| Area | File(s) | Notes |
|---|---|---|
| Domain types | `web/src/lib/gonogo/types.ts` | `Minimums` (pilot's OWN numbers), `WeatherFactors`, three-band `Verdict` (`go`/`caution`/`no_go`/`unknown`), fixed caution buffers. |
| Engine | `web/src/lib/gonogo/engine.ts` (+test) | `evaluate(factors, minimums)`; one function per factor: ceiling, visibility, crosswind component, gust factor (gust − steady), IFR-currency gate, recency. Rollup: worst-case wins, never green by omission. |
| Data seam | `web/src/lib/repo/repository.ts`, `seed.ts` | `GoNogoRepository` interface + deterministic in-memory adapter. (`repo/`, not `data/`.) |
| Persistence | `db/migrations/0001_gonogo_core.{up,down}.sql`, `web/src/lib/repo/postgres.ts` (+test) | `gonogo.personal_minimums` table + the Postgres adapter that loads the pilot's saved minimums, scoped by `owner_user_id`. See §7. |
| Dashboard | `web/src/routes/+page.server.ts`, `+page.svelte` | Per-leg overall band + per-factor rows, a minimums summary with its source badge, a first-run empty state, and the calibrated-firm disclaimer. |
| CI fix | `web/pnpm-workspace.yaml`, `web/pnpm-lock.yaml` | Isolates `web/` as its own pnpm root so the `web/**` lane installs. |

39 unit tests pass (29 engine + 10 minimums-mapper); `lint`, `check`
(0 errors), and `build` are green locally, and the migration round-trips
`up → down-all → up` against an ephemeral Postgres 16.

## 4. Architectural choices & trade-offs

- **Engine in TypeScript in the web tier, not Go (yet).** `product-research.md`
  §3.3 puts the canonical engine in `backend/internal/verdict`. There is no Go
  backend on disk yet, and the first slice's job is a working verdict surface.
  Putting the pure engine in `web/src/lib/gonogo` ships the dashboard now while
  keeping it a pure, portable function with the same `(factors, minimums) →
  verdict` shape and the same never-default-to-green invariant. **Trade-off:**
  when the on-demand `/me/verdict` path and the poll cron need the math
  server-side, the rules must be ported to Go (or the cron calls the web tier).
  Mitigated by keeping the engine I/O-free and its tests behavioural, so a port
  is a mechanical mirror — and `product-research.md` §3.3 already forbids a
  parallel TS re-implementation of the *backend* engine, which this does not
  create (there is no backend engine yet to diverge from).

- **Factors are inputs — no live weather fetch in this slice.** The NWS fetch +
  METAR/TAF parse is a trust boundary owned by `backend/internal/weather`
  (research §3.4) and is explicitly a later phase. This slice models only the
  comparison; `WeatherFactors` are already-numeric values passed in. **Trade-off:**
  the dashboard shows seeded factors until the fetch lands — acceptable and
  clearly labeled for a first slice.

- **The safety invariant is in the type system and the rollup.** A gated factor
  whose value is missing reads `unknown`, and `unknown` outranks `caution` in the
  rollup so partial data can never read better than a known caution; `no_go`
  still dominates everything. A flight with no gated factors at all rolls up to
  `unknown`, never `go`. This is the load-bearing safety choice (research §3.3,
  ADR-0003), not a style preference.

- **No `dates.ts`.** Unlike currency-hub, this engine does no calendar math —
  every factor is a scalar comparison (ft, SM, kt, days). Recency arrives as a
  pre-computed `daysSinceLastFlight`, keeping the "today" clock at the caller's
  boundary, not in the engine. Adding a `dates.ts` here would be dead code.

- **Fixed caution buffers, pilot-set minimums.** The yellow band uses small
  fixed engine defaults (research §4 schema note "yellow-band buffers — small
  fixed defaults"); the *minimums themselves* are always the pilot's own numbers
  — the engine never invents a threshold (research §3.3). A pilot-configurable
  buffer is a documented later phase (research §5 / §6).

- **Repository interface with a seed adapter.** The route depends on
  `GoNogoRepository`, not a driver or an HTTP client. Swapping the in-memory
  adapter for a Supabase/pgx minimums source (and, for the factors, the Go
  backend's weather fetch) is a one-file change with zero churn in the engine or
  the route. **Trade-off:** demo data until the real adapters land.

- **`web/` isolated as its own pnpm root.** Adding `web/pnpm-workspace.yaml`
  makes `web/` self-contained with its own committed lockfile so CI's `web` lane
  installs with `--frozen-lockfile`.

- **One new dependency: `postgres` (postgres.js).** The persistence work
  (§7) adds exactly one runtime dependency — `postgres`, a pure-JS, zero
  native-deps, server-only driver — landed in `dependencies` and
  founder-authorized for this work. Nothing else changed in the pinned
  toolchain. Coverage instrumentation (`@vitest/coverage-v8`) is intentionally
  deferred — CI's `pnpm test -- --coverage` no-ops the flag via the `--`
  passthrough, and the tests run green under plain `vitest run`.

## 5. Out of scope (next phases)

The NWS Aviation Weather Center fetch + METAR/TAF parse (research §3.4), the
crosswind-component computation from wind + runway heading (this slice takes the
component as an input), the **minimums-profile editor** (this PR persists and
reads the minimums but the in-app *edit* form, plus multi-profile labelled
profiles, is still deferred — research §6 row 3 / §4.2) and signup
disclaimer-ack persistence (research §6 rows 1–2), saved trips + the
verdict-change alert cron (§3.5), the WINGS risk-assessment PDF, and the Go
backend `verdict` package — all remain per `product-research.md` §3–§6. The
disclaimer is rendered on the verdict surface here but the signup-flow checkbox
ack is not yet persisted/versioned.

## 6. Acceptance criteria met

- `evaluate` is pure and total; each factor is its own function citing the pilot
  minimum it checks.
- Each factor (ceiling, visibility, crosswind, gust factor, IFR-currency,
  recency) and each verdict band (go / caution / no_go / unknown) has a
  table-driven test; the verdict never defaults to green on missing data.
- The pilot's personal minimums persist to `gonogo.personal_minimums` and the
  pure row→domain mapper has its own unit tests (39 tests pass total).
- The dashboard renders a per-factor and overall verdict per leg, a minimums
  summary with its source (saved / default / demo), a first-run empty state,
  and the calibrated-firm disclaimer on the verdict surface (`security.md`
  requirement).
- `web/` lint + check + build pass and the migration round-trips
  `up → down-all → up`; the `web/**` CI lane can install without a database.

## 7. Persistence (Phase 2)

This PR makes the **pilot's personal minimums durable** — the one configurable
input the engine evaluates against (research §3.3 / §4.2). The weather factors
stay transient seeded inputs; persisting them waits on the NWS fetch (§3.4, a
documented later phase).

### 7.1 What persists

`db/migrations/0001_gonogo_core.{up,down}.sql` creates one table in the gear's
private `gonogo` schema:

| Column | Type | Meaning |
|---|---|---|
| `id` | `uuid` PK `gen_random_uuid()` | row id |
| `owner_user_id` | `uuid NOT NULL UNIQUE` | the Cortex user — one profile per pilot in this slice |
| `min_ceiling_ft` | `int NOT NULL` | ceiling floor, ft AGL |
| `min_visibility_sm` | `numeric(4,2) NOT NULL` | visibility floor, statute miles |
| `max_crosswind_kt` | `int NOT NULL` | max crosswind component, kt |
| `max_gust_factor_kt` | `int NOT NULL` | max gust factor (gust − steady), kt |
| `is_ifr_current` | `boolean NOT NULL DEFAULT false` | the IFR-currency self-report gate |
| `max_days_since_flight` | `int NOT NULL` | max days since last flight |
| `created_at` / `updated_at` | `timestamptz NOT NULL DEFAULT now()` | audit |

Indexed on `owner_user_id`. The adapter (`web/src/lib/repo/postgres.ts`)
selects `min_visibility_sm::float8` so the `numeric` lands as a JS number, and
exposes a pure `mapMinimumsRow` (unit-tested — the CI `web` lane has no DB).

### 7.2 Wiring & the empty state

`+page.server.ts` chooses the adapter at the boundary:
`env.DATABASE_URL ? postgresRepository(me.id, …) : seedRepository()`. The seed
stays the fallback so local dev and the DB-less CI `web` lane still render. The
loader reports a `minimumsSource`: **saved** (the pilot's own row), **default**
(first run — no row yet, so sensible conservative defaults are shown with an
empty-state note inviting the pilot to set their own), or **demo** (seed). The
dashboard surfaces the source as a badge so a pilot is never shown a verdict
computed from numbers they did not set without knowing it.

### 7.3 Trade-offs

- **Gear-owned migration, self-contained.** The migration `CREATE SCHEMA IF
  NOT EXISTS gonogo` and creates only its own table; `down.sql` drops the
  table but **not** the schema (the platform owns the namespace). No
  cross-schema FK to `cortex.users`, so the migration applies in isolation
  against an empty Postgres — which is exactly how the CI `db` round-trip lane
  (and our local `up → down-all → up`) exercises it.
- **Owner-predicate scoping, not RLS.** The `gonogo_app` role *owns* its
  schema, so per-row RLS would be bypassed by the owner anyway; tenancy is
  enforced by scoping every query `WHERE owner_user_id = $me` (mirrors the Go
  backend's per-request owner predicate, research §4.3). The illustrative
  §4.2 DDL shows `auth.uid()`/RLS for the Supabase-backend design; the web
  adapter against the gear-owned schema uses the owner predicate instead.
- **One new runtime dependency** — `postgres` (postgres.js), pure-JS,
  server-only, in `dependencies`, founder-authorized for this work.
- **Weather stays transient.** Only the minimums are durable; the legs/factors
  are still seeded in both adapters. This preserves the two architectural
  boundaries (pure TS engine, no live weather fetch) while making the
  pilot-configured input real.
