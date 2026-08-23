#!/usr/bin/env bash
# verify-candidate.sh — P8 independent verifier (DEV-PLAN-2026-08-23).
#
# Verifies a BuildRun candidate from CLEAN state: fresh clone of the candidate
# branch, frozen acceptance suite copied in, exit codes captured directly (no
# pipes decide anything). Writes VerificationReceipt.json. ERROR never maps to
# PASS; missing evidence never implies PASS.
#
# Usage: verify-candidate.sh <run_id>
# Exit:  0 = PASS   1 = FAIL   2 = usage/state errors   3 = verifier ERROR
set -u

RUN_ID=${1:?usage: verify-candidate.sh <run_id>}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${FACTORY_REPO:-/root/unbundled}"
RUN_DIR="$ROOT/runtime/build-runs/$RUN_ID"
BRANCH="build/$RUN_ID"
VERIFIER_VERSION="1.0.0"
PYBIN=${VERIFY_PYTHON:-python3}

fail_err() { echo "ERROR: $*" >&2; printf '{"run_id":"%s","result":"ERROR","reason":"%s"}\n' "$RUN_ID" "$*" > "$RUN_DIR/receipt.json"; exit 3; }

[ -d "$RUN_DIR" ] || { echo "no such run dir: $RUN_DIR" >&2; exit 2; }
[ -f "$RUN_DIR/run.json" ] || fail_err "run.json missing"
git -C "$REPO" rev-parse --verify -q "$BRANCH" >/dev/null || fail_err "branch missing: $BRANCH"

IDEA_ID=$("$PYBIN" -c "import json;print(json.load(open('$RUN_DIR/run.json'))['idea_id'])")
BASE_COMMIT=$("$PYBIN" -c "import json;print(json.load(open('$RUN_DIR/run.json'))['base_commit'])")
SPEC_DIGEST=$("$PYBIN" -c "import json;print(json.load(open('$RUN_DIR/run.json'))['spec_digest'])")
ACCEPT_DIR="$ROOT/acceptance/$IDEA_ID"
[ -d "$ACCEPT_DIR" ] || fail_err "no frozen acceptance suite for idea $IDEA_ID"

CLONE="$(mktemp -d /tmp/verify_${RUN_ID}.XXXXXX)"
trap 'rm -rf "$CLONE"' EXIT

# --- clean independent checkout -------------------------------------------
git clone -q --branch "$BRANCH" --single-branch "$REPO" "$CLONE" || fail_err "clone failed"
CANDIDATE_COMMIT=$(git -C "$CLONE" rev-parse HEAD)
ACCEPTANCE_DIGEST=$(find "$ACCEPT_DIR" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)

# --- run checks (exit captured directly) -------------------------------------
mkdir -p "$CLONE/.acceptance"
cp -r "$ACCEPT_DIR"/. "$CLONE/.acceptance/"
cd "$CLONE" || fail_err "cannot enter clone"

ACC_LOG="$(mktemp)"; "$PYBIN" -m pytest .acceptance -q --tb=short >"$ACC_LOG" 2>&1; ACC_EXIT=$?
tail -n 5 "$ACC_LOG" >&2

if [ -d tests ]; then OWN_LOG="$(mktemp)"; "$PYBIN" -m pytest tests -q --tb=short >"$OWN_LOG" 2>&1; OWN_EXIT=$?; else OWN_EXIT=-1; OWN_LOG="/dev/null"; fi

SRC_COUNT=$(find . -path ./.acceptance -prune -o -type f \( -name '*.py' -o -name '*.rs' -o -name '*.js' -o -name '*.ts' -o -name '*.go' \) -print | wc -l)

