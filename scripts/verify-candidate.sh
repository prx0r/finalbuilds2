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
RUNS_ROOT="${FACTORY_RUNS_DIR:-$ROOT/runtime/build-runs}"
RUN_DIR="$RUNS_ROOT/$RUN_ID"
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
ACCEPT_DIR="${FACTORY_ACCEPTANCE_DIR:-$ROOT/acceptance}/$IDEA_ID"
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

# P0-2 containment: candidate code runs with a SCRUBBED environment — no
# factory/CF/Hydra/git credentials are visible to anything pytest imports.
VERIFY_TEST_TIMEOUT=${VERIFY_TEST_TIMEOUT:-180}
run_pytest() { # <log> <target...>
  local log=$1; shift
  timeout "$VERIFY_TEST_TIMEOUT" env -i PATH="/usr/local/bin:/usr/bin:/bin" HOME="$CLONE" LANG=C.UTF-8 \
    PYTHONDONTWRITEBYTECODE=1 TMPDIR="$CLONE/.tmp" \
    "$PYBIN" -m "$@" >"$log" 2>&1
}
mkdir -p "$CLONE/.tmp"
# anti-gaming: candidate-owned pytest hook/config files must not influence the judge
rm -f "$CLONE/conftest.py" "$CLONE/pytest.ini" "$CLONE/setup.cfg" "$CLONE/tox.ini"
rm -rf "$CLONE/.pytest_cache"

ACC_LOG="$(mktemp)"; run_pytest "$ACC_LOG" pytest .acceptance -q --tb=short; ACC_EXIT=$?
tail -n 5 "$ACC_LOG" >&2

if [ -d tests ]; then OWN_LOG="$(mktemp)"; run_pytest "$OWN_LOG" pytest tests -q --tb=short; OWN_EXIT=$?; else OWN_EXIT=-1; OWN_LOG="/dev/null"; fi

SRC_COUNT=$(find . -path ./.acceptance -prune -o -type f \( -name '*.py' -o -name '*.rs' -o -name '*.js' -o -name '*.ts' -o -name '*.go' \) -print | wc -l)

# P4 artifact recipes: per-type truthfulness (no mandatory web/sqlite/mcp per type)
ARTIFACT_TYPE=$("$PYBIN" -c "import json;print(json.load(open('$RUN_DIR/run.json')).get('artifact_type','cli'))")
case "$ARTIFACT_TYPE" in
  site|webapp)
    # EDGE SITE SHAPE (Astro/static): builds cleanly + emits browsable output
    if [ -f package.json ]; then
      npm install --no-audit --no-fund >"$CLONE/.build.log" 2>&1
      BUILD_EXIT=$?
      npm run build >>"$CLONE/.build.log" 2>&1 || npm run build:prod >>"$CLONE/.build.log" 2>&1
      BUILD_EXIT=$?
      [ $BUILD_EXIT -ne 0 ] && { echo "site build failed"; BUILD_FAIL=1; }
      DIST_DIR=""
      for d in dist build out public .; do [ -f "$CLONE/$d/index.html" ] && DIST_DIR="$d" && break; done
      if [ -z "$DIST_DIR" ]; then echo "no index.html emitted"; BUILD_FAIL=1; fi
    fi
    TYPE_OK=$([ "${BUILD_FAIL:-0}" = "0" ] && echo 1 || echo 0) ;;
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

# --- VerificationReceipt v3 (P0-3): gate map, missing evidence = ERROR --------
# candidate_tests_ok is REQUIRED for code artifact classes — a PASS without
# the candidate's own tests is the exact false-pass regression this closes.
case "$ARTIFACT_TYPE" in
  web|static-site|webapp) TESTS_REQUIRED=0 ;;   # journey/build gates land with P4
  *)                       TESTS_REQUIRED=1 ;;
esac

RESULT="$RESULT" RUN_DIR="$RUN_DIR" RUN_ID="$RUN_ID" BASE_COMMIT="$BASE_COMMIT" CANDIDATE_COMMIT="$CANDIDATE_COMMIT" \
SPEC_DIGEST="$SPEC_DIGEST" ACCEPTANCE_DIGEST="$ACCEPTANCE_DIGEST" VERIFIER_VERSION="3.0.0" \
IDEA_ID="$IDEA_ID" ARTIFACT_TYPE="$ARTIFACT_TYPE" TESTS_REQUIRED="$TESTS_REQUIRED" TYPE_OK="${TYPE_OK:-0}" \
ACC_EXIT="$ACC_EXIT" ACC_LOG="$ACC_LOG" OWN_EXIT="$OWN_EXIT" OWN_LOG="$OWN_LOG" SRC_COUNT="$SRC_COUNT" \
ARTIFACT_DIGEST="$(git -C "$CLONE" rev-parse HEAD)" \
"$PYBIN" - <<'PY'
import json, hashlib, os, datetime
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(p):
    try: return hashlib.sha256(open(p,'rb').read()).hexdigest()
    except Exception: return None
