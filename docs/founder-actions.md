# Founder action checklist

> **Purpose.** Operational checklist for everything that doesn't get done by
> code in a PR — accounts to create, credentials to capture, DNS records to
> publish, services to verify. Engineering work that depends on these items
> is blocked until the matching action is ✅.
>
> **Source of truth.** This document mirrors the founder-track items
> implied by [docs/product-research.md](product-research.md) §6 (Week 0 +
> the week-by-week plan) and §9 (launch plan). ADRs that change scope are
> applied throughout.
>
> **How to use it.** Work top-to-bottom. Tick ☐ → ✅ when an action is
> fully done (credentials captured **and** stored in the agreed location
> where CI/runtime will read them). Each entry tells you exactly what to
> capture and which env var or secret name to use — keep those names
> verbatim so the runtime + workflows just work.

---

## Dashboard

| ID       | Action                                                        | Status | Unblocks                                            | Cost                                       | Time          |
| -------- | ------------------------------------------------------------- | ------ | --------------------------------------------------- | --------------------------------------------- | ------------- |
| F-01     | Domain + Cloudflare DNS                                        | ☐      | F-05 (R2 hostname), F-06 (Resend sender), prod URLs | $0 (subdomain) or ~$10/yr (new domain)     | 30 min        |
| F-02     | GCP project + Workload Identity Federation                     | ☐      | M3 deploy, M-launch                                 | $0 (set $5 budget alert)                   | 2 h           |
| F-03     | Supabase project (Postgres + Auth + Google OAuth)              | ☐      | M1 first migration, M1 signup/login                 | $0                                         | 1 h           |
| F-04     | Cloud Scheduler job for the weather-poll cron                  | ☐      | M4 alert pipeline                                   | $0 (1 of 3 free jobs)                      | 30 min        |
| F-05     | Cloudflare R2 bucket + API token + custom hostname             | ☐      | M5 WINGS-PDF export                                 | $0                                         | 1 h + 24h DNS |
| F-06     | Resend account + sender domain SPF/DKIM/DMARC                  | ☐      | M1 email verification, M4 alert fan-out             | $0                                         | 1 h + 24h DNS |
| F-07     | Stripe test mode + monthly + annual price IDs                  | ☐      | M6 paywall                                          | $0 (test)                                  | 1 h           |
| F-08     | Sentry projects (web + Go backend SDKs)                        | ☐      | M3 deploy with error capture                        | $0                                         | 30 min        |
| F-09     | PostHog Cloud project + funnel + feature flags                 | ☐      | M3 deploy with analytics                            | $0                                         | 30 min        |
| F-10     | Privacy Policy + Terms of Service + Refund policy              | ☐      | **M6 Stripe verification + M-launch**               | $0 (TermsFeed free)                        | 2 h           |
| F-11     | iac-tickerbeats Woodpecker bootstrap on Mac                    | ☐      | First CI run                                        | $0                                         | 30 min        |
| F-12     | Cloudflare Tunnel `gonogo-ci` + GitHub OAuth app               | ☐      | F-13                                                | $0                                         | 10 min        |
| F-13     | Enable go-nogo repo in Woodpecker UI + verify a build          | ☐      | unblocks all queued PRs                             | $0                                         | 5 min         |
| F-14     | UptimeRobot or equivalent for `/healthz` + landing page        | ☐      | M-launch                                            | $0                                         | 15 min        |
| F-15     | Register an NWS Aviation Weather Center contact `User-Agent`   | ☐      | M3 first live weather fetch                         | $0 (no account — a contactable UA string)  | 5 min         |

**Dependency map** (read top-down):

```
F-01 ──┬─→ F-05 (R2 public hostname needs DNS)
       └─→ F-06 (Resend sender domain needs DNS)

F-02 ──┬─→ M3 deploy
       └─→ F-04 (Cloud Scheduler lives in the same GCP project)
F-03 ──→ depends on F-01 only for the prod OAuth redirect URI
        (local dev works against localhost without F-01)
F-07 ──→ F-10 (Stripe verification requires TOS + Privacy)
F-08, F-09, F-10, F-15 — independent
F-11 ──→ F-12 ──→ F-13 (Woodpecker chain)
F-14 — after first staging deploy
```

