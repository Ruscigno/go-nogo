import type { PageServerLoad } from "./$types";
import { evaluate } from "$lib/gonogo/engine";
import type { FlightVerdict } from "$lib/gonogo/types";
import { seedRepository } from "$lib/repo/seed";

interface LegVerdict {
  id: string;
  label: string;
  verdict: FlightVerdict;
}

// The route depends on the repository interface and the pure engine — not
// on a database or the NWS fetch. `me` comes from the parent layout (the
// Cortex access guard). The engine itself reads no clock and no I/O; the
// only impurity (loading seed data) lives here at the boundary.
export const load: PageServerLoad = async ({ parent }) => {
  const { me } = await parent();

  const repo = seedRepository();
  const [minimums, legs] = await Promise.all([
    repo.getMinimums(me.id),
    repo.listLegs(me.id),
  ]);

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

  return { verdicts, needsAttention };
};
