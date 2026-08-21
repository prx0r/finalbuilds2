# FOUNDRY_ARCHITECTURE.md — Cross-Repository Integration Spec

**Version:** foundry-event-contract/1.0.0
**Date:** 2026-08-21
**Status:** Implementation in progress

## Overview

Three projects integrated into one coherent, evidence-driven software factory:

- **finalbuilds2** — canonical event vocabulary, ontology, strategy lifecycle, control-plane decisions
- **builda-v2 (agentbuild2)** — execution/evidence producer
- **agentseolab** — experiment/evidence producer

HydraDB = shared living world model and learning graph.
R2/S3 = immutable raw evidence and artifacts.

## Architecture

```
                         EXTERNAL WORLD
             GitHub / standards / users / models
                             |
                             v
                    immutable observations
                             |
                             v
                     R2 / S3 EVENT STORE
                 artifacts + event envelopes
                             |
                             v
+-------------------------------------------------------------+
|                         HYDRADB                             |
|                                                             |
| Capability graph     Evidence graph      Strategy graph      |
| Product lineage      Build memory        Experiment graph    |
| Standards history    Failure graph       Deployment graph    |
| AgentSEO evidence    Model history       Provenance          |
+----------------------------+--------------------------------+
                             |
                      FINALBUILDS2
                planner / policy / promotion
                    /        |        \
                   /         |         \
                  v          v          v
             BUILDA-V2   AGENTSEOLAB   future sensors
              execute      experiment
                  \          /
                   \        /
                    v      v
                      EVIDENCE
                         |
                         +------------------> R2 + Hydra
```

## Non-negotiable rules

1. Immutable truth before projections (R2 > Hydra > JSONL)
2. Use Hydra as a graph, not JSON document database (typed labels/edges)
3. Raw high-volume telemetry → R2, not Hydra
4. No destructive knowledge updates (version everything)
5. Measured evidence beats model prose
6. Learning must be reversible (provenance on everything)

See full spec in the original document or at:
https://github.com/prx0r/finalbuilds2/blob/main/FOUNDRY_ARCHITECTURE.md

## Canonical event envelope

Every event contains:
- event_id, event_type, schema_version
- occurred_at, recorded_at
- source (system, version, repo, commit_sha)
- subject (type, id)
- context (project_id, product_id, capability_id, experiment_id)
- payload
- artifact_refs
- causation_id, correlation_id
- integrity (payload_sha256, previous_event_id)

## Migration phases

A. Contracts (schemas, ontology, fixtures)
B. Persistent event layer (R2 store, artifact store)
C. Native Hydra graph (typed projector)
D. Builda producer (client, spool, events, failure taxonomy)
E. BuildContext (strategy registry, retrieval)
F. AgentSEOLab producer
G. Learning lifecycle (promotion, rollback, invalidation)
H. Feedback loop (experiment → standard → drift → repair)
I. Code/component intelligence
