# 0003. The verdict-evaluation engine is a pure function that never defaults to green

- Status: proposed
- Date: 2026-05-21
- Deciders: founder (draft — awaiting approval)

## Context and problem statement

Go/No-Go's correctness is the correctness of one computation: given a
pilot's saved personal minimums and the parsed current weather for their
flight, compute a green / yellow / red verdict. This is **decision
support for a safety-of-flight decision** — a wrong verdict, and
especially a **false green** (telling a pilot a flight is within their
minimums when it is not), can put a pilot into weather they decided, in
calmer judgement, they would not fly. A wrong verdict is therefore a
**catastrophic** bug, not a quality blemish.

The comparison logic has sharp edges that are easy to get subtly wrong:

- **Crosswind / wind-component math.** The crosswind a pilot faces is
  not the reported wind speed — it is `wind speed × sin(wind angle −
  runway heading)`. Getting the trigonometry, or the runway-number →
  magnetic-heading conversion, wrong shifts the comparison.
- **Gust handling.** The gust factor (gust minus steady wind) is a
  distinct minimum from the steady-wind crosswind; conflating them
  mis-judges a gusty day.
- **Missing data.** A METAR may lack a ceiling group, a TAF may not
  cover the planned departure time, the AWC fetch may fail. The single
  most dangerous failure mode is a code path that, lacking a field,
  quietly produces a `go`.
- **Freshness.** A METAR an hour old is not current weather; the engine
  must judge staleness, which means it needs *a* clock — but a hidden
  wall-clock read makes the engine non-deterministic and untestable.

How should this engine be structured so its correctness is testable,
trustworthy, and safe by construction?

## Decision drivers

- **Testability is everything.** The engine must be exhaustively
  table-tested — every comparison rule, every boundary, the caution
  band, and crucially every missing-data case. Tests must be able to fix
  "now" to any instant.
- **Determinism.** The same parsed weather + the same minimums must
  always produce the same verdict — no hidden dependence on the wall
  clock, the DB, the network, or call ordering.
- **One implementation.** The on-demand `/me/verdict` and the poll
  cron's saved-trip re-evaluation must use the *same* logic. Two
  implementations drift, and a drift in a safety computation is a defect.
- **Safe by construction.** The "never default to green" property should
  be a structural invariant of the engine, enforced by the type system /
  the control flow and by a dedicated test set — not a convention a
  future change can quietly break.
- **Auditability.** A reviewer (or the founder) must be able to read
  each comparison and check it against the minimum it claims to enforce.

## Considered options

1. **Pure function.** All comparison logic in `backend/internal/verdict`
   as deterministic functions — `Evaluate(weather, minimums, asOf) →
   Verdict` — with no clock, no DB, no network, no I/O inside. The
   evaluation instant is an argument. The verdict type makes "unknown"
   a first-class outcome, so missing data cannot collapse into "go".
2. **Service object with injected dependencies.** A `VerdictService`
   struct holding a DB handle, the NWS client, and a clock, with methods
   that fetch and compute together.
3. **SQL / DB-computed.** Express the comparisons as SQL views and let
   Postgres compute the verdict.

## Decision outcome

Chosen option: **Option 1 — a pure function.**
`backend/internal/verdict` is a deterministic package:

```go
// Evaluate compares parsed weather against a pilot's personal minimums
// as of `asOf` (used only to judge observation freshness).
// PURE: no time.Now(), no DB, no network, no I/O. The clock, the parsed
// weather, and the minimums are arguments. This is the most heavily
// unit-tested package in the repo.
func Evaluate(
    weather  ParsedWeather,   // may carry missing/unparsed fields
    minimums Minimums,
    asOf     time.Time,
) Verdict
```

Rules:

- **No `time.Now()` inside the package.** The evaluation instant is
  `asOf` — the dashboard passes "now", the cron passes "now", tests pass
  fixed instants. `asOf` is used only to judge whether an observation is
  fresh enough to trust.
- **No DB, no HTTP, no NWS fetch, no file I/O, no env reads.** The NWS
  fetch and the METAR/TAF parse happen in the *caller*
  (`internal/weather` + a handler); the engine receives already-parsed
  `ParsedWeather`.
