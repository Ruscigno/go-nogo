# Engineering rules

## Phase gates

We work in seven named phases. Each ends with a reviewable artifact + a stop-and-confirm handshake **at the phase-artifact level**. Per-ticket implementation work inside Phase 5 (Implement) does NOT require per-PR stop-and-confirm — see [Working contract](../../docs/working-contract.md) for the self-merge protocol.

| #   | Phase        | Artifact                                          | What it produces                                                                        |
| --- | ------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Discovery    | `docs/01-discovery.md`                            | Problem, users (ICP + anti-personas), in/out of scope, success criteria, open questions |
| 2   | Architecture | `docs/02-architecture.md` + `docs/adr/000N-*.md`  | C4 diagrams, refined data model, critical flows, STRIDE threat model                    |
| 3   | Spec         | `docs/03-spec.md` + `docs/api/openapi.yaml`       | User stories, acceptance criteria, formal API contract                                  |
| 4   | Plan         | `docs/04-plan.md`                                 | Sliced tickets (GNG-NNN), dependencies, milestones, risk register                       |
| 5   | Implement    | code in `web/`, `backend/`, `db/migrations/`      | One PR per coherent capability slice; agent self-merges per the working contract        |
| 6   | Harden       | `docs/06-security.md`                             | OWASP ASVS L2 walkthrough, ZAP scan, residual risks                                     |
| 7   | Deploy       | live URL + `docs/07-runbook.md`                   | Production cutover + operational runbook                                                |

**At every phase-artifact gate** the agent:

1. Stops. Does not auto-advance to the next phase.
2. Writes a chat summary: what was produced, where it lives, what's open.
3. Lists open questions for the founder at the bottom of the artifact.
4. Asks: _"Approve to advance to Phase N+1, or do you want changes here first?"_

Decisions resolved in chat get captured in the journal or promoted to an ADR if architectural.

## Stack conventions

### Web — SvelteKit (Svelte 5 runes) / pnpm

- **Package manager:** `pnpm`. Lockfile committed. `packageManager` field in `package.json` pins the version.
- **Linting:** ESLint flat config + `prettier`. TypeScript `strict: true`. `svelte-check` is the typecheck gate.
- **Components:** Svelte 5 runes (`$state`, `$derived`, `$effect`). Tailwind for styling; daisyUI or shadcn-svelte for primitives.
- **Server routes:** `+page.server.ts` for loaders, `+server.ts` for API endpoints. SvelteKit server routes exist for **paths that need a server secret OR that proxy to the Go backend** — Stripe Checkout/Portal session creation, R2 presign, and the proxy layer that forwards authenticated calls to the Go service. All simple user-owned CRUD that doesn't need the backend goes browser-direct via `@supabase/supabase-js` with RLS doing the authorization.
- **DB clients (web):**
  - **Primary**: `@supabase/supabase-js` (browser) + `@supabase/ssr` (server SSR). Goes through PostgREST + RLS.
  - The web tier has **no direct Postgres connection.** Anything needing privileged or cross-table SQL goes through the Go backend, not a service-role pool in `web/`.
- **PWA:** `@vite-pwa/sveltekit` plugin; manifest + service worker + maskable icons committed under `web/static/`.
- **No `dangerouslySetInnerHTML` / `{@html ...}` on user content.** Ever. A raw METAR string is upstream-controlled data — render it as text, never as HTML.

### Backend — Go 1.25 (the weather-poll + verdict-evaluation service)

Per [ADR-0001](../../docs/adr/0001-go-backend-for-weather-polling.md), Go/No-Go has a Go service on Cloud Run. Conventions mirror the sibling `tail-number-radar` and `currency-hub` repos:

