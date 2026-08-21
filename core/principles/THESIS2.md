# TinyTools — The Stdlib for Agents

> Build the free utility layer of the agentic web before incumbents bother adapting their SaaS products.

## Core Insight

The historical cost of packaging software is collapsing faster than incumbent pricing and interfaces are adapting.

```text
OLD API ECONOMY
discover site → create account → choose subscription → card → API key → integrate SDK → call endpoint

AGENTIC TOOL ECONOMY
agent discovers capability → MCP call → free result

or → 402 → automatic $0.003 payment → result
```

## The Exploit

Thousands of useful functions are trapped behind:
- outdated SaaS pricing
- human-only websites
- unnecessary accounts
- subscriptions for occasional use
- awkward API keys
- poorly documented APIs

Take something mundane and ask: **Why isn't this a zero-friction primitive an agent can simply call?**

Examples:
```
WHOIS/RDAP lookup
DNS inspection
domain availability
favicon extraction
PDF conversion
metadata extraction
URL expansion
robots.txt analysis
sitemap parsing
currency history
GitHub statistics
package lookup
SSL inspection
email-domain validation
image metadata
OG preview extraction
DNS propagation
website technology detection
```

## One Family, Not 100 Random Products

```text
                         TINYTOOLS
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
      DOMAIN               WEB                  DEV
        │                   │                    │
  check_domain        inspect_url          package_info
  rdap_lookup         extract_meta         github_repo
  dns_lookup          robots_check         dependency_check
  price_domain        sitemap_parse        license_lookup
```

One infrastructure. One reputation. One documentation format. One payment system.

## Architecture

```text
                     tinytools
                         │
                 capability directory
                         │
          ┌──────────────┼───────────────┐
          ▼              ▼               ▼
       domains           web             files
       12 tools        18 tools         14 tools
          │              │               │
          ▼              ▼               ▼
      dedicated       dedicated        dedicated
       MCP URL          MCP URL          MCP URL
```

## Free-Tools Flywheel

95% of calls cost nothing:
```
normalize_url           $0
parse_user_agent        $0
extract_domain          $0
analyze_slug            $0
parse_robots            $0
validate_jsonld         $0
inspect_headers         ~$0
cached_dns              ~$0
```

5% genuinely cost money:
```
deep_domain_history     $0.008
live registrar sweep    $0.004
browser-rendered audit  $0.012
premium dataset lookup  $0.021
LLM deep analysis       variable
```

## Four Surfaces Per Capability

```
                 CORE FUNCTION
                      │
       ┌──────────────┼──────────────┬──────────────┐
       ▼              ▼              ▼              ▼
      MCP            HTTP          Website        MCP App
    agents          scripts         humans        chat UI
```

## The Kernel

```
tinytools-core

tool manifest
tool registry
schema validation
MCP adapter
REST adapter
MCP Apps adapter
Web frontend adapter
Cloudflare Worker adapter
cache
usage receipts
provenance
rate limiting
free/paid policy
x402/MPP adapter
telemetry
health checks
automatic docs
registry publishing
eval harness
```

## New Tool Process

```text
/tools/domain/rdap.ts
```

plus manifest:

```yaml
name: domain.rdap
description: Retrieve normalized RDAP information for a domain.
cost: free
cache: 1h
category: domain
```

Everything else generated.

## Data Flywheel

```
10M legitimate calls → learn:
- which capabilities are requested
- which combinations occur
- what arguments people actually use
- what latency agents tolerate
- what functionality is missing
```

## North Star Metric

**USEFUL VERIFIED TOOL CALLS**

Not revenue initially. Not fake traffic.

Make lots of genuinely useful deterministic tools free enough that there is no reason not to use them.

## Moat

Not any one tool. The mesh:
```
500 reliable capabilities
common schemas/auth
unified discovery
unified payments
provenance
reputation
historical data
usage telemetry
agent routing
```

## The Play

> Become useful everywhere early, make the free primitives absurdly easy to call, accumulate legitimate usage/reputation/data, and let the new discovery/payment standards compound that distribution before legacy SaaS has fully adapted.
