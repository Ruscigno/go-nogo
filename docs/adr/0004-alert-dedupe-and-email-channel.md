# 0004. Verdict-change alerts: a DB-UNIQUE-constraint dedupe, email channel

- Status: proposed
- Date: 2026-05-21
- Deciders: founder (draft — awaiting approval)

## Context and problem statement

Go/No-Go's retention mechanic is the verdict-change alert: a pilot saves
a trip (a departure/destination pair), and when the scheduled weather
poll re-evaluates that trip and the verdict *changes* — red→green as a
window opens, green→yellow as conditions degrade — the pilot is
notified. Two things must be decided:

1. **The dedupe.** The poll can re-run (Cloud Scheduler retries on
   transient failure; the founder may re-run it after a partial failure;
   a redeploy can land mid-run). The same poll must not send two emails
   for the same verdict change. But a *later, different* verdict change
   on the same trip is a new, legitimate alert. The guarantee needed is
   **at-most-once per verdict transition, per recipient.**
2. **The channel.** How is the pilot notified — email, SMS, Web Push?

Naive dedupe is wrong in two ways:
- **Re-runs.** Anything that lets the poll run twice over the same
  observation must not produce two emails for the same transition.
- **Coarseness.** A dedupe key keyed only on the saved trip would
  suppress the *second* legitimate alert when the verdict later changes
  again. The key must include the transition identity.

## Decision drivers

- **Application-logic dedupe races.** A select-then-insert in Go
  ("have we alerted this transition?") has a window between the SELECT
  and the INSERT where a concurrent run inserts the same row. Under
  Cloud Run, concurrent invocations are normal.
- **The constraint should BE the guarantee.** If at-most-once is a DB
  UNIQUE constraint, it holds unconditionally — regardless of how many
  times or how concurrently the poll runs.
- **The key must distinguish transitions.** red→green at 14:00 and
  green→yellow at 17:00 on the same trip are two distinct, both-legitimate
  alerts. A coarse per-trip key swallows the second; a key tied to the
  *specific observation* that drove the change makes a re-run a no-op but
  a genuinely new change a new alert.
- **The audit row is also the forensic record.** One row per alert (with
  `from_verdict`, `to_verdict`, `provider_message_id`, `status`) is what
  answers "did the pilot get told their KXYZ→KABC trip went green?" and
  what a future bounce-handler webhook maps back to.
- **Channel reality.** The portfolio cut Web Push from V1 over the iOS
  PWA limitation (Web Push on iOS requires Add-to-Home-Screen and is
  unreliable). SMS via Twilio needs A2P 10DLC registration — a
  multi-week external dependency. Email is immediate, free-tier
  (Resend), and consistent with the sibling `currency-hub`.

## Considered options

For the **dedupe**:

A1. **Application-logic dedupe.** Before sending, `SELECT` from
    `alert_audit` to check "already alerted?"; send if not; then
    `INSERT`.
A2. **Per-trip DB UNIQUE constraint.** `UNIQUE (saved_trip_id, user_id)`
    on `alert_audit`.
A3. **Per-recipient, per-transition DB UNIQUE constraint.**
    `UNIQUE (saved_trip_id, user_id, from_verdict, to_verdict,
    observation_id)`; `INSERT … ON CONFLICT DO NOTHING RETURNING id`.

For the **channel**:

B1. **Email** (Resend).
B2. **SMS** (Twilio).
B3. **Web Push** (service-worker push).

## Decision outcome

**Dedupe: Option A3 — a per-recipient, per-transition DB UNIQUE
constraint** on `alert_audit`:

```sql
UNIQUE (saved_trip_id, user_id, from_verdict, to_verdict, observation_id)
```

The poll handler does:

```sql
INSERT INTO alert_audit
  (saved_trip_id, user_id, from_verdict, to_verdict,
   observation_id, address, status)
VALUES ($1, $2, $3, $4, $5, $6, 'sent')
ON CONFLICT (saved_trip_id, user_id, from_verdict, to_verdict, observation_id)
DO NOTHING
RETURNING id;
```

