# Brainstorm: What to Build Next

## Current State

| Project | Status | What it does |
|---------|--------|--------------|
| **finalbuilds2** | ✅ 42/42 tests | Control plane, domain search, Gmail |
| **domainnamechecker** | ✅ Deployed | Domain intelligence, RDAP, scoring |
| **agentseolab** | ✅ Rust CLI | Experiment infrastructure |
| **agentseo** | ✅ Rust MCP | Codebase optimization |

## HydraDB Capabilities

- Distributed graph database
- OpenCypher queries
- S3-compatible storage
- Bolt 5.x + HTTP API
- Snapshot-consistent reads
- GraphBLAS traversal

## What's Missing

1. **Persistent state** — finalbuilds2 uses in-memory/JSONL, needs HydraDB
2. **GET gateway** — Router that dispatches to all tools
3. **Capability registry** — Central catalog of all capabilities
4. **Agent preference experiments** — Using agentseolab methodology
5. **Domain intelligence pipeline** — Experiments + evidence

## Cool Ideas

### 1. Connect finalbuilds2 to HydraDB
**What:** Replace in-memory graph with HydraDB
**Why:** Persistent state, proper graph queries
**How:** Use HydraDB HTTP API from finalbuilds2

### 2. Build the GET Gateway
**What:** MCP server that routes to all capabilities
**Why:** Single entry point for agents
**How:** Router dispatches to domainnamechecker, agentseo, etc.

### 3. Capability Registry in HydraDB
**What:** Graph of all capabilities with relationships
**Why:** Agent discovery, composition, lineage
**How:** Store in HydraDB, query with OpenCypher

### 4. Agent Preference Experiments
**What:** Run blind tournaments across models
**Why:** Empirically measure which tools agents prefer
**How:** Use agentseolab + promptfoo

### 5. Domain Intelligence Pipeline
**What:** Generate → verify → score → test → track
**Why:** Full lifecycle from idea to deployment
**How:** Combine all projects

### 6. GEO Benchmarking
**What:** Measure citation rates across engines
**Why:** Prove content changes improve visibility
**How:** Use promptfoo + Moltbook data

### 7. Agent Language Corpus
**What:** Build corpus from Moltbook + GitHub
**Why:** Understand agent lexical patterns
**How:** Moltbook SDK + analysis

### 8. Tool Description A/B Testing
**What:** Test which MCP descriptions agents prefer
**Why:** Description phrasing affects selection
**How:** Randomize, track selection rates

## Priority Order

1. **Connect finalbuilds2 to HydraDB** — Foundation for everything else
2. **Build GET gateway** — Single entry point
3. **Capability registry** — Central catalog
4. **Agent preference experiments** — Scientific validation
5. **Domain intelligence pipeline** — Full lifecycle

## What do you think?

Which of these should we build first?
