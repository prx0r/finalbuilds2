# Tool Transformation Queue — all properties → ChatGPT target state

**Target:** `docs/CHATGPT_SUBMISSION_TARGET.md`. Status per tool: DONE / QUEUED / EXCLUDED (with reason).
**Rule:** nothing enters a plugin that fails H1 (ChatGPT-native) or the commerce gate (physical goods only).

## DONE

### site_domainnamechecker → "Domain Availability Checker" (reference implementation)
5 tools, bundle validates green (`node scripts/chatgpt-package.mjs registry/sites/domainnamechecker.json`).
`get_analytics` excluded (internal telemetry).

## QUEUED (in priority order)

### 1. A-COM name tools → fold into Domain Availability Checker plugin
| Current | New | Annotations (R/O/D) | Notes |
|---------|-----|---------------------|-------|
| `name.search` | `search_available_domains` (merge with domainchecker equivalent) | T/T/F | Pick ONE implementation; A-COM's has registrar pricing — prefer it |
| `name.check` | merge into above | T/T/F | Duplicate surface; merge, don't ship both |
| `name.verify_domain` | `check_domain_availability` (merge) | T/T/F | Same as above |
| `name.social` | `check_brand_name_availability` | T/T/F | Socials + company-name check = the Brand Availability upgrade |
| `name.bulk_check` | `bulk_search_available_domains` (merge) | T/T/F | Same |
| `name.cf_check` | `compare_domain_prices` (merge) | T/T/F | Same |

### 2. site_llmdeals → "LLM Price Compare" (score: live data, high pain)
Capabilities (`llm.deals.aggregate`, `llm.pricing.compare`, `llm.inference.economics`) are live-data ground truth — strong H1 pass. Needs: ≤10 verb-led tools, annotations, 5+3 tests. No blockers spotted.

### 3. site_cancelme → "Subscription Cancellation Guide" (caution)
`cancel.lookup/steps/verify` = real-world side effects. Read-only guidance (steps, links) is submittable; anything that cancels on the user's behalf is destructive + third-party-ToS sensitive (unofficial-connector rule). Ship guide-only first; action tools only with explicit user OAuth + confirmation framing.

### 4. site_platform (20 capabilities) → SPLIT, never one plugin
20 capabilities in one plugin violates minimal/purpose-driven. Split by workflow (invoice, warranty, returns, landed-cost…) into ≤10-tool plugins, each separately evaluated against H1. Unscoped as-is: QUEUED for triage, not for packaging.

### 5. site_hackathonhelp → LIKELY FAILS H1
`hackathon.find/guidance` is advice ChatGPT gives natively. Unless it has live data (deadlines, prize pools, team-matching state) it doesn't clear the capability-gap bar. Needs a live-data primitive or drop.

## EXCLUDED from all ChatGPT plugins (with reason)

| Tool | Reason |
|------|--------|
| `name.cf_purchase` / domain buying | Commerce gate: domains are digital goods. Plugins may sell physical goods only. Check-only in plugin; purchase via external link |
| `name.phone_purchase` | Same commerce gate + money-transfer prohibition (§1.6h) |
| `name.wire_email` | External state change (DNS/routing) + irreversible-ish; keep agent-only with human confirm |
| `email.send` | Sends messages = destructive + exfiltration surface; agent-only with confirmed:true |
| `email.inbox/search/read` (personal mailbox) | Private user data; only via authenticated plugin with demo-creds path — defer until auth story exists |
| `get_analytics` (domainchecker) | Internal telemetry, not a user workflow |
| Generic PDF summarizer idea | Delta:0, ChatGPT-native — already rejected in seed.json |

## Next actions
1. Merge A-COM name tools with domainchecker descriptors (one canonical set, A-COM backend).
2. Package site_llmdeals (prompts + 5+3 tests + bundle).
3. Triage site_platform split.
4. Decide hackathonhelp fate (find live-data primitive or kill).
