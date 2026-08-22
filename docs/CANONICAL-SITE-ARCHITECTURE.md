# CANONICAL-SITE-ARCHITECTURE — normalizing fleet sites into finalbuilds2

*2026-08-22. How any site (Worker, Pages, Node SSR, static) becomes one observable,
standard-checked entity in the HydraDB-backed control plane.*

## 1. The normalization contract

A site enters the system by satisfying **site-onboarding v1**
(`standards/site-onboarding/site-onboarding.v1.json`):

| Requirement | Severity | Check |
|---|---|---|
| manifest-complete | required | structural validation (`src/registry/loader.js`) |
| uptime-probe | required | latest `http.status` observation healthy |
| agent-discovery-files | required | `llms.txt` AND `robots.txt` return 2xx |
| usage-telemetry | required-if-applicable | `api.calls` flowing (CF Workers), or declared exemption |
| health-endpoint | recommended | machine-readable health endpoint |

**One JSON file per site** in `registry/sites/`. That is the only registration act.
Everything downstream is derived:

```
registry/sites/<name>.json            ← source of truth (human-editable)
        │ register-sites.mjs          ← canonical site.registered event
        ▼
/v1/events  ──► runtime/events.jsonl  (durable log, rebuildable)
        │           ├── native projection :Site/:Observation nodes  (Cypher analytics)
        │           └── legacy mirror :Entity graph                 (drift machinery)
        ▼
observe-sites.mjs (cron */10)         probes homepage + discovery files
cf-usage.mjs      (cron hourly)       Cloudflare GraphQL → api.calls/cf.errors
conformance.mjs   (cron offset 5)     requirements vs observations → compliance obs
        ▼
GET /v1/drift  → POST /v1/drift/repair → runtime/hermes-outbox.jsonl → agents
```

## 2. Runtime → telemetry binding matrix

| Runtime | Example sites | Telemetry binding |
|---|---|---|
| `cloudflare-workers` | domainnamechecker | `"cloudflare_worker": "<script>"` → cf-usage pulls requests/errors/cpu_p50 (free GraphQL API, no deploy) |
| Pages/static | llmdeals-v2, hackathonhelp | pull probes only; declare `telemetry_exemptions:["usage-telemetry"]` until wired |
| `node-ssr` | onething, cancelme | same exemptions now; later Astro/Express middleware emitting canonical events (needs public control-plane URL, e.g. CF Tunnel) |

Adding a Cloudflare Worker/Pages project later: set the manifest's
`cloudflare_worker` (Pages functions appear as worker scripts), remove the
exemption — conformance starts enforcing `api.calls` automatically.

## 3. Schema rules (learned against live HydraDB v0.x)

1. **~1024-byte query cap.** Graph nodes store query-relevant scalars only
   (`slim()` in the projector); full documents stay in registry files + the
   event log. This is FOUNDRY rule #2/#3 applied: graph ≠ document DB.
2. **Node `id` must be an integer.** Entities use sha256-derived int id +
   `string_id` string property (`src/graph/cypher.js`).
3. No MERGE / no standalone CREATE / no edges between existing nodes.
   - New node ⇒ `CREATE …-[:_GENESIS]->(:_ANCHOR {id:0})`
   - Update ⇒ `MATCH {id} SET`
   - Link ⇒ `Entity{type:'Edge', data:{from_id,kind,to_id}}` keyed `rel:<from>:<kind>:<to>`
4. Lineage queries are property-based (`string_id`, `site_id`) — engine-proven model.

## 4. Capability naming convention

Capabilities are `<domain>.<verb>` lowercase pairs (existing ontology):
`domain.verify`, `cancel.lookup`, `hackathon.find`, `llm.deals.aggregate`.
They are defined once at bootstrap and become resolvable through
`/v1/capabilities/resolve?q=…`.

## 5. Standards lifecycle

- Standards are versioned JSON under `standards/<name>/<name>.vN.json`
  (requirements carry severity: `required` / `recommended` / `required-if-applicable`).
- Sites declare desired versions in their manifest's `standards` object;
  bootstrap materializes CONFORMS_TO desires.
- Conformance emits `standard.compliance` observations; drift = desired ∧ ¬compliant;
  repair tasks land in the Hermes-compatible outbox for agents to execute.
- Promoting a new standard version = new file + bootstrap; experiments
  (agentseolab) provide the promotion evidence per FOUNDRY rule #5.

## 6. Current fleet state (at wiring time)

| Site | Runtime | Status | Compliance |
|---|---|---|---|
| domainnamechecker.tradesprior.workers.dev | CF Worker | UP | ✅ all standards |
| hackathonhelp.pages.dev | Pages static | UP | ✅ all standards |
| llmdeals-v2.pages.dev | Pages static | UP | ✅ all standards |
| cancelme.pages.dev | node-ssr | deploying | ❌ onboarding (expected) |
| inspect.example.com | placeholder | down | ❌ (placeholder) |

## 7. Operating commands

```bash
node scripts/site-add.mjs <id> <domain> [--runtime R] [--worker W]  # scaffold valid manifest
node scripts/register-sites.mjs        # after registry changes (CREATE duplicates!)
node scripts/bootstrap-registry.mjs    # after adding sites or standard versions
node scripts/observe-sites.mjs         # probe fleet (cron */10)
node --env-file=.env scripts/cf-usage.mjs   # usage telemetry (cron hourly :05)
node scripts/conformance.mjs           # check standards (exit 1 = drift)
node scripts/fleet-status.mjs          # dashboard from live Hydra
curl -X POST :8787/v1/drift/repair     # create agent repair tasks from drift
```
