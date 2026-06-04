import { describe, expect, it } from "vitest";
import { DEFAULT_MINIMUMS, mapMinimumsRow } from "./postgres";

describe("mapMinimumsRow", () => {
  it("maps every saved column to its domain minimums field", () => {
    expect(
      mapMinimumsRow({
        min_ceiling_ft: 1800,
        min_visibility_sm: 4,
        max_crosswind_kt: 15,
        max_gust_factor_kt: 12,
        is_ifr_current: true,
        max_days_since_flight: 45,
      }),
    ).toEqual({
      minCeilingFtAgl: 1800,
      minVisibilitySm: 4,
      maxCrosswindKt: 15,
      maxGustFactorKt: 12,
      ifrCurrentSelfReport: true,
      maxDaysSinceLastFlight: 45,
    });
  });

  it("carries a fractional visibility (numeric column) as a number", () => {
    // postgres.js returns numeric as text; the query casts ::float8 so the
    // row already arrives numeric. The mapper must not coerce or round it.
    const m = mapMinimumsRow({
      min_ceiling_ft: 1000,
      min_visibility_sm: 1.5,
      max_crosswind_kt: 10,
      max_gust_factor_kt: 8,
      is_ifr_current: false,
      max_days_since_flight: 20,
    });
    expect(m.minVisibilitySm).toBe(1.5);
  });

  it("preserves a false IFR-currency self-report (the gate must stay false, not drop)", () => {
    const m = mapMinimumsRow({
      min_ceiling_ft: 1500,
      min_visibility_sm: 3,
      max_crosswind_kt: 12,
      max_gust_factor_kt: 10,
      is_ifr_current: false,
      max_days_since_flight: 30,
    });
    expect(m.ifrCurrentSelfReport).toBe(false);
    expect("ifrCurrentSelfReport" in m).toBe(true);
  });
});

describe("DEFAULT_MINIMUMS (first-run fallback)", () => {
  it("gates on every factor the engine evaluates (no factor left ungated)", () => {
    expect(DEFAULT_MINIMUMS.minCeilingFtAgl).toBeTypeOf("number");
    expect(DEFAULT_MINIMUMS.minVisibilitySm).toBeTypeOf("number");
    expect(DEFAULT_MINIMUMS.maxCrosswindKt).toBeTypeOf("number");
    expect(DEFAULT_MINIMUMS.maxGustFactorKt).toBeTypeOf("number");
    expect(DEFAULT_MINIMUMS.maxDaysSinceLastFlight).toBeTypeOf("number");
    expect(DEFAULT_MINIMUMS.ifrCurrentSelfReport).toBe(false);
  });
});
