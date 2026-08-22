# ANALYSIS-CATEGORIES — fleet observability → unbundled research

*2026-08-22. Connects finalbuilds2 telemetry to /root/unbundled (the $0.003
transaction thesis) so usage data can eventually feed opportunity scoring.*

## Fleet mapped to unbundled opportunities

Manifests carry an `unbundle` field linking each site to the ranked opportunity
it implements (`unbundleproducts.md`, `100PRODUCTS.md`):

| Site | Opportunity | Rank | Score | Capability tags |
|---|---|---|---|---|
| llmdeals-v2.pages.dev | LLM Deal Intelligence | #1 | 94 | llm.deals.*, llm.pricing.* |
| cancelme | Subscription Cancellation Resolver | #4 | 88 | cancel.* |
| domainnamechecker | Domain Finder + Live Buying | #5 | 87 | domain.* |
| onething | 60-tool umbrella (OneCancel = #4 subset) | — | — | pdf/qr/csv/timezone utilities |
| hackathonhelp | (not yet scored against taxonomy) | — | — | hackathon.* |

## How telemetry maps to UnbundleScore dimensions

`UnbundleScore = Demand × Pricing × Episodicity × Replicability × Growth / Competition`

| Dimension | Proxy we already collect | Where |
|---|---|---|
| Demand | `api.calls` per site (real CF traffic); later per-path counts | Hydra Observation nodes, hourly |
| Episodicity | repeat-caller distribution: distinct agents vs total calls over time | needs caller identity → middleware/beacon phase |
| Growth | week-over-week delta of api.calls; new-path discovery rate | derivable via Cypher now |
| Reliability (precondition for any score) | `http.status`, `path.status:*`, `cf.errors` conformance | live |
| Pricing / Replicability / Competition | static research fields from unbundled repo, not observable | join key = `unbundle.opportunity` |

## Analysis queries that work today

```cypher
-- weekly demand trend per site
MATCH (n:Observation) WHERE n.metric = 'api.calls'
RETURN n.site_id AS site, n.value AS calls, n.recorded_at AS at ORDER BY at;

-- availability SLO per granular endpoint
MATCH (n:Observation) WHERE n.metric STARTS WITH 'path.status'
RETURN n.site_id AS site, n.url AS path,
       count(*) AS checks, sum(CASE WHEN n.ok THEN 1 ELSE 0 END) AS ok_checks;
```

## Next analysis phases (in order of value)

1. **Per-tool granularity on onething** once deployed: 60 tools = 60 probe_paths +
   middleware emitting `observation.recorded` with `context.tool_id`. That is the
   single highest-value demand dataset (episodicity per tool).
2. **Agent-discovery experiments** (agentseolab): blind tournaments over the
   fleet's llms.txt/MCP descriptions; selection-rate observations land as
   `experiment.observation.recorded` events keyed by experiment_id.
3. **Score feedback loop**: recompute unbundled scores quarterly using measured
   Demand/Growth proxies instead of survey estimates; promote/demote build ideas
   accordingly (planner consumes via `/v1/analytics/processes`).

## Guardrails (from the foundry rules)

- Raw high-volume request logs belong in R2/logpush, not Hydra nodes.
- Every headline number must be a queryable graph value or a run-recorded hash —
  no dashboard-only truths.
