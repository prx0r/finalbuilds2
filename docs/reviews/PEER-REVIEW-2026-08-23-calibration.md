# PEER REVIEW ACCEPTED — Bayesian calibration architecture (2026-08-23)

*External peer review of calibration-engine.mjs, accepted in full by this lane.
Status: measurement-integrity push initiated; hypothesis-driven allocation
DISABLED until the loop below is scientifically correct.*

---

## Verdict on current state

The latest push changes `finalbuilds2` from "autonomous factory with heuristics" into the beginnings of a **self-correcting experimental system**. The hypothesis layer is the right direction. The current Bayesian implementation, however, should be treated as an instrumentation prototype rather than a valid statistical model.

The most important upgrade now is **not more sensors or more hypotheses**. It is getting the measurement → prediction → resolution → inference → decision loop scientifically correct.

## Current state: much better architecture, weak statistics

The build system itself has come a long way. You now have a verified autonomous promotion path, explicit hypothesis parents, a capability-gap filter, observable products, Hydra lineage, and a first attempt at closing the loop from forecasts back into resource allocation.

The conceptual structure is excellent:

```text
market evidence
    ↓
hypotheses
    ↓
falsifiable predictions
    ↓
ideas / experiments
    ↓
built products
    ↓
real observations
    ↓
prediction evaluation
    ↓
update beliefs
    ↓
allocate next builds
```

That is substantially more interesting than another automated app generator.

But the newest `calibration-engine.mjs` is not yet measuring what the documentation claims it measures.

## The critical issues found

| Problem | Current behavior | Why it matters |
| --- | --- | --- |
| Prediction resolution | Cron runs daily and reevaluates predictions | Same evidence can be counted repeatedly |
| Windows | `window_days` exists but isn't actually enforced | A 90-day prediction can resolve from a few recent samples |
| Brier score | `(posterior_mean - 0.7)^2` | This is **not a Brier score** |
| Heterogeneous pooling | All prediction successes become one Beta | Assumes fundamentally different predictions are exchangeable |
| H3P2 | Evaluates price increase only | Original prediction requires price **AND platform usage** growth |
| Current five predictions | Four aren't implemented | Nearly all hypotheses currently receive no genuine evidence |
| Signal query | Takes recent values without strict entity/window scoping | Can mix time periods/dimensions |
| Hydra graph | Physical duplicate Hypothesis nodes | No canonical posterior state |
| Prediction creation | Attempts a prohibited two-hop Hydra CREATE | Fallback loses prediction metadata |
| Prior | `Beta(1,9)` | Strong prior mean 0.10 with effective prior sample size 10 |
| Allocation | Planned Thompson sampling over hypotheses | Wrong abstraction for unique product ideas this early |

Hypothesis file currently declares five predictions across H1–H3. But the calibration code only contains implementations for `x402_resources` and `incumbent_price`; none of the current predictions uses `x402_resources`, leaving only H3P2 partially executable.

That means **today you essentially have one partially evaluated prediction rather than a calibrated hypothesis system**.

Structural bug: the Hydra graph builder explicitly records that `CREATE` supports one hop only. The new prediction seeder nevertheless first tries `Prediction -> HypothesisV2 -> _ANCHOR` (two hops). Its fallback creates only `id`, `string_id`, and `status`, so `metric`, `threshold`, and `window_days` disappear from the actual Prediction node.

Fix this before trusting any numbers.

## What the statistical architecture should become

> **A hypothesis should not have a single "probability of being right."**

Hypotheses produce predictions. Predictions produce distributions over future observations. You score those distributions against reality. Then you estimate whether the hypothesis contains useful predictive information.

### 1. Make `Forecast` the atomic quantitative object

Immutable issued forecast:

```json
{
  "forecast_id": "fc_H2P1_product_abc_2026-08-23",
  "hypothesis_id": "H2_agent_convenience",
  "prediction_family": "agent_vs_human_usage_ratio",
  "issued_at": "2026-08-23T07:00:00Z",
  "window_start": "2026-08-24T00:00:00Z",
  "window_end": "2026-09-23T00:00:00Z",
  "target": { "metric": "api_to_web_usage_ratio", "entity_id": "site_xyz", "aggregation": "30d" },
  "forecast": { "type": "lognormal", "median": 2.4, "sigma": 0.55 },
  "event_forecasts": [
    { "event": "api_to_web_usage_ratio >= 3", "probability": 0.41 }
  ],
  "resolution_rule_version": "usage_ratio_v2",
  "evidence_snapshot_hash": "...",
  "model_version": "forecast-model-v1"
}
```

Once issued, **never modify it**. A newer forecast tomorrow is another object. This gives a true historical forecasting record rather than mutable beliefs.

### 2. Separate forecast scoring from Bayesian inference

For binary event with issued probability p and result y ∈ {0,1}: Brier = (p−y)². Proper scoring rules make truthful probabilistic forecasts optimal in expectation. Store at resolution: probability issued, actual outcome, brier, log score, reference/baseline probability, brier skill vs baseline.

Continuous predictions: issue predictive distribution, score with log predictive density or CRPS. `usage growth = +80% ±30%` vs actual +76% must not collapse to PASS — that throws away almost everything.

### 3. Hierarchical Bayes across experiments (partial pooling)

Products share characteristics while differing — exactly partial pooling:

