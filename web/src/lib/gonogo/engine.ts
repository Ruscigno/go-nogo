// The go/no-go decision engine — a pure function, the heart of the product.
//
//   evaluate(factors, minimums) → FlightVerdict
//
// Load-bearing decision (CLAUDE.md / ADR-0003): no clock, no DB, no I/O.
// The parsed weather and the pilot's minimums are arguments — the NWS
// fetch + METAR/TAF parse happens in the caller (research §3.4), a later
// phase. Each comparison is its own small function carrying the minimum
// it checks, so the audit trail lives in the code. The (future) on-demand
// `/me/verdict` path and the poll cron will call the very same function —
// the rules are never re-implemented elsewhere (research §3.3).
//
// THE SAFETY INVARIANT (research §3.3, ADR-0003): the verdict NEVER
// defaults to green. A required factor whose value is missing reads
// `unknown`, and `unknown` blocks the overall from ever reading `go`.
// `go` requires every checked factor present and within the pilot's
// minimum. The pilot in command makes the final decision (disclaimer).

import {
  CAUTION_BUFFER,
  type FactorStatus,
  type FlightVerdict,
  type Minimums,
  type Verdict,
  type WeatherFactors,
} from "./types";

/** Roll up factor verdicts to the overall, worst-case wins (never green by omission). */
function rollUp(factors: FactorStatus[]): Verdict {
  // Precedence: no_go beats unknown beats caution beats go. `unknown`
  // outranks `caution` so partial data can never read better than a known
  // caution — but a clear exceedance (no_go) still dominates everything.
  const present = new Set(factors.map((f) => f.verdict));
  if (present.has("no_go")) return "no_go";
  if (present.has("unknown")) return "unknown";
  if (present.has("caution")) return "caution";
  // With no gated factors at all there is nothing to clear ⇒ unknown, not go.
  return factors.length === 0 ? "unknown" : "go";
}

/**
 * A "higher is safer" lower-bound minimum (ceiling, visibility).
 *
 * NO-GO when the observed value is below the pilot's minimum; CAUTION when
 * it clears the minimum but only within `buffer`; GO otherwise. A missing
 * value reads `unknown` — never `go` (the safety invariant).
 */
function lowerBoundFactor(
  observed: number | null | undefined,
  minimum: number,
  buffer: number,
  format: (v: number) => string,
  noun: string,
): { verdict: Verdict; detail: string } {
  if (observed === null || observed === undefined) {
    return {
      verdict: "unknown",
      detail: `${noun} unavailable — cannot clear your minimum of ${format(minimum)}; weather unavailable reads UNKNOWN, never GO.`,
    };
  }
  if (observed < minimum) {
    return {
      verdict: "no_go",
      detail: `${noun} ${format(observed)} is below your minimum of ${format(minimum)}.`,
    };
  }
  if (observed < minimum + buffer) {
    return {
      verdict: "caution",
      detail: `${noun} ${format(observed)} clears your minimum of ${format(minimum)} but only within the ${format(buffer)} caution buffer.`,
    };
  }
  return {
    verdict: "go",
    detail: `${noun} ${format(observed)} is at or above your minimum of ${format(minimum)}.`,
  };
}

/**
 * A "lower is safer" upper-bound maximum (crosswind, gust factor, recency).
 *
 * NO-GO when the observed value exceeds the pilot's maximum; CAUTION when
 * it is within `buffer` of the maximum; GO otherwise. Missing ⇒ `unknown`.
 */
function upperBoundFactor(
  observed: number | null | undefined,
  maximum: number,
  buffer: number,
  format: (v: number) => string,
  noun: string,
): { verdict: Verdict; detail: string } {
  if (observed === null || observed === undefined) {
    return {
      verdict: "unknown",
      detail: `${noun} unavailable — cannot check against your maximum of ${format(maximum)}; reads UNKNOWN, never GO.`,
    };
  }
  if (observed > maximum) {
    return {
      verdict: "no_go",
      detail: `${noun} ${format(observed)} exceeds your maximum of ${format(maximum)}.`,
    };
  }
  if (observed > maximum - buffer) {
    return {
      verdict: "caution",
      detail: `${noun} ${format(observed)} is within the ${format(buffer)} caution buffer of your maximum of ${format(maximum)}.`,
    };
  }
  return {
    verdict: "go",
    detail: `${noun} ${format(observed)} is within your maximum of ${format(maximum)}.`,
  };
}

const ft = (v: number) => `${v} ft`;
const sm = (v: number) => `${v} SM`;
const kt = (v: number) => `${v} kt`;
const days = (v: number) => `${v} day${v === 1 ? "" : "s"}`;

