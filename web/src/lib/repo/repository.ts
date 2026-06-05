// Data-access seam for the go/no-go engine.
//
// The engine is a pure function over `(factors, minimums)`; this interface
// is the only thing that knows where those values come from. V1's first
// slice ships an in-memory seed adapter (see ./seed.ts) so the dashboard
// renders a real vertical slice before the shared-Postgres minimums-profile
// table and the NWS weather fetch (research §3.4, §3.5) land. The route
// depends on this interface, not on a database or an HTTP client — swapping
// in a Supabase/pgx adapter (or, for `getFactors`, the Go backend's
// `/me/verdict` weather fetch) later is a one-file change with no churn in
// the engine or the route.

import type { Minimums, WeatherFactors } from "$lib/gonogo/types";

/** A named departure/destination leg whose factors the engine evaluates. */
export interface Leg {
  id: string;
  label: string;
  factors: WeatherFactors;
}

// Each repository instance is already scoped to ONE owner (the seed adapter
// to its demo pilot; the Postgres adapter to the `ownerUserId` passed to its
// factory). The owner is therefore NOT a per-call argument — passing it per
// call would be a false contract that the adapters silently ignore.
export interface GoNogoRepository {
  /** The pilot's personal-minimums profile (research §3.3). */
  getMinimums(): Promise<Minimums>;
  /**
   * The observed/forecast factors per leg to evaluate. In this slice these
   * are seeded; later this is backed by the NWS fetch + METAR/TAF parse
   * done server-side (research §3.4) — NOT in this engine.
   */
  listLegs(): Promise<Leg[]>;
}
