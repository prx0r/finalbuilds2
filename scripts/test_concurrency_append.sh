#!/usr/bin/env bash
# Concurrency torture for JsonlEventStore appends (P2).
# 6 workers x 25 events on ONE file; workers 3 and 5 get SIGKILLed mid-flight.
# Post-conditions: all acknowledged ids present exactly once; every line parses.
set -u
cd "$(dirname "$0")/.."
D=$(mktemp -d /tmp/conc.XXXXXX); F="$D/events.jsonl"
WORKERS=6; COUNT=25
PIDS=""
for w in 1 2 3 4 5 6; do
  DIE=""
  [ "$w" = "3" ] && DIE=$((RANDOM % 10 + 8))
  [ "$w" = "5" ] && DIE=$((RANDOM % 15 + 12))
  node scripts/conc-worker.cjs "$F" "w$w" $COUNT $DIE >/dev/null 2>&1 &
  PIDS="$PIDS $!"
done
wait $PIDS 2>/dev/null

FAIL=0
# every line parses
BAD=$(node -e "
const fs=require('fs');let bad=0,tot=0;
const ls=fs.readFileSync('$F','utf8').split('\n').filter(Boolean);
for(const l of ls){tot++;try{JSON.parse(l)}catch{bad++}}
console.log(bad);" 2>/dev/null || echo PARSE_ERR)
[ "$BAD" = "0" ] && echo "ok   - all lines parse" || { echo "FAIL - $BAD unparsable lines"; FAIL=1; }

# acked exactly once
DUP=$(node -e "
const fs=require('fs');
let acks=[];
try{acks=fs.readFileSync('$F.acks','utf8').split('\n').filter(Boolean)}catch{}
const seen=new Set(); let dup=0,missing=0;
const ls=fs.readFileSync('$F','utf8').split('\n').filter(Boolean);
for(const l of ls){try{const e=JSON.parse(l);const k=e.payload.wid+':'+e.payload.i;
  if(seen.has(k))dup++; seen.add(k);}catch{}}
for(const a of acks) if(!seen.has(a)) missing++;
console.log('dup='+dup+' missing_acked='+missing);" 2>/dev/null)
echo "$DUP" | grep -q "dup=0 missing_acked=0" && echo "ok   - acked events exactly-once ($DUP)" || { echo "FAIL - $DUP"; FAIL=1; }

rm -rf "$D"
[ $FAIL -eq 0 ] && echo "concurrency torture: PASS" || echo "concurrency torture: FAILED"
exit $FAIL
