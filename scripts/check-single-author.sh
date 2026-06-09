#!/usr/bin/env bash
# Single-author gate.
#
# Fails (exit 1) if any commit introduced by THIS PR carries a Co-Authored-By
# trailer. Scope is the PR's own commits — `HEAD ^origin/<base>`, i.e. reachable
# from HEAD but not from the base branch — so a co-authored commit already on
# the base (e.g. a Dependabot merge carrying `Co-authored-by: dependabot[bot]`)
# can never fail an unrelated PR.
#
# Base branch name, in order:
#   1. CI_COMMIT_PULL_REQUEST_BASE_BRANCH — correct for non-main targets (release/*).
#   2. the remote's default branch (origin/HEAD).
#   3. "main".
#
# If `origin/<base>` can't be resolved (e.g. the base fetch failed), the gate
# FAILS LOUDLY rather than walking full history — a history walk would re-include
# the base branch's own commits and re-introduce the exact false-fail this gate
# fixes. The primary scoped path already covers every PR commit (multi-commit
# included), so there is nothing to "fall back" to for coverage.
#
# No `set -e`: the `|| true` on the fetch and the `bad`-flag accumulation rely on
# non-zero exits being handled inline. `pipefail` + the explicit `git log` exit
# check below stop a failed `git log` from being read as "no trailer".
#
# Unit-tested by scripts/check-single-author.test.sh (run in CI via the
# single-author-tests step).
set -uo pipefail

if [ -n "${CI_COMMIT_PULL_REQUEST_BASE_BRANCH:-}" ]; then
  base="$CI_COMMIT_PULL_REQUEST_BASE_BRANCH"
elif base="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')" && [ -n "$base" ]; then
  : # resolved from the remote's default branch
else
  base="main"
fi

git fetch origin "$base" --depth=200 --quiet 2>/dev/null || true

if ! git rev-parse --verify --quiet "origin/$base" >/dev/null 2>&1; then
  echo "ERROR could not resolve base ref 'origin/$base' to scope the single-author check."
  echo "      The base fetch may have failed transiently — re-run the pipeline."
  echo "      (Refusing to walk full history, which would false-fail on base-branch commits.)"
  exit 1
fi

# On a shallow clone (CI fetches --depth=200), a PR with more commits than the
# depth grafts HEAD's history before the merge-base. `rev-list HEAD ^origin/base`
# would then silently stop at the graft and miss deeper commits. Fail loudly
# rather than under-scan.
if [ -f "$(git rev-parse --git-dir)/shallow" ] && ! git merge-base HEAD "origin/$base" >/dev/null 2>&1; then
  echo "ERROR the clone is too shallow to reach base 'origin/$base' — cannot scope the check."
  echo "      Increase the CI clone depth (currently 200) for this PR and re-run."
  exit 1
fi

shas="$(git rev-list --no-merges HEAD "^origin/$base")"

bad=0
checked=""
while IFS= read -r sha; do
  [ -n "$sha" ] || continue
  checked="$checked ${sha:0:9}"
  if ! body="$(git log -1 --format='%B' "$sha")"; then
    echo "ERROR could not read commit message for $sha."
    bad=1
    continue
  fi
  if printf '%s\n' "$body" | grep -iqE '^Co-Authored-By:'; then
    echo "ERROR $(git log -1 --oneline "$sha") has a Co-Authored-By trailer (single-author policy)."
    bad=1
  fi
done <<< "$shas"

if [ "$bad" -ne 0 ]; then
  echo "See .claude/rules/engineering.md — single author per commit."
  exit 1
fi
echo "single-author: OK (checked:${checked:- none})"
