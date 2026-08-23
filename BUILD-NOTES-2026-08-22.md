# BUILD NOTES — 2026-08-22

*Session log: observability fabric live on HydraDB, standards loop closed end-to-end.*
*Everything below was verified against the live stack, not mocks.*

## What now exists

### Running services (this box)
| Service | Detail |
|---|---|
| HydraDB | Docker `ghcr.io/hydra-db/hydradb:latest`, graph `finalbuilds`, cell `cell-0`; token `runtime/hydradb-data/auth-token` |
| Control plane | `node --env-file=.env src/server/http.js` :8787; PID tracked in `runtime/control-plane.pid` |
| Cron ×4 | observe-sites */10 · conformance 5-59/10 · outbox-consumer 5-59/10 · cf-usage hourly :05 |

### Closed loops
1. **Register** → manifest in `registry/sites/` → `register-sites.mjs` + `bootstrap-registry.mjs`
2. **Observe** → homepage/llms.txt/robots.txt probes + per-path `probe_paths` + CF GraphQL usage (`api.calls`, errors, cpu_p50)
3. **Judge** → `conformance.mjs` scores sites vs desired standard versions → `standard.compliance` observations
4. **Act** → `/v1/drift` → `/v1/drift/repair` → `hermes-outbox.jsonl` → `outbox-consumer.mjs` → agent briefs in `runtime/repairs/<task>.md` (+ optional `REPAIR_CMD` execution hook)
5. **Inspect** → `fleet-status.mjs`, raw Cypher, HTTP API

### Fleet state at end of day
| Site | Verdict |
|---|---|
| domainnamechecker.tradesprior.workers.dev | ✅ compliant, real usage telemetry flowing |
| hackathonhelp.pages.dev | ✅ compliant |
| llmdeals-v2.pages.dev | ✅ compliant, 3 agent-API endpoints instrumented |
| cancelme.pages.dev | ❌ not deployed (honest FAIL) |
| url-inspector (placeholder) | ❌ placeholder domain |
| onething | ❌ undeployed — **`onething.pages.dev` is owned by an unrelated third party; never use it** |

## Constraints discovered (live, against HydraDB v0.x)
1. **~1024-byte OpenCypher query cap** (1012 ok / 1032 fails) → graph nodes store slim scalars only (`slim()` in legacy projector); documents stay in files + event log
2. **Node `id` must be an integer** → entities use sha256 int id + `string_id`
3. No MERGE / no standalone CREATE / no edges between existing nodes →
   CREATE via `_GENESIS` anchor, MATCH SET updates, links as `Entity{type:'Edge'}` nodes
4. Pages static projects expose no per-path request counts via API — per-tool demand
   needs Web Analytics or app middleware

## Code changes (all pushed to prx0r/finalbuilds2)
- `9469ad1` LIVE: sensors, registration, fleet-status, executor wired into ingestion
- `87b66b0` LIVE: cf-usage via Cloudflare GraphQL analytics
- `04ca9c7` CANONICAL: site-onboarding v1 standard, conformance evaluator,
  bootstrap into Hydra, drift→outbox bridge, adapter rewritten off MERGE,
  5-site normalization, CANONICAL-SITE-ARCHITECTURE.md
- `bb37f10` LOOP CLOSED: outbox consumer, probe_paths granularity,
  unbundle {opportunity,rank,score} manifest fields, ANALYSIS-CATEGORIES.md

## Bugs found & fixed honestly
- Server PID tracking masked by setsid wrapper → stale server ran pre-fix code;
  EADDRINUSE crashes looked like silent mirror failures. Fixed: read real PID from `ss`.
- `bus.js` edit truncated the emit method mid-session → restored with handler map.
- Test suite: stale `/tmp` event store conflicts, missing `findNode()`, curated-meaning
  scoring assertion, hardcoded bootstrap counts — all fixed properly, 87/87 green.

## Open work (priority order)
1. Deploy onething (`@astrojs/cloudflare` adapter — original name taken) + middleware →
   unlocks per-tool demand dataset (highest-value analysis input)
2. Deploy cancelme (Node host or Workers port) — it is unbundled opportunity #4
3. Wire agentseolab experiments → promotion evidence for standard versions
4. Set `REPAIR_CMD` once auto-repair is trusted; R2/logpush tier for raw logs
5. GET gateway / MCP router over the capability registry (original BRAINSTORM #2)

## Operating quick reference
See `docs/CANONICAL-SITE-ARCHITECTURE.md` §7 and `docs/ANALYSIS-CATEGORIES.md`.
