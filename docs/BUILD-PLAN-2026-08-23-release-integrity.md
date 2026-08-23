# BUILD PLAN — 2026-08-23 — Release Integrity First (peer review P0–P8)

*Source: external peer review of FinalBuilds2 @ 623dd5d+. Supersedes feature work.
Priority: RELEASE BOUNDARY BEFORE MORE FEATURES / AUTONOMY.*

**Mission:** FinalBuilds2 is the trusted control plane for an autonomous software
factory. Builders propose candidates. Builders NEVER decide PASS. Only
independent deterministic verification authorizes promotion. Every transition is
durable, attributable, reversible, observable. No dashboards/planners/new
ontology/new ideas until P0 complete.

## P0 — RELEASE BOUNDARY
1. [ ] **TOCTOU fix**: promoter loads receipt; requires result==PASS;
       branch head == receipt.candidate_commit; candidate descends from
       base_commit; recomputes spec_digest + frozen acceptance_digest;
       run_id match; merges **EXACT SHA** never branch ref; lockfile guard.
       Adversarial test: verify C → advance branch to D → promotion MUST REFUSE D.
2. [ ] **Containment**: separate trust domains (builder/verifier/promoter).
       Verifier: ephemeral checkout, scrubbed env, no CF/Hydra/Git credentials,
       allowlisted env only. Builder: cannot read factory secrets/receipts/
       hidden suites/other worktrees. Minimum viable: unprivileged user +
       env scrubbing now; rootless container next.
3. [ ] **VerificationReceipt v3**: gates {contract_ok, acceptance_ok,
       candidate_tests_ok, build_ok, runtime_ok, user_journey_ok, artifact_ok,
       provenance_ok, sandbox_integrity_ok}. PASS = all APPLICABLE gates true;
       missing evidence = ERROR, never PASS. Artifact classes (cli/api/library/
       static-site/webapp/worker) define applicable gates. Own-tests REQUIRED
       where applicable (fixes regression vs Receipt v2).
4. [ ] **One BuildExecutor interface**: HermesWorktreeExecutor +
       AgentBuildExecutor beneath one BuildRun state machine; shared
       Candidate→Verify→Promote→Deploy→Observe tail. Retire dual-pipeline docs.
5. [ ] **Hidden challenge**: challenge tests selected after candidate freeze;
       builder sees spec + public tests only; commitment hash in receipt.
6. [ ] **Release-boundary test harness**: temp-repo fixtures covering:
       moved branch, altered SHA/base/spec/acceptance, failing acceptance,
       no implementation, missing own tests, malicious candidate reads .env /
       writes outside workspace, verifier timeout, incomplete receipt,
       double promotion, concurrent promotion. No autonomous promotion until green.

## P1 — ONE STATE MACHINE
7. [ ] Canonical states QUEUED→RUNNING→CANDIDATE_READY→VERIFYING→VERIFIED→
       REJECTED→PROMOTING→PROMOTED→DEPLOYING→DEPLOYED→OBSERVING→HEALTHY;
       failures *_FAILED. Transitions check previous state + canonical event +
       idempotent. run.json becomes projection, not competing truth.
8. [ ] Failed-build semantics (partially done 49b576e): admission suppresses
       only on running/healthy/explicit-abandon; fail→retry→success lineage test.

## P2 — ONE EVENT SYSTEM
9. [ ] Canonical events only; EventBus emits envelopes; legacy endpoints become
       adapters; sensors POST ONCE. Delete dual-write.
10. [ ] Deterministic canonical hashing (RFC 8785/JCS-style) w/ Python==Node fixture.
11. [ ] Projection reliability: PERSISTED/PROJECT_PENDING/PROJECTED/PROJECT_ERROR
       durable retry queue; destroy-Hydra→replay equivalence test.

## P3 — DURABLE REPAIR DELIVERY
12. [ ] Outbox ACK only after downstream acceptance; RETRYABLE backoff → DEAD_LETTER;
        CONTROL_TOKEN on telemetry; never mark consumed on dispatch failure.
13. [ ] repair_key = sha256(site_id+standard+violation_fingerprint); one open
        repair per key; completion requires observed resolution.

## P4 — DEPLOYMENT
14. [ ] DeploymentInput from verified candidate (receipt id + digest), both executors.
15. [ ] Two-phase deploy: preview→smoke→target conformance→prod→prod smoke→
        DeploymentReceipt; rollback known-good on post-prod failure.
