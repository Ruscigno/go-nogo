# 0005. The weather poll runs on one fixed cadence with a shared-observation cache

- Status: proposed
- Date: 2026-05-21
- Deciders: founder (draft — awaiting approval)

## Context and problem statement

Go/No-Go watches each pilot's saved trips and emails when a trip's
verdict changes. That requires re-fetching weather on a schedule. Three
linked questions must be settled:

1. **Cadence** — how often does the poll run?
2. **Scope** — which airports does it fetch each run?
3. **Caching** — does it re-fetch the same station for every trip?

The tension: a *fresher* poll catches a verdict change sooner (a better
product), but it makes more requests to the NWS Aviation Weather Center
(AWC) API, which is free, keyless, and has **no SLA and an implicit
fair-use expectation** (ADR-0002). It also makes more email — alert
volume scales with poll frequency × weather volatility against Resend's
100/day free cap. And Cloud Scheduler's free tier is 3 jobs.

A METAR is typically issued about hourly (more often when conditions are
changing); a TAF is issued a few times a day. Polling far faster than
the data refreshes buys nothing but request load.

## Decision drivers

- **Be a good AWC citizen.** Over-requesting risks a rate-block, which
  has **no paid remedy** (ADR-0002) and is a launch-availability risk.
  The poll must batch and cache.
- **METAR refresh rate sets the useful ceiling.** Polling much faster
  than ~hourly observation issuance just re-fetches identical data.
- **Cloud Scheduler free tier = 3 jobs.** A single fixed-cadence job
  uses 1. Per-trip or per-airport scheduling would multiply jobs.
- **Resend's 100/day cap.** Faster polling finds verdict transitions
  sooner but cannot *create* them — weather volatility, not cadence,
  drives alert volume. Still, cadence should not be so fast that
  borderline weather flaps the verdict and spams alerts.
- **V1 must ship in ~6 weeks.** Per-trip cadence tuning is real scope;
  a single cadence is simple and correct enough.
- **Caching is free and high-leverage.** Many pilots will save trips
  through the same handful of airports; fetching each station once per
  poll and sharing the result is an obvious, large request-volume cut.

## Considered options

For **cadence + scheduling**:

1. **One fixed-interval Cloud Scheduler job** (e.g. every 30 min).
2. **Per-trip cadence** — the pilot picks how often each trip is polled;
   multiple Cloud Scheduler jobs or in-process binning.
3. **Event-driven** — re-poll a trip only when the pilot opens it; no
   background cron.

For **scope + caching** (orthogonal, but decided here):

A. Fetch every airport of every saved trip, every run, no cache.
B. Fetch only airports of **active** saved trips; **deduplicate stations
   across trips**; **cache observations by `(station, issued_at)`** and
   reuse a fresh cached observation across trips and for on-demand
   verdicts.

## Decision outcome

Chosen: **Option 1 (one fixed-interval Cloud Scheduler job) + Option B
(active-trip scope, station-deduplicated, observation-cached).**

- **Cadence:** a single Cloud Scheduler job (`gonogo-weather-poll`) at a
  fixed interval — **default every 30 minutes** (confirmable in Phase 2;
  see `journal/open-questions.md`). 30 minutes is comfortably inside the
  ~hourly METAR refresh, so most polls find new data, and it uses 1 of
  Cloud Scheduler's 3 free jobs.
- **Scope:** each run collects the *distinct* set of airport identifiers
  referenced by saved trips with `is_active = true`. A deactivated or
  deleted trip's airports are not fetched.
- **Caching:** the `weather_observations` table caches each parsed
  observation keyed by `(station, kind, issued_at)`. Within a poll, each
  station is fetched **once** even if ten trips share it; the on-demand
  `/me/verdict` endpoint reuses a fresh cached observation rather than
  always re-fetching. The cache is purged on a rolling window (old
  observations have no value).

The poll handler, per run: verify OIDC → collect active-trip stations →
for each station, fetch (cache-aware, backoff, `User-Agent`) → parse →
re-evaluate each active trip via the pure verdict engine → on a verdict
change, the ADR-0004 dedupe-INSERT + Resend send → write the verdict
snapshot.

### Positive consequences

- One Cloud Scheduler job — the free tier (3) is untouched.
- Station deduplication + the observation cache cut AWC request volume
  to roughly "one fetch per distinct active-trip airport per 30 min",
  not "one per trip" — the single biggest lever on being a good AWC
  citizen.
- The poll handler is trivially testable: seed a trip + a stubbed
  observation, fire the endpoint, assert the verdict snapshot + the
  alert.
- The on-demand verdict path reuses the same cache — fewer AWC calls and
  a faster dashboard.

### Negative consequences

- A verdict change can be up to ~30 minutes stale before the pilot is
  alerted. Accepted for V1 — a verdict change is rarely minute-critical,
  and the pilot can always open the trip for an on-demand re-check.
- A single global cadence is not tuned to a pilot who wants a
  tighter watch on an imminent flight. That is the explicit V1.1
  evolution below.
- Borderline weather that flaps the verdict around a threshold could
  produce repeated alerts. Mitigated by the ADR-0003 caution band
  (yellow absorbs near-threshold weather) and watched in the risk
  register; a hysteresis / minimum-dwell rule is a V1.1 candidate.

## Revisit triggers

Supersede this ADR with a follow-on choosing **per-trip cadence** when
any fires:

- Pilots ask for a tighter watch on an imminent flight (a "watch this
  trip closely for the next 3 hours" mode).
- AWC request volume from the single 30-min poll approaches a level
  where a rate-block is plausible (escalate scope-narrowing or a longer
  interval first).
- Verdict-flap alert spam shows up in beta despite the caution band —
  add hysteresis / a minimum-dwell-before-alert rule.

## Pros and cons of each option

### Cadence Option 1 — one fixed-interval job (chosen)

- 👍 Simplest possible; 1 cron job; inside the METAR refresh rate.
- 👎 Up-to-30-min staleness; not tunable per trip.

### Cadence Option 2 — per-trip cadence

- 👍 A pilot can watch an imminent flight closely.
- 👎 Multiple Cloud Scheduler jobs or in-process binning; real scope;
  more AWC load to govern.

### Cadence Option 3 — event-driven, no cron

- 👍 Zero background AWC load.
- 👎 Kills the product's core feature — the pilot is *not* told when a
  window opens; they have to remember to look. Defeats the purpose.

### Scope/cache Option A — fetch everything, no cache

- 👍 Trivial.
- 👎 Re-fetches a shared airport once per trip — needless AWC load; the
  fastest route to a fair-use block.

### Scope/cache Option B — active-trip scope, dedup, cache (chosen)

- 👍 Minimal AWC request volume; the cache also speeds on-demand
  verdicts.
- 👎 A small amount of cache-management code (rolling purge).

## Links

- Spec section: [docs/product-research.md](../product-research.md) §2.8
  (the poll cron), §3.5 (the alert pipeline), §4.2
  (`weather_observations` cache schema), §11 (risk register — AWC
  rate-block, alert volume).
- Related ADRs: [0002](0002-nws-aviation-weather-api.md) (the AWC API as
  an availability dependency — this ADR is how we are a good citizen),
  [0004](0004-alert-dedupe-and-email-channel.md) (the dedupe + email
  channel the poll feeds).
- Sibling-repo precedent: `currency-hub` ADR-0003 — the same
  single-Cloud-Scheduler-job, documented-evolution-to-finer-scheduling
  decision.
- External: [Cloud Scheduler pricing](https://cloud.google.com/scheduler/pricing);
  NWS Aviation Weather Center observation/forecast issuance cadence.
