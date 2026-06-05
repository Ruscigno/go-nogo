import { describe, expect, it, vi } from "vitest";
import {
  countNeedsAttention,
  repositoryFor,
  resolveMinimums,
  type SelectedRepository,
} from "./factory";
import type { Leg } from "./repository";
import type { Minimums } from "$lib/gonogo/types";

const MIN_A: Minimums = {
  minCeilingFtAgl: 1000,
  minVisibilitySm: 3,
  maxCrosswindKt: 12,
  maxGustFactorKt: 10,
  ifrCurrentSelfReport: false,
  maxDaysSinceLastFlight: 30,
};
const MIN_B: Minimums = { ...MIN_A, minCeilingFtAgl: 2000 };
const DEFAULTS: Minimums = { ...MIN_A, minCeilingFtAgl: 9999 };

const LEGS: Leg[] = [];
const legsFn = async () => LEGS;
const noop = () => {};

const seedRepo: SelectedRepository = {
  getMinimums: async () => MIN_A,
  listLegs: legsFn,
};
const pgWithProfile: SelectedRepository = {
  getMinimums: async () => MIN_B,
  getSavedMinimums: async () => MIN_B,
  listLegs: legsFn,
};
const pgNoProfile: SelectedRepository = {
  getMinimums: async () => DEFAULTS,
  getSavedMinimums: async () => null,
  listLegs: legsFn,
};

describe("repositoryFor", () => {
  it("uses the Postgres adapter when DATABASE_URL is set", () => {
    const r = repositoryFor(
      "postgres://x",
      "u1",
      legsFn,
      () => pgWithProfile,
      () => seedRepo,
      noop,
    );
    expect(r).toBe(pgWithProfile);
  });

  it.each([undefined, ""])(
    "uses the seed adapter when DATABASE_URL is %p",
    (url) => {
      const r = repositoryFor(
        url,
        "u1",
        legsFn,
        () => pgWithProfile,
        () => seedRepo,
        noop,
      );
      expect(r).toBe(seedRepo);
    },
  );

  it("scopes the Postgres adapter to the ownerUserId", () => {
    let gotId = "";
    repositoryFor(
      "url",
      "u9",
      legsFn,
      (id) => ((gotId = id), pgWithProfile),
      () => seedRepo,
      noop,
    );
    expect(gotId).toBe("u9");
  });

  it("passes the seeded legsFn to the Postgres adapter", () => {
    let gotLegs: (() => Promise<Leg[]>) | null = null;
    repositoryFor(
      "url",
      "u1",
      legsFn,
      (_id, legs) => ((gotLegs = legs), pgWithProfile),
      () => seedRepo,
      noop,
    );
    expect(gotLegs).toBe(legsFn);
  });

  it("warns in seed mode so a missing DATABASE_URL is visible in the logs", () => {
    const warn = vi.fn();
    repositoryFor(
      undefined,
      "u1",
      legsFn,
      () => pgWithProfile,
      () => seedRepo,
      warn,
    );
    expect(warn).toHaveBeenCalledOnce();
  });

  it("does not warn when Postgres is configured", () => {
    const warn = vi.fn();
    repositoryFor(
      "postgres://x",
      "u1",
      legsFn,
      () => pgWithProfile,
      () => seedRepo,
      warn,
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("resolveMinimums", () => {
  it("returns the seed minimums with source 'seed' for the seed adapter", async () => {
    const { minimums, source } = await resolveMinimums(seedRepo, DEFAULTS);
    expect(source).toBe("seed");
    expect(minimums).toBe(MIN_A);
  });

  it("returns the saved profile with source 'saved' when Postgres has one", async () => {
    const { minimums, source } = await resolveMinimums(pgWithProfile, DEFAULTS);
    expect(source).toBe("saved");
    expect(minimums).toBe(MIN_B);
  });

  it("falls back to defaults with source 'default' when Postgres has no profile", async () => {
    const { minimums, source } = await resolveMinimums(pgNoProfile, DEFAULTS);
    expect(source).toBe("default");
    expect(minimums).toBe(DEFAULTS);
  });

  it("never calls getSavedMinimums on a seed adapter", async () => {
    const spy = { getMinimums: vi.fn(async () => MIN_A), listLegs: legsFn };
    await resolveMinimums(spy, DEFAULTS);
    expect(spy.getMinimums).toHaveBeenCalledOnce();
  });
});

describe("countNeedsAttention", () => {
  it("counts every verdict whose overall is not a clean go", () => {
    expect(
      countNeedsAttention([
        { overall: "go" },
        { overall: "caution" },
        { overall: "no_go" },
        { overall: "unknown" },
        { overall: "go" },
      ]),
    ).toBe(3);
  });

  it("is zero when every leg is a clean go", () => {
    expect(countNeedsAttention([{ overall: "go" }, { overall: "go" }])).toBe(0);
  });

  it("is zero for an empty list", () => {
    expect(countNeedsAttention([])).toBe(0);
  });
});
