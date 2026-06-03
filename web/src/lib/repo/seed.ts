// In-memory seed adapter — the V1 first-slice data source behind
// GoNogoRepository.
//
// Deterministic demo data so the dashboard renders a working slice while
// the shared-Postgres minimums table and the NWS weather fetch are still
// in flight. The seeded pilot's minimums plus three legs surface one of
// each band — a clean GO, a CAUTION, and a NO-GO — and one leg with a
// missing factor that demonstrates the safety invariant (it reads
// UNKNOWN, never GO). All values are fixed; nothing here reads a clock or
// the network, keeping the engine pure.

import type { Minimums } from "$lib/gonogo/types";
import type { GoNogoRepository, Leg } from "./repository";

const MINIMUMS: Minimums = {
  minCeilingFtAgl: 1500,
  minVisibilitySm: 3,
  maxCrosswindKt: 15,
  maxGustFactorKt: 10,
  ifrCurrentSelfReport: false,
  maxDaysSinceLastFlight: 30,
};

const LEGS: Leg[] = [
  {
    // GO: everything comfortably within the pilot's numbers, VMC.
    id: "kpao-ksql",
    label: "KPAO → KSQL",
    factors: {
      ceilingFtAgl: 4500,
      visibilitySm: 10,
      crosswindKt: 6,
      windKt: 9,
      gustKt: 14,
      imcExpected: false,
      daysSinceLastFlight: 4,
    },
  },
  {
    // CAUTION: ceiling just inside the buffer, crosswind near the max.
    id: "kpao-ksjc",
    label: "KPAO → KSJC",
    factors: {
      ceilingFtAgl: 1600,
      visibilitySm: 8,
      crosswindKt: 14,
      windKt: 12,
      gustKt: 18,
      imcExpected: false,
      daysSinceLastFlight: 12,
    },
  },
  {
    // NO-GO: IMC expected while not IFR-current, plus visibility below min.
    id: "kpao-kmry",
    label: "KPAO → KMRY",
    factors: {
      ceilingFtAgl: 900,
      visibilitySm: 1.5,
      crosswindKt: 8,
      windKt: 7,
      gustKt: null,
      imcExpected: true,
      daysSinceLastFlight: 9,
    },
  },
  {
    // UNKNOWN: crosswind component unavailable ⇒ the safety invariant —
    // a missing gated factor reads UNKNOWN, never GO.
    id: "kpao-khaf",
    label: "KPAO → KHAF",
    factors: {
      ceilingFtAgl: 5000,
      visibilitySm: 10,
      crosswindKt: null,
      windKt: 6,
      gustKt: null,
      imcExpected: false,
      daysSinceLastFlight: 3,
    },
  },
];

/** A GoNogoRepository backed by deterministic in-memory demo data. */
export function seedRepository(): GoNogoRepository {
  return {
    getMinimums: async () => MINIMUMS,
    listLegs: async () => LEGS,
  };
}
