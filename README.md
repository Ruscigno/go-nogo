# Go/No-Go

**A personal-minimums and go/no-go decision aid for US general-aviation
pilots.** Save your own weather minimums once — ceiling, visibility,
crosswind component, gust factor — and Go/No-Go pulls the current
METAR/TAF for your departure and destination, compares the weather
against *your* numbers, and renders a plain green / yellow / red verdict
plus a printable risk-assessment summary.

## Goal

Give a pilot one screen that answers the question they actually wrestle
with before a flight: **"Given the weather right now, and the minimums I
set for myself when I was calm on the ground, is this flight a go?"** —
and then email the pilot when a saved trip's verdict changes, so a
weather window opening or closing is never a surprise.

## What this product does

- Lets a pilot save a **personal-minimums profile** — ceiling, surface
  visibility, maximum demonstrated crosswind component, maximum gust
  factor, an IFR-currency self-check, and a maximum time-since-last-flight.
- Pulls **METAR and TAF** for a departure and a destination airport from
  the **free public NWS Aviation Weather Center APIs** — no commercial
  weather licence.
- Parses the raw observation into structured fields (ceiling, visibility,
  wind direction/speed/gust) and computes the **crosswind and headwind
  components** against the runway the pilot picks.
- Renders a **green / yellow / red verdict** for the trip — a pure,
  deterministic comparison of the parsed weather against the pilot's own
  stated minimums.
- Produces a **printable risk-assessment summary** (PDF) structured to
  support an FAA WINGS flight-risk-assessment record.
- **Emails the pilot when a saved trip's verdict changes** — conditions
  improving from red to green, or degrading from green to yellow — via a
  scheduled weather poll.
- Stores a small set of **saved trips** so the pilot can watch a flight
  they are planning over the next hours or days.

## What this product does NOT do

Go/No-Go is deliberately narrow. The following are **refusals**, not a
backlog — see [`docs/product-research.md`](docs/product-research.md) §5.4
for the full list and reasoning.

- **It does not make the go/no-go decision for you.** Go/No-Go is an
  advisory aid. The pilot in command is **solely responsible** for the
  go/no-go decision. The verdict is computed from pilot-entered minimums
  and public weather data that may be stale, delayed, or incomplete.
- **It is not a weather product.** No radar, no prog charts, no winds
  aloft, no icing/turbulence forecasting, no NOTAMs, no flight planning,
  no moving map. That is ForeFlight / Garmin Pilot / EZWxBrief territory
  — Go/No-Go differentiates on the **personal-minimums treatment and
  decision-aid simplicity**, not on weather depth or breadth.
- **It is not a flight planner or an EFB.** No route, no fuel, no
  weight-and-balance, no charts.
- **It does not track your regulatory currency.** Go/No-Go reads "am I
  IFR-current?" as a single yes/no input to one verdict; it does **not**
  manage your BFR, medical, 90-day landing currency, or IFR-approach
  recency. That is a sibling product's job (`currency-hub`).
- **It does not track an aircraft's airworthiness.** Annual inspections,
  ADs, transponder checks belong to a tail number, not to this product.
- **No SMS or web push in V1.** The "alert when conditions change"
  channel is **email** in V1 (the portfolio cut Web Push from V1 over the
  iOS PWA limitation).
- **No native iOS/Android app.** An installable PWA covers the need.
- **No ML/AI.** No Python service in V1.

## Adjacent products (boundary)

Go/No-Go is a **personal-minimums decision aid**. It is **not**
`currency-hub` (which manages a pilot's full regulatory currency —
BFR/IPC, medical, landing and IFR-approach recency) and **not** a
weather, charts, or flight-planning product. Go/No-Go reads IFR-currency
as a single decision input; it never *manages* currency. See
[`docs/01-discovery.md`](docs/01-discovery.md) for the explicit
go-nogo ↔ currency-hub boundary statement.

## Stack

