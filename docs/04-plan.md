# 04 — Plan

> **Status: DRAFT — awaiting founder review. No founder approval is
> recorded.** Sliced tickets, milestones, dependencies, and the risk
> register for Go/No-Go V1. Phase 5 implements one capability slice per
> PR per the working contract; this file is the source of truth for what
> those slices are and the order they ship in.
>
> Cross-references:
> [03-spec.md](03-spec.md) defines the acceptance criteria each ticket
> tests against.
> [api/openapi.yaml](api/openapi.yaml) is the formal API contract.
> [founder-actions.md](founder-actions.md) is the parallel founder track.

## 1. Conventions

- Ticket IDs are `GNG-NNN` (Go/No-Go, sequentially numbered).
- Founder-action IDs are `F-NN` ([founder-actions.md](founder-actions.md)).
- Each ticket carries a milestone (`M1`–`M7`), an estimate (`S/M/L/XL`),
  and a critical-path flag (⚠ blocks the next milestone).
- "Deps" lists prior `GNG-NNN` and `F-NN` items that must merge / clear
  first. The agent refuses to start a ticket whose deps are not satisfied.
- The working contract's per-PR self-merge rule applies inside any active
  milestone. The Phase-5 → Phase-6 boundary is a stop-and-confirm gate.

## 2. Milestones (sequenced per research §6)

| Milestone | Theme                                          | Founder-action deps                    | Gate                                                                                          |
| --------- | ---------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| M1        | Skeleton + auth + the airports seed            | F-03 (Supabase)                        | Signup → onboarding → `/app` works against real Supabase; the `airports` table is seeded       |
| M2        | The weather fetch + the verdict engine         | F-15 (NWS User-Agent)                  | METAR/TAF fetch + parse table-tested; the verdict engine ≥95% covered, never green on missing data |
| M3        | The verdict view + minimums + first deploy     | F-01, F-02, F-08, F-09                 | Both Cloud Run services deployed to staging; a pilot can save minimums and run a live verdict   |
| M4        | Saved trips + the alert pipeline               | F-04 (Cloud Scheduler), F-06 (Resend)  | `/cron/poll` OIDC-authed; poll + dedupe + alert email work; idempotency test green             |
| M5        | The WINGS risk-assessment PDF                  | F-05 (R2)                              | A WINGS PDF generates to R2 and downloads via a signed URL                                     |
| M6        | Payments + paywall                             | F-07 (Stripe), F-10 (Legal)            | Stripe Checkout (2 prices) + Portal; webhook replay-safety green; paywall enforced             |
| M7        | PWA, polish, beta, launch                      | F-11→F-13 (Woodpecker), F-14 (Uptime)  | Lighthouse PWA ≥ 90; production cutover; r/flying launch post                                  |

## 3. Ticket list

### M1 — Skeleton + auth + the airports seed

| ID      | Title                                                                                                  | Spec ACs            | Deps           | Size | ⚠ |
| ------- | ------------------------------------------------------------------------------------------------------ | ------------------- | -------------- | ---- | - |
| GNG-001 | Scaffold `web/` (SvelteKit 2 / Svelte 5, TS, ESLint, Prettier, Vitest, Playwright)                     | —                   | —              | M    | ⚠ |
| GNG-002 | Add Tailwind, daisyUI, `@supabase/ssr`, `@vite-pwa/sveltekit`, zod to `web/`                           | —                   | GNG-001        | S    |   |
| GNG-003 | Scaffold `backend/` — `go mod init`, `net/http.ServeMux`, `pgxpool`, `sqlc`, `slog`, the `run()` shape | —                   | —              | M    | ⚠ |
| GNG-004 | Migration `0001_pilots` (the `pilots` table + RLS) + Makefile `db.*` wiring                            | —                   | GNG-003        | S    | ⚠ |
| GNG-005 | Migration `0002_airports` + the airports reference-data seed pipeline                                  | AC-19, AC-20        | GNG-004        | M    | ⚠ |
| GNG-006 | `backend` `/healthz` returning `{status:ok, db:ok}`; Dockerfile builds                                  | AC-X10              | GNG-004        | S    |   |
| GNG-007 | Go JWT verifier — ES256, JWKS cached, HS256/expired/wrong-aud/wrong-iss/tampered rejected               | AC-X06              | GNG-003        | M    | ⚠ |
| GNG-008 | `web` `hooks.server.ts` — `@supabase/ssr` session; security headers (CSP, HSTS)                        | AC-X08              | GNG-002        | M    | ⚠ |
| GNG-009 | Signup + email verification + magic link + Google OAuth + anti-enumeration password reset              | AC-01–AC-06         | GNG-008, F-03  | M    | ⚠ |
| GNG-010 | Login + logout + session cookie management                                                             | AC-03               | GNG-009        | S    |   |
| GNG-011 | Onboarding + the advisory-disclaimer ack (persisted, versioned)                                        | AC-08–AC-13         | GNG-009, GNG-004 | M  | ⚠ |
| GNG-012 | In-process rate limiter (auth 10/min/IP) — shared web + backend pattern                                  | AC-07               | GNG-008        | S    |   |
| GNG-013 | Mobile-responsive shell (top nav, bottom tab bar, 360px layout)                                          | AC-43               | GNG-011        | M    |   |
| GNG-014 | Structured loggers (`pino` web, `slog` backend) + the no-PII-in-logs CI grep                            | AC-X05              | GNG-003        | S    |   |