/**
 * The gust factor is `gust − steady wind`. An absent gust group means no
 * gust was reported, which is a factor of 0 — NOT missing data. An absent
 * steady wind with a gust present is genuinely unknown.
 */
function gustFactorFactor(
  f: WeatherFactors,
  maximum: number,
): { verdict: Verdict; detail: string } {
  if (f.gustKt === null || f.gustKt === undefined) {
    return {
      verdict: "go",
      detail: `No gust reported — gust factor 0 is within your maximum of ${kt(maximum)}.`,
    };
  }
  if (f.windKt === null || f.windKt === undefined) {
    return {
      verdict: "unknown",
      detail: `Gust ${kt(f.gustKt)} reported but steady wind is unavailable — gust factor unknown, reads UNKNOWN, never GO.`,
    };
  }
  const factor = Math.max(0, f.gustKt - f.windKt);
  return upperBoundFactor(
    factor,
    maximum,
    CAUTION_BUFFER.gustFactorKt,
    kt,
    "Gust factor",
  );
}

/**
 * The IFR-currency gate (research §3.3). go-nogo reads "am I IFR-current?"
 * as ONE yes/no input and does NOT manage currency — that is currency-hub
 * (CLAUDE.md "Boundary"). It only matters when the flight is into IMC:
 * a pilot who self-reports NOT current flying into forecast IMC is NO-GO;
 * a self-reported-current pilot, or VMC, is GO on this factor.
 */
function ifrCurrencyFactor(
  imcExpected: boolean | undefined,
  selfReportCurrent: boolean,
): { verdict: Verdict; detail: string } {
  if (!imcExpected) {
    return {
      verdict: "go",
      detail: "No IMC expected — IFR currency does not gate this flight (VMC).",
    };
  }
  if (selfReportCurrent) {
    return {
      verdict: "go",
      detail:
        "IMC expected and you self-report IFR-current. (go-nogo does not verify currency — see currency-hub.)",
    };
  }
  return {
    verdict: "no_go",
    detail:
      "IMC expected but you self-report NOT IFR-current. Verify currency before filing IFR.",
  };
}

/**
 * Evaluate every gated factor and roll up to an overall verdict.
 *
 * Pure: depends only on its arguments. A factor is included only when the
 * pilot set a minimum for it (`minimums` is the pilot's OWN numbers — the
 * engine never invents a threshold, research §3.3). The IFR-currency
 * factor is included whenever the pilot stated a self-report value.
 */
export function evaluate(
  factors: WeatherFactors,
  minimums: Minimums,
): FlightVerdict {
  const rows: FactorStatus[] = [];

  if (minimums.minCeilingFtAgl !== undefined) {
    const { verdict, detail } = lowerBoundFactor(
      factors.ceilingFtAgl,
      minimums.minCeilingFtAgl,
      CAUTION_BUFFER.ceilingFtAgl,
      ft,
      "Ceiling",
    );
    rows.push({ key: "ceiling", label: "Ceiling", verdict, detail });
  }

  if (minimums.minVisibilitySm !== undefined) {
    const { verdict, detail } = lowerBoundFactor(
      factors.visibilitySm,
      minimums.minVisibilitySm,
      CAUTION_BUFFER.visibilitySm,
      sm,
      "Visibility",
    );
    rows.push({ key: "visibility", label: "Visibility", verdict, detail });
  }

  if (minimums.maxCrosswindKt !== undefined) {
    const { verdict, detail } = upperBoundFactor(
      factors.crosswindKt,
      minimums.maxCrosswindKt,
      CAUTION_BUFFER.crosswindKt,
      kt,
      "Crosswind component",
    );
    rows.push({
      key: "crosswind",
      label: "Crosswind component",
      verdict,
      detail,
    });
  }

  if (minimums.maxGustFactorKt !== undefined) {
    const { verdict, detail } = gustFactorFactor(
      factors,
      minimums.maxGustFactorKt,
    );
    rows.push({ key: "gust", label: "Gust factor", verdict, detail });
  }

  if (minimums.ifrCurrentSelfReport !== undefined) {
    const { verdict, detail } = ifrCurrencyFactor(
      factors.imcExpected,
      minimums.ifrCurrentSelfReport,
    );
    rows.push({ key: "ifr_currency", label: "IFR currency", verdict, detail });
  }

  if (minimums.maxDaysSinceLastFlight !== undefined) {
    const { verdict, detail } = upperBoundFactor(
      factors.daysSinceLastFlight,
      minimums.maxDaysSinceLastFlight,
      CAUTION_BUFFER.daysSinceLastFlight,
      days,
      "Time since last flight",
    );
    rows.push({
      key: "recency",
      label: "Time since last flight",
      verdict,
      detail,
    });
  }

  return { overall: rollUp(rows), factors: rows };
}
