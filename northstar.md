# NORTHSTAR — the goal

**Every FinalBuild compiles to every agent marketplace: website, ChatGPT plugin, x402 API on Agentic.Market — and where merchants live, a Shopify app. First proof: the domain-name-assistant. Then the queue.**

Companions: `openaifinal.md` (strategy), `marketplaces.md` (distribution alpha), `docs/CHATGPT_SUBMISSION_TARGET.md` (spec), `docs/CHATGPT_TRANSFORMATION_QUEUE.md` (work list).

---

## 1. The bet

ChatGPT is bad at domains. Not slightly bad — structurally bad:

- It **invents** names with zero grounding in availability, price, handles, or trademarks.
- It **cannot check** live registry state, registrar pricing, or cross-platform handle truth.
- People prompt it to "think of better ones" constantly, and it iterates blind every time.

Meanwhile in `cmail` we already own the full counter-stack (`src/names.ts`, 946 lines + `domain-hunter-lib`):

| What ChatGPT lacks | What we have | Where |
|--------------------|--------------|-------|
| Exact availability truth | `verifyDomain` (DNS+RDAP), `cfCheckDomain` (registrar truth) | `cmail/src/names.ts` |
| Batch checking | `bulkCheck` ≤100/call, paged | `cmail/src/names.ts` |
| Thinking of GOOD names | generators (combinator, hacks, mutations, syllables, themes) + `structuralScore` + `vanScore` (spellable-aloud test) | `domain-hunter-lib/src/generators/` |
| Price truth | `searchDomains` (15 TLDs × 4 registrars), `pricing/` + `trends/` | `names.ts` + `domain-hunter-lib/src/pricing/` |
| Handle truth | `checkHandles`, `apifySocialCheck`, `suggestHandles`, `fullSocialCheck` | `cmail/src/names.ts` |
| Learning loop | `bulkPersist` + `bulkHistory` — empirical Wilson P(hit\|rules) | `cmail/src/names.ts` |
| Naming science | van test, age test, meme test, namespace rules, session gold | `cmail/docs/DOMAINS.md`, `a-logs/NAMING_LOG_2026-09-11` |

**The gap is the product.** We wrap these primitives in the name ChatGPT is most likely to call — and the name users most likely to ask for.

## 2. The name: domain-name-assistant

Not "DomainChecker" (a tool), not "Brand Availability" (jargon). **`domain-name-assistant`** — because the user prompt is "help me find a domain name" and the model-facing ontology should mirror user intent verbatim. Plugin listing name: **Domain Name Assistant**.

Four model-facing tools. Internally they fan out to everything above. The agent never sees the machinery:

| # | Tool | User intent it answers | Backend |
|---|------|------------------------|---------|
| 1 | `check_domain_availability(domain)` | "is foo.com free?" | registrar truth (`cfCheckDomain` + RDAP corroboration) |
| 2 | `bulk_search_available_domains(names[], rules?)` | "verify these 30 names" / "give me 10 options" | `bulkCheck` + persist run (learning loop) |
| 3 | `suggest_brandable_domains(business_description, tlds?, max_length?)` | "think of better ones" — **the ChatGPT gap** | generators + structural/van scoring + verify loop; returns only available names with prices |
| 4 | `check_brand_availability(name)` | "can I use this name everywhere?" | domain + 13-platform handles + company registry (A-COM `fullSocialCheck` + `cfCheck`) |

All read-only, non-destructive, no auth, no personal data, tiny schemas. The boring security review from `openaifinal.md` §6. Tool 3 is the star: ChatGPT invents, **we verify and rank** — every suggestion ships with availability + price + score, which ChatGPT can never do natively.

## 3. Distribution compiler — every build, every marketplace

No FinalBuild is done until it compiles to all suitable surfaces. One backend, every door (see `marketplaces.md` for the full thesis):

```text
                    ┌──────────────────┐
                    │   ONE BACKEND    │
                    │  (Cloudflare     │
                    │   Worker + D1)   │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────────┐
        │ WEBSITE  │  │ CHATGPT  │  │  x402 API    │
        │          │  │  PLUGIN  │  │              │
        │ /        │  │ remote   │  │ pay-per-call │
        │ /privacy │  │ MCP,     │  │ USDC, no key │
        │ /terms   │  │ 4 tools, │  │ signed       │
        │ /docs    │  │ boring   │  │ receipts     │
        │ /mcp     │  │ review   │  │ Bazaar       │
        │ agent-   │  │          │  │ discovery    │
        │ readable │  │          │  │ ext → auto-  │
        │ landing  │  │          │  │ indexed on   │
        └────┬─────┘  └────┬─────┘  │ Agentic.     │
             │             │        │ Market       │
             │             │        └──────┬───────┘
             │             │               │
             ▼             ▼               ▼
        ChatGPT       Plugin          480K+ agents
        Search        Directory       buying APIs
        (OAI-         (user           with USDC,
        SearchBot)    connects)       no signup
                                      (165M+ txns,
                                      ~$50M+ vol —
                                      verified
                                      2026-09-11)

        ┌──────────────────────────────────────┐
        │ SHOPIFY APP (where merchants live)   │
        │ merchant installs → OAuth → our MCP  │
        │ exposes merchant ops to agents;      │
        │ usage metering on merchant invoice   │
        └──────────────────────────────────────┘
```

