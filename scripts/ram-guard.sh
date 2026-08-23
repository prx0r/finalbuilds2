#!/usr/bin/env bash
# ram-guard.sh — log RAM headroom; clean only THIS lane's junk when tight.
# Cron: */10. Never touches other agents' processes (no pkill, no pattern kills).
set -u
LOG=/root/finalbuilds2/runtime/logs/ram.log
AVAIL_MB=$(free -m | awk '/^Mem:/{print $7}')
TS=$(date -u +%FT%TZ)

if [ "$AVAIL_MB" -lt 500 ]; then
  # Emergency cleanup: stale /tmp/opencode artifacts >1h old (this lane's scratch)
  find /tmp/opencode -type f -mmin +60 -delete 2>/dev/null
  # Rotate fat logs in this lane's runtime (keep last 5MB of each)
  for f in /root/finalbuilds2/runtime/*.log; do
    [ -f "$f" ] || continue
    SZ=$(stat -c%s "$f" 2>/dev/null || echo 0)
    if [ "$SZ" -gt 5242880 ]; then tail -c 1048576 "$f" > "$f.tmp" && mv "$f.tmp" "$f"; fi
  done
  sync
  echo 3 > /proc/sys/vm/drop_caches 2>/dev/null
  AVAIL_MB=$(free -m | awk '/^Mem:/{print $7}')
  echo "$TS WARN cleaned avail=${AVAIL_MB}MB" >> "$LOG"
elif [ "$AVAIL_MB" -lt 800 ]; then
  echo "$TS TIGHT avail=${AVAIL_MB}MB" >> "$LOG"
else
  echo "$TS OK avail=${AVAIL_MB}MB" >> "$LOG"
fi
