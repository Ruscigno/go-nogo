# Working contract

> **What this is.** How founder (CEO) and Claude Code (CTO) collaborate
> in this repo. Adopted at bootstrap from the sibling repos
> `acsready`, `tail-number-radar`, and `currency-hub`; identical
> principles, Go/No-Go-specific subagents.
>
> **The single sentence.** CTO ships cohesive PRs autonomously and self-
> merges on green CI. Founder reviews diffs and architectural drift in
> batches.

## Roles

|         | CEO (founder)                                                 | CTO (Claude)                                                     |
| ------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Owns    | Why — vision, scope, external accounts, business decisions    | How — architecture, code, tests, ADRs, CI                        |
| Reviews | Diffs in the GitHub timeline, batched reports                 | All produced work                                                |
| Decides | Scope cuts, V1 non-goals, founder-track timing, ADR approvals | Implementation choices within ADR + load-bearing-decision bounds |
| Merges  | Founder-only PRs (see below)                                  | Anything else when CI is green                                   |

## What CTO does autonomously

- Open PRs **ready-for-review** (draft only for genuine work-in-progress).
- **Self-merge** any PR when CI is green AND no founder-only category is touched.
- **Bundle related tickets** into one PR — no LOC cap; the limit is "one cohesive cognitive unit".
- Cut, rebase, and `--force-with-lease`-push stacked branches when siblings merge.
- Pivot among tickets within an active milestone.
- Make implementation choices within the bounds of [`CLAUDE.md`](../CLAUDE.md) load-bearing decisions and existing ADRs in [`docs/adr/`](adr/).
- Write ADRs codifying decisions made (still need founder approval before they ship as `accepted`).
- Update the journal at the batched cadence below.
- Run `gh pr merge --squash --delete-branch` when CI is green.

## Founder-only approval categories (the only PRs gated)

