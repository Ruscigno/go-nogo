import { describe, expect, it } from "vitest";
import { evaluate } from "./engine";
import type { FactorKey, Minimums, Verdict, WeatherFactors } from "./types";

/** Evaluate one gated factor in isolation and return its verdict. */
function verdictOf(
  key: FactorKey,
  minimums: Minimums,
  factors: WeatherFactors,
): Verdict {
  const row = evaluate(factors, minimums).factors.find((f) => f.key === key);
  if (!row) throw new Error(`no factor row for ${key}`);
  return row.verdict;
}

describe("ceiling vs minimum ceiling (lower-bound, 200 ft buffer)", () => {
  const min: Minimums = { minCeilingFtAgl: 1000 };
  it.each([
    ["go above buffer", 3000, "go"],
    ["go exactly at buffer edge", 1200, "go"],
    ["caution just inside buffer", 1100, "caution"],
    ["caution exactly at minimum", 1000, "caution"],
    ["no_go below minimum", 800, "no_go"],
  ] as const)("%s", (_label, ceiling, expected) => {
    expect(verdictOf("ceiling", min, { ceilingFtAgl: ceiling })).toBe(expected);
  });

  it("reads unknown — never go — when the ceiling is missing", () => {
    expect(verdictOf("ceiling", min, { ceilingFtAgl: null })).toBe("unknown");
    expect(verdictOf("ceiling", min, {})).toBe("unknown");
  });
});

describe("visibility vs minimum visibility (lower-bound, 1 SM buffer)", () => {
  const min: Minimums = { minVisibilitySm: 3 };
  it.each([
    ["go above buffer", 10, "go"],
    ["caution inside buffer", 3.5, "caution"],
    ["no_go below minimum", 2, "no_go"],
  ] as const)("%s", (_label, vis, expected) => {
    expect(verdictOf("visibility", min, { visibilitySm: vis })).toBe(expected);
  });

  it("reads unknown when visibility is missing", () => {
    expect(verdictOf("visibility", min, {})).toBe("unknown");
  });
});

describe("crosswind component vs maximum (upper-bound, 3 kt buffer)", () => {
  const min: Minimums = { maxCrosswindKt: 15 };
  it.each([
    ["go well under max", 5, "go"],
    ["caution within buffer of max", 14, "caution"],
    ["caution exactly at max", 15, "caution"],
    ["no_go over max", 18, "no_go"],
  ] as const)("%s", (_label, xw, expected) => {
    expect(verdictOf("crosswind", min, { crosswindKt: xw })).toBe(expected);
  });

  it("reads unknown when the crosswind component is missing", () => {
    expect(verdictOf("crosswind", min, { crosswindKt: null })).toBe("unknown");
  });
});

describe("gust factor = gust − steady wind vs maximum (2 kt buffer)", () => {
  const min: Minimums = { maxGustFactorKt: 10 };

  it("go when no gust is reported — factor 0, not unknown", () => {
    expect(verdictOf("gust", min, { windKt: 12 })).toBe("go");
  });

  it("computes gust minus steady wind", () => {
    // 25 - 10 = 15 > 10 ⇒ no_go
    expect(verdictOf("gust", min, { windKt: 10, gustKt: 25 })).toBe("no_go");
    // 17 - 8 = 9, within 2 kt of 10 ⇒ caution
    expect(verdictOf("gust", min, { windKt: 8, gustKt: 17 })).toBe("caution");
    // 12 - 8 = 4 ⇒ go
    expect(verdictOf("gust", min, { windKt: 8, gustKt: 12 })).toBe("go");
  });

  it("never negative — a gust below steady wind is factor 0", () => {
    expect(verdictOf("gust", min, { windKt: 20, gustKt: 18 })).toBe("go");
  });

  it("reads unknown when a gust is reported but steady wind is missing", () => {
    expect(verdictOf("gust", min, { gustKt: 25 })).toBe("unknown");
  });
});

