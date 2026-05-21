# Decisions log

Append-only. One line per entry. Format:

```
YYYY-MM-DD | GNG-NNN or area | one-line decision | one-line rationale
```

Architectural decisions do NOT go here — they become ADRs in
`docs/adr/`. This file is for routine, non-architectural calls and a
one-line record of every self-merged PR.

---

2026-05-21 | Phase 0 | Bootstrapped the Go/No-Go repo scaffold (root config, .claude rules + 4 agents, CI, db/backend skeleton, docs) | Replicates the acsready template structure adapted to a Go-backed product; Phase 1–4 draft artifacts produced alongside.
2026-05-21 | Phase 0 | Go backend skeleton dirs scaffolded (backend/cmd/server, backend/internal) with configs only, no Go code | Go/No-Go polls the NWS Aviation Weather Center API on a schedule, evaluates verdicts, and emails on verdict change → needs a Go service per the founder's backend rule; formal call recorded in ADR-0001 (proposed).
2026-05-21 | Phase 0 | Six ADRs drafted Status:proposed (Go backend, NWS weather source, verdict-engine-pure-function, alert-dedupe + email channel, weather-poll cadence + caching, billing model) | One ADR per load-bearing decision; all await founder ratification as Phase 2's first action.
