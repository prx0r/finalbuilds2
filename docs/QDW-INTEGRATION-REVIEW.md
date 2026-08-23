# QDW INTEGRATION REVIEW — what to adopt, what to leave alone

*2026-08-23. Deep review of `/root/qdw` (~25k lines Python + vision docs) against
the running FinalBuilds2 factory. Question: how do we use QDW's processes
meaningfully without overengineering?*

## 1. What QDW actually is

A parallel "economic operating system for autonomous work", built across several
rebuild generations (`qdw_finishline/`, `qdw_global_infra/` snapshots). Subsystems:

| Subsystem | Lines | What it does | State on this box |
|---|---|---|---|
| `core/ledger` | ~500 | **hash-chained append-only event ledger**, Merkle epochs, external anchoring protocol (RFC3161/Rekor stubs), signing | built, never run (`data/review.db`: ledger_events=0) |
| `ideas/review_evidence.py` | ~60 | cryptographic idea-review evidence: stage, reviewer id/version, artifact binding, passed/score/reason_codes, snapshot hash | working pattern |
| `proof/` | ~600 | subject certificates, certificate v2, verification service | aspirational |
| `scoring/market/opportunity.py` | ~100 | **10-feature agentic opportunity score**: need, recurrence, actionability, verifiability, distribution, data_access, competition, integration_cost, failure_risk, confidence — frozen feature snapshots | pure functions, usable today |
| `intelligence/painfinder.py` | ~150 | source-family-aware pain clustering over complaint text (stopwords, pain lexicon, problem_key dedupe) → demand signals | pure functions, usable today |
| `intelligence/{startup_radar,stack_oracle,opportunities,alternative_api}` | ~400 | ecosystem scanning / stack recommendation | aspirational |
| `market/arbitrage.py` | ~100 | make-or-buy router: `market_price(task) − internal_cost(task)` | concept doc strong; needs real cost data |
| `world/store.py` | ~195 | world-data store (pairs with unignorant-style sources) | unused |
| `federation/hotswap/litellm_router` | ~600 | multi-provider model routing | conflicts with our single-provider policy |
| `review/{service,planner,closure,attacks,...}` | ~1500 | reviewer workflow engine (stages, triggers, fix planning, attack generation) | partially built |
| `contractors/teams/human/watch/publishing/products/catalog/sources/agenthub` | rest | org simulation layer | aspirational |

Test suite errors at collection on this box (missing MCP dep pins). Ledger DBs
empty ⇒ most machinery has never processed real work.

## 2. Overlap verdict — where duplication would hurt

| Concern | QDW approach | Factory approach today | Decision |
|---|---|---|---|
| Idea store | `ideas` tables + evidence | `registry/ideas.registry.json` + Hydra Idea entities (**live**) | keep factory; do NOT stand up QDW idea store |
| Event log | hash-chained Merkle ledger | plain JSONL event log | keep JSONL now; **adopt QDW's chain design later** when integrity matters (post-PoC). Design is good; timing isn't |
| Verification | proof/certificates | Receipt v3 + verify/promote scripts (**proven end-to-end twice**) | keep factory; QDW certificate format noted for future SLSA work |
| Execution | factories/executors | hermes builder + worktree pipeline (**proven**) | keep factory entirely |
| Model routing | litellm federation/hotswap | single provider, hard-set ox-alpha-free (user directive) | do not touch |

## 3. Meaningful integrations (the actual answer)

### I1 — Adopt the 10-feature opportunity rubric as THE scoring pass *(zero code)*
Our admission gate currently eats vibes. QDW's `OpportunityFeatures`
(need/recurrence/actionability/verifiability/distribution/data_access/
competition/integration_cost/failure_risk/confidence, each 0–1, frozen snapshot
hashed) is exactly the "one rubric" the multiple-theses problem demanded.
**Action:** score all 237 registry ideas against these 10 features once (LLM-
assisted, spot-checked), store `{features, total, confidence, snapshot_hash}`
per idea. Admission then ranks mechanically. This replaces score-anarchy without
writing a scoring engine — the rubric is a checklist.

### I2 — Run PainFinder over complaint corpora = thesis stage 1 *(small)*
The original thesis demands demand evidence before building ("No evidence → no
build"). PainFinder turns Reddit/HN/forum complaint dumps into clustered,
deduplicated pain signals with confidence. **Action:** feed it 2–3 public
complaint corpora for niches we care about; emit results into Hydra as
`research.recorded` events linked to matching ideas (machinery exists).
Ideas with ≥1 pain-signal link get admitted; others wait. This makes every
build evidence-backed for the first time.

### I3 — Unignorant as the live world-data sensor *(adjacent repo, already cloned)*
`/root/unignorant`: 25 connectors over public world-data APIs → SQLite → REST +
MCP. Its indicators (food prices, wages, housing by country) are *pricing/demand
signals* for future products. **Action:** serve it locally, register it as a
fleet site (it already matches the two-shape standard: REST+MCP+Astro), and let
a small cron pull 5–10 headline indicators into Hydra as observations. It becomes
both a product AND an input to I1's `distribution/data_access` features.

### I4 — Make-or-buy router: defer, but record costs now *(free)*
`market_price − internal_cost` arbitration is the right long-term brain for
buy-vs-build. It needs real numbers we don't have yet. **Action:** start logging
per-build internal cost (builder minutes × tokens) in run records — one field.
When imports/OSS alternatives exist per niche, compare honestly.

## 4. Explicitly rejected (overengineering guards)

1. Do not run QDW's ledger alongside ours — two truths is worse than one
   imperfect truth. Revisit only when external anchoring has a real requirement.
2. Do not import QDW's review workflow engine (1500 lines, stages/triggers/
   attacks) — our Receipt v3 gates cover the same trust question with less.
3. Do not stand up federation/litellm/hotswap — contradicts the settled
   single-provider policy and adds failure surface.
4. Do not "finish" empty subsystems (portfolio, scheduling, teams,
   contractors, publishing) — aspirational scaffolding with zero live data.
5. Do not migrate our events into QDW tables — HydraDB + JSONL logs stay canonical.

## 5. Sequencing

```text
now      : I1 scoring pass (rubric adoption)          — unblocks honest priority
now      : I3 unignorant serve + register + sensor    — new intel source + fleet site
next     : I2 PainFinder corpus pass → evidence-linked ideas
later    : I4 cost logging accumulates → arbitrage decisions become possible
much later: Merkle-chained event log (QDW ledger design), signed certificates
```

**Bottom line:** treat QDW as a *parts bin and spec library*, not a second
system. Take its rubric, its pain-clustering, its ledger *design*, and its
market-economics framing. Leave its infrastructure. The factory stays one
system; QDW makes it smarter.