describe("IFR-currency self-report gate (one yes/no input, not currency management)", () => {
  it("go in VMC regardless of currency", () => {
    expect(
      verdictOf(
        "ifr_currency",
        { ifrCurrentSelfReport: false },
        { imcExpected: false },
      ),
    ).toBe("go");
  });
  it("go in IMC when the pilot self-reports current", () => {
    expect(
      verdictOf(
        "ifr_currency",
        { ifrCurrentSelfReport: true },
        { imcExpected: true },
      ),
    ).toBe("go");
  });
  it("no_go in IMC when the pilot self-reports NOT current", () => {
    expect(
      verdictOf(
        "ifr_currency",
        { ifrCurrentSelfReport: false },
        { imcExpected: true },
      ),
    ).toBe("no_go");
  });
});

describe("time since last flight vs maximum (upper-bound, 7 day buffer)", () => {
  const min: Minimums = { maxDaysSinceLastFlight: 30 };
  it.each([
    ["go well under max", 3, "go"],
    ["caution within buffer", 28, "caution"],
    ["no_go over max", 45, "no_go"],
  ] as const)("%s", (_label, d, expected) => {
    expect(verdictOf("recency", min, { daysSinceLastFlight: d })).toBe(
      expected,
    );
  });

  it("reads unknown when recency is missing", () => {
    expect(verdictOf("recency", min, {})).toBe("unknown");
  });
});

describe("evaluate — only gated factors appear", () => {
  it("includes a row per minimum the pilot set, and no others", () => {
    const v = evaluate(
      { ceilingFtAgl: 3000, visibilitySm: 10 },
      { minCeilingFtAgl: 1000, minVisibilitySm: 3 },
    );
    expect(v.factors.map((f) => f.key)).toEqual(["ceiling", "visibility"]);
  });

  it("the engine never invents a threshold — no minimums ⇒ no factors", () => {
    const v = evaluate({ ceilingFtAgl: 3000 }, {});
    expect(v.factors).toHaveLength(0);
  });
});

describe("overall rollup — worst case wins, never green by omission", () => {
  const FULL: Minimums = {
    minCeilingFtAgl: 1000,
    minVisibilitySm: 3,
    maxCrosswindKt: 15,
  };

  it("go only when every factor is go", () => {
    const v = evaluate(
      { ceilingFtAgl: 3000, visibilitySm: 10, crosswindKt: 5 },
      FULL,
    );
    expect(v.factors.every((f) => f.verdict === "go")).toBe(true);
    expect(v.overall).toBe("go");
  });

  it("caution when the worst factor is caution", () => {
    const v = evaluate(
      { ceilingFtAgl: 1100, visibilitySm: 10, crosswindKt: 5 },
      FULL,
    );
    expect(v.overall).toBe("caution");
  });

  it("no_go when any factor is no_go, even alongside cautions", () => {
    const v = evaluate(
      { ceilingFtAgl: 1100, visibilitySm: 1, crosswindKt: 5 },
      FULL,
    );
    expect(v.overall).toBe("no_go");
  });

  it("unknown — never go — when any gated factor is missing", () => {
    const v = evaluate(
      { ceilingFtAgl: 3000, visibilitySm: 10 /* crosswind missing */ },
      FULL,
    );
    expect(v.overall).toBe("unknown");
  });

  it("unknown outranks caution but no_go still dominates unknown", () => {
    // crosswind missing (unknown) + ceiling caution ⇒ overall unknown
    expect(
      evaluate({ ceilingFtAgl: 1100, visibilitySm: 10 }, FULL).overall,
    ).toBe("unknown");
    // crosswind missing (unknown) + visibility no_go ⇒ overall no_go
    expect(
      evaluate({ ceilingFtAgl: 3000, visibilitySm: 1 }, FULL).overall,
    ).toBe("no_go");
  });

  it("no gated factors at all ⇒ unknown, never go (safety invariant)", () => {
    expect(evaluate({}, {}).overall).toBe("unknown");
  });
});

describe("evaluate — purity", () => {
  it("is pure: the same inputs yield deeply equal output", () => {
    const f: WeatherFactors = { ceilingFtAgl: 1100, crosswindKt: 14 };
    const m: Minimums = { minCeilingFtAgl: 1000, maxCrosswindKt: 15 };
    expect(evaluate(f, m)).toEqual(evaluate(f, m));
  });
});
