# CANONICAL PROCESS SPEC — how the factory is supposed to work, v1

*2026-08-23. This is the testable contract for the whole system. Every stage
lists: trigger → action → evidence artifact → failure mode. If reality diverges
from this document, either fix reality or version this doc — never both drift.*

## Stage map

```text
S1 IDEAS          registry + graph (scored, hypothesis-stamped)
S2 ADMISSION      tick() gates → WorkOrder
S3 BUILD          hermes builder in worktree (Lane A) / platform module (Lane B)
S4 VERIFY         frozen acceptance suite, clean clone, scrubbed env
S5 PROMOTE        exact-SHA merge after invariant re-check
S6 DEPLOY         platform = immediate (shared FastAPI); edge = CF Pages (manual v1)
S7 OBSERVE        sensors → Hydra observations (uptime/discovery/usage/signals/prices)
S8 CONFORM+DRIFT  standards evaluated → repair WorkOrders
S9 LEARN          forecasts resolve idempotently → Beta/hierarchical fitness
```

## Canonical schemas (single source of truth)

| Concept | Schema | Store |
|---|---|---|
| Event envelope | `contracts/events/event-envelope.schema.json` | runtime/events.jsonl (+ legacy mirror) |
| Hypothesis (research program) | `contracts/hypotheses/hypothesis.v2.schema.json` | hypotheses/hypotheses.json + Hydra nodes |
| Evidence claim | `contracts/hypotheses/evidence-claim.v1.schema.json` | Hydra ResearchReport entities |
| Forecast (immutable) | `schemas/forecast.v2.schema.json` | runtime/forecasts/forecasts.jsonl |
| Resolution (idempotent) | `schemas/resolution.v1.schema.json` | runtime/forecasts/resolutions.jsonl |
| Observation (fleet/signal/usage) | observation.v2 | Hydra :Observation + Entity mirror |
| Model run (future PyMC) | `contracts/hypotheses/model-run.v1.schema.json` | summary in Hydra; draws in artifacts |
| Fitness policy | `docs/HYPOTHESIS-EVOLUTION-POLICY.md` | states draft→probation→active→promoted/branch/demoted/retired |

Rules: append-only logs; never mutate issued forecasts/receipts/resolutions;
dedupe by content-hash keys; missing data ⇒ AWAITING_DATA, never PASS.

## Stage contracts

### S1 Ideas
In: scored idea w/ `hypothesis_parents`, `limit_classes`, optional `incumbents`.
Store: unbundled registry (authoring) + Hydra Idea entities (decision).
Evidence: `idea.created`/`idea.seeded` events.
Importers: seed-ideas.mjs (seeds), import-venturelab.mjs, import_r2_ideas.py.

### S2 Admission
Trigger: `POST /v1/controller/tick {limit}`.
Gates: score ≥ FACTORY_MIN_BUILD_SCORE · no live/completed run · frozen suite at
`acceptance/<idea_id>/` exists · H1 filter (limit_classes) sorts aligned-first.
Output: BuildRun record (`runtime/build-runs/<id>/run.json`, spec.md+digest) +
worktree + branch + kanban task `[wq:<idea>]`.
Failure modes: unscored → deny; no suite → deny; stale RUNNING → correct with
truthful correction event before ticking.

### S3 Build
Lane A: hermes builder implements in worktree on `build/<run_id>`, commits,
kanban_complete. Lane B: full-spec platform modules; integration ONLY at
completion via post_build.sh v2 (never into shared tree mid-build).

### S4 Verify
`bash scripts/verify-candidate.sh <run_id>` → Receipt v3
(`runtime/build-runs/<id>/receipt.json`). Clean clone; root conftest/pytest.ini
stripped; `env -i` scrubbed env; timeout wall; candidate_tests REQUIRED for code
classes; missing evidence = ERROR ≠ PASS.

### S5 Promote
`bash scripts/promote-candidate.sh <run_id>` → requires receipt PASS, branch head
== candidate_commit, ancestry, recomputed digests, lockfile, not-already-PROMOTED;
merges EXACT SHA --no-ff. Emits `build.completed`. Failure ⇒ PROMOTION_FAILED
recorded, main untouched.

### S6 Deploy
Platform products: live immediately post-merge on http://2.28.50.109:8810
(keepalive cron */5). Capability appears in `/llms.txt` automatically if route
registered on app. Edge sites: `deploy-and-register.mjs` (v1, manual trigger).

### S7 Observe
Crons → Hydra observations:
observe-sites */10 (uptime+discovery, base_url honored) · cf-usage hourly
· collect_signals daily 06:15 (x402/pypi/npm/github) · track_incumbents monthly
(price pages + Wayback backfill). Sensor content-checks discovery files are TEXT
not HTML fallbacks.

### S8 Conform + drift
conformance.mjs 5-59/10 → FAILs → outbox-consumer (repair_key dedup, ACK-after-
dispatch) → dispatch-repair.sh → fleet-board tasks → builders fix → conformance
re-eval. Repair done = original violation observes clean, nothing less.

### S9 Learn (measurement-integrity rules)
Forecasts immutable at issue (forecast.v2); resolution idempotent by
resolution_key; real Brier/log vs baseline at resolution; usage-dependent
predictions stay AWAITING_DATA until middleware exists. Hypothesis fitness =
prequential skill + calibration + entity diversity; promote gates per
HYPOTHESIS-EVOLUTION-POLICY.md. **No allocation from uncalibrated posteriors.**

## Health & ops

- `node scripts/health-probe.mjs` — 7 checks incl. hydra-live-fresh (<30min).
- RAM <500MB ⇒ ram-guard cleans THIS lane only. Never pkill; kill exact PIDs.
- Single provider: opencode-go/ox-alpha-free everywhere; zero balance stops all.
- Platform keepalive cron serves REPO code (`apps.api.main:app`) — never /tmp copies.

## Regression suites (must stay green)

npm test (92) · test/hypothesis-contracts.test.js (5) ·
scripts/test_promote_negative.sh (8) · scripts/test_verify_negative.sh (6) ·
unbundled test_post_build_negative.sh (11) · unbundled pytest platform/tests (427+)

## Known debt register (do not silently grow)

1. Dual graph models (Entity + native labels) until P2-9 single-event-system
2. findEntities 1024-row cap → add filtered/paginated queries before pool grows
3. Usage middleware pending → 4 of 5 predictions AWAITING_DATA
4. fleet-status renders https:// even when manifest.base_url is http (cosmetic)
5. Edge-site deploys manual (P4 two-phase deploy pending)
EOF
git add -A && git commit -qm "CANONICAL PROCESS SPEC v1: stage contracts S1-S9, schema index, health/ops rules, regression suites, debt register" && git push 2>&1 | tail -1