**M1 critical path: GNG-001/003 → GNG-004 → GNG-005 / GNG-007 → GNG-008 → GNG-009 → GNG-011.**

### M2 — The weather fetch + the verdict engine

| ID      | Title                                                                                            | Spec ACs            | Deps           | Size | ⚠ |
| ------- | ------------------------------------------------------------------------------------------------ | ------------------- | -------------- | ---- | - |
| GNG-015 | Migration `0003_minimums_profiles` + RLS                                                          | —                   | GNG-004        | S    | ⚠ |
| GNG-016 | Migration `0004_weather_observations` (the parsed-observation cache; not user-owned)              | —                   | GNG-004        | S    | ⚠ |
| GNG-017 | `weather` — the NWS AWC fetch client (timeout, `User-Agent`, body-size cap, 429/5xx backoff, identifier validation) | AC-22, AC-23, AC-27 | GNG-003, F-15  | M    | ⚠ |
| GNG-018 | `weather` — the METAR parser + table tests (CAVOK, VV, P6SM, fractional vis, VRB, gusts, AUTO, RMK, malformed) | AC-24, AC-25 | GNG-017        | L    | ⚠ |
| GNG-019 | `weather` — the TAF parser + table tests (incl. a window straddling departure)                    | AC-24, AC-25        | GNG-018        | M    | ⚠ |
| GNG-020 | `weather` — the observation cache (read/write by `(station, kind, issued_at)`)                     | AC-26               | GNG-016, GNG-018 | M  | ⚠ |
| GNG-021 | `verdict` — engine scaffold + the crosswind/headwind component math + table tests                  | AC-33, AC-36, AC-45 | GNG-003        | M    | ⚠ |
| GNG-022 | `verdict` — the ceiling + visibility comparisons + table tests (boundary/below/within/caution)     | AC-29–AC-31, AC-37  | GNG-021        | M    | ⚠ |
| GNG-023 | `verdict` — the crosswind + gust-factor comparisons + table tests                                  | AC-30, AC-34, AC-37 | GNG-021        | M    | ⚠ |
| GNG-024 | `verdict` — the IFR-currency gate + the time-since-flight comparison + table tests                  | AC-35, AC-37        | GNG-021        | M    | ⚠ |
| GNG-025 | `verdict` — `Evaluate` aggregator + the **"never default to green"** dedicated test set + ≥95% gate | AC-29–AC-38, AC-X11, AC-X12 | GNG-022–GNG-024 | M | ⚠ |
| GNG-026 | `minimums` CRUD handlers + `GET/PUT /me/minimums` + range validation                                | AC-14, AC-15, AC-18 | GNG-015        | M    | ⚠ |

### M3 — The verdict view + minimums UI + first cloud deploy

