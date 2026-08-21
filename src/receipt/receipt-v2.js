/**
 * Build receipt v2 — full provenance for every build.
 * 
 * Contains: source, software, execution, verification, storage, artifact, challenge.
 */

import crypto from 'node:crypto';

export function createBuildReceipt({
  run_id,
  idea,
  blueprint,
  build_context,
  execution,
  verification,
  storage,
  artifact_sha256,
  challenge,
  hydra_stats,
}) {
  return {
    schema_version: '2.0.0',
    run_id,
    created_at: new Date().toISOString(),

    source: {
      idea_id: idea?.idea_id || null,
      idea_name: idea?.name || idea?.key || null,
      source_repo: idea?.source_repo || null,
      source_file: idea?.source_file || null,
      blueprint_sha256: blueprint ? sha256(blueprint) : null,
    },

    software: {
      finalbuilds_commit: null, // filled by caller
      builda_commit: null,
      hydra_version: null,
      contract_version: '1.0.0',
    },

    execution: {
      model: execution?.model || null,
      provider: execution?.provider || null,
      provider_request_ids: execution?.request_ids || [],
      input_tokens: execution?.input_tokens || 0,
      output_tokens: execution?.output_tokens || 0,
      duration_ms: execution?.duration_ms || 0,
      attempts: execution?.attempts || 0,
      repair_loops: execution?.repair_loops || 0,
      sandbox_restarts: execution?.sandbox_restarts || 0,
    },

    verification: (() => {
      const gates = {
        source_ok: verification?.source_ok === true,
        tests_ok: verification?.tests_ok === true,
        build_ok: verification?.build_ok === true,
        runtime_ok: verification?.runtime_ok === true,
        user_journey_ok: verification?.user_journey_ok === true,
        artifact_rebuild_ok: verification?.artifact_rebuild_ok === true,
        foundry_proof_ok: verification?.foundry_proof_ok === true,
      };
      return gates;
    })(),

    storage: {
      events_persisted: storage?.events_persisted || 0,
      hydra_projected: storage?.hydra_projected || 0,
      hydra_failed: storage?.hydra_failed || 0,
      fallback_projected: storage?.fallback_projected || 0,
    },

    artifact: {
      sha256: artifact_sha256 || null,
      workspace_path: execution?.workspace_path || null,
    },

    challenge: {
      id: challenge || null,
      verified: verification?.foundry_proof_ok === true,
    },

    hydra: {
      stats: hydra_stats || null,
      fallback_zero: hydra_stats?.fallback === 0,
    },

    passed: (() => {
      const gates = {
        source_ok: verification?.source_ok === true,
        tests_ok: verification?.tests_ok === true,
        build_ok: verification?.build_ok === true,
        runtime_ok: verification?.runtime_ok === true,
        user_journey_ok: verification?.user_journey_ok === true,
        artifact_rebuild_ok: verification?.artifact_rebuild_ok === true,
        foundry_proof_ok: verification?.foundry_proof_ok === true,
      };
      return Object.values(gates).every(Boolean);
    })(),
  };
}

function sha256(str) {
  return crypto.createHash('sha256').update(str || '').digest('hex');
}
