# 01 — Discovery

> **Status: DRAFT — awaiting founder review. No founder approval is
> recorded.** This artifact restates problem, users, scope, success
> criteria, and open questions in a form the rest of the team (and
> future Claude sessions) can scan in five minutes. Source of truth:
> [docs/product-research.md](product-research.md). Where this file
> deviates from the research it cites the section + reason.

## Goal

Give a US general-aviation pilot one screen that answers the question
they wrestle with before a flight: **"Given the weather right now, and
the minimums I set for myself when I was calm on the ground, is this
flight a go?"** — and then email the pilot when a saved trip's verdict
changes, so a weather window opening or closing is never a surprise.

## Problem

Every responsible GA pilot is taught to set **personal minimums** —
their own weather limits, tighter than the regulatory VFR/IFR minimums:
a minimum ceiling, a minimum visibility, a maximum crosswind component,
a maximum gust factor, a check on their own recency and currency, a
limit on how long it has been since they last flew. The FAA actively
promotes this through the WINGS pilot proficiency program and the FITS /
Personal and Weather Risk Assessment Guide.

The trouble is what happens *after* the pilot sets them:

1. **Personal minimums get set once and forgotten.** A pilot fills out
   the FAA personal-minimums worksheet (a PDF) once — often at a flight
   review — and never looks at it again. The numbers live on a sheet of
   paper, not in the decision.
2. **The pre-flight weather check does not compare against *your*
   numbers.** ForeFlight and Garmin Pilot show excellent weather. They
   do not say "this is below the 1,500 ft ceiling *you* decided was your
   limit". The pilot has to hold their own minimums in their head and do
   the comparison — exactly when they are tired, time-pressured, and
   motivated to go.
3. **Crosswind is a calculation, not a glance.** The reported wind is
   not the crosswind. A pilot has to mentally decompose `27018G28KT`
   against their planned runway to know the crosswind and gust they
   actually face — and that arithmetic is where get-there-itis quietly
   wins.
4. **There is no honest, automatic "go/no-go" against the pilot's own
   limits, and no alert when a window opens or closes.** A 2025 Pilots
   of America thread explicitly asks for a "Decision Assist Go/NoGo App"
   that notifies the pilot when conditions match their criteria. Nothing
   self-serve and pilot-minimums-first fills that gap.

Go/No-Go's wedge is being the **personal-minimums-first, decision-aid-
simple** product: the pilot saves their minimums once, and before every
flight the app pulls the weather, does the comparison (including the
crosswind math) against *their* numbers, and renders a plain
green/yellow/red verdict — plus a printable WINGS-style risk-assessment
record and an email alert when a saved trip's verdict changes.

### Existing tools and why they don't fit

- **ForeFlight / Garmin Pilot** — excellent weather and EFB function,
  but they show *the weather*, not a verdict against *your* personal
  minimums; and they are priced/built as full EFBs.
- **EZWxBrief** — a strong web-delivered aviation-weather progressive
  web app; the closest adjacent product. It is a *weather* tool — depth,
  graphics, route weather. Go/No-Go is not competing on weather depth;
  it is a *decision aid* keyed to the pilot's own thresholds.
- **The FAA personal-minimums worksheet (a PDF)** — what most diligent
  pilots actually have. It is a static form; it does no live comparison,
  pulls no weather, and sends no alert.
- **PAVE / IMSAFE paper checklists, AOPA risk-assessment forms** — good
  frameworks, but paper; filled out once, not a live tool.
- **A pilot's own head** — the default. Mental crosswind math under
  time pressure is exactly where the decision aid earns its keep.

## Boundary — what Go/No-Go is NOT (and which siblings it is not)

This is load-bearing because the portfolio has adjacent products and the
research §3 skip-list warns explicitly against two traps Go/No-Go sits
near.

- **Go/No-Go is not a weather product.** It pulls METAR/TAF and renders
  a verdict; it does **not** show radar, satellite, prog charts, winds
  aloft, icing/turbulence forecasts, PIREPs-as-a-feature, NOTAMs, or
  TFRs. Research §3 / §7 disqualify weather depth as an indie product
  (ForeFlight/Garmin/EZWxBrief territory, paid data feeds). Go/No-Go
  differentiates on **the personal-minimums treatment and decision-aid
  simplicity** — research §5 Opportunity 8 states this explicitly. A PR
  that adds weather-product depth is scope creep.
