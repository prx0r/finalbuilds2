# PEER REVIEW 2026-08-23b — VERIFICATION SCIENCE PHASE (accepted in full)

Core verdict: more features < building a verification science around existing
mechanisms. Milestone: every important mechanism needs a machine-readable claim,
a hostile falsifying test suite, and an empirical efficacy experiment.

## Immediate findings accepted as live defects
1. resolve-forecasts calls undefined rows() — H3P2 live path crashes
2. AWAITING_DATA consumes permanent resolution_key -> can never resolve later
3. forecast.v2 aggregation enum rejects H3P1's 60d window
4. issuer persists without validating against schema
5. evidence_snapshot_hash hashes metadata, not actual evidence
6. window_start >= issued_at unenforced
7. convergence detector: repeated measurements counted as independent;
   sensor_count computed but unused; candidate id changes on latest timestamp
8. jsonl lock: 5s stale timeout lets non-owners steal locks

## Accepted architecture additions
- MechanismSpec first-class (claim, safety/liveness invariants, oracle,
  failure_model, efficacy_claim, baseline, metrics) — see mechanisms/
- Verification pyramid L0 contract .. L10 field efficacy
- fast-check model-based S1-S9 state machine (P1), property tests (P1),
  concurrency torture incl. lock-ownership (P2), Jepsen-style histories (P2),
  metamorphic tests for induction/convergence (P6), Stryker mutation on trust
  boundary (P3), TLA+ safety properties (defer until harness exists),
  chaos/fault-injection suite (P2)
- Efficacy experiments per mechanism (convergence vs brainstorm holdout;
  verifier false-accept/false-reject corpus; H1 filter shadow mode; repair MTTR)
- Mechanism Evidence Ladder: PROPOSED..PRODUCTION_AUTHORITY + INVALIDATED/STALE;
  shadow_only authority until EFFICACY_CONFIRMED
- trace_id across S1->S9 (OTel-style semantics, no full stack yet)
- Factory Scientific Scorecard dimensions (false-promotion rate, challenge
  detection rate, recovery, replay equivalence, prequential log score, etc.)
- Hydra = lineage only; quantitative canonical state = SQLite/Parquet; draws ->
  artifacts

## Build order
P0 measurement correctness (resolver, schemas, snapshots, baselines, waiting->
resolved lifecycle) · P1 executable S1-S9 model (fast-check) · P2 concurrency +
crash torture (lock ownership!) · P3 mutation testing (trust boundary only) ·
P4 usage middleware as Observation producer -> first genuine resolutions ·
P5 boring hierarchical Bayesian model, shadow-only · P6 hypothesis-induction
benchmark vs generic/random baselines · P7 AgentSEOLab/Cogym via shared
ExperimentReceipts · P8 autonomous experiment allocation after demonstrated skill.

Full text preserved verbatim in session archive; key structures reproduced in
mechanisms/ and docs/CANONICAL-PROCESS-SPEC.md updates.
