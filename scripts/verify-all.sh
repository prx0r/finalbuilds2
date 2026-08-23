#!/usr/bin/env bash
# verify-all.sh — THE single validation command (review P1 step 2).
# Runs every meaningful suite; CI must call exactly this. Exit nonzero = fail.
set -u
cd "$(dirname "$0")/.."
FAILED=0
step() { local name=$1; shift; echo "--- $name"; if "$@" >/tmp/va-$$.log 2>&1; then echo "ok   $name"; else echo "FAIL $name (see /tmp/va-$$.log)"; FAILED=1; fi }

step "node-unit"            npm test --silent
step "hypothesis-contracts" node --test test/hypothesis-contracts.test.js
step "promote-negative"     bash scripts/test_promote_negative.sh
step "verify-negative"      bash scripts/test_verify_negative.sh
step "resolution-synthetic" node scripts/test_resolution_synthetic.mjs
step "schema-validation"    bash -c 'for f in schemas/*.json contracts/hypotheses/*.schema.json; do python3 -m json.tool "$f" >/dev/null || exit 1; done'
step "platform-pytest"      bash -c 'cd /root/unbundled && python3 -m pytest platform/tests -q'
step "postbuild-negative"   bash /root/unbundled/scripts/test_post_build_negative.sh

echo
[ "$FAILED" -eq 0 ] && echo "verify-all: ALL GREEN" || echo "verify-all: FAILURES PRESENT"
exit $FAILED