**Recommendation: start in this order**

1. **F-10 today** (TermsFeed Free Generator + 2h customization). Required
   by Stripe verification, no external dependency. The refund policy +
   the go/no-go advisory disclaimer wording both matter here.
2. **F-01** (domain + Cloudflare DNS) — fan-out gate for F-05 and F-06.
3. **F-02 + F-03 in parallel** (each 1-2 h, independent for local dev) —
   unblock M1 + M3.
4. **F-04, F-05, F-06** — after F-01 / F-02.
5. **F-07, F-08, F-09, F-15** — anytime; needed by M3/M6.
6. **F-11 → F-12 → F-13** — get CI live before the first feature PR.

---

## F-01. Domain + Cloudflare DNS

**Why.** Email sender, R2 public hostname, OAuth callbacks, signed
WINGS-PDF URLs, and the production app URL all need a stable hostname
under Cloudflare DNS for free DDoS protection and CDN cache.

**Steps.**

1. Choose: register a new domain (`gonogo.app` on Cloudflare Registrar
   or Porkbun), OR reuse a subdomain of an existing zone
   (`gonogo.tickerbeats.com`). Decide here and capture below — see the
   open question in `journal/open-questions.md`.
2. On Cloudflare Dashboard, confirm the zone is on the Free plan with
   SSL/TLS mode **Full (strict)**.
3. Do **not** create DNS records yet — each downstream founder action
   writes its own (F-05 R2 hostname, F-06 sender SPF/DKIM/DMARC, F-02
   Cloud Run domain mappings).

**Capture.** Domain decision + Cloudflare zone ID in `journal/decisions.md`.

---

## F-02. GCP project + Workload Identity Federation

**Why.** Cloud Run hosts both Go/No-Go services (web + Go API). Cloud
Scheduler (F-04) runs the weather-poll cron. WIF lets CI deploy without a
long-lived service-account JSON in secrets.

**Steps.** _(Expanded during M3.)_

1. Create GCP project `gonogo-prod`. Link billing.
2. Set a $5 budget alert via Cloud Billing.
3. Enable APIs: Cloud Run, Artifact Registry, Cloud Build, Cloud
   Scheduler, Secret Manager, Cloud Logging.
4. Create Artifact Registry repo
   `us-central1-docker.pkg.dev/gonogo-prod/gonogo`.
5. Configure Workload Identity Federation between GitHub and GCP.
6. Create a dedicated cron service account (`gonogo-cron@...`) — Cloud
   Scheduler uses it to mint the OIDC token the Go backend verifies.
7. Create Secret Manager secrets for each production env var.

**Capture.** `GCP_PROJECT_ID`, WIF provider resource name, the deploy
service account email, the cron service account email.

---

## F-03. Supabase project (Postgres + Auth + Google OAuth)

**Why.** Single backend datastore + identity. One Supabase project hosts
the Postgres database (all app data), GoTrue auth (sign-up / login /
magic-link / Google OAuth), and the PostgREST auto-API that
`@supabase/supabase-js` addresses browser-direct. RLS gates browser
CRUD; the Go backend connects via `pgxpool` and verifies GoTrue JWTs.

**Steps.**