| ID      | Title                                                                                            | Spec ACs            | Deps                   | Size | ⚠ |
| ------- | ------------------------------------------------------------------------------------------------ | ------------------- | ---------------------- | ---- | - |
| GNG-027 | `POST /me/verdict` — fetch (cache-aware) → parse → `verdict.Evaluate`; the `unknown` path          | AC-23–AC-41, AC-X11 | GNG-020, GNG-025, GNG-026 | L | ⚠ |
| GNG-028 | The personal-minimums editor UI `/app/minimums`                                                   | AC-14–AC-18         | GNG-026                | M    | ⚠ |
| GNG-029 | The airport + runway entry UI (validated against `airports`)                                      | AC-19–AC-21         | GNG-005, GNG-013       | M    | ⚠ |
| GNG-030 | The "single screen" verdict view `/app` — green/yellow/red + per-check detail + the disclaimer surface | AC-39, AC-40, AC-42, AC-45 | GNG-027, GNG-029 | L | ⚠ |
| GNG-031 | The "weather unavailable" state in the verdict view                                               | AC-41               | GNG-030                | S    | ⚠ |
| GNG-032 | `web` + `backend` Dockerfiles + Cloud Run deploy scripts                                          | —                   | F-02                   | M    | ⚠ |
| GNG-033 | Wire Sentry (web client+server, Go backend)                                                      | —                   | F-08                   | S    | ⚠ |
| GNG-034 | Wire PostHog — the funnel events from [03-spec.md §Success criteria]                              | —                   | F-09                   | M    | ⚠ |
| GNG-035 | First staging deploy of both Cloud Run services; verify Sentry + PostHog + a live NWS fetch        | —                   | GNG-032, GNG-033, GNG-034 | M | ⚠ |
| GNG-036 | Slow-4G TTI benchmark in CI — Playwright + throttling, assert AC-44                                | AC-44               | GNG-030                | S    |   |

### M4 — Saved trips + the alert pipeline

| ID      | Title                                                                                            | Spec ACs            | Deps           | Size | ⚠ |
| ------- | ------------------------------------------------------------------------------------------------ | ------------------- | -------------- | ---- | - |
| GNG-037 | Migration `0005_saved_trips_and_verdicts` — `saved_trips` + `verdict_snapshots` + RLS             | —                   | GNG-015        | S    | ⚠ |
| GNG-038 | Migration `0006_alert_audit` — `alert_audit` with the per-recipient verdict-transition UNIQUE constraint | —             | GNG-037        | S    | ⚠ |
| GNG-039 | `trips` CRUD handlers + `/me/trips` (+ `/me/trips/:id`, PATCH, DELETE) + per-account cap          | AC-47–AC-51         | GNG-037        | M    | ⚠ |
| GNG-040 | Saved-trip list + detail UI (`/app/trips`, `/app/trips/:id`)                                       | AC-48               | GNG-039        | M    |   |
| GNG-041 | `POST /cron/poll` — OIDC verification (issuer + audience); 401 on failure                          | AC-52, AC-X04       | GNG-007        | M    | ⚠ |
| GNG-042 | The poll: active-trip station scan + station-deduplicated cache-aware fetch + re-evaluate          | AC-53, AC-58, AC-60 | GNG-041, GNG-027 | L  | ⚠ |
| GNG-043 | The verdict-change detection + the dedupe `INSERT … ON CONFLICT` + the Resend alert fan-out        | AC-53–AC-55, AC-59  | GNG-042, GNG-038, F-06 | L | ⚠ |
| GNG-044 | Poll idempotency integration test — fire twice over one observation, then mutate → second alert    | AC-56, AC-57, AC-X02 | GNG-043       | M    | ⚠ |
| GNG-045 | Verdict-change alert email template (with the disclaimer footer)                                  | AC-61–AC-63         | GNG-043        | S    | ⚠ |
| GNG-046 | `/webhooks/resend` — deliverability webhook (bounce/complaint), HMAC-verified                      | —                   | GNG-043        | S    |   |
| GNG-047 | Cloud Scheduler job wired (F-04) + a staging end-to-end poll run verified                          | —                   | GNG-043, F-04  | S    | ⚠ |

### M5 — The WINGS risk-assessment PDF

