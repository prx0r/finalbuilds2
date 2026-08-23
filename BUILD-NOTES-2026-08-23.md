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

## 🎉 MILESTONE 03:5x UTC — first fully autonomous verified promotion
run_mt58egkv_d7a886 / idea_domain_intelligence:
IDEA(graph admission, score gate) → BuildRun(worktree+spec digest) → WorkOrder kanban
→ hermes builder committed b44565f (285-line domain_intelligence.py, RDAP provider,
explicit-UNKNOWN, 26 own tests) → supervisor detected completion → verify-candidate.sh
(clean clone, env -i scrubbed, frozen suite) → Receipt v3 PASS(all gates)
→ promoter recompute-invariants → EXACT-SHA merge b44565f to main.
Post-merge smoke: 26/26 pass on main. Zero human intervention in chain.
Hardened boundary now includes: TOCTOU exact-sha guard, receipt v3 gates,
env-scrubbed verifier, fail-closed API auth, idempotent promotion lock.

## Remaining P0/P1 (per docs/BUILD-PLAN-2026-08-23-release-integrity.md)
- verify-side adversarial harness (malicious candidate probes)
- outbox ACK semantics + repair_key dedup
- canonical BuildRun states; single event system; two-phase deploy

## Platform spine integration (05:1x UTC)
- Unbundled platform now LIVE + publicly observable: http://2.28.50.109:8810
  (/healthz, /llms.txt w/ 34 capability GETs, /robots.txt, / index)
- Registered as site_platform (base_url manifest field added to sensor) →
  uptime+discovery observations flowing → conformance green except 2 known placeholders
- Served from /tmp/platsrv/appmod.py = committed main.py + discovery routes.
  PENDING: when OCRRoute builder's main.py edits merge cleanly, port the
  /llms.txt,/robots.txt,/ routes back into platform/apps/api/main.py (repo).
- Keepalive cron */5. Import pilots running: apischemadiff (building),
  openapikit (queued).

---

# SESSION SUMMARY — 2026-08-23 (continued): hypothesis layer live, measurement integrity, consolidation

## What got built this session (chronological)
1. Act loop closed: drift -> repair briefs -> hermes fleet board (idempotent dispatch-repair.sh)
2. Import pipeline: create-build-run --import vendors OSS repos w/ provenance SHA
3. 4 autonomous verified promotions: domain_intelligence, naming_experiment,
   apischemadiff (import), openapikit (import) — Receipt v3 gates, EXACT-SHA merges,
   incl. one honest conflict-repair cycle and one supervisor-race recovery
4. Peer review round b accepted: calibration engine retired (invalid stats),
   Forecast v2/Resolution v1 schemas + idempotent resolver built, fake Brier deleted,
   lock ownership nonce, verify-all unified command
5. Hypothesis layer LIVE: H1/H2/H3 as Hydra nodes, chatgpt_limits hard filter,
   aligned-first admission (proven behavior change), cross-rubric score
   normalization (venturelab/qdw/native all comparable)
6. Evidence substrate: venturelab 91 ideas + 88 research; R2 corpus 98 ideas +
   6 intel docs; convergence detector watching density; hermes abduction task running
7. Platform spine: ALL products observable at :8810 (llms.txt/robots/healthz/index);
   usage middleware counting per-route calls -> Hydra (env fix applied)

## Current known state (verified before this note)
- platform :8810 200 · control plane :8787 200 · hydra :8443 up · sensors green
- events.jsonl repaired (torn line quarantined); jsonl-store has append lock
- forecasts: 5 issued, resolver v2 live, 0 resolved yet (windows open — honest)
- openapikit builder finishing; redirect_chain building; abduction task generating drafts

## Loose ends (deliberate, not lost)
1. usage middleware first flush unverified (fixed env; check next cycle)
2. Abduction drafts need adversarial gate when hermes finishes (my job)
3. Edge-site deploy automation still manual (P4 backlog)
4. fleet-status https:// display cosmetic bug

## Where actual DEV needs doing (priority)
D1. Usage middleware verification (one flush cycle proof) then WAIT for windows
D2. Gate abduction drafts -> seed admitted hypotheses (adversarial pass)
D3. Feed next WorkOrder batch (suites staged for top venture ideas)
D4. findEntities pagination (>1024 entities breaking idea visibility)
D5. Edge deploy script (wrangler pages from receipts) — after D3 volume proves demand
NOT needed: more frameworks, more meta-tests, PyMC before data exists.

## THESIS SCORECARD (2026-08-23 evening)
demand-evidence: FORMING (signals daily; not yet decision-driving)
cheap-MVP:       PROVEN (4 autonomous verified promotions)
deploy:          PLATFORM AUTO · edge manual
measure:         LIVE (usage middleware + fleet sensors + market signals)
kill/scale:      PENDING (first windows close ~Sept 22)
learn:           PENDING (needs #7)

Verdict: scaffolding complete. From here the factory needs RUNTIME, not code.
Next dev only on: broken things, usage middleware verification, slot feeding.