- **Go/No-Go is not a flight planner or an EFB.** No route, no fuel, no
  navlog, no charts, no moving map, no weight-and-balance. Research §3
  also warns against avionics-equivalent calculators where being wrong
  matters legally — Go/No-Go's crosswind component is a *decision
  input*, presented with an advisory disclaimer, not an avionics
  performance calculator sold as the product.
- **Go/No-Go is not `currency-hub`.** This is the closest sibling
  boundary and must be stated precisely. `currency-hub` *manages a
  pilot's full regulatory currency* — it tracks BFR/IPC, medical /
  BasicMed, 90-day day/night landing currency, and 6-month IFR-approach
  recency under 14 CFR 61.56 / 61.57 / 61.23, computes rolling
  expirations, and emails reminders. **Go/No-Go does none of that.**
  Go/No-Go reads **one** currency-related fact — "am I IFR-current?" —
  as a single **yes/no input the pilot self-asserts**, and uses it only
  as a gate inside *one flight's verdict* (if the destination weather is
  IFR and the pilot is not IFR-current, that flight is not a go). It
  also reads "time since last flight" as a number the pilot enters,
  compared to their own limit. Go/No-Go never *tracks*, *computes*, or
  *reminds about* a currency cycle. Where the two products are adjacent,
  the boundary is: **`currency-hub` manages the pilot's currency over
  time; Go/No-Go consumes a snapshot of it as one input to a single
  flight's go/no-go decision.** A PR that drifts Go/No-Go toward
  computing or reminding about a currency cycle is duplicating
  `currency-hub` — `spec-guardian` BLOCKs it.
- **Go/No-Go is not `tail-number-radar`.** It tracks no aircraft
  airworthiness deadline (annual, AD/SB, transponder check). Those
  attach to a tail number; Go/No-Go attaches to a pilot's flight
  decision.

## Users

### Primary persona: "Dave the active private pilot"

- US-based, 30–60, holds a Private Pilot certificate; often newly
  instrument-rated or working toward the rating. 1–5 years
  post-checkride — the cohort that takes personal minimums seriously
  (it was drilled into them recently) but has the least pattern-matched
  judgement to fall back on.
- Flies 2–6 times a month, often a rental or club aircraft, often with
  family or friends aboard.
- Has an FAA personal-minimums worksheet *somewhere* — filled out once,
  at a flight review or a WINGS event — and does not look at it.
- Does the pre-flight weather check on a phone, often at the airport,
  often under mild time pressure with passengers waiting. Has had at
  least one "is this crosswind actually within what I said I'd accept?"
  moment.
- Will pay $6/mo or $39/yr for a tool that holds his minimums for him,
  does the comparison and the crosswind math honestly, and tells him
  green/yellow/red — *if* the mobile UX is faster than opening three
  weather apps and doing the arithmetic himself.

### Secondary persona: "Priya the proficiency-minded WINGS pilot"

- An active pilot who participates in the FAA WINGS program and wants a
  **risk-assessment record** for a flight — a printable summary she can
  keep or show as evidence of a deliberate go/no-go process.
- Values the WINGS risk-assessment PDF more than the alert; uses
  Go/No-Go partly as a discipline tool.
- Not a different buyer (same $6/mo individual plan) — a different *job*
  the same product serves.

### Jobs to be done (ranked by trigger frequency)

1. **Pre-flight, on the ramp or the night before (most frequent):**
   "Given the weather now, against my minimums, is this a go?" → enter
   the airports + runway, read the green/yellow/red verdict.
2. **Recurring, passively:** "Tell me when a trip I'm watching changes
   status." → receive the verdict-change alert email.
3. **Setting up, once:** "Record my personal minimums so the app can
   use them." → fill the minimums profile.
4. **Planning ahead:** "I want to watch tomorrow's flight as the
   weather firms up." → save the trip; the poll watches it.
5. **For the record / WINGS:** "I want a risk-assessment summary of this
   go/no-go decision." → generate the WINGS PDF.

