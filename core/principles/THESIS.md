# What Can't ChatGPT Do? — The Capability Foundry Thesis

> Find tasks where generic ChatGPT is already intelligent enough to reason, but still lacks a reliable external capability; build that missing capability once; expose it to agents as MCP/API and to humans as a minimal website; charge only when there is a real marginal cost.

---

# The Architecture

```text
                       AGENTIC WEB

             discovery / identity / trust
                     ERC-8004
                         │
                         ▼
               capability description
                    MCP / A2A
                         │
                         ▼
                 tool invocation
                       HTTP
                         │
                         ▼
                 payment if needed
                   MPP / x402
                         │
                         ▼
                   YOUR SENSOR
                         │
               evidence + result
                         │
                         ▼
             reputation / validation
```

---

# 1. Capability Foundry

```text
CAPABILITY FOUNDRY
│
├── GAP       "What can't ChatGPT reliably do?"
├── PAIN      "What simple task is unnecessarily annoying?"
├── REPLACE   "What paid/legacy service should be cheaper?"
├── SCOUT     "What already exists?"
├── COMPOSE   "What OSS/modules can we reuse?"
├── DOMAIN    "What should this capability be called?"
├── BUILD     coding agent
├── PROVE     "Does it actually outperform vanilla ChatGPT?"
├── PUBLISH
│   ├── MCP
│   ├── REST
│   ├── website
│   └── structured machine metadata
├── PRICE     marginal-cost pricing
├── OBSERVE   production measurements
└── REUSE     make it available to every future product
```

---

# 2. Don't build a giant "idea validation AI"

ChatGPT is already extremely good at understanding ideas, identifying competitors, reasoning about users, proposing business models, decomposing products, brainstorming improvements, analyzing positioning.

The idea layer should provide ChatGPT with evidence it doesn't inherently possess.

```text
ChatGPT = analyst

your system = Bloomberg terminal / laboratory / sensors
             for software-product ideas
```

---

# 3. The minimal Idea Gate

## Gate A — Vanilla ChatGPT test

Ask a current frontier ChatGPT to perform the actual end-user task.

```json
{
  "task": "find a safe available domain",
  "baseline": {
    "reasoning_quality": "high",
    "live_availability": "partial",
    "registrar_price_accuracy": "partial",
    "historical_domain_check": "weak",
    "exhaustiveness": "weak"
  },
  "missing_capabilities": [
    "authoritative availability",
    "registrar normalization",
    "historical observation",
    "bulk enumeration"
  ]
}
```

---

# 4. GAP — the "What Can't ChatGPT Do?" MCP

### MCP tools

```text
gap.baseline
gap.decompose
gap.compare
gap.requirements
gap.test
```

### `gap.baseline`

Input:

```json
{
  "task": "find the cheapest currently available domain that fits my product",
  "success_criteria": []
}
```

Stores: prompt, environment, model/version, tool access, result, citations, execution time, cost.

---

### `gap.decompose`

Transforms a user goal into atomic capability requirements.

Classify every node:

```text
NATIVE_LLM
WEB_SEARCHABLE
API_REQUIRED
CRAWLER_REQUIRED
COMPUTATION_REQUIRED
PERSISTENT_STATE_REQUIRED
ACTION_REQUIRED
HUMAN_REQUIRED
```

---

# 5. Capability Delta

```text
Capability Delta =
What our service can reliably provide
−
What generic ChatGPT already reliably provides
```

For domain ideation:

```text
creative naming                         Δ ~ tiny
brand reasoning                         Δ ~ tiny
language analysis                       Δ ~ tiny

bulk authoritative availability         Δ ~ huge
registrar price normalization           Δ ~ huge
renewal-price monitoring                Δ ~ huge
historical observation                  Δ ~ huge
machine-actionable registration         Δ ~ huge
```

Build the latter five. Don't spend time on the first three.

---

# 6. PAIN — consumer-friction sensor

Normalize complaints into jobs:

```json
{
  "job": "merge two PDFs",
  "current_workflow": [
    "search Google",
    "open website",
    "upload private document",
    "hit usage restriction",
    "see subscription offer"
  ],
  "consumer_frequency": "occasional",
  "subscription_fit": "very poor",
  "technical_cost": "near zero",
  "browser_local_possible": true
}
```

