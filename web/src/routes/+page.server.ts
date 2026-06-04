import type { PageServerLoad } from "./$types";
import { env } from "$env/dynamic/private";
import { evaluate } from "$lib/gonogo/engine";
import type { FlightVerdict, Minimums } from "$lib/gonogo/types";
import { SEED_LEGS, SEED_MINIMUMS, seedRepository } from "$lib/repo/seed";
import { DEFAULT_MINIMUMS, postgresRepository } from "$lib/repo/postgres";

interface LegVerdict {
  id: string;
  label: string;
  verdict: FlightVerdict;
}

// Where the minimums the engine evaluated against came from — surfaced on
// the dashboard so a pilot is never shown a verdict computed from numbers
// they did not set without knowing it.
//   "saved"   — the pilot's own saved profile (Postgres).
//   "default" — first-run: no saved profile yet, sensible defaults shown.
//   "seed"    — local dev / DB-less CI lane: deterministic demo numbers.
type MinimumsSource = "saved" | "default" | "seed";

// The route depends on the repository interface and the pure engine — not
// on a database or the NWS fetch. `me` comes from the parent layout (the
// Cortex access guard). The engine itself reads no clock and no I/O; the
// only impurity (loading data) lives here at the boundary.
//
// Persistence wiring: when DATABASE_URL is set we read the pilot's SAVED
// personal minimums from the gear's `gonogo` schema (scoped to me.id); the
// weather factors stay seeded (the NWS fetch is a later phase, research
// §3.4). With no DATABASE_URL we fall back to the in-memory seed so local
// dev and the DB-less CI `web` lane still render. A first run with no saved
// profile yields sensible defaults plus an empty-state note.
export const load: PageServerLoad = async ({ parent }) => {
  const { me } = await parent();

  let minimums: Minimums;
  let source: MinimumsSource;
  let legs;

  if (env.DATABASE_URL) {
    const repo = postgresRepository(me.id, async () => SEED_LEGS);
    const [saved, legList] = await Promise.all([
      repo.getSavedMinimums(),
      repo.listLegs(me.id),
    ]);
    legs = legList;
    if (saved) {
      minimums = saved;
      source = "saved";
    } else {
      // First run: the pilot has not saved a profile. Evaluate against
      // sensible defaults and tell them so (the empty state).
      minimums = DEFAULT_MINIMUMS;
      source = "default";
    }
  } else {
    const repo = seedRepository();
    const [seedMin, legList] = await Promise.all([
      repo.getMinimums(me.id),
      repo.listLegs(me.id),
    ]);
    minimums = seedMin ?? SEED_MINIMUMS;
    legs = legList;
    source = "seed";
  }

  const verdicts: LegVerdict[] = legs.map((leg) => ({
    id: leg.id,
    label: leg.label,
    verdict: evaluate(leg.factors, minimums),
  }));

  // "Cleared" = the legs whose overall verdict is a clean GO. Everything
  // else (caution / no_go / unknown) needs the pilot's attention.
  const needsAttention = verdicts.filter(
    (v) => v.verdict.overall !== "go",
  ).length;

  return { verdicts, needsAttention, minimums, minimumsSource: source };
};