# P4 artifact recipes: per-type truthfulness (no mandatory web/sqlite/mcp per type)
ARTIFACT_TYPE=$("$PYBIN" -c "import json;print(json.load(open('$RUN_DIR/run.json')).get('artifact_type','cli'))")
case "$ARTIFACT_TYPE" in
  cli|library|benchmark)
    # any source file + acceptance suite suffices; own-tests optional
    TYPE_OK=1 ;;
  web)
    # needs a UI entrypoint; build check only if package.json present
    [ -f index.html ] || [ -f package.json ] || [ -f src/App.tsx ] && TYPE_OK=1 || TYPE_OK=0 ;;
  worker|api|mcp)
    # needs an HTTP/worker entrypoint or handler module
    ls *.py *.js *.ts >/dev/null 2>&1 && TYPE_OK=1 || { [ -d src ] || [ -d api ]; } && TYPE_OK=1 || TYPE_OK=0 ;;
  wasm)
    find . -name '*.rs' -o -name '*.wat' -o -name '*.wasm' | grep -q . && TYPE_OK=1 || TYPE_OK=0 ;;
  *)
    TYPE_OK=0 ;;
esac

if [ "$ACC_EXIT" -ne 0 ] || [ "${SRC_COUNT:-0}" -lt 1 ] || [ "${TYPE_OK:-0}" -ne 1 ]; then RESULT="FAIL"; else RESULT="PASS"; fi

# --- receipt -------------------------------------------------------------------
RESULT="$RESULT" RUN_DIR="$RUN_DIR" RUN_ID="$RUN_ID" BASE_COMMIT="$BASE_COMMIT" CANDIDATE_COMMIT="$CANDIDATE_COMMIT" \
SPEC_DIGEST="$SPEC_DIGEST" ACCEPTANCE_DIGEST="$ACCEPTANCE_DIGEST" VERIFIER_VERSION="$VERIFIER_VERSION" \
ACC_EXIT="$ACC_EXIT" ACC_LOG="$ACC_LOG" OWN_EXIT="$OWN_EXIT" OWN_LOG="$OWN_LOG" SRC_COUNT="$SRC_COUNT" \
ARTIFACT_DIGEST="$(git -C "$CLONE" rev-parse HEAD)" \
"$PYBIN" - <<'PY'
import json, hashlib, os, datetime
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(p):
    try: return hashlib.sha256(open(p,'rb').read()).hexdigest()
    except Exception: return None
checks = [
    {"id": "acceptance", "command": "pytest .acceptance -q", "exit_code": int(os.environ["ACC_EXIT"]), "stdout_digest": digest(os.environ["ACC_LOG"])},
    {"id": "own-tests", "command": "pytest tests -q", "exit_code": int(os.environ["OWN_EXIT"]), "stdout_digest": digest(os.environ["OWN_LOG"])},
    {"id": "real-implementation", "command": "find source files", "exit_code": 0 if int(os.environ["SRC_COUNT"]) >= 1 else 1, "stdout_digest": None},
    {"id": "artifact-type-shape", "command": os.environ.get("ARTIFACT_TYPE","cli") + " shape check", "exit_code": int(os.environ.get("TYPE_OK","0")), "stdout_digest": None},
]
receipt = {
    "run_id": os.environ["RUN_ID"],
    "base_commit": os.environ["BASE_COMMIT"],
    "candidate_commit": os.environ["CANDIDATE_COMMIT"],
    "spec_digest": os.environ["SPEC_DIGEST"],
    "acceptance_digest": os.environ["ACCEPTANCE_DIGEST"],
    "artifact_digest": os.environ["ARTIFACT_DIGEST"],
    "checks": checks,
    "verifier_version": os.environ["VERIFIER_VERSION"],
    "started_at": now,
    "finished_at": now,
    "result": os.environ["RESULT"],
}
open(os.path.join(os.environ.get("RUN_DIR", ""), "receipt.json"), "w").write(json.dumps(receipt, indent=2))
PY
[ -f "$RUN_DIR/receipt.json" ] || fail_err "receipt write failed"
"$PYBIN" -c "
import json,sys
r=json.load(open('$RUN_DIR/receipt.json'))
assert r.get('result') == '$RESULT', f'receipt result mismatch: {r.get(\"result\")}'
assert 'checks' in r and r['checks'], 'receipt missing checks'
" || fail_err "receipt validation failed"

echo "verdict: $RESULT (acceptance_exit=$ACC_EXIT own_exit=$OWN_EXIT src_files=$SRC_COUNT)"
[ "$RESULT" = "PASS" ] && exit 0 || exit 1