---

# 7. Pricing mismatch detector (PRICEFIT)

```text
Incumbent: $10/month
Typical user: 3 operations/month
Our marginal cost: $0.006/month
Subscription suitability: very low
Replacement thesis:
  free human frontend
  free MCP cached/basic
  $0.003/costly invocation
```

---

# 8. Pricing doctrine

### Tier 0 — Free computation
If the action costs essentially nothing, don't meter it.

### Tier 1 — Free reasonable allowance
For tiny-cost calls: 20 domain searches/day, 100 metadata lookups/day.

### Tier 2 — True usage pricing
For externally costly operations: cost + margin.

### Tier 3 — Subscriptions only when the user is actually buying persistence

> Don't charge recurring rent for a stateless function. Charge recurring fees for recurring work.

---

# 9. Agent payments make tiny APIs viable

```text
                  FREE DISCOVERY

agent ─────────────► MCP
                       │
                       ├── cheap_tool()     FREE
                       ├── cached_tool()    FREE
                       └── costly_tool()
                              │
                            HTTP 402
                              │
                    "$0.004 required"
                              │
                            payment
                              ▼
                            result
```

---

# 10. ERC-8004 gives tools another dimension

ERC-8004 defines: Identity, Reputation, Validation.

Agent registration metadata can point at MCP endpoint:

```json
{
  "name": "Domain Sensor",
  "services": [
    {
      "name": "MCP",
      "endpoint": "https://domain.example/mcp"
    }
  ],
  "x402Support": true
}
```

---

# 11. SCOUT — do not duplicate the Internet

Before coding anything, give the build agent an exhaustive discovery module.

```text
scout.products — find human websites, APIs, MCPs, mobile apps, extensions, OSS
scout.github — find repos, SDKs, scrapers, parsers, reference implementations
```

Score: license, last commit, maintainers, test coverage, dependency health, security, modularity.

---

# 12. REPLACE — economic obsolescence scanner

Target: software where the underlying operation has become radically cheaper than the incumbent pricing model reflects.

```text
Incumbent price / cost ratio → COST MODEL → REPLACEMENT THESIS
```

---

# 13. Clone capabilities, not proprietary implementations

```text
REIMPLEMENT
✓ public functionality
✓ open standards
✓ documented protocols
✓ permissively licensed OSS
✓ browser-native computation

DON'T COPY
✗ proprietary source
✗ private assets
✗ copyrighted website text
✗ trademarks/branding
✗ leaked/internal APIs
```

---

# 14. DOMAIN — first-class factory capability

```text
domain.generate
domain.expand
domain.check
domain.price
domain.history
domain.conflicts
domain.score
domain.select
```

---

# 15. COMPOSE — OSS-first build optimizer

Given desired capability, decompose and ask:

```text
already solved?
    │
    ├── yes, good OSS ──► reuse
    ├── yes, bad OSS ───► reimplement
    └── no ─────────────► build
```

---

# 16. BUILD — coding agent consumes a CapabilitySpec

```yaml
capability:
  id: domain-intelligence
  purpose: >
    Give humans and agents reliable domain discovery and
    availability intelligence.
  baseline_gap:
    native_llm:
      generation: strong
    external:
      live_availability: required
  interfaces:
    web: true
    rest: true
    mcp: true
  economics:
    free: [generate_domains, cached_check]
    metered: [authoritative_check, deep_history]
```

---

# 17. PROVE — every product must beat the blank-chat baseline

```text
TASK                          CHATGPT    + SENSOR
--------------------------------------------------
generate good domains          9/10       9/10
find actually available        5/10      10/10
current renewal prices         4/10       9/10
check 500 candidates           2/10      10/10
reproducible output            4/10      10/10
```

If your sensor does not materially improve anything: delete it.

---

# 18. Website should be almost incidental

```text
                     CAPABILITY
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
      MCP               API               WEB
    agents          developers          humans
```

---

# 19. "Legacy site → agentic site" is a product category

```text
LEGACY SITE → CRAWL → extract capabilities → infer APIs → build MCP façade
```

