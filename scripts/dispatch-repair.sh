#!/usr/bin/env bash
# dispatch-repair.sh — hand a repair brief to the hermes fleet board.
# Called by outbox-consumer via REPAIR_CMD="<this script>" with the brief path as $1.
# Idempotent: hermes idempotency-key = repair-<task_id>, so consumer-state resets
# or outbox replays cannot duplicate tasks.
set -euo pipefail

BRIEF="${1:?usage: dispatch-repair.sh <brief.md>}"
BOARD="${REPAIR_BOARD:-fleet}"

TASK_ID="$(basename "$BRIEF" .md)"
SITE="$(grep -m1 -- '- Site:' "$BRIEF" | awk '{print $3}')"
STD="$(grep -m1 -- '- Standard:' "$BRIEF" | awk '{print $3}' | cut -d' ' -f1)"
SITE_SHORT="${SITE#site_}"

TITLE="[repair:${SITE_SHORT}] ${STD:-drift}"

hermes kanban --board "$BOARD" create "$TITLE" \
  --body "$(cat "$BRIEF")"$'\n\n'"## Completion contract"$'\n'"When done, re-run from /root/finalbuilds2:"$'\n'"node scripts/observe-sites.mjs && node scripts/conformance.mjs"$'\n'"Report conformance PASS for ${SITE} via kanban_complete." \
  --idempotency-key "repair-${TASK_ID}" \
  >/dev/null

echo "dispatched ${TASK_ID} -> kanban:${BOARD} (${TITLE})"
