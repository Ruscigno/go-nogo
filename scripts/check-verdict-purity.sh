#!/usr/bin/env bash
# Verdict-engine purity guard.
#
# The go/no-go verdict-evaluation engine (backend/internal/verdict) is a
# PURE function per ADR-0003: (parsedWeather, minimums) -> verdict, with
# no clock, no DB, no network I/O inside. A wrong or non-deterministic
# verdict is a safety-of-flight defect. This script is a fast heuristic
# pre-commit / CI gate; the authoritative review is the
# weather-and-verdict-auditor subagent.
#
# It greps backend/internal/verdict/*.go (excluding tests) for impurity
# markers: time.Now(), database calls, HTTP clients, env reads, file I/O.
# A real match returns non-zero and blocks.

set -euo pipefail

verdict_dir="backend/internal/verdict"

# Nothing to check until the package exists (Phase 5 / M2).
if [[ ! -d "$verdict_dir" ]]; then
  exit 0
fi

# Impurity markers that must never appear inside the pure verdict package.
impure='time\.Now\(|pgx\.|pgxpool|sql\.DB|http\.(Get|Post|Client|NewRequest)|os\.Getenv|os\.Open|os\.ReadFile|net\.Dial'
bad=0

while IFS= read -r f; do
  if grep -nE "$impure" "$f" >/tmp/impure-hit.txt 2>/dev/null; then
    if [[ -s /tmp/impure-hit.txt ]]; then
      echo "::verdict-purity::$f" >&2
      cat /tmp/impure-hit.txt >&2
      bad=1
    fi
  fi
done < <(find "$verdict_dir" -type f -name '*.go' -not -name '*_test.go' 2>/dev/null || true)

rm -f /tmp/impure-hit.txt

if [[ $bad -ne 0 ]]; then
  echo "" >&2
  echo "ERROR The verdict engine must be a pure function (ADR-0003)." >&2
  echo "      No clock, no DB, no HTTP, no env reads, no file I/O inside" >&2
  echo "      backend/internal/verdict. The evaluation date and the parsed" >&2
  echo "      weather are arguments. Move the impure call into a caller." >&2
  exit 1
fi

exit 0