The Resend send fires **only when the INSERT returned a row** (it won
the dedupe). On conflict, the handler skips — this exact transition,
driven by this exact observation, was already alerted. Including
`observation_id` makes a re-run over the same observation a safe no-op,
while a genuinely new observation that drives a fresh transition
produces a new row and a new alert. Including `user_id` keeps the key
per-recipient (a saved trip is single-owner today, but a future
shared-trip evolution must not let one recipient's send suppress
another's — the sibling repos hit and corrected exactly this per-item
bug).

**Channel: Option B1 — email**, via Resend. SMS and Web Push are cut
from V1 (research §5.4). iOS PWA install is an in-app instructions card.

### Positive consequences

- At-most-once holds unconditionally — no race window, regardless of
  concurrency or retries.
- A later, different verdict change legitimately alerts again; a re-run
  over the same observation is a safe no-op.
- The `alert_audit` table is a complete forensic log — one row per
  alert, with the transition, the driving observation, provider IDs, and
  status, ready for a future bounce-handler.
- Email is free-tier (Resend), immediate, and has no external-onboarding
  lead time (unlike Twilio A2P 10DLC).
- Channel-consistent with `currency-hub`.

### Negative consequences

- The poll must re-fetch / re-evaluate to know the current verdict
  before it can detect a transition — but that work is the poll's whole
  job anyway.
- A five-column UNIQUE index. Negligible — `alert_audit` cardinality at
  V1 scale is a few thousand rows.
- Email is silent until the pilot checks it — a verdict change is not
  delivered as urgently as a push would be. Accepted for V1; a verdict
  change is rarely minute-critical, and Web Push is a V1.1 candidate if
  the portfolio constraint lifts.

## Pros and cons of each option

### Dedupe A1 — application-logic

- 👍 No schema constraint to design.
- 👎 Select-then-insert races under concurrent poll invocations.
- 👎 The guarantee depends on application code being perfectly correct
  forever — fragile for a notification product.

### Dedupe A2 — per-trip UNIQUE constraint

- 👍 Atomic; the constraint is the contract.
- 👎 The *first* verdict change on a trip claims the row; every later
  verdict change is silently suppressed. A genuine data-loss bug — the
  pilot stops getting alerts after the first one.

### Dedupe A3 — per-recipient, per-transition UNIQUE constraint (chosen)

- 👍 Atomic AND correct — a re-run is a no-op, a new change is a new
  alert.
- 👍 One audit row per alert — complete forensic record.
- 👎 Marginally wider index (negligible).

### Channel B1 — email (chosen)

- 👍 Free-tier (Resend); no external onboarding; consistent with
  `currency-hub`.
- 👎 Silent until checked; not as immediate as push.

### Channel B2 — SMS

- 👍 High open rate, immediate.
- 👎 Twilio A2P 10DLC registration is a multi-week external dependency;
  per-message cost breaks the free-tier discipline.

### Channel B3 — Web Push

- 👍 Immediate, free.
- 👎 Cut portfolio-wide for V1 — iOS Web Push requires Add-to-Home-Screen
  and is unreliable; a poor fit for a safety-relevant alert.

## Links

- Spec section: [docs/product-research.md](../product-research.md) §2.6
  (email), §3.5 (the alert pipeline), §4.2 (`alert_audit` schema),
  §5.4 (SMS / Web Push cut list).
- Related ADRs: [0001](0001-go-backend-for-weather-polling.md) (the Go
  service that hosts the poll cron),
  [0005](0005-weather-poll-cadence-and-caching.md) (the poll cadence
  that drives the transition detection).
- Sibling-repo precedent: `currency-hub` ADR-0002 — the same per-item →
  per-recipient DB-constraint dedupe correction, and email-only V1.