| Layer | Tech | Why |
|---|---|---|
| Frontend | SvelteKit (Svelte 5 runes) + Tailwind + Vite-PWA | ~15-25 KB JS payload — wins on 3-bar LTE at the airport |
| Backend | Go 1.25 service on Cloud Run (`net/http.ServeMux`, `pgx/v5` + `sqlc`, `slog`) | NWS API polling + a weather-poll cron + verdict evaluation + PDF generation need a real server — see [ADR-0001](docs/adr/0001-go-backend-for-weather-polling.md) |
| DB + Auth | Supabase (Postgres + GoTrue + RLS + PostgREST) | One vendor for data + identity; RLS gates browser-direct CRUD |
| File storage | Cloudflare R2 (presigned PUT URLs, zero egress) | 10 GB free; WINGS risk-assessment PDF exports |
| Payments | Stripe Checkout + Customer Portal + Billing | `$6/mo` + `$39/yr` individual |
| Email | Resend (100/day, 3 000/mo, 1 verified domain) | Transactional + the saved-trip verdict-change alert fan-out |
| Weather | NWS Aviation Weather Center APIs (METAR/TAF) | Free, public US-government data — no commercial licence |
| Hosting | Google Cloud Run (us-central1, scale-to-zero) | Free tier covers the first ~50 paying users |
| Analytics | PostHog Cloud free tier | 1M events + session replay + flags in one tool |
| Errors | Sentry developer tier | 5K errors/mo, web + Go SDKs |
| Migrations | golang-migrate | Sequential `db/migrations/NNNN_*.up.sql` / `*.down.sql` |
| CI | Self-hosted Woodpecker on the founder's Mac via Cloudflare Tunnel | Free; runner infra lives in `iac-tickerbeats` |

Total infrastructure cost target: \$0/mo at 0 paying users; <\$30/mo at
50 paying users; <\$80/mo at 500.

## Repo layout

```
web/            SvelteKit app (not yet scaffolded — Phase 5 / M1)
backend/        Go weather-poll + verdict-evaluation service (scaffolded skeleton — Phase 5 / M3)
db/migrations/  sequential SQL — consumed by golang-migrate + sqlc
db/seeds/       reference + fixture seed data
docs/           spec + phase artifacts + ADRs; product-research.md is the source of truth
journal/        running session log per .claude/rules/journal.md
prompts/        reusable phase-kickoff prompts for Claude Code
.claude/        agent + rule definitions for Claude Code
.woodpecker/    CI pipeline definitions; infra lives in iac-tickerbeats
scripts/        Claude Code hooks + branch helpers
```

## Working on the code

1. **Read** [`CLAUDE.md`](CLAUDE.md) and
   [`docs/working-contract.md`](docs/working-contract.md) first. The
   contract supersedes the higher-ceremony engineering rules where they
   conflict.
2. **Bootstrap** — `make bootstrap` installs pre-commit hooks and
   verifies the local toolchain (Node 20+, pnpm, Go 1.25+, gitleaks,
   golang-migrate, supabase CLI).
3. **Day-to-day** — once scaffolded, `make web.dev` runs the SvelteKit
   dev server, `make backend.dev` runs the Go service with air
   live-reload.
4. **Migrations** — `make db.migrate` runs `golang-migrate -path
   db/migrations` against `$SUPABASE_DB_URL`. Numbered sequentially;
   irreversible migrations require an ADR.
5. **Stacked epics** — `./scripts/new-epic-branch.sh NN-slug` cuts a new
   epic branch from the most recent unmerged parent.

CI runs on every push to a branch with an open PR via
[iac-tickerbeats](https://github.com/Ruscigno/iac-tickerbeats)'
Woodpecker server. The single-author policy is enforced both locally
(pre-commit `commit-msg` hook) and in CI — `Co-Authored-By:` trailers
are rejected; never bypass with `--no-verify`.

## Phase status

Phase 0 (Bootstrap) just landed alongside the Phase 1–4 draft artifacts.
**Phases 1–4 in `docs/` are DRAFTS awaiting founder review — no founder
approval has been recorded.** The kickoff prompt is
[`prompts/01-discovery-kickoff.md`](prompts/01-discovery-kickoff.md).

## Disclaimer

Go/No-Go is an advisory decision aid. It is not affiliated with or
endorsed by the FAA or the National Weather Service. **The pilot in
command is solely responsible for the go/no-go decision.** The verdict is
computed from minimums the pilot enters and from public weather data that
may be stale, delayed, incomplete, or unavailable. Always obtain an
official weather briefing and exercise pilot-in-command judgement before
every flight.

## Contact

Built solo. Reach me at [tickerbeats@gmail.com](mailto:tickerbeats@gmail.com).
