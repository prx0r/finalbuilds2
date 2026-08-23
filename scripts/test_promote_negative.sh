#!/usr/bin/env bash
# test_promote_negative.sh — P0-1 adversarial suite (temp repos, no shared state).
# The release boundary must refuse every forged/raced promotion path.
ENV_DIR=""
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROMOTE="$ROOT/scripts/promote-candidate.sh"
PASS=0; FAIL=0

t() { local name=$1 want=$2; shift 2; local got=0; "$@" >/dev/null 2>&1 || got=$?
  if [ "$got" -eq "$want" ]; then PASS=$((PASS+1)); echo "ok   - $name";
  else FAIL=$((FAIL+1)); echo "FAIL - $name (want exit=$want got=$got)"; fi; }

setup_env() {
  local D; D=$(mktemp -d /tmp/promo_neg.XXXXXX); ENV_DIR="$D"
  export FACTORY_REPO="$D/repo" FACTORY_WORKTREES="$D/wt" FACTORY_RUNS_DIR="$D/fb/runtime/build-runs" FACTORY_ACCEPTANCE_DIR="$D/fb/acceptance"
  mkdir -p "$FACTORY_REPO" "$FACTORY_WORKTREES" "$D/fb/runtime/build-runs/run_x" "$D/fb/acceptance/idea_x"
  echo '{"idea_id":"idea_x"}' > "$D/fb/runtime/build-runs/run_x/run.json"
  git -C "$FACTORY_REPO" init -q -b main
  git -C "$FACTORY_REPO" config user.email t@t; git -C "$FACTORY_REPO" config user.name t
  echo base > "$FACTORY_REPO/base.txt"; git -C "$FACTORY_REPO" add .; git -C "$FACTORY_REPO" commit -qm base
  echo "BASE=$(git -C $FACTORY_REPO rev-parse HEAD)" > "$D/env"
  echo x > "$D/fb/runtime/build-runs/run_x/spec.md"
  ACCD=$(find "$D/fb/acceptance/idea_x" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)
  echo "ACCD=$ACCD" >> "$D/env"
  echo "$D"
}

write_receipt() { # D candidate_commit result
  python3 - "$1" "$2" "$3" <<'PY'
import json, sys, hashlib, os
d, cand, result = sys.argv[1], sys.argv[2], sys.argv[3]
env = dict(l.strip().split("=",1) for l in open(f"{d}/env") if l.strip())
spec_digest = hashlib.sha256(open(f"{d}/fb/runtime/build-runs/run_x/spec.md","rb").read()).hexdigest()
json.dump({"run_id":"run_x","result":result,"candidate_commit":cand,
           "base_commit":env["BASE"],"spec_digest":spec_digest,"acceptance_digest":env["ACCD"]},
          open(f"{d}/fb/runtime/build-runs/run_x/receipt.json","w"))
PY
}

promote_in() { # D -> runs promote with ROOT pointed at fake fb tree
  local D=$1
  ( cd "$D/fb" && bash "$PROMOTE" run_x )
}

# --- happy path: verify C, promote C -----------------------------------------
setup_env; D=$ENV_DIR
git -C "$FACTORY_REPO" checkout -qb build/run_x
echo impl > "$FACTORY_REPO/naming.py"; git -C "$FACTORY_REPO" add .; git -C "$FACTORY_REPO" commit -qm cand
C=$(git -C "$FACTORY_REPO" rev-parse build/run_x)
write_receipt "$D" "$C" PASS
t "PASS receipt + intact branch promotes" 0 promote_in "$D"
rm -rf "$D"

