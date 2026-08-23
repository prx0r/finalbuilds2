# FACTORY OPERATIONS — the autonomous build system, from scratch

*2026-08-23. Everything a new agent needs to run, use, and debug the factory.
Read this top to bottom once; then use §5 as your daily driver.*

---

## 1. What this is (one paragraph)

An evidence-driven software factory. **FinalBuilds2** decides what gets built
(scored ideas in a HydraDB graph) and records what happened. **Hermes** executes:
builder agents implement candidates in isolated git worktrees. An **independent
verifier** decides PASS/FAIL — builders can never certify their own work.
Promotion merges the exact verified commit to main. Deployed products are then
observed by sensors; drift becomes repair tasks that flow back to Hermes.
Governing strategy: `/root/unbundled/ABUSE.md`. Release-integrity rules:
`/root/finalbuilds2/docs/BUILD-PLAN-2026-08-23-release-integrity.md`.

```
IDEAS (unbundled/registry + finalbuilds2 graph)
  → FinalBuilds2 admission (score gate + frozen acceptance suite required)
  → WorkOrder → hermes kanban → builder profile
  → candidate branch in git worktree
  → verify-candidate.sh  (clean clone, scrubbed env, frozen suite, Receipt v3)
  → promote-candidate.sh (EXACT-SHA merge; invariants recomputed)
  → supervisor.mjs (cron: automates the last two steps)
  → deployed fleet observed by sensors → drift → repair WorkOrders → loop
```

## 2. Machines, repos, credentials

| Path | Role |
|---|---|
| `/root/finalbuilds2` | Control plane: server :8787, registry, standards, verifier/promoter scripts, supervisor, crons |
| `/root/unbundled` | Idea corpus (`registry/ideas.registry.json`) + product platform (`platform/`, FastAPI) + frozen suites live in finalbuilds2 |
| `/root/unbundled/worktrees/<run_id>` | Live builder sandboxes (one per BuildRun) — never commit these |
| `/root/finalbuilds2/runtime/build-runs/<run_id>` | Immutable run record: `run.json`, `spec.md`, `receipt.json`, `run.json.status` |
| `/root/.hermes` | Hermes agent home: config, profiles (builder/patala/qdw), kanban boards |

Credentials all live in env files, never committed:
- `/root/finalbuilds2/.env` — CONTROL_TOKEN, HYDRA_URL/TOKEN, CF_API_TOKEN/ACCOUNT_ID, FACTORY_* policy knobs
- `/root/finalbuilds2/.env.local` — SANDBOXD_URL/token (legacy), OPENCODE_GO_API_KEY
- `/root/.hermes/profiles/{builder,patala}/.env` — provider keys for hermes profiles

Provider: OpenCode zen gateway (`https://opencode.ai/zen/go/v1`), model hard-set
to `ox-alpha-free` everywhere (root config + all profiles). **Single point of
failure**: zero balance stops every lane simultaneously.

## 3. Fresh setup (new box or after wipe)

1. Clone repos: `git clone https://github.com/prx0r/finalbuilds2 ~/finalbuilds2`
   and `~/unbundled`. Copy `.env` / `.env.local` from secret storage (never from git).
2. HydraDB: `cd ~/finalbuilds2 && docker compose -f docker-compose.hydra.yml up -d`
   → serves :8443. Token at `runtime/hydradb-data/auth-token`.
3. Hermes: installed at `/usr/local/lib/hermes-agent`; set profile keys in
   `/root/.hermes/profiles/builder/.env` (`OPENCODE_GO_API_KEY=...`),
   lock model in `/root/.hermes/config.yaml`:
   ```yaml
   model: { default: ox-alpha-free, provider: opencode-go }
   ```
4. Control plane: `node --env-file=.env src/server/http.js` (PID → `runtime/control-plane.pid`).
5. Seed the idea graph: `node --env-file=.env scripts/seed-ideas.mjs`
6. Crontab (see `crontab -l` on the live box): observe-sites */10, conformance +
   outbox-consumer 5-59/10, cf-usage hourly, ram-guard every minute,
   supervisor */15, kanban dispatch */15.

## 4. Health check — run this first, always

```bash
cd /root/finalbuilds2 && node scripts/health-probe.mjs
```
7 checks must PASS: control-plane, hydra-live-fresh (<30min stale = sensor write
path alive), provider-zen (real completion call), hermes-cli, build-repo,
acceptance-suites-present, ram-headroom (>500MB). Exit 0 = factory may admit work.

RAM discipline: `free -h` before heavy jobs. Below ~500MB available:
`scripts/ram-guard.sh` logic applies — clean only THIS lane's artifacts
(`/tmp/opencode` >1h old, rotated runtime logs). **Never kill `opencode`
processes or anything you didn't spawn — they belong to the two agent lanes.**

## 5. Daily driver — producing a product from an idea

### Lane A: verified-worktree pipeline (the standard)
```bash
# 1. Admission happens automatically via tick (picks best scored idea with a
#    frozen acceptance suite):
curl -s -X POST http://127.0.0.1:8787/v1/controller/tick \
  -H "Authorization: Bearer $(grep '^CONTROL_TOKEN=' .env | cut -d= -f2)" \
  -H "Content-Type: application/json" -d '{"limit":1}'
# → creates BuildRun + worktree + branch build/run_<id> + kanban task [wq:<idea>]

# 2. Give it to a builder:
hermes kanban --board unbundled assign <task_id> builder
hermes kanban --board unbundled dispatch --max 1     # spawns worker if slots free

# 3. Builder codes in /root/unbundled/worktrees/<run_id>, commits to its branch,
#    calls kanban_complete. From here it's hands-off:
#    supervisor cron (*/15) detects done+commits → runs verifier → promotes on
#    PASS → emits build.completed to the graph. Watch: tail -f runtime/logs/supervisor.log
```
Manual override (debugging): `bash scripts/verify-candidate.sh <run_id>` then
`bash scripts/promote-candidate.sh <run_id>`.

