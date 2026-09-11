# ChatGPT Submission Target State

**Source:** OpenAI developer docs fetched 2026-09-11. Not memory. Not the user's paste. The actual spec.
**Docs:** `developers.openai.com/plugins/deploy/submission`, `/plugins/app-guidelines`, `/plugins/reference`, `/apps-sdk/quickstart`, App Developer Terms (2026-07-09), submission announcement (2025-12-17).

Every tool in finalbuilds2 + A-COM transforms into this. Nothing ships that fails this checklist.

---

## 1. What we submit

A **plugin** via the portal at `platform.openai.com/plugins`. A plugin bundles apps, skills, templates. The external tool/action integration is an **MCP-backed app**.

Submission types:
- Skills only
- **With MCP** (remote MCP-only, UI optional) ← our path
- With MCP + skills

Submit the **remote MCP server URL itself** (`https://<host>/mcp`, Universal type). Never an existing integration reference. Template URLs only for approved trusted developers — we use Universal.

## 2. Portal fields (all required before Submit for Review)

| Tab | Contents |
|-----|----------|
| Info | Plugin name (customer-facing, not generic single-word), short + long description, verified developer/business identity, logo, category, website, support URL, privacy policy URL, terms URL |
| MCP | Universal URL, auth config, demo credentials, CSP, domain verification token at `/.well-known/openai-apps-challenge`, Scan Tools result |
| Skills | Optional. SKILL.md + file tree, or MCP-imported static skills snapshot |
| Prompts | Starter prompts showing highest-value workflows |
| Testing | **5 positive + 3 negative test cases** with prompts, expected tool/behavior, result shape, fixtures |
| Global | Country/region availability |
| Submit | Release notes + policy attestations |

Pre-reqs: submitter has **Apps Management: Write** role. Publisher identity verified in Platform org settings.

## 3. MCP server contract (hard requirements)

- Public HTTPS `/mcp` endpoint. Streamable HTTP (SSE also supported). Stateless mode OK.
- CORS: allow `content-type, mcp-session-id`, expose `Mcp-Session-Id`. Handle OPTIONS preflight. GET `/` health check (avoid 502s during review).
- `Scan Tools` must discover tools cleanly. Refresh after every server change.
- Domain verification: exact token at `https://<mcp-host>/.well-known/openai-apps-challenge`, token only, no JSON wrapper.
- Auth (if any): transparent flow, minimal permissions, **demo credentials that work without MFA/SMS/email-confirm/private-network**. No signup walls in review path.
- UI (optional): single HTML bundle, MCP Apps bridge (`ui/initialize`, `tools/call` over postMessage). CSP `_meta.ui.csp` with exact `connectDomains`/`resourceDomains`. `frameDomains` triggers extra manual review — avoid. `redirect_domains` still via legacy `_meta["openai/widgetCSP"]` for `openExternal`.

## 4. Tool definition law (rejection territory)

Every tool must have: **unique human-readable verb-led name, accurate description, minimal input schema, declared outputSchema (when returning structuredContent), correct annotations.**

| Rule | Spec |
|------|------|
| Names | `snake_case` verb, e.g. `get_order_status`. Unique per server. No `pick_me`/`best`/`official`, no promotional/comparative language |
| Descriptions | Describe exactly what the tool does. No favoring/disparaging other plugins. No broad-trigger language ("use whenever user mentions X"). Mismatch = rejection |
| Inputs | Minimum necessary. No full conversation history, no raw transcripts, no "just in case" fields. No precise location (use coarse client side-channel). Task-specific intent field only if it improves execution |
| Outputs | `structuredContent` must match declared `outputSchema`. `content` text for model. `_meta` goes to UI only, hidden from model. Strip session IDs, trace IDs, timestamps, debug payloads, undisclosed PII |
| Behavior | Exactly as named/described. Side effects never hidden. Sending/posting = visible in definition. Safe to retry or explicitly marked non-idempotent |
| Fair play | No descriptions/titles/annotations that steer selection toward you or against others |