### Anti-personas (who we are NOT serving in V1)

- **Pilots wanting a weather app.** Go/No-Go renders a verdict against
  the pilot's minimums; it is not a place to study the weather. EZWxBrief
  / ForeFlight own that. A pilot who wants radar and winds aloft is not
  the buyer.
- **Pilots wanting a flight planner / EFB.** No route, fuel, charts, or
  W&B. ForeFlight / Garmin Pilot territory.
- **Pilots wanting currency tracking.** Go/No-Go reads IFR-currency as
  one yes/no input; it does not manage the BFR/medical/landing/IFR-recency
  cycles. That pilot wants the sibling `currency-hub`.
- **Aircraft owners wanting airworthiness tracking.** Annual / AD-SB /
  transponder deadlines belong to a tail number — `tail-number-radar`.
- **Part 121/135 crews / dispatch.** Their go/no-go is an operator
  function with a dispatcher; this is a Part 91 individual-pilot
  decision aid.
- **Non-US pilots.** V1 uses the US NWS Aviation Weather Center API and
  US airport reference data. International coverage is out of scope.

## In scope (V1)

The full feature list lives in [product-research.md](product-research.md)
§5.1; reproduced here for at-a-glance reading. Each row traces to a
research section.

| #   | Feature                                                       | Research § |
| --- | ------------------------------------------------------------- | ---------- |
| 1   | Self-serve signup (email/password, magic link, Google)        | §5.1 #1    |
| 2   | Onboarding (display name, home airport) + advisory-disclaimer ack | §5.1 #2 |
| 3   | Personal-minimums profile editor                              | §5.1 #3    |
| 4   | Airport + runway entry (departure + destination)              | §5.1 #4    |
| 5   | NWS weather fetch — METAR + TAF for the entered airports       | §5.1 #5, §3.4 |
| 6   | The verdict-evaluation engine (pure function; never green by default) | §5.1 #6, §3.3 |
| 7   | The "single screen" green/yellow/red verdict view             | §5.1 #7    |
| 8   | Crosswind / headwind component display                        | §5.1 #8    |
| 9   | Save a trip (a dep/dest pair to watch)                        | §5.1 #9    |
| 10  | Scheduled weather poll + verdict-change alert cron            | §5.1 #10, §3.5 |
| 11  | Verdict-change alert email                                    | §5.1 #11   |
| 12  | WINGS risk-assessment PDF export                              | §5.1 #12   |
| 13  | "Weather unavailable" graceful-degradation state              | §5.1 #13   |
| 14  | Stripe Checkout (monthly + annual) + Customer Portal          | §5.1 #14   |
| 15  | Paywall (14-day trial)                                        | §5.1 #15   |
| 16  | PWA installability                                            | §5.1 #16   |
| 17  | Mobile-responsive everything                                  | §5.1 #17   |
| 18  | Legal pages + the advisory-disclaimer surfaces                | §5.1 #18   |

V1 architecture is per [CLAUDE.md](../CLAUDE.md)'s load-bearing block:
a SvelteKit web tier + a Go backend service, both on Cloud Run; a single
Supabase project for data + auth; the free NWS Aviation Weather Center
API for METAR/TAF; R2 for WINGS PDFs; Stripe for billing; Resend for
email; Cloud Scheduler for the weather-poll cron. The formal Go-backend
call is [ADR-0001](adr/0001-go-backend-for-weather-polling.md); the
weather-source call is [ADR-0002](adr/0002-nws-aviation-weather-api.md).

## Explicitly out of scope (V1)

Reproduced from [product-research.md](product-research.md) §5.4. This is
a **refusal list**, not a backlog. Adding any of these in V1 requires a
founder override + an ADR superseding the row.