Admission rules: idea must be scored ≥ FACTORY_MIN_BUILD_SCORE (6), have no
live/completed BuildRun, AND have a frozen suite at
`/root/finalbuilds2/acceptance/<idea_id>/`. No suite → no build. Write one
first (see §7).

### Lane B: registry batch builds (platform capability modules)
```bash
cd /root/unbundled
python3 scripts/registry_to_kanban.py --list              # prioritized candidates
python3 scripts/registry_to_kanban.py --create <idea_id>  # full-spec kanban task
hermes kanban --board unbundled assign <task_id> builder && \
hermes kanban --board unbundled dispatch --max 1
# when task shows done, integrate (idempotent):
bash /root/finalbuilds2/scripts/post_build.sh <task_id> <idea_id>
```
post_build v2 refuses fake passes (independent pytest exit capture); it copies
the module into `platform/products/`, runs the platform suite, updates registry
status to BUILT_PLATFORM, logs provenance to Hydra. Exit 2 = evidence-write
failed (registry promoted but Hydra down — fix Hydra, rerun).

Concurrency: keep ≤3 running builders on this box (~400MB each pair). Dispatch
skips when slots are full; just retry later.

## 6. Verification & promotion contract (what "done" means)

Receipt v3 gates: `contract_ok, acceptance_ok, artifact_shape_ok,
real_implementation_ok, candidate_tests_ok`. For code classes (cli/api/mcp/
worker/library/wasm) **candidate_tests_ok is REQUIRED** — a candidate without
its own tests can never PASS. Missing evidence ⇒ ERROR, never PASS.

Promotion refuses unless: receipt PASS, branch head == receipt.candidate_commit
(TOCTOU guard), candidate descends from base, spec + acceptance digests match
recomputed values, single-flight lock held, not already PROMOTED.

Test suites guarding this boundary (all must stay green):
| Suite | Count | What |
|---|---|---|
| `npm test` (finalbuilds2) | 87 | core contracts/projector/controller |
| `scripts/test_promote_negative.sh` | 8 | TOCTOU, forged SHA, mutated spec, double/concurrent promote |
| `scripts/test_verify_negative.sh` | 6 | secret-scrub probe, missing tests, conftest injection, timeout wall |
| `unbundled/scripts/test_post_build_negative.sh` | 11 | pipefail false-pass regression etc. |
| `pytest platform/tests` (unbundled) | 288 | product golden/adversarial suites |

## 7. Writing a frozen acceptance suite (the admission ticket)

Create `/root/finalbuilds2/acceptance/<idea_id>/test_*.py`. Contract style:
import the candidate module by explicit path from `parents[1]`, assert
*behavior*, never implementation. Keep it small and semantic — it is the law
the builder codes against. Example minimal CLI suite lives at
`acceptance/idea_naming_experiment/`.

## 8. Fleet observability & repair loop

- Crons write uptime/discovery/path observations + CF usage into Hydra every 10 min.
- `node scripts/fleet-status.mjs` — human view of all sites.
- Conformance vs standards (`standards/site-onboarding/v1` etc.) → FAILs become
  drift → `outbox-consumer.mjs` writes repair briefs → `dispatch-repair.sh`
  creates `[repair:<site>]` tasks on the **fleet** board (deduped by
  repair_key in `runtime/open-repairs.json`). Builders work them like any task.
- A repair is DONE only when conformance re-evaluates clean — not when code was written.

## 9. Troubleshooting — known failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Every builder dies instantly, `Insufficient balance` | zen workspace $0 | new key into `.env.local` + both profile `.env`s; `hermes auth reset opencode-go` |
| `sandbox_capacity low_memory` (agentbuild path only) | box RAM exhausted | sandboxd is RETIRED from critical path; use Lane A/B instead. Free RAM (kill YOUR pids only) |
| Tick returns `selected: []` | all scored ideas already have live/completed runs, or lack frozen suites | write suites for remaining ideas, or correct stale BuildRun statuses (see below) |
| BuildRun stuck `running` forever | projection lag or dead dispatch | confirm evidence (outbox/receipt), then set truthful status via `cp.graph.upsertEntity` + emit correction note. Never fabricate success |
| Promote REFUSED: branch moved | TOCTOU guard worked | re-run verifier on current head, then promote |
| Sensor `N rejected` | CONTROL_TOKEN mismatch between .env and caller | run crons with `--env-file=.env` (they already do) |
| `EADDRINUSE` on :8787 | old server alive | `kill $(cat runtime/control-plane.pid)` exactly, restart |

## 10. Invariants — do not break these

1. Builders never decide PASS. Only verify-candidate.sh output may authorize promotion.
2. Promotion merges the receipt's exact SHA — never a mutable ref.
3. Never mutate historical receipts/run records; append corrections as status events.
4. Frozen acceptance suites change only via review, never inside a build.
5. Never `sleep` to wait; never `pkill`; kill only PIDs you spawned.
6. Never commit secrets, runtime/, or worktrees/.
7. Quarantine junk, don't delete (`_errors/`, archived board tasks).
8. Scope discipline: throughput of *verified products* beats new machinery.
   Add infrastructure only when a real failure demands it.