- **Routing:** stdlib `net/http.ServeMux` (Go 1.22+ enhanced patterns). **No chi, gin, echo, fiber.**
- **DB:** `pgx/v5` + `sqlc`-generated queries. **No GORM. Never `database/sql` directly.** Queries live in `backend/internal/db/queries/*.sql`; `sqlc generate` produces typed Go. `sqlc diff` in CI catches schema drift.
- **Migrations:** `golang-migrate`, sequential `db/migrations/NNNN_<name>.up.sql` / `*.down.sql` — shared with the web tier, applied once. Up + down + up validation runs in CI on every PR touching `db/migrations/**`.
- **Logging:** `slog`, structured JSON. No PII in logs.
- **Auth:** the Go service verifies Supabase-issued ES256 JWTs against the JWKS endpoint (fetched once at boot, cached, refresh on `kid` mismatch). HS256 rejected; `aud='authenticated'` enforced.
- **The NWS weather integration is a trust boundary.** Per [ADR-0002](../../docs/adr/0002-nws-aviation-weather-api.md), all METAR/TAF fetched from the NWS Aviation Weather Center API is **untrusted input** — validated, length-capped, and parsed defensively (a malformed observation must never panic the parser or be rendered as HTML). The fetch client sets a descriptive `User-Agent`, times out, and backs off on 429/5xx. Upstream unavailability is a graceful-degradation case, not an error the user sees as a crash.
- **The verdict-evaluation engine is a pure function.** Per [ADR-0003](../../docs/adr/0003-verdict-engine-pure-function.md): all minimums-comparison math lives in `backend/internal/verdict` as deterministic functions — `(parsedWeather, minimums) → verdict` — with **no DB, no clock, no network I/O** inside. The clock and the parsed weather are injected. This is the most heavily unit-tested package in the repo; every comparison rule has a table-driven test. `scripts/check-verdict-purity.sh` is a fast pre-commit gate; the `weather-and-verdict-auditor` subagent is the authoritative review.
- **The verdict never defaults to green.** Missing, stale, or unparseable weather yields an explicit "unknown / weather unavailable" verdict surface — never a green by omission. This is a safety invariant, not a style preference.
- **No global `init()` for anything DI-able.** Construct dependencies in `main()` / `run()` and pass them down (see TNR's `cmd/server/main.go` pattern).
- **Cron:** the weather-poll + verdict-change-alert cron is `POST /cron/poll`, OIDC-authed (Cloud Scheduler calls it). Per [ADR-0004](../../docs/adr/0004-alert-dedupe-and-email-channel.md), the alert dedupe is a DB UNIQUE constraint, not application logic.

### Database + Auth — Single Supabase

- **One Supabase project** hosts Postgres + GoTrue + PostgREST + RLS.
- **Connections:**
  - Web tier: public anon connection via `@supabase/supabase-js` — RLS-gated.
  - Go backend: direct `pgxpool` connection via `DATABASE_URL`. The backend is a trusted server; it authorizes per request from the verified JWT's `sub` claim **and** RLS is still enabled as defense-in-depth. The cron path uses an app-admin role deliberately.
  - Migrations: direct connection via `SUPABASE_DB_URL`.
- **Cross-tenant isolation** is enforced two ways: RLS policies on every user-owned table (`auth.uid()`-keyed), AND the Go backend's per-request `WHERE owner_user_id = $jwt_sub` predicate. The cross-tenant regression test exercises both layers.
- **Local dev:** `supabase start` (Supabase CLI) runs Postgres + GoTrue + Studio + Inbucket via Docker.

### Auth — Supabase Auth

- Email + password (with verification on), magic link, Google OAuth. No phone/SMS in V1.
- **Browser:** `@supabase/supabase-js` handles sign-up / login / OAuth callback / session refresh.
- **Web SSR:** `@supabase/ssr` `createServerClient` + `safeGetSession()` in `hooks.server.ts`.
- **Go backend:** verifies the `Authorization: Bearer <jwt>` header on every authenticated route.

## Branching strategy & stacked epics

- **Phase artifacts:** `epic/NN-slug` (e.g., `epic/01-discovery`).
- **Implementation tickets:** `feat/GNG-NNN-slug` (e.g., `feat/GNG-001-verdict-engine`).
- **Meta / chores:** `chore/<slug>`.
- **Fixes:** `fix/<slug>`.

### Stacking rules

1. **Cut from the parent.** New branch off the previous unmerged dependency, not `main`.
2. **PR targets the parent.** Re-target to `main` when the parent merges.
3. **`--force-with-lease`, never bare `--force`.**
4. Use `scripts/new-epic-branch.sh <NN-slug>` to cut new epic branches stacked on the most recent unmerged epic.

## PR conventions

- **PR per coherent capability slice**, not per ticket. A slice may bundle multiple GNG-NNN tickets when they form one capability or unblock each other on the critical path.
- **No hard LOC cap.** Use judgment on coherence.
- **Conventional commits.** `feat(scope): …`, `fix(scope): …`, `chore(scope): …`, `docs(scope): …`.
- **Single author per commit — founder only.** Never add `Co-Authored-By:` trailers (Claude, agent, or otherwise). Enforced locally by a `commit-msg` pre-commit hook and in CI by the `single-author` step; do not bypass with `--no-verify`.
- **Failing test added before code** for any business logic — especially every verdict-comparison rule and every METAR/TAF parse case. Trivial wiring is exempt.
- **Coverage gate ≥ 80% on changed business-logic files.** The `backend/internal/verdict` package targets ≥ 95% — it is the product. The `backend/internal/weather` parser targets ≥ 90%. Generated code (`sqlc`) excluded.
- **PR body:** title + 3-bullet "what changed and why" + verbatim auditor output. Spec citations live in commit messages, not PR bodies.

## Definition of done (per PR)

1. CI green (lint, typecheck, tests, SAST, secret scan, coverage, `sqlc diff`, migration round-trip if applicable, `govulncheck`).
2. Acceptance criteria from the user story(ies) verifiable by automated or manual test.
3. All applicable auditor subagents (see triggers below) run on the staged diff before push; PASS/CONCERN/BLOCK output goes verbatim into the PR body.
4. **Self-merge** if all checks pass AND the PR does NOT touch any founder-only category (see [Working contract](../../docs/working-contract.md)). Otherwise, push with `FOUNDER APPROVAL REQUIRED — <category>` header.
5. Append one line to `journal/decisions.md` on merge: `YYYY-MM-DD | scope | what | why`.

## Subagent invocation triggers

The agent runs these on the **staged diff before pushing**, not after the PR opens. Output goes verbatim into the PR body.

- **`spec-guardian`** — **every PR with code changes.** Always runs. Catches scope creep against `docs/product-research.md` + the load-bearing-decisions block.
- **`weather-and-verdict-auditor`** — runs when the diff touches `backend/internal/weather/**`, `backend/internal/verdict/**`, or anything that parses a METAR/TAF or computes a verdict. Verifies the verdict engine stays a pure function, NWS responses are validated/sanitized on ingest, the parser handles malformed input safely, crosswind/component math is correct, the verdict never defaults to green on missing data, and each rule has a table-driven test.
- **`alert-pipeline-auditor`** — runs when the diff touches `backend/internal/alerts/**`, the poll cron handler, `alert_audit`, or weather-observation tables. Verifies the dedupe UNIQUE constraint (per-recipient, keyed by the verdict transition), the alert email send is post-dedupe, OIDC verification on the cron endpoint, and the NWS request budget.
- **`rls-and-tenancy-auditor`** — runs when the diff touches `db/migrations/**`, any RLS policy, a SvelteKit server route reading user-owned rows, `web/src/hooks.server.ts`, or a Go handler that reads user-owned tables. Verifies RLS on every user-owned table AND the backend's per-request owner predicate.

If any auditor returns **BLOCK**: do not push. Fix the underlying issue and re-run. If a CONCERN: include it in the PR body; founder may review.

## Self-merge protocol

For PRs that do NOT touch a founder-only category:

1. CI green on all required checks.
2. All applicable auditor subagents returned PASS or CONCERN (never BLOCK).
3. No open question in `journal/open-questions.md` blocks the slice.
4. Merge via `gh pr merge --squash <N>`.
5. Append one line to `journal/decisions.md`: `YYYY-MM-DD | GNG-NNN / area | what merged | one-line why`.

For PRs that touch a founder-only category:

1. Same auditors run.
2. Push the branch and open the PR with header `FOUNDER APPROVAL REQUIRED — <category>`.
3. Add to `journal/open-questions.md` if not already raised.
4. Wait. The founder merges (or rejects).

## Anti-patterns

- ❌ Auto-advancing **phase artifacts** without approval. (Per-PR self-merge inside Phase 5 is allowed.)
- ❌ Editing `docs/product-research.md` post-bootstrap (write an ADR that supersedes the row).
- ❌ Re-litigating a load-bearing decision in `CLAUDE.md` without a documented blocker.
- ❌ Self-merging a PR that touches a founder-only category.
- ❌ Skipping the auditor pre-push gate.
- ❌ A verdict-evaluation function that reads the wall clock, a DB, or the network inside it — the clock and the parsed weather are arguments (ADR-0003).
- ❌ A verdict that defaults to green when weather is missing, stale, or unparseable. Missing data → an explicit "unavailable" verdict, never green.
- ❌ Rendering a raw METAR/TAF string as HTML (`{@html}`), or trusting NWS response length/shape without validation.
- ❌ A migration that adds a user-owned table without `enable row level security` + at least own-read / own-write policies in the same migration.
- ❌ Alert dedupe implemented as a select-then-insert in application code instead of a DB UNIQUE constraint (ADR-0004).
- ❌ Reaching for chi/gin/GORM in the Go backend, or Next.js in the web tier.
- ❌ Drift toward weather-product depth (radar, prog charts, winds aloft, NOTAMs), flight planning, or managing the pilot's regulatory currency — these are sibling-product / out-of-scope territory.
- ❌ Pinned-to-`latest` deps. Pin exact versions; Dependabot is on.
