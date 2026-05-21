# Operating playbook

> **Purpose.** Runbooks for production operations. Filled out as the
> system grows — each section ships when its system reaches production.

## 1. Source-of-truth doctrine

[docs/product-research.md](product-research.md) is **sacred**. It is not
edited after bootstrap.

Decisions that change the research are encoded as ADRs in
[docs/adr/](adr/) with `Status: superseded by` linking forward.

When asked to "fix the spec", check the question first:

- If the **research file** is wrong (typo, broken link, factual error
  about an external service): edit it, note in `journal/decisions.md`
  why this was an exception.
- If a **decision in the research** is wrong (we'd choose differently
  today): write an ADR that supersedes the specific row. Do not edit
  the research.

## 2. Local dev runbook

_Filled during M1._ Expected flow:

1. `make bootstrap` — installs pre-commit, verifies the toolchain (Node
   20+, pnpm, Go 1.25+, gitleaks, golang-migrate, supabase CLI).
2. `cp .env.example .env`, fill in Supabase / Stripe test keys from
   F-03, F-07. Local Supabase URLs come from `supabase start` below.
   The NWS Aviation Weather Center API needs no key — only the
   `NWS_AWC_*` vars.
3. `supabase start` — boots the full local Supabase stack via Docker
   (Postgres on :54322, GoTrue on :54321, Studio on :54323, Inbucket
   SMTP on :54324). Prints the local API URL, anon key, service-role
   key, and DB URL — paste into `.env`.
4. `make db.migrate` — applies `db/migrations/*` against the local
   Supabase Postgres via `golang-migrate`.
5. `make backend.dev` — Go service on :8080 with air live-reload.
6. `make web.dev` — SvelteKit dev server on :5173.
7. (Optional) `stripe listen --forward-to localhost:8080/webhooks/stripe`
   when working on billing.
8. (Optional) To exercise the weather-poll cron locally, POST to
   `localhost:8080/cron/poll` with a dev bypass token (the OIDC check
   accepts a documented dev escape hatch off-prod only — see M3 notes).
   Against the real NWS API, keep local poll runs sparse — the AWC API
   is shared public infrastructure.

To stop: `supabase stop` (preserves the volume) or
`supabase stop --no-backup` (wipes it).

## 3. Deploy runbook

_Filled during M3 (first staging deploy)._ Will cover the two Cloud Run
services (gonogo-web + gonogo-api), blue/green rollout, Cloud Scheduler
cron wiring, secret rotation, rollback.

## 4. Weather-poll cron runbook

_Filled during M4._ Will cover: how to confirm the poll cron fired, how
to read `alert_audit` to see which verdict transitions were alerted /
skipped / failed, how to safely re-run the poll (idempotent by the
UNIQUE constraint — over-firing is safe), how to diagnose a missed alert,
and **how to respond if the NWS Aviation Weather Center API is
unavailable or rate-limiting us** (graceful degradation: the verdict
surface shows "weather unavailable"; the poll backs off; nothing goes
green by default).

## 5. Stripe webhook replay runbook

_Filled during M6._ Will cover: how to find a failed webhook, replay it
via the Stripe dashboard, verify idempotency by checking
`processed_webhook_events`.

## 6. Database backup + restore

_Filled before launch (M7/M8)._ Will cover: Supabase free-tier daily
backups (7-day retention) + an extra nightly `pg_dump` to Cloud Storage
with 30-day lifecycle. Restore-to-staging dry run documented before
launch.

## 7. Secret rotation schedule

_Filled before launch._ 90-day rotation for: Stripe live keys, Resend
API key, R2 access keys, `URL_SIGNING_SECRET`, Supabase service-role
key. (The NWS API has no key to rotate.) **Note:** rotating
`URL_SIGNING_SECRET` invalidates every live signed WINGS-PDF URL —
document the user-comms implication in the runbook.

## 8. Incident response

_Filled before launch._ Sentry alert → triage → user comms template.
A specific incident class to plan for: a **verdict-correctness incident**
(a wrong comparison or false green ships) — the verdict engine's
pure-function table tests are the first line, but a runbook entry covers
how to roll back, how to notify affected pilots, and how to re-baseline.
Status page consideration deferred unless paying-user count justifies.

## 9. Replicating this scaffolding in another repo

This repo's way-of-working was bootstrapped from three sibling repos
(`acsready`, `tail-number-radar`, `currency-hub`). If you ever bootstrap
another:

1. Copy `.editorconfig`, `.gitignore`, `.dockerignore`,
   `.pre-commit-config.yaml`, `.gitleaks.toml`, `Makefile`,
   `.env.example`, `CLAUDE.md`, `README.md` — adapt the stack-specific
   bits.
2. Copy `docs/adr/0000-template.md`, `docs/founder-actions.md`,
   `docs/operating-playbook.md`, `docs/working-contract.md`, and the
   four phase docs.
3. Copy `.claude/settings.json`, `.claude/agents/*.md`,
   `.claude/rules/*.md` — adapt subagents to the new domain.
4. Copy `scripts/hooks/*.sh`, `scripts/new-epic-branch.sh`,
   `scripts/setup-claude.sh`, plus any product-relevant check script.
5. Copy `journal/README.md` + the supporting journal files.
6. Copy `prompts/01-discovery-kickoff.md` — adapt to the new product.
7. Copy `.woodpecker/{pr,deploy}.yml` — adapt to the new stack's
   lint/test commands.
8. Copy `.github/PULL_REQUEST_TEMPLATE.md`, `ISSUE_TEMPLATE/`,
   `dependabot.yml`.

The principle: this scaffolding is the founder's portable working style,
not a property of any one product. Go/No-Go, like `currency-hub`, has a
`backend/` Go service — a future Go-backed product can copy Go/No-Go's
`backend/` configs (`sqlc.yaml`, `.golangci.yml`, `.air.toml`,
`Dockerfile`) directly, and a product that integrates a third-party API
can reuse the trust-boundary treatment in the rules + the
`weather-and-verdict-auditor` shape.