- **The verdict NEVER defaults to green.** The `Verdict` outcome set is
  `go` | `caution` | `no_go` | `unknown`. A `go` is returned **only**
  when every checked field is present, the observation is fresh, and
  every value is within the pilot's minimum. Any missing required field,
  any stale observation, any `parse_ok=false` input → `unknown`
  ("weather unavailable"). `caution` is the yellow band (close to a
  minimum, or partial data within the caution buffer). `no_go` is a
  clear exceedance. The "unknown, never go, on any missing/stale/
  unparseable input" property has its own dedicated test set.
- **One function per comparison**, each clearly tied to the minimum it
  enforces: ceiling, surface visibility, computed crosswind component,
  gust factor, the IFR-currency self-check gate, time-since-last-flight.
- **Crosswind / wind-component math is explicit and tested** — the
  trigonometric decomposition and the runway-number → magnetic-heading
  conversion are their own tested helpers.
- **The on-demand verdict and the cron call these same functions** — no
  parallel implementation. The SvelteKit web tier never re-implements a
  comparison in TypeScript; it calls the Go API.
- **Every comparison has a table-driven test** covering boundary /
  below / within / caution-band / missing-field. Target ≥ 95% coverage.

The `weather-and-verdict-auditor` subagent and
`scripts/check-verdict-purity.sh` enforce all of the above on every PR
touching the package.

### Positive consequences

- The engine is trivially testable — fix `asOf`, supply parsed weather +
  minimums, assert the verdict. The exhaustive table tests are the
  product's correctness guarantee.
- Determinism: no flaky time-dependent behavior; no test that passes one
  hour and fails the next.
- One implementation — the dashboard and the cron cannot disagree.
- The "never green on missing data" safety invariant is structural (the
  `unknown` outcome is first-class) and test-enforced.
- A reviewer can check each comparison against the minimum it claims.

### Negative consequences

- The caller must assemble the inputs (fetch + parse the weather, supply
  the clock) before calling the engine — a little more wiring than a
  service object that does everything. Accepted: that wiring is itself
  easy to test, and the separation is the point.
- A pure function cannot lazily fetch "the weather it needs" — the
  caller fetches it. At Go/No-Go's data volume (a verdict touches one or
  two observations) this is irrelevant.

## Pros and cons of each option

### Option 1 — pure function (chosen)

- 👍 Maximally testable; deterministic; clock injected.
- 👍 One implementation; reviewable comparison-by-comparison.
- 👍 The "never green on missing data" invariant is structural.
- 👎 The caller assembles inputs (minor).

### Option 2 — service object with injected DB + NWS client + clock

- 👍 Convenient single call site.
- 👎 Tests need a fake DB and a fake weather client to exercise pure
  comparison math — more ceremony, more ways a test can be wrong.
- 👎 Mixing fetch and computation invites the verdict to quietly depend
  on fetch behavior — exactly the coupling a safety computation must not
  have.

### Option 3 — SQL / DB-computed

- 👍 The DB does the work; one query.
- 👎 Crosswind trigonometry and the caution-band logic in SQL are hard
  to read, hard to table-test, and hard to audit.
- 👎 Enforcing "never default to green on a NULL field" in SQL is
  error-prone — a `NULL` comparison silently yielding the wrong branch
  is exactly the false-green class of bug.
- 👎 The on-demand verdict and the cron would each need their own SQL —
  the one-implementation property is lost.

## Links

- Spec section: [docs/product-research.md](../product-research.md) §3.3
  (the verdict engine), §3.4 (weather ingestion), §7.1 (testing — the
  engine + the parser are the priority).
- Related ADRs: [0001](0001-go-backend-for-weather-polling.md) (the Go
  service that hosts the engine), [0002](0002-nws-aviation-weather-api.md)
  (the weather source — the engine consumes its parsed output).
- External: standard crosswind-component trigonometry; the FAA Aviation
  Weather Handbook (FAA-H-8083-28) for METAR/TAF field semantics.
