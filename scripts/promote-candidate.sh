#!/usr/bin/env bash
# promote-candidate.sh v2 — P0-1 release-integrity (BUILD-PLAN-2026-08-23).
#
# Promotion merges the EXACT verified commit SHA, never a mutable branch ref.
# Every receipt invariant is RE-COMPUTED here; any drift = refusal.
#
# Invariants enforced:
#   receipt.result == PASS
#   receipt.run_id == requested run
#   branch head  == receipt.candidate_commit      (TOCTOU guard)
#   candidate_commit descends from receipt.base_commit
#   sha256(spec.md)            == receipt.spec_digest
#   frozen acceptance digest   == receipt.acceptance_digest
#   single-flight lock per run (concurrent promotion refused)
set -u

RUN_ID=${1:?usage: promote-candidate.sh <run_id>}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${FACTORY_REPO:-/root/unbundled}"
RUNS_ROOT="${FACTORY_RUNS_DIR:-$ROOT/runtime/build-runs}"
RUN_DIR="$RUNS_ROOT/$RUN_ID"
ACCEPTANCE_ROOT="${FACTORY_ACCEPTANCE_DIR:-$ROOT/acceptance}"

refuse() { echo "REFUSED: $*" >&2; exit 1; }
err3()  { echo "ERROR: $*" >&2; exit 3; }

[ -f "$RUN_DIR/receipt.json" ] || { echo "no receipt for $RUN_ID" >&2; exit 2; }
[ -f "$RUN_DIR/run.json" ] || refuse "run.json missing — cannot verify idea binding"
if [ -f "$RUN_DIR/run.json.status" ]; then
  LAST=$(grep -o '"status":"[A-Z_]*"' "$RUN_DIR/run.json.status" | tail -1 | cut -d'"' -f4)
  [ "$LAST" = "PROMOTED" ] && refuse "already PROMOTED (idempotency)"
fi

# single-flight lock (atomic mkdir)
LOCK="$RUN_DIR/.promote-lock"
mkdir "$LOCK" 2>/dev/null || refuse "promotion already in progress for $RUN_ID"
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

read -r RECEIPT_RUN RESULT CANDIDATE BASE SPEC_DIGEST ACC_DIGEST < <(python3 - <<PY
import json
r = json.load(open("$RUN_DIR/receipt.json"))
print(r.get("run_id",""), r.get("result",""), r.get("candidate_commit",""), r.get("base_commit",""), r.get("spec_digest",""), r.get("acceptance_digest",""))
PY
) || err3 "unreadable receipt"

[ "$RECEIPT_RUN" = "$RUN_ID" ] || refuse "receipt run_id mismatch ($RECEIPT_RUN != $RUN_ID)"
[ "$RESULT" = "PASS" ] || refuse "receipt result=$RESULT (promotion requires PASS)"
[ -n "$CANDIDATE" ] || refuse "receipt missing candidate_commit"

# TOCTOU guard: the branch must STILL point at the verified SHA
BRANCH_HEAD=$(git -C "$REPO" rev-parse "build/$RUN_ID" 2>/dev/null) || refuse "branch build/$RUN_ID gone"
[ "$BRANCH_HEAD" = "$CANDIDATE" ] || refuse "branch moved: head=$BRANCH_HEAD != verified=$CANDIDATE (TOCTOU)"

git -C "$REPO" merge-base --is-ancestor "$BASE" "$CANDIDATE" || refuse "candidate does not descend from base_commit"

# recompute digests from live artifacts
SPEC_RECOMPUTED=$(sha256sum "$RUN_DIR/spec.md" | cut -d' ' -f1) || err3 "spec.md missing"
[ "$SPEC_RECOMPUTED" = "$SPEC_DIGEST" ] || refuse "spec mutated since verification"
IDEA_ID=$(python3 -c "import json;print(json.load(open('$RUN_DIR/run.json'))['idea_id'])")
ACC_RECOMPUTED=$(find "$ACCEPTANCE_ROOT/$IDEA_ID" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)
[ "$ACC_RECOMPUTED" = "$ACC_DIGEST" ] || refuse "acceptance suite mutated since verification"

# merge the EXACT verified object, not the ref
git -C "$REPO" merge --no-ff -q "$CANDIDATE" -m "PROMOTE $RUN_ID at $CANDIDATE (verified by receipt)" || {
  git -C "$REPO" merge --abort 2>/dev/null;
  echo "{\"status\":\"PROMOTION_FAILED\",\"at\":\"$(date -u +%FT%TZ)\"}" >> "$RUN_DIR/run.json.status";
  err3 "merge conflict/failed — aborted, main untouched"; }

echo "{\"status\":\"PROMOTED\",\"at\":\"$(date -u +%FT%TZ)\",\"candidate\":\"$CANDIDATE\"}" >> "$RUN_DIR/run.json.status"
git -C "$REPO" worktree remove --force "${FACTORY_WORKTREES:-/root/unbundled/worktrees}/$RUN_ID" 2>/dev/null || true
echo "PROMOTED $RUN_ID at EXACT $CANDIDATE"
