# FinalBuilds Control Plane — The Full Architecture

> A control plane for a fleet of agent-native products. Not a monorepo of websites.

## Core Architecture

```
                   FINALBUILDS CONTROL PLANE
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
    REGISTRY              POLICIES            SOURCE
 "what exists"        "how it should be"    actual projects
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                       RECONCILER
                             │
                  compare desired/observed
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
          no action       proposal       repair task
                                            │
                                            ▼
                                      HERMES KANBAN
                                            │
                                      coding agents
                                            │
                                       git worktree
                                            │
                                            ▼
                                           PR
                                            │
                                  tests / eval / preview
                                            │
                                            ▼
                                          merge
                                            │
                                            ▼
                                    affected deploys
                                            │
                                            ▼
                                   post-deploy sensors
                                            │
                                            └───────────┐
                                                        │
                                                        ▼
                                                 OBSERVED STATE
```

## The Six-Stage Loop

```
┌───────────────────────────────────────┐
│ 1. OBSERVE                           │
│   sensors, web research, telemetry   │
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ 2. UNDERSTAND                        │
│   intelligence reports, LLM analysis │
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ 3. DECLARE                           │
│   standards, policies, versions      │
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ 4. RECONCILE                         │
│   compare fleet with desired state   │
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ 5. ACT                               │
│   Hermes, Codex, codemods, PRs       │
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ 6. PROVE                             │
│   tests, browser, SEO, usage, rollback│
└──────────────────┬────────────────────┘
                   └────────► OBSERVE
```

## Risk Classification

| Class | Description | Autonomy |
|-------|-------------|----------|
| 0 | Generated metadata (llms.txt, sitemap) | Auto-patch, auto-merge |
| 1 | Deterministic frontend (footer, tags) | Canary → test → auto-merge |
| 2 | Behavior changes (API, MCP) | PR + independent review |
| 3 | Economic/security (billing, auth) | Human approval required |

## Idea Lifecycle

```
SEED → RESEARCHED → APPROVED → BUILDING → VERIFYING → GRADUATED → PRODUCTION → MAINTAINED
```

## Factory Constraints

```yaml
factory:
  max_building: 2
  max_verifying: 4
  max_new_per_day: 1

requirements:
  tests: pass
  domain: required
  mcp: preferred
  seo: required
  agent_web: required

budget:
  inference_per_day: 2.00
```

## Declarative Site Manifest

```yaml
# registry/sites/domain-tool.yaml

id: domain-tool

identity:
  name: Domain Tool
  domain: example.com
  lifecycle: production

source:
  path: apps/domain-tool

capabilities:
  - domain.generate
  - domain.check
  - domain.compare

interfaces:
  web: true
  rest: true
  mcp: true
  webmcp: true

deployment:
  provider: cloudflare
  worker: domain-tool

standards:
  seo: "^3"
  agent_web: "^2"
  llms_txt: "^2"
  structured_data: "^4"

automation:
  risk_class: low
  auto_patch: true
```

## Tech Stack

| Component | Tool |
|-----------|------|
| Monorepo engine | Nx |
| Task lifecycle | Hermes Kanban |
| Catalog model | Backstage |
| Reconciliation | Argo CD pattern |
| Workflows | Cloudflare Workflows |
| Codemods | ast-grep + OpenRewrite |
| Dependencies | Renovate |
| Registry | MCP Registry |

## The IP

```text
finalbuilds-control-plane

├── registry schema
├── capability schema
├── site schema
├── standard schema
├── sensor event schema
├── research → policy compiler
├── reconciliation engine
├── Hermes dispatcher
├── fleet telemetry
└── agent-native standards packs
```
