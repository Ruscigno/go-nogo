#!/usr/bin/env bash
# Single-author gate.
#
# Fails (exit 1) if any commit introduced by THIS PR carries a Co-Authored-By
# trailer. Scope is the PR's own commits — `HEAD ^origin/<base>`, i.e. reachable
# from HEAD but not from the base branch — so a co-authored commit already on
# the base (e.g. a Dependabot merge carrying `Co-authored-by: dependabot[bot]`)
# can never fail an unrelated PR.
#
# Base resolution, in order:
#   1. CI_COMMIT_PULL_REQUEST_BASE_BRANCH — correct for non-main targets (release/*).
#   2. the remote's default branch (origin/HEAD).
#   3. "main".
# If the base ref still can't be resolved on a shallow clone, fall back to a
# bounded recent-history walk (50 commits, not just the tip) so multi-commit
# PRs stay covered.
#
# Unit-tested by scripts/check-single-author.bats (run in CI via the
# single-author-tests step).
set -u

if [ -n "${CI_COMMIT_PULL_REQUEST_BASE_BRANCH:-}" ]; then
  base="$CI_COMMIT_PULL_REQUEST_BASE_BRANCH"
elif base="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')" && [ -n "$base" ]; then
  : # resolved from the remote's default branch
else
  base="main"
fi

git fetch origin "$base" --depth=200 --quiet 2>/dev/null || true

if git rev-parse --verify --quiet "origin/$base" >/dev/null 2>&1; then
  shas="$(git rev-list --no-merges HEAD "^origin/$base")"
else
  shas="$(git rev-list --no-merges -n 50 HEAD)"
fi

bad=0
while IFS= read -r sha; do
  [ -n "$sha" ] || continue
  if git log -1 --format='%B' "$sha" | grep -iqE '^Co-Authored-By:'; then
    echo "ERROR $(git log -1 --oneline "$sha") has a Co-Authored-By trailer (single-author policy)."
    bad=1
  fi
done <<< "$shas"

if [ "$bad" -ne 0 ]; then
  echo "See .claude/rules/engineering.md — single author per commit."
  exit 1
fi
echo "single-author: OK"