1. Sign up at [supabase.com](https://supabase.com), create project
   `gonogo` in the closest region to us-central1.
2. Enable auth providers: Email + Password (verification on), Magic
   Link, Google OAuth. The Google OAuth Client ID + Secret come from
   Google Cloud Console. Add redirect URIs:
   `http://localhost:5173/auth/callback` (local web),
   `http://localhost:54321/auth/v1/callback` (local Supabase CLI),
   `https://<prod-domain>/auth/callback` (added once F-01 lands).
3. From **Project Settings → API**, capture:
   - `PUBLIC_SUPABASE_URL` (Project URL)
   - `PUBLIC_SUPABASE_ANON_KEY` (anon / public key)
   - `SUPABASE_SERVICE_ROLE_KEY` (service-role key — **server-only**)
   - The JWKS URL (`<project>/auth/v1/.well-known/jwks.json`) →
     `SUPABASE_JWT_JWKS_URL`, used by the Go backend to verify tokens.
4. From **Project Settings → Database → Connection string**, capture:
   - `SUPABASE_DB_URL` / `DATABASE_URL` (the **direct** connection
     string for migrations + the Go backend's `pgxpool`).
5. **Disable Storage** (we use Cloudflare R2). Leave Realtime + Edge
   Functions disabled until/unless V2 uses them.
6. Create a second project for staging — the free tier allows 2 active
   projects.

**Capture.** All env vars above. Store in Google Secret Manager (prod) +
`.env` (local).

**Note.** Local dev uses `supabase start` (Supabase CLI) — a full local
stack. The hosted project from F-03 is for staging + prod only.

---

## F-04. Cloud Scheduler job for the weather-poll cron

**Why.** Go/No-Go's saved-trip alert mechanic is the scheduled weather
poll. Cloud Scheduler posts an OIDC-authed request to the Go backend's
`/cron/poll` on a fixed cadence. Per
[ADR-0005](adr/0005-weather-poll-cadence-and-caching.md) V1 uses a single
job at a fixed interval.

**Steps.** _(Expanded during M4.)_

1. In the GCP project, create a Cloud Scheduler job `gonogo-weather-poll`.
2. Schedule: the fixed cadence chosen in ADR-0005 (default every 30
   minutes — see `journal/open-questions.md`).
3. Target: HTTP POST to the Cloud Run `gonogo-api` service URL
   `/cron/poll`.
4. Auth: OIDC token, using the `gonogo-cron@...` service account from
   F-02. The audience must equal the Cloud Run service URL.

**Capture.** `CRON_OIDC_AUDIENCE` (the service URL),
`CRON_OIDC_SERVICE_ACCOUNT`.

---

## F-05. Cloudflare R2 bucket

**Why.** Server-generated WINGS risk-assessment PDF exports live in R2;
the pilot fetches them via signed GET URLs.

**Steps.**

1. On Cloudflare Dashboard → R2, create bucket `gonogo-files`.
2. Create an R2 API token (access key + secret) scoped to that bucket.
3. After F-01, set up a public hostname `files.gonogo.app` (or
   equivalent) via the R2 → Custom Domain workflow.

**Capture.** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`, `R2_ENDPOINT`, `R2_PUBLIC_HOSTNAME`.

---

## F-06. Resend transactional + alert email

**Why.** Email verification, magic links, password reset, and — the core
of the product — the **verdict-change alert fan-out**. Resend free tier:
100/day, 3 000/month, 1 verified domain. The alert volume is the closest
free-tier watch item; see research §6 and `.claude/rules/security.md`.

**Steps.**

1. Sign up at resend.com.
2. Add the sender domain (e.g. `alerts@gonogo.app`).
3. Publish SPF, DKIM, DMARC TXT records via Cloudflare DNS. Wait ~24 h
   for verification.
4. Create an API key.
5. Configure the deliverability webhook (bounce / complaint) pointed at
   the Go backend's `/webhooks/resend` — capture the signing secret.

**Capture.** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`,
`RESEND_WEBHOOK_SECRET`.

---

## F-07. Stripe test mode

**Why.** Paywall in M6. Test-mode credentials only at this stage; live
keys land during launch prep.

**Steps.**

1. Create a Stripe account in test mode.
2. Create products → prices:
   - Individual monthly: $6/mo recurring → `STRIPE_PRICE_MONTHLY`
   - Individual annual: $39/yr recurring → `STRIPE_PRICE_ANNUAL`
3. Create a webhook endpoint pointed at the local `stripe listen`
   forward during dev; the prod endpoint is added at launch.
4. **Blocks on F-10** — Stripe will not enable live mode until business
   info + TOS + Privacy are in place.

**Capture.** `STRIPE_SECRET_KEY`, `PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`STRIPE_WEBHOOK_SECRET`, the two price IDs.

---

## F-08. Sentry

**Why.** Error capture across both deployables — the SvelteKit web tier
and the Go backend.

**Steps.** Create an org + two projects (`gonogo-web`, `gonogo-api`).
Capture DSNs. Create `SENTRY_AUTH_TOKEN` for sourcemap / release tagging.

**Capture.** `PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_DSN_BACKEND`,
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.

---

## F-09. PostHog Cloud

**Why.** Analytics + session replay + feature flags + funnel
instrumentation from M3.

**Steps.** Create project `gonogo`. Enable session replay (5k replays
free). Configure EU-compatible privacy defaults to avoid a cookie banner.

**Capture.** `PUBLIC_POSTHOG_KEY`, `PUBLIC_POSTHOG_HOST`.

---

## F-10. Legal docs

**Why.** Stripe live-mode verification requires Terms of Service +
Privacy Policy at minimum. Go/No-Go also needs a clear **Refund policy**
and a prominent **advisory disclaimer** ("an advisory aid; the pilot in
command is solely responsible for the go/no-go decision; obtain an
official weather briefing").

**Steps.**

1. Generate base docs via the TermsFeed Free Generator.
2. Customize the advisory-disclaimer wording — it must be unambiguous
   that Go/No-Go does not decide whether a flight is safe, compares
   weather only to the pilot's own entered minimums, uses public weather
   data that may be stale/incomplete, and carries no FAA/NWS endorsement
   (research §2 + `.claude/rules/security.md`).
3. Add the age-confirmation (≥13 COPPA) requirement — implemented in the
   M1 signup flow.

**Capture.** Hosted URLs (e.g. `gonogo.app/terms`, `/privacy`,
`/refund`) — linked from the app footer.

---

## F-11. iac-tickerbeats Woodpecker bootstrap

**Why.** Self-hosted CI on the founder's Mac (matches the sibling
repos). Runner infra lives in
[`iac-tickerbeats`](https://github.com/Ruscigno/iac-tickerbeats).

**Steps.** Follow the `iac-tickerbeats` README to run `bootstrap.sh` on
the macOS host. Verifies Colima, gitleaks, semgrep, pnpm, Go,
golang-migrate, golangci-lint, etc. are in place.

---

## F-12. Cloudflare Tunnel for Woodpecker

**Why.** GitHub webhooks need to reach the Woodpecker server on the
founder's Mac.

**Steps.** `cloudflared tunnel login` → create the `gonogo-ci` tunnel →
publish under `ci.gonogo.app` or equivalent → create a GitHub OAuth app
for Woodpecker login.

---

## F-13. Enable repo in Woodpecker UI + first build

**Why.** Closing the loop — once enabled, the next push triggers
`.woodpecker/pr.yml`.

**Steps.** Woodpecker dashboard → enable the `go-nogo` repo → push a tiny
no-op commit on `epic/01-discovery` → confirm the pipeline runs + green.

---

## F-14. UptimeRobot

**Why.** Synthetic checks on `/healthz` (both services) and the landing
page. 50 monitors, 5-min interval, free.

**Steps.** Sign up. Add monitors for the prod URLs once the launch
milestone ships.

---

## F-15. NWS Aviation Weather Center contact `User-Agent`

**Why.** The NWS Aviation Weather Center API is free, keyless public
data — there is **no account and no API key**. But US-government weather
services expect every automated client to send a descriptive,
contactable `User-Agent` so they can reach the operator if a client
misbehaves. This is a courtesy that protects launch availability (a
non-identifying client is the first to be blocked).

**Steps.**

1. Settle the `User-Agent` string: a product name + the contact email,
   e.g. `gonogo.app weather poll (tickerbeats@gmail.com)`.
2. Confirm the Go fetch client sends it on every request (verified in
   the M3 weather-fetch ticket).
3. Re-read the AWC API's current terms-of-use / rate guidance and note
   any change in `journal/decisions.md` — the API has no SLA and the
   guidance can move.

**Capture.** `NWS_AWC_USER_AGENT`, `NWS_AWC_BASE_URL`.
