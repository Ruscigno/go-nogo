#!/usr/bin/env bats
# Unit tests for scripts/check-single-author.sh.
#
# Each test builds a throwaway repo with a bare "origin", so the gate's git
# plumbing (fetch, rev-list, rev-parse) runs for real. Covers: clean PR pass,
# trailer detection (tip + intermediate commit), base-branch exclusion (the
# Dependabot regression), all three base-resolution branches (CI var,
# origin/HEAD, main fallback) and the bounded recent-history fallback.

setup() {
  SCRIPT="$BATS_TEST_DIRNAME/check-single-author.sh"
  TMP="$(mktemp -d)"
  git init -q --bare "$TMP/remote.git"
  git clone -q "$TMP/remote.git" "$TMP/work" 2>/dev/null
  cd "$TMP/work"
  git config user.email t@example.com
  git config user.name Tester
  git config commit.gpgsign false
  git commit -q --allow-empty -m "base"
  git branch -M main
  git push -q origin main
  git remote set-head origin main
  unset CI_COMMIT_PULL_REQUEST_BASE_BRANCH
}

teardown() {
  rm -rf "$TMP"
}

# helper: an empty commit whose message body carries a Co-Authored-By trailer
coauthored_commit() {
  printf '%s\n\nCo-authored-by: %s\n' "$1" "$2" | git commit -q --allow-empty -F -
}

@test "passes for a clean single-commit PR" {
  git checkout -q -b feature
  git commit -q --allow-empty -m "feat: clean"
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"single-author: OK"* ]]
}

@test "fails when a PR commit carries a Co-Authored-By trailer" {
  git checkout -q -b feature
  coauthored_commit "feat: x" "Someone <s@e.com>"
  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Co-Authored-By trailer"* ]]
}

@test "excludes a Co-Authored-By commit already on the base branch (Dependabot regression)" {
  coauthored_commit "chore(deps): bump" "dependabot[bot] <bot@users.noreply.github.com>"
  git push -q origin main
  git checkout -q -b feature
  git commit -q --allow-empty -m "feat: clean"
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"single-author: OK"* ]]
}

@test "checks every PR commit, not just the tip" {
  git checkout -q -b feature
  coauthored_commit "feat: middle" "X <x@e.com>"
  git commit -q --allow-empty -m "feat: tip clean"
  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
}

@test "honours CI_COMMIT_PULL_REQUEST_BASE_BRANCH for a non-main base" {
  git checkout -q -b release/v2
  git commit -q --allow-empty -m "release base"
  git push -q origin release/v2
  git checkout -q -b feature
  git commit -q --allow-empty -m "feat: clean"
  CI_COMMIT_PULL_REQUEST_BASE_BRANCH=release/v2 run bash "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "resolves base from origin/HEAD when the CI var is unset" {
  coauthored_commit "chore: dep" "bot <b@e.com>"
  git push -q origin main
  git checkout -q -b feature
  git commit -q --allow-empty -m "feat: clean"
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "falls back to a bounded history walk when the base ref is unresolvable" {
  git checkout -q -b feature
  git commit -q --allow-empty -m "feat: clean"
  CI_COMMIT_PULL_REQUEST_BASE_BRANCH=does-not-exist run bash "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "fallback still catches a trailer when the base ref is unresolvable" {
  git checkout -q -b feature
  coauthored_commit "feat: x" "Y <y@e.com>"
  CI_COMMIT_PULL_REQUEST_BASE_BRANCH=does-not-exist run bash "$SCRIPT"
  [ "$status" -eq 1 ]
}
