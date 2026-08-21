# Internal validation report

Date: 2026-08-21

## Executed here

`npm run validate` passed end-to-end.

- syntax check: passed;
- Node unit/integration tests: **14/14 passed**;
- in-memory full demo: passed;
- 10,000-capability scale smoke: passed;
- fake-transport HydraDB HTTP contract test: passed;
- JSONL persistence/rebuild tests: passed;
- HTTP bearer-auth/observation-ingest test: passed;
- deterministic experiment assignment/report test: passed;
- standards drift/reconciliation test: passed;
- idea-generator lineage attribution test: passed;
- generic process-lineage attribution test: passed.

Observed scale-smoke run in this environment:

```text
capabilities: 10,000
in-memory materialization: ~74 ms
intent resolution scan: ~58 ms
correct target ranked first: yes
```

These timings are environment-specific and are **not** HydraDB benchmarks.

## Not executable in this environment

A real HydraDB server could not be launched because this execution environment does not provide Docker and cannot pull/build external dependencies. Therefore the live HydraDB round-trip was not falsely marked as tested.

The archive includes `scripts/hydra-smoke.sh` and a manual GitHub Actions workflow that run a genuine HydraDB write/read/lineage round trip when Docker/GHCR are available.

## Important production work still required

- pin a specific HydraDB release/digest after live compatibility verification;
- confirm the exact JSON row shape of the pinned HydraDB HTTP release (the adapter supports common row wrappers, but the live smoke test is authoritative);
- replace the JSONL Hermes outbox with the actual task-creation adapter;
- persist raw evidence/artifacts to R2/S3 and link digests from observations;
- add Cloudflare deploy/rollback integration;
- use metric-specific experimental statistics and predeclared stopping rules before autonomous standards promotion;
- add authentication/authorization scopes if exposing the control plane beyond a private network.