| ID      | Title                                                                                            | Spec ACs            | Deps           | Size | ⚠ |
| ------- | ------------------------------------------------------------------------------------------------ | ------------------- | -------------- | ---- | - |
| GNG-048 | Migration `0007_wings_pdfs` + RLS                                                                 | —                   | GNG-037        | S    | ⚠ |
| GNG-049 | `wings` — the server-side WINGS risk-assessment PDF renderer (weather + minimums + verdict + PAVE) | AC-64, AC-65        | GNG-027        | L    | ⚠ |
| GNG-050 | `POST /me/trips/:id/wings-pdf` — render → R2 (per-pilot key) → owner-scoped signed GET URL          | AC-64, AC-66        | GNG-049, F-05  | M    | ⚠ |
| GNG-051 | WINGS-PDF CTA + download UX on the saved-trip detail page                                          | AC-64               | GNG-050, GNG-040 | S  |   |

### M6 — Payments + paywall

| ID      | Title                                                                                            | Spec ACs            | Deps           | Size | ⚠ |
| ------- | ------------------------------------------------------------------------------------------------ | ------------------- | -------------- | ---- | - |
| GNG-052 | Migration `0008_billing` — `subscriptions` + `processed_webhook_events`                          | —                   | GNG-004        | S    | ⚠ |
| GNG-053 | `backend` Stripe client + price-ID constants                                                      | —                   | F-07           | S    | ⚠ |
| GNG-054 | `POST /billing/checkout` (monthly + annual) + `POST /billing/portal`                              | AC-67, AC-68        | GNG-053, GNG-052 | M  | ⚠ |
| GNG-055 | `POST /webhooks/stripe` — signature on raw body + dedupe insert + event dispatcher                | AC-69–AC-71         | GNG-052, GNG-053 | L  | ⚠ |
| GNG-056 | Stripe replay-safety integration test + per-event-type fixture test                               | AC-72, AC-X03       | GNG-055        | M    | ⚠ |
| GNG-057 | Paywall — 14-day-trial check (Discovery Q3 default); redirect to `/app/upgrade` on expiry         | AC-73–AC-75         | GNG-052, GNG-055 | M  | ⚠ |
| GNG-058 | Paywall / pricing page `/app/upgrade` — two-plan comparison + Stripe CTAs                          | AC-67               | GNG-054        | M    |   |
| GNG-059 | `/webhooks/*` rate limiting (60/min/IP) + per-user limit on `/me/verdict`                          | AC-X09              | GNG-012, GNG-055 | S  |   |

### M7 — PWA, polish, beta, launch

| ID      | Title                                                                                            | Spec ACs            | Deps                   | Size | ⚠ |
| ------- | ------------------------------------------------------------------------------------------------ | ------------------- | ---------------------- | ---- | - |
| GNG-060 | `@vite-pwa/sveltekit` — manifest, icons (192/512/maskable/apple-touch), service worker            | AC-76, AC-78        | GNG-002                | M    | ⚠ |
| GNG-061 | Install prompt banner (Android) + iOS install-instructions card                                   | AC-76, AC-77        | GNG-060                | S    |   |
| GNG-062 | Empty states, loading skeletons, error boundaries, 404/500 pages                                  | —                   | —                      | M    |   |
| GNG-063 | Legal pages `/legal/{terms,privacy,refund}` from F-10 + footer disclaimer on every page           | AC-79, AC-81        | F-10                   | S    | ⚠ |
| GNG-064 | Advisory-disclaimer surface audit — signup, every verdict surface, alert email, WINGS PDF, unavailable state, footer | AC-80 | GNG-030, GNG-031, GNG-045, GNG-049, GNG-063 | S | ⚠ |
| GNG-065 | The NWS-degradation end-to-end test — upstream stubbed to time out / 429 / garbage → verdict `unknown`, never green | AC-X11 | GNG-027, GNG-042 | M | ⚠ |
| GNG-066 | Lighthouse CI gate — PWA ≥ 90, Performance ≥ 85 on `/`, `/app`                                    | AC-78               | GNG-060                | M    | ⚠ |
| GNG-067 | Resend sender domain SPF/DKIM/DMARC verified (F-06) + transactional email templates polished      | —                   | F-06                   | S    | ⚠ |
| GNG-068 | Beta — invite 10–15 pilots from the founder's network on a free code                              | —                   | All M6 tickets         | S    | ⚠ |
| GNG-069 | Sentry top-issue triage from the beta week                                                        | —                   | GNG-068                | M    |   |
| GNG-070 | Production cutover — both Cloud Run services + Cloudflare DNS                                      | —                   | F-01, F-02, all M6     | M    | ⚠ |
| GNG-071 | UptimeRobot monitors on `/healthz` (both services) + the landing page                             | —                   | F-14, GNG-070          | S    | ⚠ |
| GNG-072 | 90-second demo video + the r/flying / AOPA-forum launch post                                      | —                   | GNG-070                | S    | ⚠ |

