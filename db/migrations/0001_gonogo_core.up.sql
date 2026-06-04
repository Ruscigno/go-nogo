-- go-nogo core table — the pilot's saved personal minimums
-- (product-research §3.3 / §4.2 `minimums_profiles`). This is the one
-- persistent input the verdict engine evaluates against: the configurable
-- per-factor limits the pilot set for THEMSELVES. The weather factors stay
-- transient inputs — the live NWS fetch + METAR/TAF parse (research §3.4)
-- is a later phase and never persists a guessed threshold here.
--
-- These live in the gear's private `gonogo` schema in the shared Cortex
-- Postgres. `CREATE SCHEMA IF NOT EXISTS` keeps this migration
-- self-contained so the CI db-round-trip lane can apply it against an empty
-- ephemeral Postgres without the platform migrations. The platform owns the
-- schema namespace; this gear owns its tables.
--
-- owner_user_id is the Cortex user id (cortex.users.id). No cross-schema FK
-- is declared: the gear schema can SELECT cortex.* but must stay applyable
-- in isolation. Ownership is enforced by the adapter's owner predicate on
-- every query (research §4.3 "the Go backend additionally scopes every
-- user-data query by the JWT-derived owner_user_id"). The gonogo_app role
-- OWNS this schema, so owner-predicate scoping — not per-row RLS — is the
-- tenancy boundary for the web adapter.
--
-- One row per pilot: a single saved minimums profile per owner in this
-- slice (the multi-profile labelled-profiles model in research §4.2 is a
-- later phase), enforced by the UNIQUE on owner_user_id.

CREATE SCHEMA IF NOT EXISTS gonogo;

CREATE TABLE gonogo.personal_minimums (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id            uuid NOT NULL UNIQUE,
    -- VFR-side weather minimums (the pilot's OWN numbers, never a default).
    min_ceiling_ft           int          NOT NULL,   -- ceiling floor, ft AGL
    min_visibility_sm        numeric(4, 2) NOT NULL,   -- visibility floor, statute miles
    -- wind limits.
    max_crosswind_kt         int          NOT NULL,   -- demonstrated/comfort crosswind
    max_gust_factor_kt       int          NOT NULL,   -- gust minus steady wind
    -- non-weather decision inputs.
    is_ifr_current           boolean      NOT NULL DEFAULT false,  -- pilot self-report gate
    max_days_since_flight    int          NOT NULL,   -- time-since-last-flight limit
    created_at               timestamptz  NOT NULL DEFAULT now(),
    updated_at               timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX personal_minimums_owner_idx ON gonogo.personal_minimums (owner_user_id);
