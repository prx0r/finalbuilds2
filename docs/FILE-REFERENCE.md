# FILE REFERENCE — every file in the factory, explained

*2026-08-23. Companions: FACTORY-OPERATIONS.md (how to run things) ·
BUILD-PLAN-2026-08-23-release-integrity.md (rules). This doc explains WHAT each
file IS. Status tags: **LIVE** production path · **SUPPORT** tests/tools ·
**LEGACY** functional but superseded · **RETIRED** history only, do not wire back.*

## 1. Control-plane core (`src/`)

| File | Status | What it is |
|---|---|---|
| `src/server/http.js` | LIVE | HTTP API :8787. `/healthz`, `/v1/events(+batch)`, `/v1/build-context`, `/v1/observations`, `/v1/failures`, `/v1/controller/tick`, `/v1/drift(/repair)`, strategy/contract/experiment reads. Fail-closed auth: loopback default bind; non-loopback without CONTROL_TOKEN refuses startup. |
| `src/controller/control-plane.js` | LIVE | Composition root. `fromEnv()` wires graph + event store + EventBus + RouterDispatcher + FactoryController + engines. Knobs: `FACTORY_DISPATCHER=workorder`, `FACTORY_MIN_BUILD_SCORE=6`, `FACTORY_MAX_BUILDING=2`. |
| `src/controller/factory-controller.js` | LIVE | Admission/scheduling. `tick()` picks best scored idea with live capacity; truthful statuses (`queued`→`running` on accept, else rejected+reason); failed/rejected runs re-admit ideas (P1-8). |
| `src/dispatch/router-dispatcher.js` | LIVE | One dispatch seam: `product-build`→WorkOrderDispatcher; all else→outbox. Result cache collapses bus/direct double-dispatch. |
| `src/dispatch/workorder-dispatcher.js` | LIVE | Product-build transport (sandboxd-free): runs `create-build-run.mjs`, mirrors decision to outbox, returns run info. |
| `src/dispatch/outbox.js` | LIVE | `JsonlTaskOutbox` append-only queue → `runtime/hermes-outbox.jsonl`. |
| `src/dispatch/agentbuild-dispatcher.js` | RETIRED | agentbuild/sandboxd transport. Selectable but blocked by sandbox RAM limits; do not re-wire without proof. |

## 2. Events & contracts

| File | Status | What it is |
|---|---|---|
| `contracts/index.js` | LIVE | Canonical envelope: EVENT_TYPES allowlist, validation, payload sha256 integrity, ids. System vocabulary. |
| `contracts/{events,ontology,fixtures}` | SUPPORT | Contract definitions/fixtures backing index.js. |
| `src/events/canonical-ingestor.js` | LIVE | validate → hash check → dedupe(event_id) → persist exact envelope → project (best-effort) → checkpoint. |
| `src/events/event-store-factory.js` | LIVE | Canonical store backend selection. |
| `src/events/checkpoint-store.js` | LIVE | Projection cursor at `runtime/projection-checkpoint.json`. Backlog note: persistence vs projection cursors still merged (P2-11). |
| `src/event/bus.js` | LIVE | EventBus: appends legacy event, projects via `event/projector.js`, runs handlers; routes `task.created` to dispatcher. |
| `src/event/jsonl-store.js` | LIVE | Append-only event log `runtime/events.jsonl`. |
| `src/event/projector.js` | LIVE | Legacy Entity-model projector. Slims payloads (Hydra ~1024B query cap); explicit status support incl. `rejected_reason`; observations/sites/builds/tasks/generators. |
| `src/event/r2-store.js` | SUPPORT | Optional object-store backend, unused on this box. |

## 3. Graph layer