# --- THE TOCTOU CASE: branch moves to D after verification --------------------
setup_env; D=$ENV_DIR
git -C "$FACTORY_REPO" checkout -qb build/run_x
echo impl > "$FACTORY_REPO/naming.py"; git -C "$FACTORY_REPO" add .; git -C "$FACTORY_REPO" commit -qm cand
C=$(git -C "$FACTORY_REPO" rev-parse build/run_x)
echo sneaky >> "$FACTORY_REPO/naming.py"; git -C "$FACTORY_REPO" commit -qam "post-verify move to D"
D_SHA=$(git -C "$FACTORY_REPO" rev-parse build/run_x)
[ "$D_SHA" != "$C" ] || { echo "test setup broken"; exit 9; }
write_receipt "$D" "$C" PASS   # receipt still attests the OLD verified SHA
MAIN_BEFORE=$(git -C "$FACTORY_REPO" rev-parse main)
t "moved-branch promotion REFUSED (TOCTOU)" 1 promote_in "$D"
[ "$(git -C "$FACTORY_REPO" rev-parse main)" = "$MAIN_BEFORE" ] && { PASS=$((PASS+1)); echo "ok   - main untouched after refusal"; } || { FAIL=$((FAIL+1)); echo "FAIL - main advanced despite refusal!"; }
rm -rf "$D"

# --- forged receipt pointing at unverified SHA -------------------------------
setup_env; D=$ENV_DIR
git -C "$FACTORY_REPO" checkout -qb build/run_x
echo impl > "$FACTORY_REPO/naming.py"; git -C "$FACTORY_REPO" add .; git -C "$FACTORY_REPO" commit -qm cand
C=$(git -C "$FACTORY_REPO" rev-parse build/run_x)
FORGED=$(python3 -c "c='$C'; d=str((int(c[0],16)+1)%16); print(d+c[1:])")
write_receipt "$D" "$FORGED" PASS
t "forged candidate SHA refused" 1 promote_in "$D"
rm -rf "$D"

# --- non-PASS receipt ----------------------------------------------------------
setup_env; D=$ENV_DIR
git -C "$FACTORY_REPO" checkout -qb build/run_x
echo impl > "$FACTORY_REPO/naming.py"; git -C "$FACTORY_REPO" add .; git -C "$FACTORY_REPO" commit -qm cand
C=$(git -C "$FACTORY_REPO" rev-parse build/run_x)
write_receipt "$D" "$C" FAIL
t "FAIL receipt refused" 1 promote_in "$D"
rm -rf "$D"

# --- mutated spec since verification -------------------------------------------
setup_env; D=$ENV_DIR
git -C "$FACTORY_REPO" checkout -qb build/run_x
echo impl > "$FACTORY_REPO/naming.py"; git -C "$FACTORY_REPO" add .; git -C "$FACTORY_REPO" commit -qm cand
C=$(git -C "$FACTORY_REPO" rev-parse build/run_x)
write_receipt "$D" "$C" PASS
echo "tampered spec" >> "$D/fb/runtime/build-runs/run_x/spec.md"
t "mutated spec refused" 1 promote_in "$D"
rm -rf "$D"

# --- concurrent promotions (lock) ----------------------------------------------
setup_env; D=$ENV_DIR
git -C "$FACTORY_REPO" checkout -qb build/run_x
echo impl > "$FACTORY_REPO/naming.py"; git -C "$FACTORY_REPO" add .; git -C "$FACTORY_REPO" commit -qm cand
C=$(git -C "$FACTORY_REPO" rev-parse build/run_x)
write_receipt "$D" "$C" PASS
mkdir "$D/fb/runtime/build-runs/run_x/.promote-lock"   # simulate in-flight promotion
t "concurrent promotion refused (lock held)" 1 promote_in "$D"
rm -rf "$D"

# --- double promotion (second must fail cleanly) ---------------------------------
setup_env; D=$ENV_DIR
git -C "$FACTORY_REPO" checkout -qb build/run_x
echo impl > "$FACTORY_REPO/naming.py"; git -C "$FACTORY_REPO" add .; git -C "$FACTORY_REPO" commit -qm cand
C=$(git -C "$FACTORY_REPO" rev-parse build/run_x)
write_receipt "$D" "$C" PASS
promote_in "$D" >/dev/null 2>&1
t "second promotion refuses (branch deleted post-promote)" 1 promote_in "$D"
rm -rf "$D"

echo
echo "promote-negative: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