---

# 20. Agent-SEO expands into Agentic Modernization

Output:

```text
HUMAN WEB
✓ mobile ✓ understandable ✓ indexed

AGENT WEB
✗ no structured capability manifest
✗ no MCP
✗ no machine-readable pricing
✗ requires account creation
✗ subscription-only
✗ no programmatic payment
```

---

# 21. Identify obsolete websites automatically (Archaeology)

```text
Could this 2018 SaaS now be:
1. implemented client-side?
2. implemented with commodity APIs?
3. solved by an LLM?
4. exposed directly as an MCP tool?
5. delivered for near-zero marginal cost?
```

---

# 22. Three discovery engines

```text
1. CAPABILITY GAPS — What can't a frontier agent reliably do?
2. PAIN GAPS — What easy thing remains unnecessarily annoying?
3. ECONOMIC GAPS — What is priced according to old software economics?
```

---

# 23. Competition pass

```text
Does it exist?
YES → free+excellent+agent-native? KILL
    → excellent but expensive? PRICE OPPORTUNITY
    → cheap but human-only? AGENTIZATION OPPORTUNITY
    → mediocre? QUALITY OPPORTUNITY
    → open source but inaccessible? PACKAGING OPPORTUNITY
NO → CAPABILITY OPPORTUNITY
```

---

# 24. Scoring system

| Dimension | Question |
|-----------|----------|
| Delta | Does ChatGPT genuinely lack the capability? |
| Pain | Is the task annoying or recurring? |
| Cost Collapse | Can we make it radically cheaper? |
| Composability | Will other agents/products call it? |
| Evidence | Can we provide objectively better data/results? |
| Build Leverage | Can OSS + existing sensors build most of it? |

```text
0–7    kill
8–11   backlog
12–14  prototype
15–18  build immediately
```

---

# 25. The project family

```text
01 GAP       What can't ChatGPT reliably do?
02 PAIN      What do people struggle unnecessarily with?
03 ARCHAEOLOGY  Which old SaaS economics are obsolete?
04 SCOUT     Existing products/APIs/MCPs/research
05 GITGOBLIN Existing reusable implementation
06 DOMAIN    Generate/check/evaluate a name
07 DELL      Pick cheapest sufficient inference
08 BUILDER   Compose + implement missing code
09 PROVE     Test against ChatGPT baseline
10 AGENT-SEO Make result discoverable/usable by agents
11 PUBLISH   Deploy Web + REST + MCP + payments
12 TRUST     ERC-8004 reputation aggregation
13 COST      marginal-cost calculator
14 STATUS    uptime/freshness/evidence monitoring
15 DISCOVERY searchable catalog
```

---

# 26. Recursive improvement

```text
product 1      ████████████████████
product 5      █████████████
product 20     ███████
product 100    ███
```

Maximum accumulation of reusable capabilities.

---

# 27. Mature loop

```text
"I need capability X."
    → GAP → SCOUT → GITGOBLIN → DOMAIN → DELL → COMPOSE → BUILD → PROVE → AGENT-SEO → PUBLISH → OBSERVE → becomes tool for next build
```

---

# 28. Public philosophy

> Software should charge according to the work it actually performs.

Where it costs almost nothing: make it free.
Where genuine ongoing cost exists: charge for the cost.
Where genuine ongoing service exists: charge recurring.

---

# 29. Product thesis

> Find useful capabilities missing from frontier agents.
> Find everyday software whose friction or pricing exists because of obsolete technical assumptions.
> Rebuild only the missing capability using current open models, open-source software and cheap compute.
> Expose one canonical service through MCP/API for machines and a minimal frontend for humans.
> Make basic functionality free; meter genuinely costly operations near their marginal cost.
> Measure whether the capability actually improves a frontier agent before publishing it.
> Make every published capability reusable by the factory that created it.

---

# 30. Build first

```text
capability-spec
GAP baseline harness
SCOUT/GitHub research
DOMAIN MCP
shared MCP/REST/Web template
MPP/x402-capable pricing layer
PROVE eval harness
Cloudflare deployment module
```

Then use that exact system to manufacture the next sensor.