| Cut                                                | Reason                                                          |
| -------------------------------------------------- | --------------------------------------------------------------- |
| Weather-product depth (radar, prog charts, winds aloft, icing/turbulence, PIREPs-as-a-feature) | Research §3/§7: weather depth needs paid feeds; ForeFlight/EZWxBrief territory |
| NOTAMs / TFRs / airspace                           | Not weather; a separate data domain; ForeFlight/Garmin territory |
| Flight planning — route, fuel, navlog, charts, moving map | Go/No-Go is a decision aid, not an EFB / planner          |
| Weight-and-balance / performance as the product    | Research §3: avionics-equivalent calculators where being wrong matters legally are a crowded, high-liability trap |
| Managing the pilot's regulatory currency           | Go/No-Go reads IFR-currency as one input; it does not track BFR/medical/landing/IFR-recency — that is `currency-hub` |
| Aircraft airworthiness tracking (annual/AD-SB/etc.)| Belongs to a tail number — `tail-number-radar`                  |
| Making the go/no-go decision FOR the pilot         | Go/No-Go is advisory; the PIC decides — liability + scope       |
| A commercial / paid weather API                    | Costs money; "more weather" is not the wedge (ADR-0002)         |
| SMS notifications                                  | Twilio A2P 10DLC is a multi-week external dependency            |
| Web Push                                           | Cut portfolio-wide for V1 (iOS PWA limitation); email is the channel |
| Native iOS / Android app                           | PWA covers 95% of need                                          |
| ML / AI features                                   | No ML component → no Python service in V1                       |
| Real-time ADS-B / live traffic                     | Requires paid data feeds                                        |
| Social feed / community / shared-minimums library  | Cannot be moderated solo; r/flying exists                       |
| Lifetime billing                                   | A weather decision-support service is an indefinite recurring need |

### Cuts I'd surface as additions to the research's list

None at this phase. The research §5.4 cut list is comprehensive. The one
item to *watch*, not cut, is **a TAF-aware "go window"** (the earliest /
latest time today the trip is a go) — research §5.2 parks it in V1.1.
Discovery agrees: it stays a V1.1 item; V1 evaluates the current
observation + the relevant TAF group, not a full forecast timeline.

## Success criteria

### Activation funnel (instrumented in PostHog from M3)

```
Visit landing  →  Sign up  →  Complete onboarding (name + disclaimer ack)
   │                                  │
   ▼                                  ▼
Personal-minimums profile saved  →  First verdict run (a dep/dest pair)
   │                                  │
   ▼                                  ▼
First saved trip  →  First verdict-change alert received
   │
   ▼
Paywall hit (14-day trial expiry)  →  Stripe Checkout  →  Paid (monthly/annual)
```

### Leading indicators (PostHog events to ship in M3/M4)

- `minimums.saved` — the activation gate; a pilot with no minimums has
  no product.
- `verdict.run` (with `outcome` ∈ go|caution|no_go|unknown) — the core
  engagement event.
- `verdict.unavailable_shown` — the NWS-degradation surface; a health
  signal for the upstream dependency.
- `trip.saved` — the retention-loop signal.
- `alert.email_sent` / `alert.email_opened` — the moat metric; open rate
  within a few hours is the health check.
- `wings_pdf.generated` — the WINGS / proficiency-pilot signal.
- `paywall.hit` / `upgrade.completed` (with `plan`).

### Cohort gates (what success looks like)

| Phase        | Gate                                                              |
| ------------ | ----------------------------------------------------------------- |
| Beta         | 10–15 pilots from the founder's network; ≥ 60% save a minimums profile and run a verdict |
| Launch       | First paid customer within 7 days of the r/flying post           |
| 90 days      | 30 paying customers; verdict-change alert open rate ≥ 50%        |
| 180 days     | ~$1k MRR equivalent (mix of monthly + annual)                     |
| 365 days     | PMF signal OR a deliberate sunset/pivot decision                  |

### Counter-metrics worth watching

- **Verdict-change alert open rate.** The retention mechanic is the
  alert. If pilots ignore the emails, the loop is broken — re-think the
  email before scaling acquisition.
- **Wrong-verdict reports, especially false greens.** Any report of a
  verdict that disagrees with the actual weather vs the pilot's minimums
  is a P0 — and a false green is a safety-relevant P0. Track the count,
  target zero.
- **`verdict.unavailable_shown` rate.** A leading indicator of NWS API
  health — if it spikes, the upstream dependency is degrading.
- **Resend daily send volume vs the 100/day free cap.** Alert volume
  scales with weather volatility; a cost-risk leading indicator — see
  the §11 risk register.

