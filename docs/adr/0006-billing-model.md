# 0006. Billing model — Stripe Checkout, $6/mo + $39/yr individual, 14-day trial

- Status: proposed
- Date: 2026-05-21
- Deciders: founder (draft — awaiting approval)

## Context and problem statement

Go/No-Go is a paid micro-SaaS. The billing model — provider, pricing,
plan shape, trial vs free tier — must be settled before the M6 payments
milestone, and it shapes the data model (`subscriptions`), the paywall
logic, and the launch positioning.

Inputs:

- Research §5 Opportunity 8 prices this opportunity at **$5–7/mo**.
- Research §8 warns that a **free tier sets a $0 anchor for the whole
  category** in GA software (MyFlightbook, etc. give core function away)
  and recommends a **time-boxed trial** instead.
- The portfolio's billing convention is Stripe Checkout + Customer
  Portal — Stripe-hosted, so no PCI exposure.
- Go/No-Go is a **single-pilot decision aid**. Unlike the sibling
  `currency-hub` (which has a flying-club roll-up and so a per-seat club
  price), Go/No-Go has no roster or org surface — there is no second
  buyer type to price for.

## Decision drivers

- **Stay inside the research's $5–7/mo band.** $5 attracts non-buyers;
  $7 is the top of the band; $6 is the defensible mid-point and is
  consistent with the sibling `currency-hub`'s $6/mo individual price.
- **An annual option lifts LTV and cuts churn.** A $39/yr price
  (a ~46% notional discount vs 12×$6) is the research's stated annual
  figure for the adjacent currency opportunity and a familiar GA price
  point.
- **No free tier — a trial.** Per research §8, a permanent free tier
  would anchor the category at $0. A 14-day no-credit-card trial samples
  the product fairly (a pilot can run real verdicts and save a trip)
  without giving the core away forever.
- **No lifetime deal.** A weather decision-support service is an
  indefinite, recurring need (the weather keeps happening); recurring
  revenue should match a recurring service.
- **No club / org tier.** Go/No-Go has no roster surface; a per-seat
  price would be a feature the product does not have. (If a shareable
  verdict snapshot ships in V2, that is a feature, not a billing tier.)
- **Stripe-hosted = no PCI scope.** Checkout + Customer Portal keep card
  data entirely off our infrastructure.

## Considered options

For **plan shape**:

1. **Monthly + annual individual, 14-day trial, no free tier.**
2. **A permanent free tier** (e.g. one saved trip free) + a paid
   upgrade.
3. **Monthly + annual + a lifetime one-time price.**

For **provider**: Stripe Checkout + Customer Portal (the portfolio
default) — not seriously contested; included for completeness.

## Decision outcome

Chosen: **Option 1 — Stripe Checkout + Customer Portal; two prices,
individual only; a 14-day no-credit-card trial; no free tier; no
lifetime deal.**

- `price_monthly` — **$6/mo** recurring.
- `price_annual` — **$39/yr** recurring.
- **Trial:** 14 days, no credit card required. Full product during the
  trial. The exact paywall trigger (time-based on trial expiry) is
  confirmed in Phase 1; the draft default is purely time-based — the
  simplest predicate, no per-pilot counter, and the product's value is
  continuous so a time trial samples it fairly.
- **Webhook handling:** the Go backend receives `/webhooks/stripe`;
  events handled are `checkout.session.completed`, `invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `charge.refunded`. Idempotency is a
  `processed_webhook_events` table with `UNIQUE (provider, event_id)`;
  the signature is verified against the **raw** request body; the dedupe
  insert + the state mutation run in one transaction.
- **Refund policy** is written (F-10) and visible before launch.

### Positive consequences

- Inside the research's $5–7/mo band; consistent with the portfolio.
- The annual price lifts LTV and reduces churn.
- No free tier → the category is not anchored at $0 for Go/No-Go.
- Stripe-hosted → zero PCI scope; the Customer Portal gives
  self-service cancellation with no support load.
- Two prices, one buyer type → the simplest possible billing surface and
  paywall logic.

### Negative consequences

- A trial-only model converts a narrower top of funnel than a generous
  free tier would — accepted, per the research §8 reasoning that a $0
  anchor is worse.
- No lifetime option forgoes a one-time cash bump some indie products
  use — accepted; a recurring service should be recurring revenue, and a
  lifetime price on a service with an ongoing infra cost (the poll, the
  email) ages badly.

## Pros and cons of each option

### Option 1 — monthly + annual, 14-day trial, no free tier (chosen)

- 👍 Inside the research band; annual lifts LTV; no $0 category anchor.
- 👍 Simplest billing surface — two prices, one buyer type.
- 👎 Narrower top of funnel than a free tier.

### Option 2 — a permanent free tier + paid upgrade

- 👍 Wider top of funnel; more word-of-mouth.
- 👎 Research §8: a free tier anchors the whole category at $0; the free
  cohort is expensive (the poll + email cost is per-trip, not per-payer)
  and rarely converts. Rejected.

### Option 3 — monthly + annual + a lifetime one-time price

- 👍 A one-time cash bump at launch.
- 👎 Go/No-Go has an ongoing per-user infra cost (the recurring poll,
  the alert email); a lifetime price collects once and pays forever.
  Rejected.

## Links

- Spec section: [docs/product-research.md](../product-research.md) §2.5
  (Stripe), §5.1 #14–#15 (billing + paywall), §9.4 (pricing).
- Research source: §5 Opportunity 8 ("$5–7/mo"), §8 (free tier vs
  trial).
- Related ADRs: [0001](0001-go-backend-for-weather-polling.md) (the Go
  service hosts the webhook receiver).
- External: [Stripe Checkout](https://stripe.com/docs/checkout),
  [Stripe Customer Portal](https://stripe.com/docs/billing/subscriptions/customer-portal).
