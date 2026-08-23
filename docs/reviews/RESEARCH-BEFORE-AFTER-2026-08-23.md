# RESEARCH BEFORE OR AFTER HYPOTHESIS? — answered (2026-08-23)

*Synthesis of peer review + patalacheckpoints theme-layer review + v2 contract bundle.*

## Answer: both, at different phases of one spiral

```text
PHASE 1 EXPLORATION (research BEFORE hypothesis)
  undirected research + live sensors accumulate EvidenceClaims
  no hypothesis directs this — it is the substrate
        ↓ density triggers
PHASE 2 CRYSTALLIZATION (the transition)
  machine clustering over claims (patala pattern: hybrid graph +
  Louvain overlapping communities, deterministic) → EvidenceClusters
  abduction over bounded neighborhoods → HypothesisProposals
  adversarial gate (falsifiability, novelty-vs-existing, complexity)
        ↓ admission
PHASE 3 DIRECTED (research AFTER hypothesis)
  hypotheses issue forecasts, motivate products/experiments
  research becomes ACTIVE: driven by posterior uncertainty,
  graph gaps, contradictions (with anti-confirmation budget split:
  ~35% supporting / 30% adversarial / 20% frontier / 15% alternatives)
        ↓ outcomes resolve forecasts
PHASE 4 SELECTION
  predictive fitness (prequential score vs baseline, calibration,
  independent-entity count) -> KEEP/BRANCH/PROMOTE/DEMOTE/RETIRE
  failures spawn ResearchGaps -> targeted research questions
        ↺ back to phase 1 enriched
```

Research is upstream of hypothesis GENERATION and downstream of hypothesis
SURVIVAL. The transition trigger is evidence density crossing clustering
thresholds — exactly what convergence-detector.mjs now watches.

## Adopted from this review

1. **v2 contract bundle merged** (`contracts/hypotheses/`: HypothesisV2,
   EvidenceClaimV1, ForecastV1, ObservationV2, ResolutionV1, ModelRunV1,
   HypothesisFitnessV1 + validate.js; 5/5 tests green in our tree).
2. **Hypotheses = versioned research programs**, not Bernoulli arms.
   Fitness = prequential score vs baseline + calibration + effect directions +
   entity diversity + information gain. States: draft→probation→active→promoted /
   branch / demoted→retired. Gates: ≥8 resolved forecasts, ≥3 entities,
   ≥2 windows before any promote/demote.
3. **Patala theme-layer pattern adopted for EvidenceClusters**: hybrid relation
   graph + overlapping communities (not partitions), deterministic discovery,
   validator-gated acceptance, membership overlaps. Upgrades the crude threshold
   detector once claim volume justifies it.
4. **Abduction is bounded**: LLM gets a graph neighborhood (N supporting,
   M contradictory, K products, related hypotheses) and must cite evidence ids.
   Generation-fitness Q(H) = coverage×independence×novelty×falsifiability×
   compression / complexity × contradiction-penalty — "worth investigating",
   NOT probability-of-truth.
5. **Anti-confirmation budget** mandatory in research-task generation.
6. **Two competitions kept separate**: ideas compete for investigation
   (coverage/novelty/EIG/cost); admitted hypotheses compete against reality
   (predictive performance/calibration/generalization). Interesting-but-wrong
   is still a win if it generated information.
7. **Recursive generator training**: store genealogy (cluster→proposal→
   experiments→outcome). After ~100 hypotheses, learn which evidence topologies
   historically produced predictive hypotheses (paper-only clusters poor;
   contradiction-born high-EIG; sensor+product anomaly+mechanism excellent).
8. **H0 phase inserted**: Research Intelligence / Hypothesis Induction precedes
   quantitative lifecycle. H1–H3 are seeds; future hypotheses emerge from the pipeline.

## Rejected/deferred
- Thompson sampling over hypotheses (arms aren't repeatable yet) — replaced by
  Score = E[utility] + λ_I·EIG + λ_D·coverage − λ_C·cost − λ_R·risk
- BOED upgrades until after baseline hierarchical models exist
- Writing posterior samples into Hydra (Hydra = provenance brain only)
