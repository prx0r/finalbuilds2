# PEER-REVIEW PROCESS — how factory output gets tested, reviewed, fixed

*2026-08-23. Role split: **builders** produce code; **the reviewer agent** (this
lane) live-tests, peer-reviews, writes high-quality tests, and adjusts. Builders
never certify their own work.*

## 1. The three review layers

| Layer | When | Mechanism | Catches |
|---|---|---|---|
| **Gate verification** | every build, automatic | `verify-candidate.sh`: clean clone, `env -i` scrubbed env, frozen acceptance suite, direct exit codes, wall-clock timeout, Receipt v3 gates | fake passes, missing tests, broken contracts, secret leakage |
| **Boundary suites** | every change to release machinery | `test_promote_negative.sh` (8), `test_verify_negative.sh` (6), `test_post_build_negative.sh` (11) | TOCTOU races, forged receipts/shas, conftest injection, pipefail false-passes, runaway candidates |
| **Live audit** (manual/cron) | continuous | probe public URLs: homepage, `/llms.txt`, `/robots.txt`, API endpoints, MCP surface; diff against registry claims | HTML-instead-of-text false passes, dead endpoints, missing discovery files, stale registrations |

## 2. Live-audit checklist (per site, run on every review pass)

```text
[ ] homepage 200 (human surface works)
[ ] /llms.txt returns text/plain starting with '# ' (NOT HTML SPA fallback)
[ ] /robots.txt returns text/plain with User-agent
[ ] /healthz or declared health endpoint 200
[ ] API endpoint from llms.txt actually serves JSON/data (spot-check 1+)
[ ] MCP surface present if manifest claims mcp:true
[ ] telemetry flowing (api.calls for CF workers) or exemption declared
[ ] registry manifest matches reality (domain, capabilities, status)
```

Known caught-by-this checklist: hackathonhelp + llmdeals serve **HTML** for
`/llms.txt` (SPA fallback) — counted "present" by the old 2xx-only check.
Fix landed in observe-sites.mjs content sniffing; both sites need real
discovery files (repair tasks queued via drift).

## 3. Peer-review pass over completed builds

For each merged product/module:
1. **Convention check**: module path (`platform/products/<id>/`), service entry,
   migrations numbered without collision, LICENSE preserved for vendored code.
   *Caught: three migrations colliding on `0003` → renumbered.*
2. **Test-quality check**: own tests assert behavior not implementation; ≥6
   golden fixtures per product (registry_to_kanban §23 gates); adversarial
   malformed-input cases exist.
3. **Surface check**: routes registered on platform app; capability appears in
   `/llms.txt`; REST + MCP parity where claimed.
4. **Spine alignment**: Idea→BuildRun→Product lineage events; site registration;
   observation flow confirmed in HydraDB.

## 4. Finding → adjustment workflow

```text
finding (test failure / audit mismatch / quality issue)
  → classify: blocker | defect | improvement | note
  → blocker/defect: fix directly OR create kanban task with repro + acceptance
  → write/upgrade a regression test so the finding can't recur silently
  → record in BUILD-NOTES (dated) + commit with reason
```

Examples already processed this way:
- `pytest | tail` false-pass → post_build v2 rewrite + 11 negative tests
- migration-prefix collision → renumbered + convention noted
- llms.txt HTML false-pass → content-sniffing in sensor
- budgetfirewall WIP polluting shared tree mid-build → Lane B isolation rule below

## 5. Normalization decision (settled 2026-08-23)

**Two canonical shapes only. Nothing else ships.**

| Shape | For | Stack | Deploy target |
|---|---|---|---|
| **Capability module** | API/MCP data-and-rules products | Python service.py in `platform/products/<id>/`, mounted on the shared FastAPI app, SQLite V1 + migrations, golden+adversarial tests | the platform (:8810) — one deployment, one observability surface |
| **Edge site** | human-facing web products | Astro static + optional CF Worker functions, JS/TS | Cloudflare Pages/Workers |

Rust CLI only as an *optional accelerator* attached to an edge site (dnc
pattern) when measured need exists. Vendored imports land as capability modules
(`vendor/` subtree + `align.py`) unless they are inherently web products.

Rationale: one deployment per shape = one observability config, one test
convention, no per-product snowflakes. New shapes require a written spec +
review before first build, not after.

## 6. Current open findings (live ledger)

| # | Severity | Finding | State |
|---|---|---|---|
| 1 | blocker→fixed | migration 0003 ×3 collision | renumbered, committed |
| 2 | major | hackathonhelp/llmdeals llms.txt = HTML fallback | sensor fixed; sites need real files (drift tasks queued) |
| 3 | major | Lane B builders wrote shared tree concurrently → 33 transient failures + WIP pollution | resolved this cycle; rule: Lane B tasks must integrate only at completion |
| 4 | minor | fleet-status renders https:// even for base_url http sites | cosmetic, queued |
| 5 | note | cancelme down / onething domain lost / url-inspector placeholder | known placeholders; decide deploy-or-drop |
DOCEOF
echo done; wc -l docs/PEER-REVIEW-PROCESS.md