Why each surface:

- **Website** — required for policy URLs (submission gate), domain verification host, docs, and ChatGPT Search discovery. Agent-readable landing page, not marketing sludge.
- **ChatGPT plugin** — distribution to users inside conversation. 4 obvious tools, boring review, no OAuth v1. OpenAI is actively promoting plugins (Business credit promos running now) — ship before monetization settles.
- **x402 / Agentic.Market** — monetization + agent-to-agent rails. Machine buys answer: 402 → $0.01 USDC → 200, no signup. Auto-indexed via Bazaar discovery extension; curated entries rank above. Status in-org today: monitored, not built — first x402 wrapper lands with FINALBUILDS2-001 and becomes the template.
- **Shopify app** — merchant acquisition through Shopify's existing ecosystem + usage billing on the merchant invoice. Two plays: (a) capability apps that make a merchant callable by agents (ReturnsCom, InventoryCom…), (b) the hidden market: **"why does ChatGPT recommend my competitor?"** — AI-visibility optimizer + agent-commerce analytics across ChatGPT/Gemini/Meta/Copilot. Millions of merchants are being injected into AI shopping channels right now with zero intuition for it.

Monetization today (no waiting for OpenAI native payments): free plugin with allowance → "connect/upgrade" → our website → Stripe → Pro API/MCP access. Plus x402 per-call revenue from agents. Plus Shopify merchant billing. Three money paths, zero dependence on OpenAI's roadmap.

The surfaces compound: Search drives plugin connects, plugin usage trains ToolRank, ToolRank optimizes descriptions, x402 captures value from agents outside ChatGPT entirely, merchant data feeds back into capability discovery.

## 4. Sequencing — one slice, then factory

1. **FINALBUILDS2-001: domain-name-assistant.** Slim worker to the 4 primitives (titles, annotations, justifications, outputSchemas), back 3–4 with cmail, redeploy, `chatgpt-package` green, Developer Mode test, ToolRank battery (the 5-variant name experiment is perfect here: `check_domain` vs `check_domain_availability` vs `domain_lookup` vs `find_available_domain` vs `verify_domain_registration_availability`).
2. **Website** on the plugin domain (policy pages + agent landing + OAI-SearchBot).
3. **x402 wrapper** on the same 4 tools (pay-per-call + receipts + Bazaar discovery ext). First x402 implementation in the org — template for all later builds.
4. **Submit.** Portal with manifest listing + 5+3 tests. Owner step.
5. **Extract template** (manifest + chatgpt block + package script + eval pack + website skeleton + x402 wrapper) → run the queue: HandleChecker (backend live), llmdeals, CompanyChecker… (`docs/CHATGPT_TRANSFORMATION_QUEUE.md`, 13 queued ideas in `registry/ideas/seed.json`).
6. **Second track — merchant tools.** Once the template is proven, attack the Shopify hidden market: AI-visibility optimizer ("why does ChatGPT recommend my competitor?") + agent-commerce analytics across the four storefront surfaces. This is where the paying audience already exists.

Portfolio hunts three categories from here: **agent tools** (tiny truths → plugin + MCP + x402), **merchant tools** (Shopify apps riding agentic storefronts), **agent infrastructure** (ToolRank, capability analytics, x402 discovery/reputation). The domain-name-assistant is the first cheap probe; the higher-value businesses are agent-commerce optimization and machine-paid specialist services.

## 5. Definition of done — per build, no exceptions

- [ ] Backend live on Cloudflare, `tools/list` clean, MCP def small
- [ ] ≤4 model-facing tools, verb-led names, intent-mirroring descriptions, titles, 3 annotations + justifications, outputSchemas
- [ ] Website live: `/`, `/privacy`, `/terms`, `/docs`, `/mcp`, agent-readable landing, OAI-SearchBot allowed
- [ ] x402 pay-per-call live with signed receipts
- [ ] `chatgpt-package` validates green; 5 starter prompts; 5+3 reviewer-runnable tests
- [ ] ToolRank battery run; descriptions optimized from measured P(tool selected | intent)
- [ ] Submitted to portal; listing + verified identity + icons complete
- [ ] Template extracted for the next build

**The one sentence:** *we build the ground-truth primitives ChatGPT reaches for but cannot be — starting with names and domains — and ship each one simultaneously as website, plugin, and paid API until the factory runs itself.*
