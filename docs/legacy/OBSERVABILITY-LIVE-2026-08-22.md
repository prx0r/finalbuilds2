# Observability Live — 2026-08-22

Fleet observability wired end-to-end against **live HydraDB** on this box.

## What runs now

| Piece | Detail |
|---|---|
| HydraDB node | Docker `ghcr.io/hydra-db/hydradb:latest` via `docker-compose.hydra.yml`, graph `finalbuilds`, cell `cell-0`. Ready + round-trip write verified. |
| Control plane | `node --env-file=.env src/server/http.js` → :8787, PID in `runtime/control-plane.pid`, log `runtime/control-plane.log` |
| Canonical ingestion | `/v1/events` now **actually projects into Hydra** (`HydraExecutor` wired; was stubbed TODO). `GRAPH_BACKEND=hydra` gates it; failures never block persistence. |
| Sensor | `scripts/observe-sites.mjs` probes every `registry/sites/*.json`: homepage status/latency, llms.txt, robots.txt → canonical `observation.recorded` events |
| Registration | `scripts/register-sites.mjs` emits `site.registered` (run once per registry change — CREATE is not idempotent) |
| Fleet dashboard | `scripts/fleet-status.mjs` queries live Hydra, prints latest obs per site/metric with ok/FAIL |
| Cron | Every 10 min sensor appends to `runtime/sensor.log` (coexists with crypto-lab cron) |

## Fleet state at wiring time

- `site_domainnamechecker` — UP, 200 (~120ms), llms.txt ✓, robots.txt ✓
- `site_llmdeals` — DOWN (DNS doesn't resolve yet; dell-new deploy pending)
- `site_url_inspector` — DOWN (placeholder domain)

## Verified against live Hydra (not mocks)

- 7/7 strict `hydra-real-live.test.js`; suite 85/85
- Direct Cypher after sensor run returns 3 Site nodes + observation history
  (`MATCH (n:Observation) WHERE n.site_id = 'site_domainnamechecker' ...`)

## Fixed this session

1. http.js ingestion stub → live `HydraExecutor` (env: `HYDRA_URL/TOKEN/GRAPH_ID/NAMESPACE/CELL_ID`)
2. Projector handles `site.registered`; observations carry site_id/value/ok/url/timestamp
3. Executor accepts both `HYDRA_*` and `HYDRADB_*` env spellings; sends `X-Graph-Namespace`
4. Pre-existing test failures fixed honestly:
   - hydra-live: `/tmp/foundry-test-events` cleared in `before()` (stale event_ids conflicted across runs)
   - LocalGraphStore gained `findNode()` (test called a method that didn't exist)
   - domain-search test used curated-meaning domain (`get-api.com`) as if uncurated

## Cloudflare hookup — researched & chosen (2026-08-22 PM)

Cloudflare's observability layers evaluated for feeding Hydra:

| Layer | Cost | Direction | Verdict |
|---|---|---|---|
| Workers Logs/Traces/Query Builder | Paid plan | dashboard-only | ✗ not exportable |
| Tail Worker (realtime invocation stream) | Free | push | Phase 3 — needs public control-plane URL (CF Tunnel) |
| Logpush → R2 | $0.05/M | batch | Later raw-evidence tier (matches FOUNDRY rule: R2 = immutable raw) |
| Analytics Engine | Paid plan | SQL pull | Redundant while GraphQL API works |
| **GraphQL Analytics API** | **Free, token-only** | **pull** | ✅ **chosen — zero deploys, real usage data** |

**Implemented:** `scripts/cf-usage.mjs` (hourly cron :05) pulls per-worker
`requests / errors / cpu_p50` from `workersInvocationsAdaptive` for every site
manifest carrying `"cloudflare_worker": "<script>"`, then emits canonical
`observation.recorded` events: `api.calls` (the experiment/attribution metric),
`cf.errors`, `cf.cpu_p50_us`. Verified live: domainnamechecker 3 calls, 0 errors.

**onething note:** Astro SSR (`@astrojs/node`), NOT a Worker — no wrangler.
When deployed it gets a registry manifest like the rest; if we want in-app
telemetry, add Astro middleware emitting canonical events to the control plane
(then expose the control plane via CF Tunnel). Until then pull sensors cover it.



- Re-running `register-sites.mjs` duplicates Site nodes (Hydra has no MERGE); re-register only on registry change
- Lineage is property-based (`site_id`, `string_id`), not edge traversal (Hydra v0.x constraint)
- Container token lives in `runtime/hydradb-data/auth-token` = `.env:HYDRA_TOKEN`
- If control plane dies between shells: `cd /root/finalbuilds2 && setsid nohup node --env-file=.env src/server/http.js > runtime/control-plane.log 2>&1 & echo $! > runtime/control-plane.pid`