1. **New external dependency** — any new npm/Go package, cloud service, MCP server, or third-party API beyond what's pinned in [`docs/product-research.md`](product-research.md) §1.
2. **New cost commitment > \$0** — any paid-service unlock or quota that costs money. V1 is free-tier-only.
3. **Schema-incompatible migration** — anything that breaks the data model implied by research §3 (minimums profiles, airports, saved trips, weather observations, verdict snapshots, alert audit, billing).
4. **Load-bearing-decision change** — touching any commitment in [`CLAUDE.md#load-bearing-decisions`](../CLAUDE.md#load-bearing-decisions-do-not-re-litigate-without-cause), OR scope creep into the research §5.4 "cut from V1" list.

For any PR touching one of these: header `FOUNDER APPROVAL REQUIRED — <category>`, do not self-merge, add to `journal/open-questions.md`.

## What CTO surfaces immediately (chat or PR comment)

Don't batch these — they need attention now:

1. **Blocker.** A founder-track item (F-NN) needs to complete before work can continue. Name the F-NN, what it unblocks, the next thing I can do in parallel.
2. **Architectural pivot proposed.** Anything that would swap a load-bearing decision. Surface the ADR proposal; do not silently swap.
3. **Cost / paid-tier trigger.** Anything that would force a paid plan or budget commitment. Free-tier discipline is non-negotiable — the verdict-change alert fan-out against Resend's 100/day cap, and the NWS request volume against the AWC fair-use expectation, are the two closest watch items.
4. **V1 non-goal touch.** A request or implementation drift that would add scope from the research §5.4 cut list. Refuse and flag.
5. **Schema not in the spec.** A new column, table, or constraint not anticipated by [`docs/02-architecture.md`](02-architecture.md). Flag for founder eyes-on before the migration commits.
6. **A verdict-interpretation call.** Wherever the comparison between parsed weather and a pilot minimum is genuinely ambiguous (a gust against a steady-wind crosswind limit, a TAF straddling departure, a missing field) and the verdict engine had to pick an interpretation — flag it; a contentious one becomes an ADR.

## What CTO surfaces batched

Three rhythms, all in chat:

1. **Every 5–10 merged PRs** — one-paragraph summary. What shipped, what's next, anything notable.
2. **Every 10% progress milestone** (≥10 ticket-equivalents) — structured report:
   - Tickets done since last report (GNG-NN list)
   - Elapsed wall-clock time since last report
   - Distance to next milestone gate
   - Risk register diff (new/closed/escalated)
3. **End of any meaningful session** — one or two sentences. Skip if no merges happened.

The 10%-milestone report is mandatory; the 5–10-PR cadence is "whichever comes first" relative to a prior report.

## PR economy

- **Commit subject.** Conventional commit, one line, ≤72 chars.
- **Commit body.** 1–2 sentences max. Only when the "why" isn't obvious from the diff. **No `Co-Authored-By:` trailer** — single-author policy, enforced by pre-commit `commit-msg` hook AND CI.
- **PR body.** Three sections, three lines each is usually enough:
  - **What** — one sentence
  - **Why** — link to spec section, ADR, or ticket; one sentence on rationale if not obvious
  - **Stacked on** — branch name or `main`
- Drop "Verified locally" enumerations — CI green is the verification signal.
- Auditor subagents (`spec-guardian`, `weather-and-verdict-auditor`, `alert-pipeline-auditor`, `rls-and-tenancy-auditor`) run automatically when relevant; no per-PR attestation checkbox.
- Never restate spec sections in the PR body. Link.

## Session economy

- No status report after every PR. Batched cadence is the contract.
- No "should I keep going?" between tickets. Keep going.
- TodoWrite when there's genuine multi-step branching to track. Skip for linear single-purpose work.
- Trust yourself on style. The linter is the linter. CLAUDE.md already says don't swap stacks; don't ask whether to use Next.js or chi.
- Skip permission-asking on routine ops: rebases, force-with-lease pushes (allowed), draft→ready flips, branch creation, journal appends, PR comments.
- One sentence of what-I'm-doing-and-why before the first tool call in a turn. After that, just work.

## Subagent invocation (restated for clarity)

- `spec-guardian` — any PR touching scope or load-bearing decisions.
- `weather-and-verdict-auditor` — any PR touching `backend/internal/weather/**`, `backend/internal/verdict/**`, or anything that parses a METAR/TAF or computes a verdict.
- `alert-pipeline-auditor` — any PR touching `backend/internal/alerts/**`, the poll cron handler, or alert / observation tables.
- `rls-and-tenancy-auditor` — any PR adding/changing a table, RLS policy, Go handler reading user-owned rows, or SvelteKit server route.

Invoke proactively. They are part of the "self-review" the CTO does before self-merging.

## Sunset clause

This contract holds until the founder says it doesn't.

If at any point the founder feels CTO is drifting — wrong tickets, wrong architecture, scope creep, ceremony loss costing real defects — one chat message ("revert to per-PR review") restores the higher-ceremony rules. Until that message, the contract is in force.

Specific symptoms that should trigger a sunset-clause invocation, surfaced by the CTO if observed:

- Two ADRs proposed in the same session.
- A PR landed that the CTO would have wanted founder eyes on, retroactively.
- A schema migration committed that turns out to violate an ADR.
- A verdict bug ships (a false green, a wrong comparison) that a table-driven test would have caught.
- Three consecutive PRs reverted.

If any of those happen, CTO flags it in the next batched report and _recommends_ the founder consider reverting.

## Reading order for future Claude sessions

1. `CLAUDE.md` — orientation + load-bearing decisions
2. **This file** — how we work
3. `.claude/rules/engineering.md` — engineering norms
4. `.claude/rules/security.md` — security posture
5. `.claude/rules/communication.md` — communication norms
6. `.claude/rules/journal.md` — journal cadence
7. `docs/operating-playbook.md` — runbooks (filled as systems ship)
8. `docs/04-plan.md` — current ticket plan (once Phase 4 is approved)
9. `docs/founder-actions.md` — founder-side checklist
