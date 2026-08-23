# BUILD NOTES — 2026-08-23

*Session: completing the full autonomous build stack (foundry → builder → deploy → observe).*

## Provider recovery (root cause of all builder failures)
- zen workspace had $0 balance; every hermes builder + agentbuild build died with CreditsError.
- New OPENCODE_GO_API_KEY installed; model hardset to `ox-alpha-free` everywhere:
  root config.yaml, profiles {builder,qdw,patala}, no fallback providers registered.
- Verified: `hermes chat --cli` returns WIRING-OK via opencode-go/ox-alpha-free.

## Stack changes this session
1. Act loop CLOSED: scripts/dispatch-repair.sh bridges outbox repair briefs -> hermes kanban board `fleet`.
   - REPAIR_CMD set in .env; idempotency-key = repair-<task_id> (re-dispatch safe).
   - 4 backlog briefs dispatched as t_3b5470e7 / t_db539c04 / t_ae4a4065 / t_f094a439.
2. agentbuild2 reconfigured for openrouter then settled on opencode-go/ox-alpha-free.
3. Live smoke run-20260823T014708Z-9b203c: machinery PROVEN (3 retries w/ session continuation,
   2 repair loops, sandbox restart fallback, honest release-gate FAIL, 39 events spooled to foundry).
   Failed only on provider credits — re-running now that key works.

## In flight
- agentbuild direct-mode smoke #2 (target: release_passed=true)
- unblocking 8 blocked unbundled kanban tasks
