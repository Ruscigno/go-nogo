# Open questions for the founder

Append-only queue. Each question carries a default-decision-by date so
work is never blocked waiting on an answer. Format:

```
## YYYY-MM-DD — <one-line question>
Context: <one sentence>
Default (if no answer by YYYY-MM-DD): <what I'll do absent input>
```

---

## 2026-05-21 — Domain choice for Go/No-Go

Context: the app, email sender, R2 public hostname, and signed PDF links
all need a stable hostname — `gonogo.app` (new registration) vs
`gonogo.tickerbeats.com` (subdomain of an existing zone).
Default (if no answer by F-01 execution): subdomain
`gonogo.tickerbeats.com` — zero cost, no new registration.

## 2026-05-21 — Weather-poll cadence (how often does the cron fetch)

Context: the poll cron fetches METAR/TAF for active-saved-trip airports
and alerts on verdict change; cadence trades freshness against NWS
request volume + Resend send volume. Draft ADR-0005 proposes a single
fixed-interval cron (~every 30 min) for V1.
Default (if no answer by Phase 2 sign-off): a single Cloud Scheduler job
at a 30-minute fixed interval, polling only airports of active saved
trips; per-trip cadence tuning deferred to V1.1.

## 2026-05-21 — V1 individual pricing point ($5 vs $6 vs $7 monthly)

Context: research §5 Opportunity 8 gives a $5–7/mo band; the draft
product-research.md picks $6/mo + $39/yr. Pricing is a founder call.
Default (if no answer by Phase 3 sign-off): $6/mo + $39/yr individual —
mid-band, annual anchored consistent with the portfolio's currency-hub.

## 2026-05-21 — Yellow band — does Go/No-Go define a caution margin?

Context: the verdict is green/yellow/red. Red and green are unambiguous
(weather within / outside the pilot's stated minimums). Yellow is a
"close to your minimum" caution band — but the margin (e.g. within 20%
of a limit, or within a pilot-set buffer) is a product decision.
Default (if no answer by Phase 3 sign-off): yellow = within a small
fixed margin of any minimum (ceiling within 500 ft, vis within 1 SM,
crosswind within 3 kt) OR any required weather field stale/uncertain;
revisit after beta. A pilot-configurable buffer is a V1.1 candidate.

## 2026-05-21 — How far does the WINGS PDF go toward the FAA FRAT format?

Context: research §5 says the printable risk-assessment summary should
"satisfy WINGS". The FAA Flight Risk Assessment Tool (FRAT) has a
specific PAVE/IMSAFE-flavored structure. Matching it exactly is more
build; a clean self-assessment summary may be enough.
Default (if no answer by Phase 3 sign-off): a clean risk-assessment
summary covering the weather snapshot, the pilot's minimums, the verdict,
and a PAVE-checklist section the pilot fills in — structured to be
WINGS-suitable, not a pixel-exact FAA FRAT clone.

## 2026-05-21 — Free tier vs trial; the exact paywall trigger

Context: research §8 warns a free tier sets a $0 anchor for the whole
category; research §5 Opportunity 8 prices at $5–7/mo. The draft assumes
a 14-day no-credit-card trial then a paywall.
Default (if no answer by Phase 3 sign-off): a 14-day full trial, no
credit card, then a time-based paywall — no permanent free tier.