### Cross-cutting chores

| ID      | Title                                                                                            | Deps    | Size |
| ------- | ------------------------------------------------------------------------------------------------ | ------- | ---- |
| GNG-X01 | Migration round-trip + `sqlc diff` in CI (wired in `.woodpecker/pr.yml`; verify after GNG-004)   | GNG-004 | S    |
| GNG-X02 | `openapi-typescript` codegen for the web tier's API client types                                  | GNG-002 | S    |
| GNG-X03 | Local-dev cron escape hatch — a documented off-prod bypass token for `/cron/poll`                 | GNG-041 | S    |
| GNG-X04 | A small fixture library of real-world METAR/TAF strings for the parser table tests                | GNG-018 | S    |

## 4. Dependencies (Gantt-style summary)

```
M1 ── GNG-001/003 → GNG-004 → GNG-005 → GNG-009 → GNG-011 → [M1 gate]
                          └→ GNG-007 (JWT) ─────────────────┘
                                                              │
M2 ── GNG-015/016 → GNG-017 → GNG-018 → GNG-019/020 ─────────┤
       GNG-021 → GNG-022/023/024 → GNG-025 (engine) ─────────┤
       GNG-026 (minimums CRUD) ──────────────────────────────┤
                                                              │
M3 ── F-01/02/08/09 → GNG-027 → GNG-030 → GNG-031 → GNG-035 ─┤
                                                              │
M4 ── F-04/06 → GNG-037/038 → GNG-041 → GNG-042 → GNG-043 → GNG-044 → GNG-047 ┤
                                                              │
M5 ── F-05 → GNG-048 → GNG-049 → GNG-050 ────────────────────┤
                                                              │
M6 ── F-07/10 → GNG-052 → GNG-055 → GNG-056 → GNG-057 ───────┤
                                                              │
M7 ── GNG-060 → GNG-066 → GNG-063/064/065 → GNG-070 → GNG-072 → [LAUNCH]
```

## 5. Risk register

Owned items update at every milestone gate. New / Closed / Escalated
flags fire in the milestone report. This register is the canonical home
for the §11 risks from `product-research.md`.