| File | Status | What it is |
|---|---|---|
| `src/graph/factory.js` | LIVE | `GRAPH_BACKEND=hydra` → HydraHttpGraphStore; memory default for tests. |
| `src/graph/hydradb-http.js` | LIVE | Query/upsert/getEntity/link against HydraDB OpenCypher (:8443). Entity-model read/write. Handles row decode + int-id scheme. |
| `src/graph/cypher.js` | LIVE | Cypher builders (entity create/set), string/int-id helpers. Escaping proven against Hydra parser. |
| `src/graph/store.js` | LIVE | Abstract GraphStore base. |
| `src/graph/inmemory.js` | SUPPORT | In-memory store for unit tests. |
| `src/graph/hydradb/projector.js` | LIVE | Native label-model projector (Site/Observation/Idea/BuildRun/... nodes with `_GENESIS` anchors) used by the canonical ingest path. NOTE: dual model coexists with Entity model — see §9 known debt. |
| `src/graph/hydradb/executor.js` | LIVE | Thin query/exec wrapper used by server ingest projection. |
| `src/graph/hydradb/bolt-executor.js` | SUPPORT | Bolt protocol variant, not active. |
| `src/graph/hydradb/schema.js` | SUPPORT | Label/schema constants. |

**Known debt (documented, do not "fix" casually):** two graph models coexist.
Controller reads Entity model (via ControlPlane bus); canonical events project
native labels. Unification is P2-9 in BUILD-PLAN — requires the one-event-system
work first.

## 4. Ideas, planner, analytics

| File | Status | What it is |
|---|---|---|
| `src/ideas/importer.js` | SUPPORT | Parses finalbuildideas markdown → idea records (one-shot ingestion path, F0-sanctioned). |
| `src/ideas/blueprint-compiler.js` | LEGACY | Idea → blueprint text (agentbuild era). |
| `src/planner/idea-planner.js` + `score.js` | LIVE | Selection policy: score threshold, maxBuilding capacity, exclusion rules. |
| `src/analytics/lineage.js` | LIVE | Lineage walks over the Entity graph (idea→run→product edges). |
| `src/analytics/process-attribution.js` | SUPPORT | Ranks generation processes by outcomes (P8 groundwork; do not extend until reliability milestone). |

## 5. Standards, conformance, reconcile, registry, resolver

| File | Status | What it is |
|---|---|---|
| `src/standards/catalog.js` | LIVE | Standard + version registration (site-onboarding v1, agent-discovery v2, seo-core v1) with requirement lists. |
| `src/standards/conformance.js` | LIVE | Evaluates site observations against desired standard versions → compliance verdicts. |
| `src/reconcile/reconciler.js` | LIVE | `standardDrift()` finds noncompliant pairs; `createRepairTasks()` emits drift tasks to the outbox (→ fleet board). |
| `src/registry/loader.js` | LIVE | Validates `registry/sites/*.json` manifests against the onboarding standard. |
| `src/registry/bootstrap.js` | LIVE | Bulk-registers manifests into graph. |
| `src/registry/capability-registry.js` | SUPPORT | Capability atoms (`cancel.lookup`, `pdf.extract`, …) — reuse genome. |
| `src/resolver/capability-resolver.js` | SUPPORT | Resolves capability requests to registered implementations (GET-gateway groundwork; frozen). |
| `standards/site-onboarding/site-onboarding.v1.json` | LIVE | Onboarding requirements: manifest-complete, uptime-probe, agent-discovery-files, usage-telemetry, health-endpoint. |
| `standards/agent-discovery/*` | LIVE | llms.txt / robots.txt / MCP discovery requirements. |

## 6. Experiments & domain-search

| File | Status | What it is |
|---|---|---|
| `src/experiments/{engine,stats,report}.js` | SUPPORT | Deterministic A/B machinery + read APIs. Frozen per scope freeze (P8). |
| `src/domain-search/engine.js` | SUPPORT | Porkbun-backed domain availability engine (used by domainnamechecker product). |
| `src/integrations/*` | SUPPORT | Cloudflare (GraphQL usage analytics), Porkbun, Gmail, ChatGPT-apps, MCP registry adapters. |
| `src/model/types.js` | LIVE | EntityType/RelKind enums — the graph ontology names used by projectors. |

## 7. Operational scripts (`scripts/`) — the daily toolbox

