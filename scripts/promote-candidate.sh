#!/usr/bin/env bash
# promote-candidate.sh — consume a VerificationReceipt; PROMOTED only on PASS.
# Merge is --no-ff so the candidate branch stays inspectable in history.
# Usage: promote-candidate.sh <run_id>
set -u

RUN_ID=${1:?usage: promote-candidate.sh <run_id>}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${FACTORY_REPO:-/root/unbundled}"
RUN_DIR="$ROOT/runtime/build-runs/$RUN_ID"

[ -f "$RUN_DIR/receipt.json" ] || { echo "no receipt for $RUN_ID — run verify-candidate.sh first" >&2; exit 2; }
RESULT=$(python3 -c "import json;print(json.load(open('$RUN_DIR/receipt.json'))['result'])")
[ "$RESULT" = "PASS" ] || { echo "REFUSED: receipt result=$RESULT (promotion requires PASS)" >&2; exit 1; }

CANDIDATE_COMMIT=$(python3 -c "import json;print(json.load(open('$RUN_DIR/receipt.json'))['candidate_commit'])")
git -C "$REPO" rev-parse --verify -q "$CANDIDATE_COMMIT" >/dev/null || { echo "candidate commit not reachable" >&2; exit 3; }

git -C "$REPO" merge --no-ff -q "build/$RUN_ID" -m "PROMOTE $RUN_ID (verified: receipt $RUN_ID/receipt.json)" || { echo "merge failed" >&2; exit 4; }
echo "{\"status\":\"PROMOTED\",\"at\":\"$(date -u +%FT%TZ)\"}" >> "$RUN_DIR/run.json.status"
git -C "$REPO" worktree remove --force "${FACTORY_WORKTREES:-/root/unbundled/worktrees}/$RUN_ID" 2>/dev/null || true
echo "PROMOTED $RUN_ID at $CANDIDATE_COMMIT"
