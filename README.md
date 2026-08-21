# FinalBuilds2 — The Capability Foundry Control Plane

> A working reference implementation of the FinalBuilds spine: an append-only, experiment-aware control plane that tracks the complete lineage of tiny agent-native products from idea-generation method through research/build/deployment to observed usage and controlled SEO/agent-discovery experiments.

## Quick Start

```bash
# Run tests
npm test

# Run demo
npm run demo

# Run scale smoke test (10,000 capabilities)
npm run scale:smoke

# Run HydraDB integration (requires Docker)
npm run hydra:smoke
```

## Architecture

```
finalbuilds2/
├── src/
│   ├── event/           # Append-only JSONL event store
│   ├── graph/           # In-memory + HydraDB HTTP adapter
│   ├── controller/      # Factory controller + reconciliation
│   ├── experiments/     # Deterministic cohort assignment
│   ├── analytics/       # Attribution by process/product
│   ├── resolver/        # Capability resolver (10,000+ tools)
│   ├── planner/         # Idea scoring and capacity gating
│   ├── reconcile/       # Standards drift detection
│   ├── standards/       # Version registry
│   ├── registry/        # Entity registration
│   ├── dispatch/        # Hermes-compatible task outbox
│   ├── server/          # HTTP control-plane API
│   ├── cli/             # Command-line interface
│   └── model/           # Domain types
├── core/
│   └── design-system/   # Shared CSS, tokens
├── standards/
│   └── agent-discovery/ # Versioned standards
├── registry/
│   ├── ideas/           # Seed ideas
│   └── sites/           # Site manifests
├── policies/
│   └── autonomy.json    # Risk classification
├── scripts/             # Integration scripts
├── test/                # Test suite
└── docs/                # Architecture docs
```

## Core Lineage

```
IdeaGenerator
    │ GENERATED
    ▼
Idea
    │ BUILT_BY
    ▼
BuildRun
    │ PRODUCED
    ▼
Product
    │ EXPOSES
    ▼
Site
    │ OBSERVED_BY
    ▼
Observation
```

## Key Features

- **Append-only event log** — Durable, rebuildable graph projection
- **Generic process lineage** — Track any process and attribute outcomes
- **Deterministic experiments** — SHA-256 cohort assignment
- **Standards reconciliation** — Detect drift, generate repair tasks
- **Attribution analytics** — Which process produced the best outcomes
- **Capability resolver** — Maps intent to tools (tested at 10,000 scale)
- **HTTP control plane** — Full API with auth
- **Hermes-compatible outbox** — JSONL task dispatch

## CLI Commands

```bash
node src/cli/main.js seed registry/ideas/seed.json
node src/cli/main.js rebuild
node src/cli/main.js tick 1
node src/cli/main.js drift
node src/cli/main.js repair
node src/cli/main.js attribution api.calls
node src/cli/main.js experiment-report <experiment-id>
node src/cli/main.js entities Site
```

## HTTP Endpoints

```text
GET  /healthz
POST /v1/observations
POST /v1/failures
POST /v1/controller/tick
GET  /v1/drift
POST /v1/drift/repair
GET  /v1/analytics/attribution?metric=api.calls
GET  /v1/analytics/products?metric=api.calls
GET  /v1/analytics/processes?stage=idea-generation&metric=api.calls
GET  /v1/capabilities/resolve?q=check+domain
POST /v1/experiments
POST /v1/experiments/:id/assign
GET  /v1/experiments/:id/report
```

## HydraDB Integration

The graph projection supports HydraDB via HTTP/OpenCypher:

```bash
export GRAPH_BACKEND=hydra
export HYDRA_URL=http://127.0.0.1:8443
export HYDRA_GRAPH_ID=finalbuilds
export HYDRA_NAMESPACE=default
export HYDRA_CELL_ID=cell-0
export HYDRA_TOKEN=local-development-token-32-bytes
node src/server/http.js
```

## What's Implemented

- 14/14 tests passing
- 10,000-capability scale smoke (74ms materialize, 58ms resolve)
- Full idea → build → product → usage attribution
- Standards drift/reconciliation
- Controlled SEO experiment simulation
- Generic process attribution
- Append-only graph rebuild
- HydraDB HTTP contract adapter

## Next Steps

1. Connect to live HydraDB instance
2. Add Hermes Kanban adapter
3. Add GitHub webhook ingestion
4. Add uniform telemetry SDK
5. Add Cloudflare deployment integration
6. Run first real cross-site experiment
