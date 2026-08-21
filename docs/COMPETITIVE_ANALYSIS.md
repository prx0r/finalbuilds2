# GET — Competitive Analysis & Market Position

> GET is the utility layer for AI. Not another MCP directory.

## Market Landscape

| Product | What it owns | Missing relative to GET |
|---------|--------------|------------------------|
| RapidAPI | Huge traditional API marketplace | Account/subscription-centric, weak capability abstraction |
| APIs.guru | Machine-readable OpenAPI encyclopedia | No execution, routing, reliability or consumer UX |
| Official MCP Registry | Canonical MCP server metadata | Server-centric, not capability-centric; MCP only |
| Glama | MCP discovery, tool-level indexing, health/scoring | Closest competitor; still primarily MCP ecosystem |
| Smithery | MCP discovery + auth + installation | Mostly connecting existing integrations |
| Pipedream | 10,000+ tools across 3,000+ APIs + OAuth | Primarily authenticated SaaS actions/integrations |
| Composio | Tool routing + authentication + execution | Integration infrastructure |
| Arcade | Enterprise agent tools/auth/governance | Enterprise actions rather than public micro-utilities |
| ChatGPT Plugin Directory | Distribution inside ChatGPT/Codex | Distribution channel, not neutral universal registry |

## The Gap

Don't define GET as "another MCP directory."

Define it as: **the canonical record and execution surface for a small useful capability, regardless of protocol.**

### Data Model Comparison

```
Glama:     MCP server → tools
RapidAPI:  API provider → API → endpoints
GET:       CAPABILITY → everything else
```

## Canonical Capability Page

Every capability has one URL answering virtually every question:

```
GET /json/repair

Accept: text/html      → human site
Accept: text/markdown   → LLM documentation
Accept: application/json → canonical capability record
```

Capability record:

```json
{
  "id": "get://json/repair",
  "name": "Repair malformed JSON",
  "status": "healthy",
  "interfaces": {
    "web": "https://g-et.com/json/repair",
    "http": "https://api.g-et.com/v1/json/repair",
    "mcp": "https://mcp.g-et.com/data",
    "openapi": "https://api.g-et.com/openapi.json"
  },
  "pricing": { "type": "free" },
  "performance": {
    "p50_ms": 18,
    "p95_ms": 43,
    "success_rate_30d": 0.9998
  }
}
```

## Tool Router Architecture

Don't expose 10,000 tools. Expose:

```
search_capabilities(query, constraints)
inspect_capability(id)
execute_capability(id, input)
```

## ChatGPT Distribution

### Strategy A — GET Utility App

One ChatGPT app: "What useful operation do you need?"

Backed by search → inspect → execute.

### Strategy B — Promote Exceptional Capabilities

Standalone website + MCP + ChatGPT app separately.

## Core Promise

> **Useful functions that just work.**

No account. No API key. No "free trial." No credit card.

For costly operations: `402 → payment → result`.

## Reliability as Moat

Measure and publish:

```
Last checked:       34 seconds ago
30d uptime:         99.997%
p50 latency:        24 ms
p95 latency:        71 ms
sample tests:       4,921 / 4,923 passed
schema valid:       yes
MCP handshake:      yes
```

## Target Categories (Initial 50)

TEXT, JSON, HTML, XML, CSV, URLs, DNS, domains, HTTP, dates, encoding, hashing, identifiers, files, images, PDF, developer transforms, web extraction, validation, format conversion.

## Positioning

- **For humans:** Tiny tools that just work.
- **For machines:** Canonical, tested, machine-callable capabilities.
- **For ChatGPT:** One connection that lets it discover the small deterministic function it needs.

## The Loop

```
FIND PROBLEM → BUILD → EVALUATE → CANONICAL PAGE → Web/OpenAPI/MCP → DISTRIBUTE → USE → TELEMETRY → improve/promote/kill → HYDRA
```
