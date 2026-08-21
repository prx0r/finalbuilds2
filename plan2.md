# PLAN2 — Integration Correctness Pass

**Date:** 2026-08-21
**Mission:** Make the durable learning pipeline real. No new features — fix the plumbing.

## Status

```
contracts          █████████░
native graph model ████████░░
Builda telemetry   ████░░░░░░
R2 durability      ████░░░░░░
BuildContext       ██░░░░░░░░
strategy learning  ██░░░░░░░░
AgentSEOLab link   ░░░░░░░░░░
closed learning    ░░░░░░░░░░
```

## P0 — Fix FinalBuilds event ingestion

POST /v1/events currently calls bus.emit() which creates a DIFFERENT legacy event. The native projectEvent() only returns Cypher strings without executing them. Replace with CanonicalEventIngestor that validates → persists exact envelope → projects into graph.

## P0 — Separate canonical event append from legacy

Route all events through one ingestion path. Keep legacy adapters temporarily but route through canonical creation first.

## P0 — Wire R2 into ControlPlane.fromEnv()

Add EVENT_STORE_BACKEND env var (jsonl/local-r2/r2). Default jsonl for dev. Production supports R2.

## P0 — Harden immutable R2 events

Idempotent append (conflict detection), event index for lookup, proper pagination, stream method, remote artifact verification.

## P0 — Execute native Hydra projector

Create executor.js that runs Cypher statements. Use MERGE not CREATE for idempotent replay.

## P0 — Projection checkpoints

R2 append succeeds, Hydra unavailable → event durable, projection pending. Add catch-up/rebuild/verify CLI.

## P0 — Rebuild test

Hydra graph A → destroy → rebuild from R2 → graph B → semantic equivalence.

## P0 — Remove contract duplication from Builda

Generate Python bindings from canonical FinalBuilds contracts. One source of truth.

## P0 — Fix Builda spool semantics

Spool first → send → acknowledge accepted IDs → remove. Batch endpoint returns accepted/duplicate/rejected.

## P0 — Real BuildAttempt lineage

Each attempt gets stable ID before submission. Emit attempt.started, task.started, task.completed, failure.recorded, repair.started, repair.completed.

## P0 — Failure classification in Builda

Use canonical classifier. Emit failure events with class + raw message + context.

## P0 — Emit release evidence

After finalize: emit audit.completed, artifact.created, build.completed with findings. Upload workspace.zip, evidence.json, release-receipt.json as artifacts.

## P0 — Add Builda integration tests

tests/test_foundry_contract.py, test_foundry_spool.py, test_foundry_client.py, test_foundry_runner_events.py, test_build_context.py

## P0 — Use BuildContext during normal builds

Integrate into BuildRunner.run_direct(): lint → hash → request context → compile prompt → run. Offline-safe fallback.

## Definition of done

```
[ ] canonical event envelopes persisted exactly
[ ] ingestion validates payload hash and event type
[ ] event IDs are idempotent
[ ] conflicting duplicate IDs rejected
[ ] R2 selectable from environment
[ ] R2 lookup and pagination work
[ ] native Hydra Cypher actually executed
[ ] Hydra projection replay is idempotent
[ ] projection catches up after Hydra outage
[ ] Builda spool no longer duplicates successful sends
[ ] Builda emits real BuildAttempt nodes
[ ] failures emitted and classified
[ ] repairs represented
[ ] release audits represented
[ ] artifacts represented
[ ] BuildContext consumed by actual runner
[ ] BuildContext contains standards
[ ] BuildContext contains contextual failure history
[ ] BuildContext contains precedents
[ ] strategy stats from durable graph evidence
[ ] end-to-end test passes
```
