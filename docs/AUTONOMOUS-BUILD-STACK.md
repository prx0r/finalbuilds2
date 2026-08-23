# AUTONOMOUS-BUILD-STACK — the full loop and its evidence contracts

*2026-08-23. What the end-to-end autonomous build stack is, which links are
proven, and what peer review must check. Companion to CANONICAL-SITE-ARCHITECTURE.md
(fleet/observe side) — this doc owns the build/deploy side.*

## 1. The loop

```text
registry/ideas (seed.json / graph Idea entities)
      |
      v  FactoryController.tick()  [capacity-gated: maxBuilding=2, minScore]
src/controller/factory-controller.js
      |
      v  AgentBuildDispatcher.dispatch(task)
src/dispatch/            blueprint generated from build_brief
      |                  -> .agentbuild/blueprints/<task>.md
      v  agentbuild build <blueprint> --mode direct     [cwd=finalbuilds2]
agentbuild2 (v4)        retries w/ session continuation, bounded repair loops,
      |                 sandbox-restart fallback, honest release gate
      v  sandboxd :9091 (docker) -> opencode worker (opencode-go/ox-alpha-free)
      |
      v  release receipt: release_passed + artifact workspace.zip
.agentbuild/runs/run-*/release-receipt.json
      |
      v  deploy-and-register.mjs <receipt> <site-id>
scripts/deploy-and-register.mjs
      |   unzip artifact -> wrangler pages deploy -> site-add.mjs ->
      |   register-sites.mjs -> observe-sites.mjs -> conformance.mjs
      v
fleet registry (registry/sites/*.json) + HydraDB observations
      |
      v  conformance FAIL => drift => outbox task
scripts/outbox-consumer.mjs  --REPAIR_CMD--> scripts/dispatch-repair.sh
      |
      v  hermes kanban board `fleet` (idempotency-key repair-<task_id>)
hermes builder worker (ox-alpha-free) fixes repo, redeploys
      |
      v  conformance PASS closes the loop; every hop emits graph events
```

## 2. Evidence at each boundary (anti-theatre)

| Hop | Evidence artifact | Where |
|---|---|---|
| idea → build task | `build.started`, `task.created` events | runtime/events.jsonl + HydraDB |
| blueprint → code | sandboxd task events + checkpoint diffs | agentbuild run dir events.jsonl |
| code → release | `release-receipt.json` (`release_passed`) | .agentbuild/runs/run-* |
| receipt → live site | CF Pages deploy URL + git push of manifest | registry/sites/*.json |
| site → health | `http.status`, `llms_txt.present`, `api.calls` obs | HydraDB (10-min crons) |
| drift → repair | repair brief file + kanban task id | runtime/repairs/, fleet board |

A claimed capability without its artifact is theatre. The release gate refuses
to pass when checkpoint diffs contain no implementation-source changes — this
fired correctly on run-20260823T014708Z (credits-dead provider, zero source
changes, gate said NO).

## 3. Proven vs unproven (honest status 2026-08-23)

| Link | Status | Proof |
|---|---|---|
| hermes builders on ox-alpha-free | ✅ proven | WIRING-OK chat + 8 unbundled tasks running |
| outbox → kanban dispatch (Act loop) | ✅ wired+idempotent-tested | re-dispatch produced no dup (t_3b5470e7) |
| controller tick → dispatcher wiring | ✅ env fix landed (.env.local cwd bug) | sandboxd auth 200 from finalbuilds2 cwd |
| full blueprint→receipt (green) | ⏳ in flight | smoke #3 via POST /v1/controller/tick |
| receipt → CF deploy → registered | 🔲 unproven | needs first green receipt |
| repair worker → conformance PASS | 🔲 unproven | url-inspector/cancelme repairs queued on fleet board |

## 4. Known constraints

1. **sandbox_capacity**: sandboxd refuses new sandboxes under box memory pressure.
   Max ~1 concurrent agentbuild build alongside a few kanban workers (8 GB box).
2. **Provider budget**: everything runs through opencode-go zen gateway,
   model hardset `ox-alpha-free` (root config + profiles {builder,qdw,patala},
   no fallbacks). Zero-balance = all lanes stop simultaneously.
3. **HydraDB v0.x**: ~1024-byte OpenCypher cap, integer node ids, no MERGE —
   see BUILD-NOTES-2026-08-22 for workarounds baked into the projectors.
4. **Dispatcher timeout** 600 s per execFile call — long builds need the value
   raised in src/dispatch or async job pattern.

## 5. Peer-review checklist

- [ ] Re-run smoke: `curl -XPOST :8787/v1/controller/tick -d '{"limit":1}'`
      produces a run with `release_passed=true`.
- [ ] Feed that receipt to `deploy-and-register.mjs`; verify site appears in
      registry, conformance picks it up, no manual edits anywhere.
- [ ] Break a compliant site deliberately (remove llms.txt); verify drift →
      outbox → kanban task within 2 cron ticks, and closure after fix.
- [ ] Kill a builder mid-run; verify hermes failure accounting and redispatch.
- [ ] Confirm idempotency: replay hermes-outbox.jsonl lines; no duplicate
      kanban tasks (idempotency keys).
- [ ] Review ram-guard.sh actions are lane-scoped (no cross-agent kills).