| Risk                                                                                  | Probability | Impact       | Mitigation                                                                                                            | Owner   | Status |
| ------------------------------------------------------------------------------------- | ----------- | ------------ | --------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| **R1** — the verdict engine ships a wrong verdict, especially a **false green**        | Medium      | Catastrophic | The pure-function engine + a table-driven test per comparison (GNG-021–025) + the dedicated "never green on missing data" test set (GNG-025, GNG-065); `weather-and-verdict-auditor`; ≥95% coverage | Claude  | open   |
| **R2** — a pilot flies below-minimums weather trusting a wrong/stale verdict → liability| Low        | Catastrophic | The calibrated-firm advisory disclaimer on every surface (GNG-064); the verdict never defaults to green; the "weather unavailable" state | founder | open   |
| **R3** — the NWS Aviation Weather Center API is down, slow, or rate-limits us           | Medium      | High         | Graceful degradation (verdict `unknown`, never green — GNG-031, GNG-065); the observation cache cushions short outages; a well-behaved client (UA, batching, backoff — GNG-017) avoids a block. **No paid escape hatch** — this is a launch-availability risk | founder | open   |
| **R4** — the METAR/TAF parser mishandles a real-world observation                       | Medium      | High         | A defensive parser that degrades to `parse_ok=false`, never panics (GNG-018/019); a large real+malformed fixture battery (GNG-X04); `weather-and-verdict-auditor` | Claude  | open   |
| **R5** — the verdict-change alert fan-out exceeds Resend's 100/day cap on a stormy day  | Medium      | Medium       | Watch alert volume from the first 100 users; one alert per transition, deduped; Resend Pro ($20/mo) is the escape hatch | founder | open   |
| **R6** — the poll cron silently fails to fire (Cloud Scheduler / OIDC misconfig)        | Medium      | High         | GNG-047 verifies a staging poll run; UptimeRobot + the `verdict_snapshots`/`alert_audit` tables make a missed run visible | Claude  | open   |
| **R7** — alert dedupe is subtly wrong → alert spam or a silent miss                     | Medium      | High         | The DB UNIQUE constraint keyed by the verdict transition is the contract (ADR-0004); GNG-044 idempotency test; `alert-pipeline-auditor` | Claude  | open   |
| **R8** — an RLS / owner-predicate bug leaks one pilot's minimums or trips to another     | Medium      | Catastrophic | Two-layer authz; the cross-tenant regression test covering both layers + the WINGS-PDF R2-key case (part of GNG-037/048 + a dedicated harness) | Claude  | open   |
| **R9** — scope creep toward a weather product (radar, winds aloft, NOTAMs)               | Medium      | High         | `spec-guardian` BLOCKs §5.4 cut-list hits; research §3 is the refusal authority; the positioning is "decision aid, not weather" | founder | open   |
| **R10** — Supabase free project auto-pauses after 7 days inactivity (dev)               | High (dev)  | Medium       | Move to Pro at first paying-customer testing; ping staging weekly                                                     | founder | open   |
| **R11** — the METAR parser (GNG-018) is harder than estimated (real-world format variety)| Medium      | Medium       | GNG-018 is sized L deliberately; the fixture library (GNG-X04) front-loads the edge cases; if it slips, ship M2 with METAR-only and add TAF parsing early in M3 | Claude  | open   |
| **R12** — two Cloud Run services double the deploy + secret surface                     | Low         | Low          | One `.woodpecker/deploy.yml` with path-gated steps; shared Secret Manager                                             | Claude  | open   |
| **R13** — Cloud Run cold-start latency hurts the AC-44 ≤1.5s verdict-view TTI            | Medium      | Low-Medium   | The web tier may need `min-instances=1` (~$5/mo) — flag as a paid-service decision at M3 deploy time                  | Claude  | open   |
| **R14** — `iac-tickerbeats` Woodpecker bootstrap (F-11/12/13) isn't done before GNG-001 | Medium      | Medium       | Founder prioritizes F-11→F-13 in week 1; Claude can `make ci` locally but cannot self-merge until CI runs             | founder | open   |
| **R15** — EZWxBrief / ForeFlight bundle a personal-minimums verdict                     | Medium      | Medium       | Personal-minimums-first + decision-aid simplicity + the WINGS artifact is the wedge; do not try to out-weather them   | founder | open   |
| **R16** — solo-developer fatigue over a ~6-week build                                   | Medium      | High         | Narrow V1; the §6 plan is paced; weekly 15-minute ops ritual                                                          | founder | open   |

## 6. Critical path

The end-to-end critical-path sequence to launch:

```
F-03 → GNG-004 → GNG-005 → GNG-009 → GNG-011 ──┐
GNG-007 (JWT) ─────────────────────────────────┤→ [M1 gate]
                                                │
F-15 → GNG-017 → GNG-018 → GNG-020 ────────────┤
GNG-021 → GNG-022/023/024 → GNG-025 (engine) ──┤→ [M2 gate]
GNG-026 (minimums CRUD) ───────────────────────┘
                                                │
F-01/02 → GNG-027 → GNG-030 → GNG-031 → GNG-035 → [M3 gate]
                                                │
F-04/06 → GNG-037/038 → GNG-041 → GNG-042 → GNG-043 → GNG-044 → GNG-047 → [M4 gate]
                                                │
F-05 → GNG-048 → GNG-049 → GNG-050 → [M5 gate]
                                                │
F-07/10 → GNG-052 → GNG-055 → GNG-056 → GNG-057 → [M6 gate]
                                                │
GNG-060 → GNG-066 → GNG-063/064/065 → GNG-070 → GNG-072 → [LAUNCH]
```

