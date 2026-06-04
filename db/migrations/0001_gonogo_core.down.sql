-- Drop the gear's table but NOT the `gonogo` schema — the schema namespace
-- is owned by the platform (Cortex creates the empty schema + the
-- gonogo_app role), not this gear. Dropping the table only keeps the
-- up→down→up round-trip clean while leaving the platform-owned namespace
-- intact in production.

DROP TABLE IF EXISTS gonogo.personal_minimums;