### Annotations (all three required per tool)

| Annotation | `true` when |
|------------|-------------|
| `readOnlyHint` | Fetches/lists/computes only. Zero external state change. `false` if it creates, updates, deletes, sends, enqueues, runs jobs, writes logs |
| `openWorldHint` | Touches public internet or open-ended entities (web search, RDAP, registrar, posting, sending). `false` only for bounded private account/workspace |
| `destructiveHint` | Write tool that deletes/overwrites/revokes/sends-irreversibly. `false` for reversible writes |

Also available: `idempotentHint` (same args = no extra effect). Hints drive user confirmation framing; server must still enforce authz.

### File params (if any tool takes files)

Four properties declared, `download_url` + `file_id` required, `mime_type` + `file_name` optional-but-declared. List fields in `_meta["openai/fileParams"]`.

## 5. Commerce / safety / privacy gates

- **Commerce: physical goods only.** No digital products/services, subscriptions, tokens, credits — directly or via upsell. Existing paid accounts may access included features; no new-subscribe/upgrade/checkout flows inside plugin. External checkout on own domain for physical goods. No ChatGPT-specific surcharges.
- **Prohibited:** adult, gambling, illegal/regulated drugs + paraphernalia, Rx/age-restricted meds, counterfeit/stolen/fraud tools, malware/spyware, tobacco/nicotine, weapons, extremist merch, fake IDs, debt/credit schemes, unregulated finance, crypto speculation, money-transfer execution, gov-service abuse, negative-option billing.
- **Safety:** comply with Usage Policies. General audiences (13–17 safe). No children-under-13 targeting. Respect user intent, no unrelated injection. No scraping/ToS-violating third-party access. No unofficial pass-through connectors. No rate-limit circumvention.
- **Privacy:** published policy (categories, purposes, recipients, retention, controls). Collection minimization. Response minimization. **Restricted data never:** PCI, PHI, gov IDs, credentials/secrets (API keys, MFA/OTP, passwords). Sensitive data only if strictly necessary + consent + prominent disclosure. No full-chatlog pull — operate on explicit snippets only. No surveillance/profiling metadata unless disclosed + scoped + user-controlled.
- **Terms kill-clauses:** §1.6(h) no money/crypto transfers through Services. §1.6(f) no training competing models on App Requests. §7.4 no placement guarantee. OpenAI may reject/remove anytime (§7.5).

## 6. Test case contract (5+3)

Each positive: user prompt, expected tool/workflow, expected result shape, fixture/demo data to reproduce.
Each negative: prompt/scenario, expected refusal/clarification/fallback, why it must not complete.
Reviewer-runnable with zero internal context. Auth paths complete with demo creds alone.

## 7. Our tool-selection legibility layer (on top of spec)

Spec compliance gets us accepted. This gets us *chosen*:

- ≤10 tools per plugin, each mappable to one user sentence ("Is this domain free?")
- Description starts with when-to-invoke: "Use when the user asks about X. Returns Y."
- Input/output tiny and structured. One call answers the question.
- Ground-truth primitive only: live state, authority, or action ChatGPT lacks.

## 8. Definition of done (per plugin)

- [ ] Universal MCP URL live, Scan Tools clean
- [ ] Domain verification token hosted
- [ ] Every tool: unique verb name, accurate description, minimal schema, outputSchema, 3 annotations with justification
- [ ] Responses stripped of debug/PII/identifiers
- [ ] Listing: name, descriptions, logo, category, website/support/privacy/terms URLs, verified identity
- [ ] 5 positive + 3 negative test cases, reviewer-runnable
- [ ] Starter prompts, country availability, release notes, attestations
- [ ] No commerce/safety/privacy violations (§5 above)
- [ ] Developer Mode end-to-end: 50 realistic prompts invoke the right tool
- [ ] Bundle emitted by `scripts/chatgpt-package.mjs` and validated green
