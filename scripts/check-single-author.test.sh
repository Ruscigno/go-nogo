#!/usr/bin/env bash
# Unit tests for scripts/check-single-author.sh — plain bash, no test framework.
#
# Deliberately depends only on `bash` + `git` (the same footprint every other
# .woodpecker/pr.yml step already requires under the local backend, ADR-0003),
# so the single-author-tests CI step needs no extra tooling on the agent.
#
# Each case builds a throwaway repo with a real bare "origin", so the gate's git
# plumbing (fetch, rev-list, rev-parse, symbolic-ref) runs for real. Covers:
# clean PR pass, trailer detection (tip + intermediate commit), base-branch
# exclusion (the Dependabot regression — asserted on the *scanned set*, not just
# the exit code), all three base-name branches (CI var, origin/HEAD, literal
# "main") and the loud failure when the base ref can't be resolved.
set -eu   # -e so a failed setup command (e.g. `git push`) aborts instead of
          # running a case against a mis-configured repo (a false PASS).

SCRIPT="$(cd "$(dirname "$0")" && pwd)/check-single-author.sh"
fail=0
TMP=""

cleanup() { cd / 2>/dev/null || true; [ -n "${TMP:-}" ] && rm -rf "$TMP"; return 0; }
trap cleanup EXIT

mkrepo() {
  TMP="$(mktemp -d)"
  git init -q --bare "$TMP/remote.git"
  git clone -q "$TMP/remote.git" "$TMP/work" 2>/dev/null
  cd "$TMP/work" || exit 1
  git config user.email t@example.com
  git config user.name Tester
  git config commit.gpgsign false
  git commit -q --allow-empty -m "base"
  git branch -M main
  git push -q origin main
  git remote set-head origin main
  unset CI_COMMIT_PULL_REQUEST_BASE_BRANCH
}

# coauthored <subject> <author> — an empty commit whose body carries a trailer
coauthored() { printf '%s\n\nCo-authored-by: %s\n' "$1" "$2" | git commit -q --allow-empty -F -; }

# set -e is not inherited inside the `$(short …)` command sub, so guard rev-parse
# explicitly: a failure exits the sub non-zero, which aborts the (set -e) caller.
short() { local s; s="$(git rev-parse "$1")" || { echo "rev-parse failed: $1" >&2; exit 1; }; printf '%s' "${s:0:9}"; }

# expect <description> <want_exit> [must_contain] [must_NOT_contain]
expect() {
  local desc="$1" want="$2" inc="${3:-}" exc="${4:-}" out status okk=1
  # `if` keeps `set -e` from aborting on the gate's intended non-zero exits.
  if out="$(bash "$SCRIPT" 2>&1)"; then status=0; else status=$?; fi
  [ "$status" -eq "$want" ] || okk=0
  if [ -n "$inc" ] && ! printf '%s' "$out" | grep -qF "$inc"; then okk=0; fi
  if [ -n "$exc" ] &&   printf '%s' "$out" | grep -qF "$exc"; then okk=0; fi
  if [ "$okk" -eq 1 ]; then
    echo "ok   - $desc"
  else
    echo "FAIL - $desc (want exit $want, got $status; inc='$inc' exc='$exc')"
    printf '%s\n' "$out" | sed 's/^/       | /'
    fail=1
  fi
}

# --- cases -----------------------------------------------------------------

mkrepo
git checkout -q -b feature
git commit -q --allow-empty -m "feat: clean"
expect "clean single-commit PR passes" 0
cleanup

mkrepo
git checkout -q -b feature
coauthored "feat: x" "Someone <s@e.com>"
expect "PR commit with a Co-Authored-By trailer fails" 1
cleanup

# Headline regression: a co-authored commit on the base is excluded AND the
# feature commit is actually scanned (asserts the scanned set, so the test
# can't pass against a no-op gate that scans nothing).
mkrepo
coauthored "chore(deps): bump" "dependabot[bot] <bot@users.noreply.github.com>"
git push -q origin main
base_sha="$(short HEAD)"
git checkout -q -b feature
git commit -q --allow-empty -m "feat: clean"
feat_sha="$(short HEAD)"
expect "base co-authored commit excluded; feature commit IS scanned" 0 "$feat_sha" "$base_sha"
cleanup

mkrepo
git checkout -q -b feature
coauthored "feat: middle" "X <x@e.com>"
git commit -q --allow-empty -m "feat: tip clean"
expect "an intermediate (non-tip) trailer is caught" 1
cleanup

