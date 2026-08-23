# MechanismSpec registry — evidence ladder for factory mechanisms

Every nontrivial mechanism gets a `<id>.yaml` spec (claim, invariants, oracle,
failure model, efficacy claim + baseline + metrics) and an authority level from
the ladder: PROPOSED → SPECIFIED → UNIT_VERIFIED → STATE_VERIFIED →
ADVERSARIAL_VERIFIED → EFFICACY_CONFIRMED → REPLICATED → PRODUCTION_AUTHORITY.
Any stage can go INVALIDATED; REPLICATED can go STALE.
**Mechanisms below EFFICACY_CONFIRMED are shadow_only: they may log and
recommend, but must not gate autonomous decisions.**

| Mechanism | Spec | code_status | evidence_status | authority |
|---|---|---|---|---|
| forecast_resolver_v2 | mechanisms/forecast_resolver_v2.yaml | v2 rewrite, synthetic idempotency green | PROPOSED | shadow_only |
| convergence_detector | (spec pending) | threshold v0 live | PROPOSED | shadow_only |
| exact_sha_promotion | promote-negative 8/8 | ADVERSARIAL_VERIFIED | — | active (gates real merges) |
| independent_verifier | verify-negative 6/6 + receipt v3 gates | ADVERSARIAL_VERIFIED | efficacy corpus pending | active |
