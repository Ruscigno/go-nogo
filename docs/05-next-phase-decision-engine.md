# Phase 5 — Next phase: the go/no-go decision engine + dashboard first vertical slice

> Status: **implemented in this PR** (stacked on `feat/web-app-platform-integration`).
> Authority for scope: [`docs/product-research.md`](product-research.md) §0, §3.3, §3.6, §6 (rows 6–8).
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
passed in), without the still-in-flight Cortex backend, and **without any new
dependency**.

## 3. What this PR delivers

| Area | File(s) | Notes |
|---|---|---|
| Domain types | `web/src/lib/gonogo/types.ts` | `Minimums` (pilot's OWN numbers), `WeatherFactors`, three-band `Verdict` (`go`/`caution`/`no_go`/`unknown`), fixed caution buffers. |
| Engine | `web/src/lib/gonogo/engine.ts` (+test) | `evaluate(factors, minimums)`; one function per factor: ceiling, visibility, crosswind component, gust factor (gust − steady), IFR-currency gate, recency. Rollup: worst-case wins, never green by omission. |
| Data seam | `web/src/lib/repo/repository.ts`, `seed.ts` | `GoNogoRepository` interface + deterministic in-memory adapter. (`repo/`, not `data/`.) |
| Dashboard | `web/src/routes/+page.server.ts`, `+page.svelte` | Per-leg overall band + per-factor rows + the calibrated-firm disclaimer. |
| CI fix | `web/pnpm-workspace.yaml`, `web/pnpm-lock.yaml` | Isolates `web/` as its own pnpm root so the `web/**` lane installs. |

29 unit tests pass; `lint`, `check` (0 errors), and `build` are green locally.

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

- **No new dependencies.** Everything uses the scaffold's pinned toolchain, so
  this PR needs no founder dependency approval. Coverage instrumentation
  (`@vitest/coverage-v8`) is intentionally deferred — CI's `pnpm test --
  --coverage` no-ops the flag via the `--` passthrough, and the tests run green
  under plain `vitest run`.

## 5. Out of scope (next phases)

The NWS Aviation Weather Center fetch + METAR/TAF parse (research §3.4), the
crosswind-component computation from wind + runway heading (this slice takes the
component as an input), the minimums-profile editor and signup disclaimer-ack
persistence (research §6 rows 1–3), saved trips + the verdict-change alert cron
(§3.5), the WINGS risk-assessment PDF, and the Go backend `verdict` package — all
remain per `product-research.md` §3–§6. The disclaimer is rendered on the verdict
surface here but the signup-flow checkbox ack is not yet persisted/versioned.

## 6. Acceptance criteria met

- `evaluate` is pure and total; each factor is its own function citing the pilot
  minimum it checks.
- Each factor (ceiling, visibility, crosswind, gust factor, IFR-currency,
  recency) and each verdict band (go / caution / no_go / unknown) has a
  table-driven test; the verdict never defaults to green on missing data
  (29 tests pass).
- The dashboard renders a per-factor and overall verdict per leg with the
  calibrated-firm disclaimer on the verdict surface (`security.md` requirement).
- `web/` lint + check + build pass; the `web/**` CI lane can install.