mkrepo
git checkout -q -b release/v2
git commit -q --allow-empty -m "release base"
git push -q origin release/v2
git checkout -q -b feature
git commit -q --allow-empty -m "feat: clean"
CI_COMMIT_PULL_REQUEST_BASE_BRANCH=release/v2
export CI_COMMIT_PULL_REQUEST_BASE_BRANCH
expect "branch 1: honours CI_COMMIT_PULL_REQUEST_BASE_BRANCH (non-main base)" 0
unset CI_COMMIT_PULL_REQUEST_BASE_BRANCH
cleanup

mkrepo
coauthored "chore: dep" "bot <b@e.com>"
git push -q origin main
git checkout -q -b feature
git commit -q --allow-empty -m "feat: clean"
expect "branch 2: resolves base from origin/HEAD when CI var is unset" 0
cleanup

# branch 3: CI var unset AND origin/HEAD removed -> base falls to literal "main".
# A co-authored commit sits on main, so a *broken* resolution would widen scope
# and trip — i.e. this passes only because base correctly resolves to main.
mkrepo
coauthored "chore: dep" "bot <b@e.com>"
git push -q origin main
git remote set-head origin --delete
git checkout -q -b feature
git commit -q --allow-empty -m "feat: clean"
expect "branch 3: falls back to literal 'main' when CI var unset and origin/HEAD missing" 0
cleanup

# Unresolvable base must FAIL LOUDLY, never silently widen to a history walk —
# which would re-trip on a base-branch co-authored commit (the original bug).
# Put a Dependabot commit on main and assert the failure is "can't resolve base",
# NOT "Co-Authored-By trailer": proves the history-walk regression stays dead.
mkrepo
coauthored "chore(deps): bump" "dependabot[bot] <bot@users.noreply.github.com>"
git push -q origin main
git checkout -q -b feature
git commit -q --allow-empty -m "feat: clean"
CI_COMMIT_PULL_REQUEST_BASE_BRANCH=does-not-exist
export CI_COMMIT_PULL_REQUEST_BASE_BRANCH
expect "unresolvable base fails loudly, not by tripping on a base commit" 1 "could not resolve base ref" "Co-Authored-By trailer"
unset CI_COMMIT_PULL_REQUEST_BASE_BRANCH
cleanup

# A PR branch deeper than the shallow-clone depth must FAIL LOUD, not silently
# under-scan. `file://` forces a real shallow clone (a bare local path would
# hardlink all objects and not be shallow).
mkrepo
git checkout -q -b feature
git commit -q --allow-empty -m f1
git commit -q --allow-empty -m f2
git commit -q --allow-empty -m f3
git push -q origin feature
feat_sha="$(git rev-parse HEAD)"
# Reproduce the CI clone: init + `git remote add` (full +refs/heads/* refspec, so
# `git fetch origin main` maps to origin/main) + a depth-1 fetch of the PR SHA.
SHALLOW="$TMP/shallow"
mkdir -p "$SHALLOW"
cd "$SHALLOW" || exit 1
git init -q
git remote add origin "file://$TMP/remote.git"
git fetch --depth=1 origin "$feat_sha" --quiet 2>/dev/null
git checkout -q FETCH_HEAD
CI_COMMIT_PULL_REQUEST_BASE_BRANCH=main
export CI_COMMIT_PULL_REQUEST_BASE_BRANCH
expect "shallow clone too shallow to reach base fails loudly" 1 "too shallow"
unset CI_COMMIT_PULL_REQUEST_BASE_BRANCH
cleanup

# A *normal* shallow PR — base within the clone depth — must PASS. This proves
# the shallow guard does not false-fire on every real (always-shallow) CI clone.
mkrepo
for i in 1 2 3 4 5 6 7 8 9; do git commit -q --allow-empty -m "m$i"; done
git push -q origin main
git checkout -q -b feature
git commit -q --allow-empty -m "feat: clean"
feat_sha="$(git rev-parse HEAD)"
git push -q origin feature
SHALLOW="$TMP/shallow2"
mkdir -p "$SHALLOW"
cd "$SHALLOW" || exit 1
git init -q
git remote add origin "file://$TMP/remote.git"
git fetch --depth=3 origin "$feat_sha" --quiet 2>/dev/null   # shallow, but base is reachable
git checkout -q FETCH_HEAD
CI_COMMIT_PULL_REQUEST_BASE_BRANCH=main
export CI_COMMIT_PULL_REQUEST_BASE_BRANCH
expect "shallow PR with reachable base passes (guard does not false-fire)" 0
unset CI_COMMIT_PULL_REQUEST_BASE_BRANCH
cleanup

# --- summary ---------------------------------------------------------------

if [ "$fail" -ne 0 ]; then
  echo "single-author tests: FAILED"
  exit 1
fi
echo "single-author tests: all passed"