### Build pipeline (Lane A — verified worktrees)
| Script | What it does |
|---|---|
| `create-build-run.mjs` | Admission + immutable BuildRun: run.json (status history), spec.md + sha256 digest, git worktree + branch `build/<run_id>`, WorkOrder kanban task. Gates: unscored idea → denied; missing frozen suite → denied. |
| `verify-candidate.sh` | Independent verifier. Fresh clone of candidate branch, acceptance copied in, conftest.py/pytest.ini at root REMOVED (anti-injection), pytest under `env -i` scrubbed env + `timeout $VERIFY_TEST_TIMEOUT` (default 180s), exit codes captured directly. Emits Receipt v3 (`receipt.json`: gates map, digests, builder/verifier identity). Missing evidence = ERROR, never PASS. |
| `promote-candidate.sh` | Release gate. Recomputes spec+acceptance digests, requires receipt PASS, branch head == candidate_commit (TOCTOU), ancestry from base, single-flight lockfile, idempotency on PROMOTED status; merges EXACT SHA `--no-ff`; appends PROMOTED/PROMOTION_FAILED status. |
| `supervisor.mjs` | The unattended loop (cron */15): RUNNING runs whose branch advanced and whose kanban task finished → verify → promote → emit canonical `build.completed`. REJECTED branches kept as evidence. |
| `health-probe.mjs` | 7-point startup gate: control-plane, hydra-live-fresh (<30min), provider-zen real call, hermes-cli, build-repo clean, suites present, RAM >500MB. Exit 0 = admit work. |
| `ram-guard.sh` | Cron every minute: logs avail MB; <500MB cleans ONLY this lane's junk (/tmp/opencode >1h, log rotation) + drop_caches. Never touches other-agent processes. |

### Fleet observability
| Script | What it does |
|---|---|
| `observe-sites.mjs` | Probes homepage/llms.txt/robots.txt/per-path for all registry sites → observations via :8787. |
| `conformance.mjs` | Scores sites vs desired standards → compliance observations. |
| `cf-usage.mjs` | Cloudflare GraphQL analytics → api.calls/errors/cpu_p50 hourly. |
| `fleet-status.mjs` | Human-readable live fleet view straight from HydraDB. |
| `outbox-consumer.mjs` | Repair dispatcher: filters non-repair lines, dedups by repair_key (sha256 of site‖standard‖violations) via `runtime/open-repairs.json`, ACK only after dispatch success, authenticated telemetry. |
| `dispatch-repair.sh` | REPAIR_CMD target: brief → hermes kanban fleet-board task, idempotency-key `repair-<task_id>`. |

### Registry & site management
| Script | What it does |
|---|---|
| `site-add.mjs` | Scaffold a fleet site manifest satisfying onboarding v1. |
| `register-sites.mjs` | Push manifests → control-plane events → graph. |
| `bootstrap-registry.mjs` | Bulk bootstrap of all manifests (idempotent). |
| `seed-ideas.mjs` | Materialize `registry/ideas/seed.json` into the graph via ControlPlane bus. |
| `import-ideas.js` / `build-idea.js` | SUPPORT: parse finalbuildideas markdown; compile idea blueprints (Lane B tooling). |

### Deployment & legacy demos
| Script | Status | What it does |
|---|---|---|
| `deploy-and-register.mjs` | SUPPORT | receipt(PASS) → unzip artifact → `wrangler pages deploy` → site-add + register + observe + conformance. Currently consumes agentbuild receipts — P4-14 will retarget to v3 receipts. |
| `demo.mjs`, `scale-smoke.mjs`, `hydra-smoke.sh`, `hydra-integration.mjs`, `hydra-version.sh` | SUPPORT | Smoke/demo utilities for graph + capacity. |

### Release-boundary test suites (must stay green)
| Suite | Cases | Guards against |
|---|---|---|
| `test_promote_negative.sh` | 8 | moved branch after verify, forged candidate SHA, FAIL receipts, mutated spec/frozen suite, concurrent promote lock, double promotion |
| `test_verify_negative.sh` | 6 | factory secrets visible to candidates (env -i probe), missing own tests passable, failing own tests, root conftest injection, runaway tests vs timeout wall |

