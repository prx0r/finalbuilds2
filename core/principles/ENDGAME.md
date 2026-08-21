# The Endgame — Autonomous Software Ecosystem Compiler

> 10,000 API/MCP capabilities is not crazy at all. What would be crazy is maintaining 10,000 unrelated SaaS applications manually.

## Core Architecture

```
                          THE WORLD
                             │
           ┌─────────────────┼──────────────────┐
           ▼                 ▼                  ▼
        research          standards           usage
       GitHub/APIs       web changes        production
           │                 │                  │
           └─────────────────┼──────────────────┘
                             ▼
                        EVENT STORE
                             │
                        R2 immutable
                             │
                             ▼
                         HYDRADB
                    living world model
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
        capability       dependency        evidence
          graph             graph             graph
            │                │                │
            └────────────────┼────────────────┘
                             ▼
                         PLANNER
                   frontier reasoning model
                             │
                             ▼
                    DESIRED STATE / GIT
                             │
                             ▼
                       RECONCILER
                             │
                             ▼
                      HERMES KANBAN
                             │
           ┌─────────────────┼──────────────────┐
           ▼                 ▼                  ▼
       researcher          coder             verifier
                             │
                             ▼
                         BUILDS
                             │
                             ▼
                         PROVE
                             │
                             ▼
                        PUBLISH
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
             MCP            API            WEB
                             │
                             ▼
                          USERS
                      humans + agents
                             │
                             ▼
                        TELEMETRY
                             │
                             └──────────────► HYDRADB
```

## The Scaling Rules

1. Never create a new codebase when a new manifest will do
2. Never create a new product when a new capability will do
3. Never ask an LLM to rediscover something the graph already knows
4. Never apply a fleet change independently when one versioned standard/codemod can express it

## Capability Hierarchy

```
10,000 capabilities
    4,000 public tools
        400 useful human tool pages
            50 substantial products
                10 major brands
```

## Experiments System

```
OBSERVE WORLD
     │
     ▼
discover pain / standard / API / research / failure
     │
     ▼
UPDATE GRAPH
     │
     ▼
find missing or improvable capability
     │
     ▼
generate CapabilitySpec
     │
     ▼
search existing services + GitHub
     │
     ▼
compose cheapest implementation
     │
     ▼
build
     │
     ▼
adversarial tests
     │
     ▼
deploy canary
     │
     ▼
observe actual usage
     │
     ├──── bad ───► deprecate / learn
     │
     └──── good ──► graduate
                       │
                       ▼
               available to factory
                       │
                       └────────────↺
```

## Statistical Learning

For every architectural choice, record outcomes:

| Strategy | Success | p95 | Cost | Security |
|----------|---------|-----|------|----------|
| raw fetch parser | 91% | low | tiny | 0 |
| browser rendering | 98% | high | high | 0 |
| external API | 96% | medium | medium | 3 outages |

## Event Schema

```json
{
  "event_id": "uuid",
  "event_type": "capability.call",
  "timestamp": "2026-08-21T00:00:00Z",
  "source": "domain-tool",
  "entity": {
    "type": "capability",
    "id": "domain.check"
  },
  "payload": {
    "input": { "domain": "example.com" },
    "output": { "has_dns": true },
    "latency_ms": 81,
    "status": "success",
    "cached": true,
    "cost_usd": 0.00001
  },
  "context": {
    "interface": "mcp",
    "agent_id": "chatgpt",
    "session_id": "..."
  }
}
```

## Graph Queries

### Find missing capabilities
```cypher
MATCH (task:Task)-[:REQUIRES]->(cap:Capability)
WHERE NOT EXISTS((:Tool)-[:IMPLEMENTS]->(cap))
RETURN cap, count(task) as demand
ORDER BY demand DESC
```

### Find blast radius
```cypher
MATCH (std:Standard)-[:AFFECTS]->(site:Site)
WHERE std.version = 'v4'
RETURN site.id, site.identity.domain
```

### Find best implementation
```cypher
MATCH (tool:Tool)-[:IMPLEMENTS]->(cap:Capability {id: 'domain.check'})
MATCH (tool)-[:OBSERVED_BY]->(obs:Observation)
RETURN tool, avg(obs.latency) as avg_latency, avg(obs.success) as success_rate
ORDER BY success_rate DESC, avg_latency ASC
```

### Find dependency chains
```cypher
MATCH path = (start:Capability)-[:DEPENDS_ON*]->(end:Capability)
WHERE start.id = 'domain.monitor'
RETURN path
```

## HydraDB Integration

```typescript
// Graph store interface
interface GraphStore {
  upsertNode(type: string, id: string, properties: Record<string, any>): Promise<void>;
  upsertEdge(source: string, target: string, type: string, properties: Record<string, any>): Promise<void>;
  neighbors(nodeId: string, edgeType?: string): Promise<Node[]>;
  paths(source: string, target: string, maxDepth?: number): Promise<Path[]>;
  query(cypher: string): Promise<any>;
  snapshot(): Promise<GraphSnapshot>;
}
```

## Experiment Lifecycle

```yaml
experiment:
  id: exp-001
  name: "llms-txt-v2-migration"
  hypothesis: "Upgrading to llms.txt v2 improves agent discovery"
  
  control:
    sites: [site-a, site-b, site-c]
    standard: "llms-txt@1"
  
  treatment:
    sites: [site-d, site-e, site-f]
    standard: "llms-txt@2"
  
  metrics:
    - agent_referrals
    - citation_frequency
    - crawl_frequency
    - mcp_calls
  
  duration: "2 weeks"
  status: "running"
```

## The Key Insight

> The factory gets an increasingly accurate model of what has worked before.

Not mystical self-improvement. Statistical, evidential, graph-based learning from thousands of production systems.
