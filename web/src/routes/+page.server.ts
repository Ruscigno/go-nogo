import type { PageServerLoad } from "./$types";
import { env } from "$env/dynamic/private";
import { evaluate } from "$lib/gonogo/engine";
import type { FlightVerdict } from "$lib/gonogo/types";
import { SEED_LEGS } from "$lib/repo/seed";
import { DEFAULT_MINIMUMS } from "$lib/repo/postgres";
import {
  countNeedsAttention,
  repositoryFor,
  resolveMinimums,
} from "$lib/repo/factory";

interface LegVerdict {
  id: string;
  label: string;
  verdict: FlightVerdict;
}

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
// profile yields sensible defaults plus an empty-state note. The selection,
// the minimums-source branching, and the needs-attention count all live in
// `$lib/repo/factory` as pure, unit-tested helpers.
export const load: PageServerLoad = async ({ parent }) => {
  const { me } = await parent();

  const repo = repositoryFor(env.DATABASE_URL, me.id, async () => SEED_LEGS);
  const [{ minimums, source }, legs] = await Promise.all([
    resolveMinimums(repo, DEFAULT_MINIMUMS),
    repo.listLegs(),
  ]);

  const verdicts: LegVerdict[] = legs.map((leg) => ({
    id: leg.id,
    label: leg.label,
    verdict: evaluate(leg.factors, minimums),
  }));

  // "Cleared" = the legs whose overall verdict is a clean GO. Everything
  // else (caution / no_go / unknown) needs the pilot's attention.
  const needsAttention = countNeedsAttention(verdicts.map((v) => v.verdict));

  return { verdicts, needsAttention, minimums, minimumsSource: source };
};
