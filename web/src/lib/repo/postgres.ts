// Postgres-backed GoNogoRepository — the real persistence adapter behind
// the repository seam. Connects to the shared Cortex Postgres with the
// gear's `gonogo_app` role (DATABASE_URL) and reads the gear's `gonogo`
// schema, scoping every query by the authenticated Cortex user id. Mirrors
// the Go backend's per-request owner predicate (research §4.3 / CLAUDE.md).
//
// What this persists: the pilot's saved personal minimums — the configurable
// per-factor limits the engine evaluates against (research §3.3 / §4.2). The
// weather factors themselves stay transient inputs: the live NWS fetch +
// METAR/TAF parse (research §3.4) is a later phase, so `listLegs` still comes
// from the seed even when DATABASE_URL is set.
//
// Server-only: imported from +page.server.ts via the repository factory,
// never from a .svelte component, so the browser never holds the connection
// string. The row→domain mapper is pure and exported so it can be unit-tested
// without a live database (the CI `web` lane has no Postgres; the `db` lane
// round-trips the migration separately).

import postgres from "postgres";
import { env } from "$env/dynamic/private";
import type { Minimums } from "$lib/gonogo/types";
import type { GoNogoRepository, Leg } from "./repository";

/**
 * Shape of a `gonogo.personal_minimums` row as selected below. The numeric
 * columns (`min_visibility_sm`) arrive as text from postgres.js, so they are
 * cast `::float8` in the query to land as JS numbers; `min_ceiling_ft` etc.
 * are `int` and arrive as numbers already.
 */
export interface MinimumsRow {
  min_ceiling_ft: number;
  min_visibility_sm: number;
  max_crosswind_kt: number;
  max_gust_factor_kt: number;
  is_ifr_current: boolean;
  max_days_since_flight: number;
}

/**
 * Pure: map a DB minimums row to the domain `Minimums`. Every saved column
 * is a gated factor, so each maps to a present field — there is no "the
 * pilot does not gate on this" sentinel in the persisted row (a saved
 * profile sets all six limits; product-research §4.2 makes them NOT NULL).
 */
export function mapMinimumsRow(row: MinimumsRow): Minimums {
  return {
    minCeilingFtAgl: row.min_ceiling_ft,
    minVisibilitySm: row.min_visibility_sm,
    maxCrosswindKt: row.max_crosswind_kt,
    maxGustFactorKt: row.max_gust_factor_kt,
    ifrCurrentSelfReport: row.is_ifr_current,
    maxDaysSinceLastFlight: row.max_days_since_flight,
  };
}

// Lazy singleton connection — created on first use and reused for the life
// of the (long-running, adapter-node) process.
let sql: ReturnType<typeof postgres> | null = null;
function client(): ReturnType<typeof postgres> {
  if (!sql) {
    if (!env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set; cannot open the go-nogo Postgres adapter.",
      );
    }
    sql = postgres(env.DATABASE_URL);
  }
  return sql;
}

/**
 * A GoNogoRepository backed by the shared Cortex Postgres for the pilot's
 * saved minimums. `getMinimums` returns `null` when the pilot has not saved a
 * profile yet (the first-run/empty state) — the caller substitutes sensible
 * defaults. The weather factors are still seeded (`listLegs` from `legsFn`)
 * until the NWS fetch lands.
 */
export function postgresRepository(
  ownerUserId: string,
  legsFn: () => Promise<Leg[]>,
): GoNogoRepository & { getSavedMinimums(): Promise<Minimums | null> } {
  const db = client();
  const getSavedMinimums = async (): Promise<Minimums | null> => {
    const rows = await db<MinimumsRow[]>`
      SELECT min_ceiling_ft,
             min_visibility_sm::float8 AS min_visibility_sm,
             max_crosswind_kt,
             max_gust_factor_kt,
             is_ifr_current,
             max_days_since_flight
      FROM gonogo.personal_minimums
      WHERE owner_user_id = ${ownerUserId}
      LIMIT 1`;
    return rows.length > 0 ? mapMinimumsRow(rows[0]) : null;
  };
  return {
    getSavedMinimums,
    // The engine needs a non-null Minimums; the +page.server loader uses
    // getSavedMinimums directly so it can detect the empty state. This
    // method preserves the GoNogoRepository contract for any caller that
    // only wants the effective minimums (falling back to defaults).
    getMinimums: async () => (await getSavedMinimums()) ?? DEFAULT_MINIMUMS,
    listLegs: legsFn,
  };
}

/**
 * Sensible first-run defaults shown when the pilot has saved no profile yet.
 * These are conservative GA VFR personal minimums (research §3.3 example:
 * a 1500 ft ceiling / 3 SM is a common new-pilot floor). They are clearly
 * surfaced as DEFAULTS in the UI — the engine never silently treats them as
 * the pilot's own numbers.
 */
export const DEFAULT_MINIMUMS: Minimums = {
  minCeilingFtAgl: 1500,
  minVisibilitySm: 3,
  maxCrosswindKt: 12,
  maxGustFactorKt: 10,
  ifrCurrentSelfReport: false,
  maxDaysSinceLastFlight: 30,
};