```text
Y_it ~ NegativeBinomial(mu_it, phi)
log mu_it = alpha + u_i + beta1·ChatGap_i + beta2·AgentNative_i + beta3·Free_i + beta4·MCP_i + beta5·Deterministic_i + gamma_t
u_i = product random effect; gamma_t = changing global environment
```

Interesting output becomes: *"after controlling for category, age and exposure, agent-native interfaces show +0.48 log usage effect, 90% CI [+0.11,+0.84], P(effect>0)=0.96."* PyMC has worked examples for hierarchical binomial / negative-binomial / meta-analysis / posterior predictive checking.

### 4. Different metrics → different likelihoods

API calls = NegBin · API/web ratio = Beta-Binomial · retention = Bernoulli · time-to-100-calls = survival · revenue/cost = Lognormal/Student-t · growth = state-space · event forecast = Bernoulli proper scoring · continuous forecast = posterior predictive distribution.

### 5. Split H1/H2/H3 into estimable claims

- **H1**: measure continuous `chatgpt_substitutability` per idea; estimate β_substitution < 0. Later: task suite → ChatGPT attempts → deterministic evaluator → capability score dataset.
- **H2**: matched feature ladder (REST → +llms.txt → +MCP → +agent docs), staggered rollout, estimate causal lift in agent-origin usage. The factory generates treatments automatically.
- **H3 split**: H3a occasional-use demand poorly matched to subscriptions; H3b zero-price increases adoption; H3c free utility achieves sufficient usage vs marginal cost. Testable. "Subscriptions are dead" is not.

### 6. Time, properly later

Decay instinct correct; `alpha *= 0.9` per cron is not the implementation. Eventually dynamic parameters βt ~ Normal(βt−1, σβ); BOCPD for regime changes instead of manual wipes. Only after trustworthy observations.

### 7. No Thompson sampling yet

Ideas are largely NEW arms; building Domain Intelligence 20× says nothing about CancelMe. Near-term rule: Score(build) = E[Utility|data] + λ·EIG(build) − Cost(build). Deliberately build high-information discriminators between H1/H2/H3. Later: hierarchical contextual Thompson sampler once repeated products/features exist.

## Target architecture

Hydra = lineage/relationships/provenance. NOT canonical posterior store. Canonical quantitative table = SQLite/Parquet. Posterior draws/diagnostics/plots → R2 artifacts; Hydra gets ModelRun node with summary + artifact URI + hashes. Never write thousands of posterior samples into Hydra.

## Implementation order

1. Disable hypothesis-driven resource allocation ✓ (done with this doc)
2. `forecast.v2` schema: exact issued_at/window/entity scope/metric definition/predictive distribution/resolution-rule version/evidence snapshot hash
3. Idempotent resolver: `resolution_key = hash(forecast_id + window_end + rule_version)`; rerun ⇒ zero state change
4. Implement all five existing predictions with exact window queries (not latestTwo)
5. Delete fake Brier; real Brier/log at resolution; baselines + skill
6. Synthetic tests: known series → exact outcomes; double-run ⇒ identical state
7. `modeling/` Python package: dataset.py, models/baseline.py, models/hierarchical_usage.py, fit.py, diagnostics.py, decide.py (PyMC + ArviZ)
8. Simplest hierarchical usage model first (Bayesian Workflow: iterative)
9. Prior predictive checks → fit → convergence → PPC → held-out; simulation-based calibration for inference errors
10. PSIS-LOO comparison vs stupid baselines; Pareto-k diagnostics
11. Feed admission ONLY after model beats baselines out-of-sample
12. Then experimental design: expected_utility, posterior_uncertainty, EIG, build_cost, strategic_value per candidate

## Key shift

Stop asking *"which hypothesis won the most predictions?"* Start asking *"what quantitative relationships predict outcomes, how uncertain are they, how have they changed, and which next build makes money or teaches us the most?"*

This makes finalbuilds2 an **autonomous Bayesian product laboratory**. The existing deterministic factory, isolated BuildRuns, frozen verification and Hydra provenance are unusually well suited. Next push = **measurement integrity**, not modelling complexity.
EOF
wc -l docs/reviews/PEER-REVIEW-2026-08-23-calibration.md
---
## EXECUTION STATUS (2026-08-23, same day)

| Order item | State |
|---|---|
| 1. Disable hypothesis-driven allocation | ✅ cron removed; engine retired to `legacy/calibration-engine.mjs.instrumented` |
| 2. forecast.v2 schema | ✅ `schemas/forecast.v2.schema.json` (immutable, full window/target/distribution/rule fields) + resolution.v1 |
| 3. Idempotent resolver | ✅ `scripts/resolve-forecasts.mjs` — resolution_key sha256(forecast_id+window_end+rule); rerun = zero change (test-proven) |
| 4. Five predictions implemented | partial — H3P2 clause A (price slope, exact window) live; usage clauses AWAITING_DATA(usage_middleware), explicitly labeled not silently passed |
| 5. Fake Brier deleted | ✅ retired with engine; real Brier/log/skill computed at resolution only (once data exists) |
| 6. Synthetic tests | ✅ double-run idempotency green; per-rule outcome fixtures land with FORECASTS_DIR isolation next |
| 7. modeling/ PyMC package | queued (next session; box RAM budget respected) |
| 8–12. hierarchical model → checks → LOO → admission → EIG | blocked behind #7 + usage middleware |

**Honest current measurement capacity: H3P2 clause A only. Everything else
explicitly AWAITING_DATA — no silent passes anywhere.**
