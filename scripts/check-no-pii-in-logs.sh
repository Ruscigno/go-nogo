#!/usr/bin/env bash
# PII-in-logs guard for AC-X05.
#
# Greps the web/ and backend/ source trees for log call sites that
# reference PII / secrets keys directly. Returns non-zero (blocks commit
# / CI) if any match is found.
#
# Go/No-Go PII includes the pilot's email, JWT, and — importantly — the
# routes a pilot saves as trips (departure/destination airport pairs
# reveal travel patterns). Structured loggers (pino in web, slog in Go)
# scrub keys when passed as object properties, but a developer can still
# log raw strings like `log.Info("alert sent to " + email)`. This script
# catches that.

set -euo pipefail

banned='\b(password|jwt|secret|authorization|sb-access-token|owner_email|pilot_email)\b'
bad=0

# ---------------------------------------------------------------------------
# Web — TypeScript / Svelte sources (exclude tests + the log module itself)
# ---------------------------------------------------------------------------
if [[ -d web/src ]]; then
  while IFS= read -r f; do
    if grep -nE "(log|logger|console)\.[a-z]+\([^)]*${banned}" "$f" >/tmp/pii-hit.txt 2>/dev/null; then
      if [[ -s /tmp/pii-hit.txt ]]; then
        echo "::pii-check::$f" >&2
        cat /tmp/pii-hit.txt >&2
        bad=1
      fi
    fi
  done < <(find web/src -type f \( -name '*.ts' -o -name '*.svelte' \) \
    -not -name '*.test.ts' \
    -not -name '*.spec.ts' \
    -not -path '*/lib/server/log.ts' \
    2>/dev/null || true)
fi

# ---------------------------------------------------------------------------
# Backend — Go sources (exclude tests + the logging package itself)
# slog call shapes: slog.Info(...), logger.Error(...), log.Warn(...)
# ---------------------------------------------------------------------------
if [[ -d backend ]]; then
  while IFS= read -r f; do
    if grep -nE "(slog|logger|log)\.[A-Za-z]+\([^)]*${banned}" "$f" >/tmp/pii-hit.txt 2>/dev/null; then
      if [[ -s /tmp/pii-hit.txt ]]; then
        echo "::pii-check::$f" >&2
        cat /tmp/pii-hit.txt >&2
        bad=1
      fi
    fi
  done < <(find backend -type f -name '*.go' \
    -not -name '*_test.go' \
    -not -path '*/internal/db/*' \
    2>/dev/null || true)
fi

rm -f /tmp/pii-hit.txt

if [[ $bad -ne 0 ]]; then
  echo "" >&2
  echo "ERROR PII / secret keys referenced inside log call sites." >&2
  echo "      See .claude/rules/security.md + spec AC-X05." >&2
  echo "      Pass row UUIDs or hashed IDs, not raw email / JWT / saved-trip routes." >&2
  exit 1
fi

exit 0
