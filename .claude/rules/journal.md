# Journal rules

Operational memory lives under `journal/`:

| File                        | Purpose                                                                                                                                                                                     | Append cadence                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `journal/decisions.md`      | Running, append-only log of routine decisions (one line per entry: `YYYY-MM-DD \| scope \| what \| why`). One entry per self-merged PR + any non-architectural decision made along the way. | Every self-merged PR; agent appends without notifying.                                      |
| `journal/open-questions.md` | Running queue of questions for the founder (with default-decision-by date so work is never blocked).                                                                                        | When a question for the founder is identified; agent batches into the next periodic report. |
| `journal/milestones.md`     | Milestone reports at every ≥10% overall progress. One section per milestone crossing.                                                                                                       | Triggered automatically when the threshold is crossed.                                      |
| `journal/YYYY-MM-DD.md`     | Day-files for **phase-artifact** sessions only (Discovery, Architecture, Spec, Plan, Harden, Deploy gates) — narrative entries.                                                             | At every phase-artifact gate. Not for per-PR work.                                          |

## Purpose

Operational memory carries things that don't belong in commit messages, PR descriptions, or ADRs but matter for future sessions:

- What was decided and why, when not architectural enough for an ADR.
- Reminders to bring up later.
- Blockers encountered or cleared.
- Things deferred with intent.
- The "I wonder why we did X" answer-in-three-months.

## When to append (which file)

| Event                                               | File                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| Self-merged PR                                      | `journal/decisions.md` — one line                                 |
| Routine non-architectural decision (GNG-NNN scope)  | `journal/decisions.md` — one line                                 |
| Question that needs founder input                   | `journal/open-questions.md` — entry with default-decision-by date |
| Crossed ≥10% overall progress                       | `journal/milestones.md` — milestone-report section                |
| Reached a phase-artifact gate                       | `journal/YYYY-MM-DD.md` — narrative entry                         |
| Discovered a non-obvious library / service property | `journal/YYYY-MM-DD.md` — narrative entry (carries forward)       |

## What NOT to put in any journal file

- Anything already in git log, PR descriptions, or ADRs (link to those instead).
- Code or config (belongs in the source tree).
- Secrets.
- Verbose narration of routine actions.
- Permanent project conventions (those go in `.claude/rules/` or `CLAUDE.md`).

## Templates

**`journal/decisions.md`** — append-only, one line per entry:

```
YYYY-MM-DD | GNG-NNN or area | one-line decision | one-line rationale
```

**`journal/open-questions.md`** — append-only, per question:

```
## YYYY-MM-DD — <one-line question>
Context: <one sentence>
Default (if no answer by YYYY-MM-DD): <what I'll do absent input>
```

**`journal/milestones.md`** — one section per milestone:

```
## <percentage>% — YYYY-MM-DD
Tickets merged this milestone: GNG-NNN through GNG-MMM
Highlights: <2-3 bullets>
Re-prioritization recommendation: <if any>
Open ADRs to consider: <if any>
```

**`journal/YYYY-MM-DD.md`** (phase-artifact gates only):

```markdown
# YYYY-MM-DD

## HH:MM — <topic>

### What happened

- <concrete actions, with commit short SHAs and PR numbers>

### Decisions made

- <non-trivial choices with rationale; ADR-worthy → write an ADR instead>

### Deferred

- <intentionally not done; revisit-by date if known>

### Blockers

- <external dependencies>

### Reminders carried forward

- <items to surface in future sessions>
```

## Reading at session start

When Claude Code starts a new session, scan in this order:

1. `journal/open-questions.md` — any unresolved questions still relevant.
2. `journal/decisions.md` — last ~20 lines for recent context.
3. The most recent phase-artifact day-file (`journal/YYYY-MM-DD.md`) if any — for **Reminders carried forward** and **Deferred** sections.

Surface anything still open at the top of the first response.

## Go/No-Go-specific things worth journaling

- METAR/TAF parse edge cases — wherever a real-world observation broke the parser or forced an interpretation (variable winds `VRB`, `CAVOK`, `NSC`, `P6SM`, missing ceiling group, vertical visibility `VV`, fractional visibility `1 1/2SM`, automated-station remarks). These belong in the journal AND a table-driven test, and a contentious one becomes an ADR.
- Verdict-rule interpretation calls — wherever the comparison between a parsed weather field and a pilot minimum is genuinely ambiguous (e.g. how to treat a TAF that straddles the planned departure time, or whether a gust counts against the steady-wind crosswind limit). Record the call; a contentious one becomes an ADR.
- NWS Aviation Weather Center API quirks — response-shape changes, rate-limiting behavior, station-not-found responses, stale-observation timestamps, the difference between the METAR and TAF endpoints.
- `pgx/v5` + `sqlc` gotchas (CITEXT overrides, NULL pointer handling, timestamp tz behavior).
- Supabase JWKS quirks when the Go backend verifies tokens (kid rotation timing).
- Cloud Scheduler OIDC audience mismatches (the single most common cron-auth failure).
- Resend webhook event-shape changes; Stripe event-type renames.
- SvelteKit 2 / Svelte 5 runes gotchas (load lifecycle, form-action progressive enhancement).
- PostHog event schema drift (renaming a property breaks every dashboard built against it).