## Open questions for the founder

These need a founder decision before Phase 2 (Architecture) is locked.
They are also tracked in [journal/open-questions.md](../journal/open-questions.md).

### Q1 — The yellow (caution) band — how is it defined?

The verdict is green/yellow/red. Green (within minimums) and red (a
clear exceedance) are unambiguous. Yellow is a "close to a minimum"
caution band — but the margin is a product decision.
**Recommended:** yellow = within a small fixed buffer of any minimum
(ceiling within 500 ft, visibility within 1 SM, crosswind within 3 kt)
OR any required weather field is stale / partially missing. A
pilot-configurable buffer is a V1.1 candidate. Founder confirm.

### Q2 — How close to the FAA FRAT does the WINGS PDF go?

Research §5 says the printable risk-assessment summary should "satisfy
WINGS". The FAA Flight Risk Assessment Tool (FRAT) has a specific
PAVE/IMSAFE-flavored structure; matching it pixel-for-pixel is more
build.
**Recommended:** a clean risk-assessment summary — the weather snapshot,
the pilot's minimums, the verdict, and a PAVE-checklist section the
pilot fills in — structured to be WINGS-suitable, not a pixel-exact FAA
FRAT clone. Founder confirm.

### Q3 — Free tier vs trial; the exact paywall trigger.

Research §8 warns a free tier sets a $0 anchor; research §5 Opportunity
8 prices at $5–7/mo.
**Recommended:** a 14-day full trial, no credit card, then a time-based
paywall — no permanent free tier (ADR-0006). The trigger is purely
time-based (trial expiry). Founder confirm.

### Q4 — Weather-poll cadence.

The poll cron's interval trades alert freshness against NWS request
volume and Resend send volume.
**Recommended:** a single Cloud Scheduler job at a 30-minute fixed
interval, polling only active-saved-trip airports, observation-cached
(ADR-0005). Per-trip cadence tuning is a V1.1 evolution. Founder confirm.

### Q5 — Domain choice.

`gonogo.app` (new registration, ~$10/yr) vs `gonogo.tickerbeats.com`
(subdomain of an existing zone, $0).
**Recommended:** the subdomain for V1 to hold to free-tier discipline;
register the apex domain if the product shows traction. Founder confirm
(also F-01 in `founder-actions.md`).

### Q6 — V1 pricing point ($5 vs $6 vs $7 monthly).

Research §5 Opportunity 8 gives a $5–7/mo band.
**Recommended:** $6/mo + $39/yr individual (ADR-0006) — mid-band,
consistent with the sibling `currency-hub`. Founder confirm.

---

## Reminders carried into Phase 2

- The six ADRs (`0001`–`0006`) are `Status: proposed`. Phase 2's first
  action is the founder ratifying them `proposed → accepted` and updating
  CLAUDE.md's load-bearing block to reflect the ratified state.
- The data model in research §4.2 is concrete enough to migrate from on
  day one of Phase 5; Phase 2 reviews it once for `pgx`/`sqlc`
  compatibility — note the split between user-owned tables (RLS) and the
  shared public `airports` / `weather_observations` tables (not
  RLS-per-user).
- The cross-tenant isolation regression test — covering **both** the RLS
  layer and the Go-backend owner-predicate layer, **and** the WINGS-PDF
  R2-key case — is the single most important test in the suite. Phase 3
  spec must call it out as a top-priority acceptance test.
- The verdict engine's per-comparison table tests — and especially the
  dedicated "verdict never defaults to green on missing/stale/
  unparseable weather" test set — are the product's safety guarantee.
  Phase 4's plan must budget real time for them, not treat them as
  wiring.
- The NWS Aviation Weather Center API is a third-party trust boundary
  and an availability dependency with no paid escape hatch — Phase 2's
  STRIDE pass and Phase 4's risk register must both treat it explicitly.

---

**Phase 1 status: DRAFT — not founder-approved.** This artifact, and the
draft `02-architecture.md` / `03-spec.md` / `04-plan.md` produced
alongside it during the Phase 0 bootstrap, are review drafts. Phase 2
work is blocked until the founder approves this Discovery artifact and
answers Q1–Q6.
