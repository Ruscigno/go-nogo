# Phase 1 — Discovery kickoff prompt

Paste the fenced block below into Claude Code at the repo root **after**
running [scripts/setup-claude.sh](../scripts/setup-claude.sh).

This kickoff is a one-time prompt for **Phase 1 only**. Subsequent phases
are gated behind explicit founder approval — Claude will stop and
summarize at each phase boundary per
[.claude/rules/communication.md](../.claude/rules/communication.md).

Run this on **Opus** (planning/discovery). Implementation phases (5+) can
downshift to Sonnet.

> **Note on the current state of `docs/`.** The Phase 0 bootstrap landed
> draft `01-discovery.md` through `04-plan.md` and six `proposed` ADRs
> *alongside* the scaffold. Those are review drafts — no founder approval
> is recorded. This kickoff prompt re-runs Discovery properly: the agent
> should treat the existing `01-discovery.md` as a starting proposal to
> pressure-test with the founder, not as approved fact.

---

```
You are the lead engineer on Go/No-Go — a personal-minimums and
go/no-go decision aid for US general-aviation pilots. The product lets a
pilot save their own weather minimums (ceiling, visibility, crosswind
component, gust factor, an IFR-currency self-check, time-since-last-
flight); it pulls METAR/TAF for a departure and destination airport from
the free public NWS Aviation Weather Center APIs, parses them, evaluates
them against the pilot's stated minimums, and renders a green/yellow/red
verdict plus a printable WINGS-style risk-assessment summary; and it
emails the pilot when a saved trip's verdict changes. Your job is to take
this from zero to production MVP with full SDLC discipline and a
hacker-proof posture. This is a senior-engineer engagement, not a
vibe-coding session.

# Project context

Read @docs/product-research.md in full before doing anything else. That
is the source of truth for what we are building, who for, and why. Then
read @CLAUDE.md, @docs/working-contract.md, and @.claude/rules/*.md —
those are non-negotiable working rules.

Summary:
- Product: Go/No-Go — a "single screen" decision aid that compares the
  current weather for a flight against the MINIMUMS THE PILOT SET FOR
  THEMSELVES and renders a plain go/no-go verdict. Includes a printable
  WINGS risk-assessment PDF and an email alert when a saved trip's
  verdict changes.
- Target user: an active US GA pilot — especially a lower-time or
  newly-instrument-rated private pilot — who set personal minimums once
  (often on the FAA PDF at a BFR) and never looks at them, and who wants
  a fast, honest "is this a go against MY numbers?" check before a
  flight.
- Core value prop: "Set your personal minimums once. Before every
  flight, Go/No-Go pulls the weather and tells you — against YOUR
  numbers, not generic VFR minimums — whether it's a go. We email you
  when a saved trip's weather window opens or closes."
- Monetization: $6/mo or $39/yr individual. Free-tier marketing surface
  TBD in Discovery.
- Non-negotiable constraints:
    - V1 free-tier-only (Supabase free tier — data + auth in one
      project; Cloudflare R2 free tier; Cloud Run free tier — TWO
      services, web + Go API; Resend free tier; PostHog + Sentry free
      tiers; Cloud Scheduler 3-job free tier; the NWS Aviation Weather
      Center API is free + keyless public data).
    - Mobile-first PWA — no native shell in V1.
    - Email-only alerts in V1 — SMS and Web Push are cut (the portfolio
      cut Web Push over the iOS PWA limitation).
    - Cuts in research §5.4 (weather-product depth — radar, prog charts,
      winds aloft, NOTAMs, icing/turbulence; flight planning / routing /
      charts / W&B; managing regulatory currency; aircraft airworthiness
      tracking; SMS; Web Push; native apps; ML/AI) are refusals, not
      deferrals.
    - Founder is in UTC-3 (Florianópolis), targeting US users.

# Tech stack — per @docs/product-research.md §1 + @docs/adr/

Do not re-litigate these without a documented blocker:
- Frontend: SvelteKit (Svelte 5 runes) + Tailwind + Vite-PWA. Deployed
  to Cloud Run us-central1 with adapter-node.
- Backend: a Go 1.25 service on Cloud Run (per ADR-0001) — stdlib
  net/http.ServeMux, pgx/v5 + sqlc, golang-migrate, slog. It owns the
  NWS weather integration, the verdict-evaluation engine, the scheduled
  weather-poll + verdict-change-alert cron, and server-side WINGS-PDF
  generation. No chi/gin, no GORM. No separate Python service in V1 (no
  ML component).
- Weather source: the free public NWS Aviation Weather Center APIs
  (per ADR-0002) — no commercial weather licence; treated as a trust
  boundary AND an availability dependency.
- DB + Auth: a single Supabase project (Postgres + GoTrue + RLS +
  PostgREST). RLS gates browser-direct CRUD; the Go backend additionally
  scopes every query by the JWT-derived owner.
- Files: Cloudflare R2 (signed URLs) for WINGS risk-assessment PDFs.
- Payments: Stripe Checkout + Customer Portal + Billing.
- Email: Resend (transactional + the verdict-change alert fan-out).
- The verdict-evaluation engine is a PURE FUNCTION (ADR-0003) — no clock,
  no DB, no network I/O inside; the most heavily unit-tested package in
  the repo. It NEVER defaults to green on missing/stale weather.
- Alert dedupe is a DB UNIQUE constraint, not app logic (ADR-0004); the
  alert channel is email (ADR-0004); the weather poll runs on a fixed
  cadence with a shared-observation cache (ADR-0005).

# Boundary discipline — do NOT duplicate sibling products

Go/No-Go is a PERSONAL-MINIMUMS DECISION AID. It is NOT a weather /
flight-planning / charts product (research §3 warns explicitly against
weather depth and against avionics-equivalent calculators where being
wrong matters legally — differentiate on personal-minimums treatment +
decision-aid simplicity). It reads "am I IFR-current?" as ONE yes/no
verdict input, but it is NOT currency-hub — it does not manage the
pilot's regulatory currency (BFR/IPC, medical, landing/IFR recency).
State the go-nogo <-> currency-hub boundary explicitly in
01-discovery.md.

# Aviation-domain disclaimer

A go/no-go verdict is decision support for a safety-of-flight decision.
The disclaimer is calibrated FIRM (see .claude/rules/security.md):
"Go/No-Go is an advisory aid; the pilot in command is solely responsible
for the go/no-go decision; the verdict uses minimums you entered and
public weather data that may be stale, delayed, or incomplete; obtain an
official weather briefing before every flight." Required on signup,
every verdict surface, every alert email, the WINGS PDF, the footer, and
any "weather unavailable" state — firmer than currency-hub's middle-bar.

# Your task for Phase 1 (Discovery)

Pressure-test and finalize @docs/01-discovery.md: the problem statement,
the ICP persona + anti-personas, the in-scope V1 feature list (traceable
to product-research.md sections), the explicit out-of-scope cut list, the
success criteria + funnel + leading indicators, and the open questions
for the founder. Where you deviate from the research, cite the section
and the reason.

When the Discovery artifact is ready: STOP. Summarize what changed, list
the open questions at the bottom of the artifact, and ask the founder to
approve advancing to Phase 2 (Architecture). Do not auto-advance.
```
