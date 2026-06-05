// Repository selection — the one place that decides between the real
// Postgres adapter and the in-memory seed, kept out of `+page.server.ts` so
// the branch is unit-testable without SvelteKit's `$env` or a live database.

import type { Minimums } from "$lib/gonogo/types";
import type { GoNogoRepository, Leg } from "./repository";
import { postgresRepository } from "./postgres";
import { seedRepository } from "./seed";

// The Postgres adapter additionally exposes `getSavedMinimums`, which returns
// `null` when the pilot has saved no profile yet — the loader needs this to
// distinguish a SAVED profile from the first-run DEFAULT. The seed adapter has
// no such notion (its demo minimums always exist), so the field is optional on
// the selected repository.
export type SelectedRepository = GoNogoRepository & {
  getSavedMinimums?(): Promise<Minimums | null>;
};

/**
 * Pick the data source: real Postgres when `databaseUrl` is set (the shared
 * Cortex Postgres with the gear's `gonogo_app` role), else the deterministic
 * seed so local dev + the DB-less CI `web` lane still render. The weather
 * legs stay seeded in both adapters until the NWS fetch lands (research §3.4),
 * so `legsFn` is the shared source of demo legs.
 *
 * The adapter factories and the `warn` sink are injectable so both branches
 * are testable without a database. In seed mode it warns once-per-call on the
 * server so an accidental deploy without `DATABASE_URL` is visible in the logs
 * rather than silently serving demo data to real users.
 */
export function repositoryFor(
  databaseUrl: string | undefined,
  ownerUserId: string,
  legsFn: () => Promise<Leg[]>,
  makePostgres: (
    id: string,
    legs: () => Promise<Leg[]>,
  ) => SelectedRepository = postgresRepository,
  makeSeed: () => GoNogoRepository = seedRepository,
  warn: (msg: string) => void = (m) => console.warn(m),
): SelectedRepository {
  if (databaseUrl) return makePostgres(ownerUserId, legsFn);
  warn(
    "[go-nogo] DATABASE_URL is not set — serving in-memory SEED data (demo only).",
  );
  return makeSeed();
}

// Where the minimums the engine evaluated against came from — surfaced on the
// dashboard so a pilot is never shown a verdict computed from numbers they did
// not set without knowing it.
//   "saved"   — the pilot's own saved profile (Postgres).
//   "default" — first-run: no saved profile yet, sensible defaults shown.
//   "seed"    — local dev / DB-less CI lane: deterministic demo numbers.
export type MinimumsSource = "saved" | "default" | "seed";

/**
 * Resolve the effective minimums plus where they came from. Pure over the
 * injected repository — no `$env`, no clock, no I/O of its own. Three branches,
 * each a distinct `MinimumsSource`:
 *   - seed adapter (no `getSavedMinimums`)        → "seed", its demo minimums
 *   - Postgres adapter with a saved profile       → "saved", the saved minimums
 *   - Postgres adapter with no saved profile yet  → "default", `defaultMinimums`
 */
export async function resolveMinimums(
  repo: SelectedRepository,
  defaultMinimums: Minimums,
): Promise<{ minimums: Minimums; source: MinimumsSource }> {
  if (!repo.getSavedMinimums) {
    return { minimums: await repo.getMinimums(), source: "seed" };
  }
  const saved = await repo.getSavedMinimums();
  if (saved) return { minimums: saved, source: "saved" };
  return { minimums: defaultMinimums, source: "default" };
}

/**
 * Count the legs whose overall verdict is NOT a clean GO — the legs that need
 * the pilot's attention (caution / no_go / unknown). Pure helper extracted so
 * the dashboard's "needs attention" badge is unit-tested.
 */
export function countNeedsAttention(
  overalls: ReadonlyArray<{ overall: string }>,
): number {
  return overalls.filter((v) => v.overall !== "go").length;
}