## 7. Founder-action timing

| Founder action          | Latest start                              | Why                                                                              |
| ----------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| F-10 (Legal docs)       | **Today** — TermsFeed + 2h customization  | Stripe verification requires it; the advisory-disclaimer wording also lands here  |
| F-03 (Supabase)         | Before GNG-009 (M1 first authenticated path) | The app can't bootstrap without the Supabase URL + keys + DB URL                |
| F-15 (NWS User-Agent)   | Before GNG-017 (M2 first NWS fetch)        | The fetch client needs the contactable `User-Agent` string                       |
| F-01 (Domain DNS)       | Before GNG-032 (M3 first deploy)           | Cloud Run domain mapping + Cloudflare cert pre-provisioning (~24h)               |
| F-02 (GCP + WIF)        | Before GNG-032                             | Cloud Run deploy requires it                                                     |
| F-04 (Cloud Scheduler)  | Before GNG-047 (M4)                        | The weather-poll cron has no schedule without it                                 |
| F-05 (R2)               | Before GNG-050 (M5)                        | The WINGS-PDF export writes to R2                                                |
| F-06 (Resend)           | Before GNG-043 (M4)                        | The alert fan-out sends through Resend; SPF/DKIM/DMARC need ~24h to propagate     |
| F-07 (Stripe)           | Before GNG-053 (M6)                        | Test-mode price IDs are blocked otherwise                                        |
| F-08 (Sentry)           | Before GNG-033 (M3)                        | Error capture                                                                    |
| F-09 (PostHog)          | Before GNG-034 (M3)                        | Funnel events                                                                    |
| F-11–F-13 (Woodpecker)  | Before the first GNG-NNN PR is pushed      | Without CI the self-merge protocol can't fire                                    |
| F-14 (UptimeRobot)      | Before GNG-071 (M7)                        | Monitors prod URLs that don't exist until M7                                     |

## 8. Definition of done — V1 launch (M7 close)

All P0 acceptance criteria green in CI. The `backend/internal/verdict`
engine ≥ 95% covered with a table-driven test per comparison rule, and
the dedicated "verdict never defaults to green on missing/stale/
unparseable weather" test set green. The `backend/internal/weather`
parser ≥ 90% covered with the real + malformed METAR/TAF fixture
battery. The cross-tenant isolation test green for every user-owned
table, both layers, and the WINGS-PDF R2-key case. The poll idempotency
test and the Stripe replay-safety test green. The NWS-degradation
end-to-end test green (verdict `unknown`, never green). The advisory
disclaimer present on all six required surfaces (GNG-064). Lighthouse
PWA + Performance gates green. Both Cloud Run services live in
production. Demo video + the r/flying launch post shipped. UptimeRobot
monitors green for 24 hours.

P1 acceptance criteria are nice-to-have — ship if landed on schedule;
otherwise defer to V1.1.

## 9. Open questions for the founder

Carried from Discovery and Architecture, all still open and all
affecting this plan:

- **Q1 (yellow-band definition)** — GNG-022 / GNG-023 assume a small
  fixed caution buffer; the exact buffer is a founder call.
- **Q2 (WINGS-PDF fidelity)** — GNG-049 assumes a clean WINGS-suitable
  summary, not a pixel-exact FAA FRAT clone.
- **Q3 (free tier vs trial; paywall trigger)** — GNG-057 assumes a
  14-day time-based trial. An activity-based trigger changes the ticket.
- **Q4 (poll cadence)** — F-04 / GNG-047 assume a single 30-minute poll.
- **Architecture Q3 (`airports` data source)** — GNG-005 assumes a
  chosen public airport dataset; the source affects the seed pipeline.
- **Architecture Q1** — Phase 4 assumes the six ADRs (0001–0006) are
  ratified `accepted` before Phase 5 begins.

---

**Phase 4 status: DRAFT — not founder-approved.** This artifact and the
draft `01`–`03` phase docs were produced together during the Phase 0
bootstrap. Phase 5 (Implement) is blocked until the founder approves
Phases 1–4 in order and ratifies ADRs 0001–0006.
