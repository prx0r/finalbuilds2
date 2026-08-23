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

## SANDBOXD PIVOT (decision, 03:2x UTC)

sandboxd dropped from critical path: repeated sandbox_capacity/low_memory 503s +
hung create_sandbox while 8 builders + other agent's opencode sessions hold RAM.
The stack is now executor-agnostic per ABUSE.md ("Hermes Foundry executes"):

- FinalBuilds2 tick -> RouterDispatcher(FACTORY_DISPATCHER=workorder)
  -> WorkOrderDispatcher -> create-build-run.mjs:
    * immutable run.json (P2) + spec digest
    * git worktree + branch build/<run_id> (P3 isolation, zero docker)
    * admission gate: unscored idea OR missing frozen acceptance suite = denied
    * WorkOrder kanban task on unbundled board
- hermes builder implements in worktree, commits, kanban_complete
- supervisor.mjs cron (*/15): branch advanced + task not running ->
  verify-candidate.sh (clean clone, frozen suite, direct exit codes, digests)
  -> PASS: promote --no-ff merge; FAIL: rejected, branch kept as evidence
- health-probe.mjs (P6): 7-point startup gate, all green

## Lifecycle proven (run_test, 03:1x)
PASS candidate -> receipt -> PROMOTED (merge a09438e); BROKEN candidate ->
FAIL receipt -> promote REFUSED; repair commit -> re-verify -> PROMOTED.
Test artifacts kept under runtime/build-runs/run_test as evidence; test merge
reverted from main (history preserved).

## Honest gaps remaining
- P4 artifact recipes are implicit (cli-only checks in verifier) — need per-type
- P7 provider pool: single-key zen; CF Workers AI fallback noted by reviewer
- P9 registry_to_kanban still feeds old-pipeline tasks (frozen until milestone)
- e2e MILESTONE: waiting on live builder for run_mt58egkv_d7a886
