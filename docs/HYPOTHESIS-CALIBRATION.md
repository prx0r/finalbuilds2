# HYPOTHESIS CALIBRATION ENGINE — quantitative design (v0)

*2026-08-23. Literature-grounded: Beta-Bernoulli conjugate updates + Thompson
sampling allocation (arXiv:1911.05309 portfolio-bandits; arXiv:1505.00146
budgeted-TS), online calibration under non-stationarity (arXiv:2605.11490,
2607.19689), restart-on-regime-shift (arXiv:2605.06612 BRPC).*

## 1. The chain

```text
REPORT (qdw/R2 corpus; gov/trends MCPs later)
   |  extract_hypotheses()  [LLM, schema-constrained]
HYPOTHESIS DRAFT        prior = Beta(1,9)  (pessimistic until proven)
   |  declares falsifiable PREDICTIONS {metric, threshold, window}
TRACKED SIGNALS (x402 supply, prices, downloads, usage middleware actuals)
   |  window closes -> outcome PASS/FAIL from Hydra observations
BETA UPDATE             alpha += pass ? 1 : 0 ; beta += fail ? 1 : 0
   |                     (decayed: alpha,beta *= lambda each window, lambda=0.9)
POSTERIOR MEAN          p = alpha/(alpha+beta)      <- "how predictive"
BRIER HISTORY           running calibration quality <- "weighting capacity"
THOMPSON ALLOCATION     builder slots sampled ~ Beta posterior per hypothesis
GENERATION LOOP         demote drafts with first-window Brier > 0.5;
                        keep/promote calibrated ones; repeat from reports
```

## 2. Where each piece lives (HydraDB graph, native labels)

| Node | Props (MATCH SET updated) | Notes |
|---|---|---|
| `:HypothesisV2` | string_id, status, **alpha, beta, brier[], last_eval_at** | weights live ON the node |
| `:Prediction {id}` | metric, threshold_op, threshold, window_end, outcome | co-created with BELONGS_TO edge to its HypothesisV2 |
| `:Observation` (existing) | signal.* / usage.* series | the ground-truth feed |
| edges at creation | `(p)-[:BELONGS_TO]->(h)` | one-hop rule respected |

Constraint workarounds carried over: pairwise CREATE only; MATCH SET for weight
updates (no MERGE); dedupe by string_id/int-id.

## 3. Outcome sources (falsifiability contract)

| Prediction type | Ground truth source | Available? |
|---|---|---|
| x402 supply growth >= X% | signal.x402_resources series | yes |
| incumbent price slope > 0 | signal.incumbent_price_min series | yes |
| niche download growth | signal.pypi/npm_downloads_30d series | yes |
| product usage <=/> thresholds | platform capability usage middleware | **pending (next wire-up)** |

Until usage middleware lands, engine evaluates only signal-based predictions.

## 4. Generation loop (reports -> hypotheses -> keep/demote)

```text
for report in corpus:
    drafts = LLM_extract(report, schema=hypotheses.json schema, max=3/report)
    create draft nodes with prior Beta(1,9) + 1 falsifiable prediction each
weekly:
    evaluate open windows -> update Betas + Brier
    draft rules: brier > 0.5 after first window -> DEMOTE (retired, kept in log)
                 brier <= 0.35 and posterior mean > 0.6 -> PROMOTE to active
```
The LLM never judges outcomes — it only proposes falsifiable claims; Hydra
observations decide. This keeps generation cheap and honesty structural.