## 8. Data files

| Path | What |
|---|---|
| `registry/sites/*.json` | Fleet manifests (6 sites). url-inspector is a known placeholder (FAIL noise by design until real). |
| `registry/ideas/seed.json` | Seed generators + ideas with score vectors. |
| `acceptance/<idea_id>/` | **Frozen** acceptance suites — admission tickets. Change only via review; builder never sees them before freeze. |
| `runtime/build-runs/<run_id>/` | run.json (identity+spec_digest), spec.md, receipt.json (v3), run.json.status (append-only history). Evidence, on disk only (gitignored). |
| `runtime/hermes-outbox.jsonl` | Durable task queue (repairs + workorder mirrors). |
| `runtime/open-repairs.json` | repair_key ledger (one open repair per condition). |
| `runtime/events.jsonl` + `projection-checkpoint.json` | Event log + projection cursor. |
| `.env` / `.env.local` | Secrets/config (CONTROL_TOKEN, HYDRA_*, CF_*, FACTORY_*; OPENCODE_GO_API_KEY, SANDBOXD_* legacy). Never committed. |

## 9. The other repos (referenced, not owned)

| Repo | Role in this system |
|---|---|
| `/root/unbundled` | Idea corpus (`registry/ideas.registry.json`, 139 ideas), product platform (`platform/` FastAPI, 17 products, 288 tests), Lane-B tooling in `scripts/`: `registry_to_kanban.py` (--list/--create), `post_build.sh` v2 (hardened integration: independent pytest exit capture, registry promotion, honest EVIDENCE-WRITE-FAILED exit 2), `log_build_to_hydra.py`, `test_post_build_negative.sh` (11 cases). Builder worktrees live at `worktrees/<run_id>` (gitignored). |
| `/root/agentbuild2` | RETIRED executor (agentbuild CLI + sandboxd client). Doctor still passes; kept for HIGH_ASSURANCE experiments. Not on critical path. |
| `/root/.hermes` | Execution substrate. Boards: `unbundled` (product builds + wq WorkOrders), `fleet` (repairs). Profiles: `builder` (worker lane), `patala` (gateway w/ embedded kanban dispatcher). Config locked to `opencode-go/ox-alpha-free`; no fallbacks. |
| `/root/hydradb-*` containers | Graph store :8443. Projections only — the event logs are truth. |

## 10. Reading order for a new agent

1. `docs/FACTORY-OPERATIONS.md` — run things
2. This file — know what you're touching
3. `docs/BUILD-PLAN-2026-08-23-release-integrity.md` — the rules and remaining P0–P8
4. `ABUSE.md` (unbundled) — why the factory exists
5. `BUILD-NOTES-2026-08-2{2,3}.md` — what happened, honestly

## 11. Remaining modules (smaller, but accounted for)

| File | Status | What it is |
|---|---|---|
| `src/index.js` | LIVE | Public exports barrel (ControlPlane, stores, engines). Import from here in new code. |
| `src/cli/main.js` | SUPPORT | Thin CLI wrapper over control-plane ops (dev convenience). |
| `src/canonical/generator.js` | SUPPORT | Multi-format capability page generator (llms.txt/robots scaffolding for products). |
| `src/receipt/receipt-v2.js` | LEGACY | Receipt v2 schema (7 booleans, all-explicit true). Superseded by Receipt v3 inside verify-candidate.sh; v3 keeps v2's "missing evidence ≠ PASS" principle. `test/receipt-v2.test.js` pins the old contract. |
| `src/util/{id,time}.js` | LIVE | id/time helpers. |
| `test/*.test.js` (24 files) | SUPPORT | 87 tests: contracts, projector slimming, controller admission/exclusion, graph adapters (incl. live-Hydra variants), conformance, reconcile drift→repair, resolver, lineage, receipt-v2, server routes. |
