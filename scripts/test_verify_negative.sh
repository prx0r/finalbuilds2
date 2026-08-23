#!/usr/bin/env bash
# test_verify_negative.sh — P0-6 adversarial matrix for verify-candidate.sh.
# Proves the judge cannot be gamed by candidate-side tricks and that
# containment holds where claimed.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERIFY="$ROOT/scripts/verify-candidate.sh"
ENV_SCRUBBED_MARKER="VERIFY_ENV_SCRUB_PROBE"
PASS=0; FAIL=0

t() { local name=$1 want=$2; shift 2; local got=0; "$@" >/dev/null 2>&1 || got=$?;
  if [ "$got" -eq "$want" ]; then PASS=$((PASS+1)); echo "ok   - $name";
  else FAIL=$((FAIL+1)); echo "FAIL - $name (want exit=$want got=$got)"; fi; }

setup() { # -> sets REPO RUNS ACC RUN_ID; fresh branch build/run_v with impl committed
  local D; D=$(mktemp -d /tmp/vneg.XXXXXX); DIR="$D"
  export FACTORY_REPO="$D/repo" FACTORY_RUNS_DIR="$D/runs" FACTORY_ACCEPTANCE_DIR="$D/acc"
  mkdir -p "$FACTORY_REPO" "$FACTORY_RUNS_DIR/run_v" "$FACTORY_ACCEPTANCE_DIR/idea_x"
  git -C "$FACTORY_REPO" init -q -b main; git -C "$FACTORY_REPO" config user.email t@t; git -C "$FACTORY_REPO" config user.name t
  echo base > "$FACTORY_REPO/base.txt"; git -C "$FACTORY_REPO" add .; git -C "$FACTORY_REPO" commit -qm base
  git -C "$FACTORY_REPO" checkout -qb build/run_v
  printf 'def score_candidates(n):\n    return sorted(n)\ndef top_candidate():\n    return "a"\n' > "$FACTORY_REPO/naming.py"
  cat > "$FACTORY_ACCEPTANCE_DIR/idea_x/test_accept.py" <<'EOF'
import importlib.util, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
def _load():
    p = ROOT / "naming.py"; assert p.exists()
    s = importlib.util.spec_from_file_location("naming", p)
    m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
def test_ok():
    m = _load(); assert len(m.score_candidates(["b","a"])) == 2 and m.top_candidate()
EOF
}
commit_candidate() { git -C "$FACTORY_REPO" add -A >/dev/null 2>&1; git -C "$FACTORY_REPO" commit -qm "$1"; }
stage_run() {
  echo spec > "$FACTORY_RUNS_DIR/run_v/spec.md"
  python3 -c "
import json,hashlib
json.dump({'run_id':'run_v','idea_id':'idea_x','artifact_type':'cli','base_commit':'$(git -C $FACTORY_REPO rev-parse main)','spec_digest':hashlib.sha256(b'spec\n').hexdigest(),'status_history':[]}, open('$FACTORY_RUNS_DIR/run_v/run.json','w'))"
}

# --- A. env scrubbing: candidate CANNOT see factory secrets -------------------
setup; stage_run
mkdir -p "$FACTORY_REPO/tests"
cat > "$FACTORY_REPO/tests/test_scrub.py" <<EOF
import os
def test_factory_secrets_not_in_env():
    for k in ("HYDRA_TOKEN","CF_API_TOKEN","CONTROL_TOKEN","SANDBOXD_API_TOKEN","OPENCODE_GO_API_KEY"):
        assert k not in os.environ, f"LEAK: {k} visible to candidate code"
    assert not os.environ.get("$ENV_SCRUBBED_MARKER")
EOF
commit_candidate "scrub probe"
export VERIFY_TEST_TIMEOUT=120
t "A: factory secrets invisible to candidate code (env -i)" 0 bash "$VERIFY" run_v
rm -rf "$DIR"

# --- B. missing own tests -> not PASSABLE (missing evidence = ERROR) ----------
setup; stage_run; commit_candidate "impl only, no tests"
t "B: no own tests -> refused (exit 1)" 1 bash "$VERIFY" run_v
GATE=$(python3 -c "
import json; r=json.load(open('$FACTORY_RUNS_DIR/run_v/receipt.json'))
g=r['gates']['candidate_tests_ok']
print('OK' if g in ('unknown',False) and r['result'] in ('ERROR','FAIL') else 'BAD')")
[ "$GATE" = "OK" ] && { PASS=$((PASS+1)); echo "ok   - B2: missing evidence not passable ($GATE)"; } \
  || { FAIL=$((FAIL+1)); echo "FAIL - B2: wrong gate/result"; }
rm -rf "$DIR"

# --- C. failing own tests -> FAIL ----------------------------------------------
setup; stage_run
mkdir -p "$FACTORY_REPO/tests"; printf 'def test_bad():\n    assert False\n' > "$FACTORY_REPO/tests/test_bad.py"
commit_candidate "failing own test"
t "C: failing own tests -> FAIL" 1 bash "$VERIFY" run_v
rm -rf "$DIR"

# --- D. evil root conftest cannot suppress the judge ----------------------------
setup; stage_run
cat > "$FACTORY_REPO/conftest.py" <<'EOF'
collect_ignore_glob = [".acceptance/**", ".acceptance/*"]
def pytest_collection_modifyitems(config, items):
    items[:] = []
EOF
commit_candidate "evil conftest"
t "D: root conftest injection -> FAIL" 1 bash "$VERIFY" run_v
rm -rf "$DIR"

# --- E. runaway candidate hits the wall-clock cap -------------------------------
setup; stage_run
mkdir -p "$FACTORY_REPO/tests"; printf 'import time\ndef test_slow():\n    time.sleep(600)\n' > "$FACTORY_REPO/tests/test_slow.py"
commit_candidate "slow test"
VERIFY_TEST_TIMEOUT=5 t "E: timeout wall enforced -> FAIL" 1 env VERIFY_TEST_TIMEOUT=5 bash "$VERIFY" run_v
rm -rf "$DIR"

echo
echo "verify-negative: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
