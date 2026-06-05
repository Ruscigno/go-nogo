// Domain types for the go/no-go decision engine. Mirrors the shape in
// product-research §3.3: a `Minimums` profile declares the pilot's OWN
// numbers, an observed `WeatherFactors` set carries the values to check,
// and the engine compares the two factor-by-factor. The engine never
// touches a database, a clock, or the network — these are plain values
// passed in and out (ADR-0003: the verdict engine is a pure function).
//
// SCOPE NOTE (CLAUDE.md "Boundary"): go-nogo evaluates weather against
// the thresholds the pilot set for THEMSELVES. It is not a weather
// product. This slice takes already-observed factors as input — the NWS
// fetch + METAR/TAF parse is the caller's job (research §3.4), a later
// phase. Here we model only the comparison.

/**
 * The three-band verdict per single factor and for the overall flight.
 *
 * Bands map to the product's plain-language colours (research §0, §3.3):
 *   go      → green  — within the pilot's minimum, comfortably.
 *   caution → yellow — close to a minimum (inside the caution buffer),
 *                       or a soft factor that warrants attention.
 *   no_go   → red    — a clear exceedance of the pilot's minimum.
 *   unknown → grey   — the factor is required but its value is missing.
 *                       NEVER folds to `go`; it is the safety invariant
 *                       (research §3.3, ADR-0003: "never defaults to green").
 */
export type Verdict = "go" | "caution" | "no_go" | "unknown";

/**
 * The pilot's personal-minimums profile — the pilot's OWN numbers, NOT a
 * regulatory default (research §3.3: "the engine never invents a
 * threshold the pilot did not set"). Every field the engine compares
 * against lives here. Optional fields mean "the pilot does not gate on
 * this factor" — an absent minimum yields no factor row, not a `go`.
 */
export interface Minimums {
  /** Lowest acceptable ceiling, ft AGL. Observed ceiling below this is NO-GO. */
  minCeilingFtAgl?: number;
  /** Lowest acceptable surface visibility, statute miles. */
  minVisibilitySm?: number;
  /** Highest acceptable crosswind component, knots. */
  maxCrosswindKt?: number;
  /** Highest acceptable gust factor (gust − steady wind), knots. */
  maxGustFactorKt?: number;
  /**
   * Whether the pilot self-reports IFR-current. A `false` here gates IMC
   * out of a `go` — go-nogo reads currency as ONE yes/no input and does
   * NOT manage it (that is currency-hub's job; CLAUDE.md "Boundary").
   */
  ifrCurrentSelfReport?: boolean;
  /** Highest acceptable days since the pilot last flew. */
  maxDaysSinceLastFlight?: number;
}

/**
 * Observed/forecast weather + pilot-state factors to evaluate. All values
 * are passed in (no fetch in this slice). A `null`/absent value on a
 * factor the pilot gates on yields `unknown` for that factor — never a
 * silent `go`.
 */
export interface WeatherFactors {
  /** Observed/forecast ceiling, ft AGL. `null` ⇒ unknown when gated. */
  ceilingFtAgl?: number | null;
  /** Observed surface visibility, statute miles. */
  visibilitySm?: number | null;
  /** Computed crosswind component for the chosen runway, knots. */
  crosswindKt?: number | null;
  /** Steady surface wind, knots — used with `gustKt` for the gust factor. */
  windKt?: number | null;
  /** Gust, knots. Absent ⇒ no gust reported (gust factor 0), not unknown. */
  gustKt?: number | null;
  /**
   * Whether the flight is planned/forecast into IMC. Combined with the
   * pilot's IFR-currency self-report to gate eligibility.
   */
  imcExpected?: boolean;
  /** Days since the pilot last flew. */
  daysSinceLastFlight?: number | null;
}

/** A single evaluated factor — one row on the verdict surface. */
export interface FactorStatus {
  /** Stable key for the factor (also the `#each` key in the UI). */
  key: FactorKey;
  /** Human label for the dashboard row. */
  label: string;
  verdict: Verdict;
  /** Plain-language, minimum-cited explanation for the verdict surface. */
  detail: string;
}

/** The factors this engine evaluates in V1's first slice. */
export type FactorKey =
  | "ceiling"
  | "visibility"
  | "crosswind"
  | "gust"
  | "ifr_currency"
  | "recency";

/** The engine's full result: every checked factor + the rolled-up overall. */
export interface FlightVerdict {
  overall: Verdict;
  factors: FactorStatus[];
}

/**
 * The caution buffers — a small fixed margin around a minimum within which
 * a factor reads yellow instead of green (research §3.3 "caution band",
 * §4 schema note "yellow-band buffers — small fixed defaults"). These are
 * engine defaults, NOT pilot-set; a pilot-configurable buffer is a
 * documented later phase (research §5 / §6 "pilot-configurable yellow band").
 */
export const CAUTION_BUFFER = {
  /** Within 200 ft of the ceiling minimum reads caution. */
  ceilingFtAgl: 200,
  /** Within 1 SM of the visibility minimum reads caution. */
  visibilitySm: 1,
  /** Within 3 kt of the crosswind maximum reads caution. */
  crosswindKt: 3,
  /** Within 2 kt of the gust-factor maximum reads caution. */
  gustFactorKt: 2,
  /** Within 7 days of the recency maximum reads caution. */
  daysSinceLastFlight: 7,
} as const;