16. [ ] Target-scoped conformance (`--site site_x`); fleet scan stays separate.

## P5 — CONTROL PLANE SECURITY
17. [ ] Fail-closed auth: default bind 127.0.0.1; non-loopback without CONTROL_TOKEN
        refuses startup; mutating endpoints always authenticated.
18. [ ] No ambient production secrets in builder/verifier processes.

## P6 — TELEMETRY CORRECTNESS
19. [ ] Health = explicit allowed statuses (2xx/3xx); path probes use
        metric=path.status + dimensions.path; windows on aggregates.
20. [ ] Remove runtime/** from git; sanitized fixtures under fixtures/.

## P7 — CI/SUPPLY CHAIN
21. [ ] CI executes shell lifecycle in temp repos (create→verify→promote→supervisor).
22. [ ] Receipt v3 translatable to SLSA provenance; HIGH_ASSURANCE mode optional
        GitHub attestations later.

## P8 — LEARNING (only after reliability)
23. [ ] Strategy evidence: cohorts, CIs, held-out validation; FB consumes, not produces.
24. [ ] Factory metrics: acceptance rate, rejection rate, false-pass rate,
        rollback rate, cost. North star: VERIFIED USEFUL CAPABILITIES / UNIT COST.

## DONE DEFINITION
Unattended fixture proving IDEA→…→HEALTHY, then break-the-deployed-thing repair
loop, then adversarial matrix (unverified/moved/malicious/retry/outage cases).
Do not claim "closed autonomous factory" until proven end-to-end.


---

# ADDENDUM 2026-08-23b — Verification Science phase (peer review accepted)

Status: S1-S9 canonical spec live; measurement-integrity push executed (resolver
v2, Forecast v2 validation, lock ownership nonce, verify-all unified). The
current green suite does NOT yet cover interaction-level failures — the next
phase is the verification science harness, not features.

## Priority order (accepted verbatim)
P0 measurement correctness: RESOLVED for resolver/schema/snapshot/baseline items
(see docs/reviews/PEER-REVIEW-2026-08-23b-verification-science.md execution table);
remaining: usage middleware -> first genuine resolutions.
P1 fast-check executable S1-S9 model, 1000+ sequences/nightly.
P2 concurrency+crash torture on JSONL/outbox/supervisor/promoter locks.
P3 Stryker mutation testing on trust boundary only.
P4 usage middleware as Observation producer -> resolve first real forecasts.
P5 boring hierarchical Bayesian model (PyMC), shadow-only.
P6 hypothesis-induction benchmark vs generic/random baselines.
P7 AgentSEOLab/Cogym via shared ExperimentReceipts (no direct belief mutation).
P8 autonomous experiment allocation after demonstrated predictive skill.

## Mechanism evidence ladder (binding)
PROPOSED -> SPECIFIED -> UNIT_VERIFIED -> STATE_VERIFIED -> ADVERSARIAL_VERIFIED
-> EFFICACY_CONFIRMED -> REPLICATED -> PRODUCTION_AUTHORITY; any -> INVALIDATED;
REPLICATED -> STALE. Sub-EFFICACY_CONFIRMED mechanisms are shadow_only and must
not gate autonomous decisions. Registry: mechanisms/README.md.

## Milestone target
A Factory Scientific Scorecard report: generated-transition counts with zero
safety violations; concurrent-append zero-loss; mutation score on critical gates;
false-promotion count over adversarial corpus; Hydra destroy/replay equivalence;
resolved-forecast Brier skill vs baseline; induction holdout skill; H-branching
decisions; repeat-usage lift vs unguided cohort.


---

# ADDENDUM 2026-08-23c — Edge-site lane LIVE

Pipeline for human-facing sites (Astro + CF Pages functions):
WorkOrder(artifact_type=site) -> worktree -> hermes builder ->
verify-candidate.sh site gates (npm build + dist/index.html + discovery files)
-> promote exact-SHA -> deploy-edge-site.sh (wrangler pages + fleet registration)
-> sensors/conformance/usage automatic.
Pilot: url_inspector_v2 replaces dead placeholder manifest.
Rust CLIs attach per-product when measured need exists (dnc pattern).
