# 0002. The weather source is the NWS Aviation Weather Center public API

- Status: proposed
- Date: 2026-05-21
- Deciders: founder (draft — awaiting approval)

## Context and problem statement

Go/No-Go's entire input is current weather: METAR (observations) and TAF
(terminal aerodrome forecasts) for a departure and a destination
airport. The product compares that weather against the pilot's personal
minimums and renders a verdict. The choice of *where the weather comes
from* is load-bearing — it determines the cost structure, the legal
posture, the failure modes, and whether the product is even buildable
inside the free-tier discipline.

Research §3 and §7 are explicit: flight planning / weather / charts as a
*product* is a trap for an indie — ForeFlight and Garmin Pilot dominate,
and competitive weather depth requires paid SiriusXM or commercial
weather licences. Research §5 Opportunity 8 is equally explicit about
the way *through* that trap: pull METAR/TAF from the **public NWS
Aviation Weather Center APIs (free, no commercial license needed)** and
compete on the *personal-minimums decision-aid framing*, not on weather
depth.

So the question is narrow: confirm the NWS Aviation Weather Center (AWC)
API as the V1 weather source, and decide how to treat it.

## Decision drivers

- **Free-tier discipline.** V1 is free-tier-only. The AWC API is free,
  public, US-government data and needs no account or key. A commercial
  weather API costs money — a founder-only cost commitment.
- **No licensing exposure.** AWC METAR/TAF is public-domain government
  data; redistributing a verdict computed from it carries no commercial
  data-licence obligation. A commercial feed's terms typically restrict
  redistribution.
- **The wedge is not weather depth.** Research §5 Opportunity 8 says
  differentiate on personal-minimums treatment and decision-aid
  simplicity. Paying for richer weather data buys nothing the product
  positioning needs.
- **It is a third-party dependency with no SLA.** The AWC API can be
  slow, can rate-limit, can change response shape, can be briefly down.
  The product must handle that — it cannot assume the upstream.
- **It is untrusted input.** Whatever the AWC returns is parsed and,
  potentially, displayed and stored. It must be validated and sanitized.

## Considered options

1. **NWS Aviation Weather Center public API** (METAR/TAF). Free,
   keyless, US-government data.
2. **A commercial aviation-weather API** (e.g. a paid METAR/TAF
   provider with an SLA).
3. **Scrape NWS / other public weather pages.** Free, but brittle and
   abusive.

## Decision outcome

Chosen option: **Option 1 — the NWS Aviation Weather Center public API**,
treated explicitly as **both a trust boundary and an availability
dependency.**

It is the source research §5 Opportunity 8 names, it keeps V1 inside the
free-tier discipline, and it carries no commercial-licence exposure.

**Treatment — the trust-boundary half:**

- The fetch client validates the airport identifier against a strict
  ICAO/FAA pattern *before* building the request URL — no raw user
  string in an outbound request.
- The response is length-capped and content-type-checked on ingest.
- The METAR/TAF parser is defensive — it never panics on malformed
  input; an unparseable observation is recorded `parse_ok = false`.
- Raw observation strings are stored as text and rendered as text
  (Svelte auto-escaping / Go `html/template`), never `{@html}` /
  `text/template`.

**Treatment — the availability-dependency half:**

- The fetch client is timeout-bounded, sends a descriptive `User-Agent`
  (so NWS can contact the operator), and backs off on 429/5xx.
- Observations are cached by `(station, issued_at)` so we fetch each
  station at most once per poll and reuse fresh data for on-demand
  verdicts (ADR-0005).
- **If the AWC API is slow, rate-limiting us, erroring, or returning
  nothing, the verdict is `unknown` ("weather unavailable") — never
  `go`, never a silently-stale green.** This composes with the ADR-0003
  invariant that the verdict never defaults to green.
- **There is no paid escape hatch.** An AWC outage or a rate-block is
  not something money fixes (unlike Resend Pro or Supabase Pro). The
  only mitigations are graceful degradation and being a well-behaved API
  citizen so we are never the client that gets blocked. This is tracked
  as a launch-availability risk in the §11 risk register.

### Positive consequences

- \$0 weather-data cost — V1 stays free-tier.
- No commercial-data-licence obligation.
- The source the research prescribes for this exact opportunity.

### Negative consequences

- **No SLA.** AWC availability is outside our control; the product must
  degrade gracefully, and "weather unavailable" is a real, visible
  state the UI must handle well.
- **Fair-use, not unlimited.** Over-requesting risks a rate-block; the
  poll must batch, cache, and back off (ADR-0005). Being a bad citizen
  has no paid remedy.
- **Response-shape drift.** A public government API can change; the
  parser and a battery of table tests absorb known formats, and a
  shape change surfaces as `parse_ok=false` rather than a crash.

## Pros and cons of each option

### Option 1 — NWS Aviation Weather Center API (chosen)

- 👍 Free, keyless, no commercial licence; the research's prescribed
  source.
- 👍 Authoritative US METAR/TAF.
- 👎 No SLA; fair-use rate expectation; no paid remedy for an outage.

### Option 2 — a commercial aviation-weather API

- 👍 An SLA, support, often a cleaner JSON shape.
- 👎 Costs money — breaks the free-tier discipline; a founder-only cost
  commitment.
- 👎 Redistribution terms may restrict computing+showing a verdict from
  the data.
- 👎 Buys weather depth the product positioning explicitly does not need
  (research §5 Opportunity 8).

### Option 3 — scrape public weather pages

- 👍 Free.
- 👎 Brittle (HTML changes break it), abusive (no API contract), and a
  faster route to a block than a well-behaved API client. Rejected.

## Links

- Spec section: [docs/product-research.md](../product-research.md) §2.2
  (weather source), §3.4 (weather ingestion), §11 (risk register).
- Related ADRs: [0001](0001-go-backend-for-weather-polling.md) (the Go
  service that hosts the fetch), [0003](0003-verdict-engine-pure-function.md)
  (the verdict never defaults to green),
  [0005](0005-weather-poll-cadence-and-caching.md) (the poll cadence +
  the observation cache that bounds AWC request volume).
- External: NWS Aviation Weather Center data API
  (`https://aviationweather.gov/data/api/`); 14 CFR 91.103
  (preflight action — the regulatory backdrop for why a pilot checks
  weather, and why Go/No-Go is an *aid*, not a substitute for an
  official briefing).