own_exit = int(os.environ["OWN_EXIT"]); tests_required = os.environ["TESTS_REQUIRED"] == "1"
candidate_tests = None if own_exit == -1 else (own_exit == 0)
gates = {
    "contract_ok": True,
    "acceptance_ok": int(os.environ["ACC_EXIT"]) == 0,
    "artifact_shape_ok": int(os.environ.get("TYPE_OK", "0")) == 1,
    "real_implementation_ok": int(os.environ["SRC_COUNT"]) >= 1,
    "candidate_tests_ok": ("not_applicable" if not tests_required
                           else "unknown" if candidate_tests is None
                           else candidate_tests),
}
required = {k: v for k, v in gates.items() if v != "not_applicable"}
if any(v is False for v in required.values()): result = "FAIL"
elif any(v == "unknown" for v in required.values()): result = "ERROR"
elif all(v is True for v in required.values()): result = "PASS"
else: result = "ERROR"

checks = [
    {"id": "acceptance", "command": "pytest .acceptance -q", "exit_code": int(os.environ["ACC_EXIT"]), "stdout_digest": digest(os.environ["ACC_LOG"])},
    {"id": "own-tests", "command": "pytest tests -q", "exit_code": int(os.environ["OWN_EXIT"]), "stdout_digest": digest(os.environ["OWN_LOG"])},
    {"id": "real-implementation", "command": "find source files", "exit_code": 0 if int(os.environ["SRC_COUNT"]) >= 1 else 1, "stdout_digest": None},
    {"id": "artifact-type-shape", "command": os.environ.get("ARTIFACT_TYPE","cli") + " shape check", "exit_code": int(os.environ.get("TYPE_OK","0")), "stdout_digest": None},
]
receipt = {
    "schema": "verification-receipt",
    "version": 3,
    "run_id": os.environ["RUN_ID"],
    "idea_id": os.environ.get("IDEA_ID", ""),
    "artifact_type": os.environ.get("ARTIFACT_TYPE", "cli"),
    "base_commit": os.environ["BASE_COMMIT"],
    "candidate_commit": os.environ["CANDIDATE_COMMIT"],
    "spec_digest": os.environ["SPEC_DIGEST"],
    "public_acceptance_digest": os.environ["ACCEPTANCE_DIGEST"],
    "hidden_challenge_commitment": None,
    "artifact_digest": os.environ["ARTIFACT_DIGEST"],
    "builder_identity": "hermes:builder@unbundled-board",
    "verifier_identity": f"verify-candidate.sh@{os.environ['VERIFIER_VERSION']}",
    "gates": gates,
    "checks": checks,
    "verifier_version": os.environ["VERIFIER_VERSION"],
    "started_at": now,
    "finished_at": now,
    "result": result,
}
open(os.path.join(os.environ.get("RUN_DIR", ""), "receipt.json"), "w").write(json.dumps(receipt, indent=2))
with open("/tmp/.v3_result", "w") as f: f.write(result)
PY
RESULT=$(cat /tmp/.v3_result 2>/dev/null || echo ERROR); rm -f /tmp/.v3_result
[ -f "$RUN_DIR/receipt.json" ] || fail_err "receipt write failed"
"$PYBIN" -c "
import json,sys
r=json.load(open('$RUN_DIR/receipt.json'))
assert r.get('result') == '$RESULT', f'receipt result mismatch: {r.get(\"result\")}'
assert 'checks' in r and r['checks'], 'receipt missing checks'
assert 'gates' in r and r['gates'], 'receipt missing gates'
" || fail_err "receipt validation failed"

echo "verdict: $RESULT (acceptance_exit=$ACC_EXIT own_exit=$OWN_EXIT src_files=$SRC_COUNT type=$ARTIFACT_TYPE tests_required=$TESTS_REQUIRED)"
[ "$RESULT" = "PASS" ] && exit 0 || exit 1
