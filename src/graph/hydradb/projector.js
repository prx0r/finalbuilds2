/**
 * Native HydraDB projector — maps canonical events to typed Cypher queries.
 * Uses real labels and relationship types.
 * 
 * HydraDB constraints:
 * - Node `id` must be an integer (we use a hash-based numeric ID)
 * - MERGE and SET must be separate statements
 * - RETURN requires property access (n.id) not node (n)
 */

import { NODE_SCHEMAS, RELATIONSHIP_TYPES } from './schema.js';

function cypherString(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function stringToId(s) {
  // Hydra requires integer IDs. Hash the string to a positive 32-bit int.
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function propsToCypher(props) {
  const parts = [];
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (k === 'id') continue; // id handled separately as integer
    if (typeof v === 'string') parts.push(`${k}: '${cypherString(v)}'`);
    else if (typeof v === 'number' || typeof v === 'boolean') parts.push(`${k}: ${v}`);
    else parts.push(`${k}: '${cypherString(JSON.stringify(v))}'`);
  }
  return parts.join(', ');
}

function upsertNode(label, stringId, props) {
  const numericId = stringToId(stringId);
  const allProps = { id: numericId, string_id: stringId, ...props };
  const propStr = propsToCypher(allProps);
  // Split MERGE and SET for HydraDB compatibility
  return [
    `MERGE (n:${label} {id: ${numericId}})`,
    `SET n += {${propStr}}`,
  ];
}

function createEdge(fromLabel, fromStringId, relType, toLabel, toStringId, props = {}) {
  const fromId = stringToId(fromStringId);
  const toId = stringToId(toStringId);
  const propStr = propsToCypher(props);
  const setClause = propStr ? ` SET r += {${propStr}}` : '';
  return [
    `MATCH (a:${fromLabel} {id: ${fromId}}), (b:${toLabel} {id: ${toId}})`,
    `MERGE (a)-[r:${relType}]->(b)${setClause}`,
  ];
}

/**
 * Project a canonical event into Cypher queries for HydraDB.
 * Returns an array of Cypher statement strings (each executed separately).
 */
export function projectEvent(event) {
  const p = event.payload ?? {};
  const statements = [];

  function add(stmts) {
    if (Array.isArray(stmts)) statements.push(...stmts);
    else statements.push(stmts);
  }

  switch (event.event_type) {
    case 'idea.created':
      add(upsertNode('Idea', p.id, { name: p.name, description: p.description, seeded_at: event.occurred_at }));
      break;

    case 'idea.generator.executed':
      add(upsertNode('IdeaGenerator', p.id, { name: p.name, registered_at: event.occurred_at }));
      break;

    case 'research.recorded':
      add(upsertNode('ResearchReport', p.id, { title: p.title, recorded_at: event.occurred_at }));
      if (p.idea_id) add(createEdge('Idea', p.idea_id, 'RESEARCHED_BY', 'ResearchReport', p.id));
      break;

    case 'capability.defined':
      add(upsertNode('Capability', p.id, { name: p.name, description: p.description, defined_at: event.occurred_at }));
      if (p.idea_id) add(createEdge('Idea', p.idea_id, 'PROPOSES', 'Capability', p.id));
      break;

    case 'build.started':
      add(upsertNode('BuildRun', p.build_run_id ?? p.id, {
        name: p.name ?? p.id,
        status: 'running',
        started_at: event.occurred_at,
      }));
      if (p.idea_id) add(createEdge('Idea', p.idea_id, 'BUILT_BY', 'BuildRun', p.build_run_id ?? p.id));
      if (p.strategy_version_id) add(createEdge('BuildRun', p.build_run_id ?? p.id, 'USED_STRATEGY', 'StrategyVersion', p.strategy_version_id));
      break;

    case 'build.attempt.started':
      add(upsertNode('BuildAttempt', p.attempt_id, {
        attempt_number: p.attempt_number,
        status: 'running',
        started_at: event.occurred_at,
      }));
      if (p.build_run_id) add(createEdge('BuildRun', p.build_run_id, 'HAS_ATTEMPT', 'BuildAttempt', p.attempt_id));
      break;

    case 'build.task.completed': {
      add(upsertNode('Task', p.task_id, { status: p.status, duration_ms: p.duration_ms }));
      if (p.attempt_id) add(createEdge('BuildAttempt', p.attempt_id, 'EXECUTED_TASK', 'Task', p.task_id, {
        build_ok: p.build_ok,
        preview_ok: p.preview_ok,
      }));
      break;
    }

    case 'build.failure.recorded':
      add(upsertNode('Failure', p.failure_id, {
        failure_class: p.failure_class,
        message: p.message,
        recorded_at: event.occurred_at,
      }));
      if (p.attempt_id) add(createEdge('BuildAttempt', p.attempt_id, 'FAILED_WITH', 'Failure', p.failure_id));
      break;

    case 'build.repair.started':
      add(upsertNode('RepairAttempt', p.repair_id, {
        repair_strategy: p.repair_strategy,
        result: 'pending',
      }));
      if (p.triggering_failure_id) add(createEdge('Failure', p.triggering_failure_id, 'FIXED_BY', 'RepairAttempt', p.repair_id));
      break;

    case 'build.repair.completed':
      add(upsertNode('RepairAttempt', p.repair_id, { result: p.result }));
      break;

    case 'build.audit.completed':
      add(upsertNode('ReleaseGate', p.attempt_id, { passed: p.passed }));
      if (p.attempt_id) add(createEdge('BuildAttempt', p.attempt_id, 'VERIFIED_BY', 'ReleaseGate', p.attempt_id));
      break;

    case 'build.completed':
      add(upsertNode('BuildRun', p.build_run_id, {
        status: p.passed ? 'completed' : 'failed',
        passed: p.passed,
        preview_url: p.preview_url,
        completed_at: event.occurred_at,
      }));
      break;

    case 'build.artifact.created':
      add(upsertNode('Artifact', p.artifact_id, {
        sha256: p.sha256,
        size_bytes: p.size_bytes,
        media_type: p.media_type,
        storage_uri: p.storage_uri,
        created_at: event.occurred_at,
      }));
      if (p.build_run_id) add(createEdge('BuildRun', p.build_run_id, 'CREATED_ARTIFACT', 'Artifact', p.artifact_id));
      break;

    case 'product.graduated':
      add(upsertNode('Product', p.id, { name: p.name, graduated_at: event.occurred_at }));
      if (p.build_run_id) add(createEdge('BuildRun', p.build_run_id, 'PRODUCED', 'Product', p.id));
      break;

    case 'site.registered':
      add(upsertNode('Site', p.id, { name: p.name, url: p.url, registered_at: event.occurred_at }));
      if (p.product_id) add(createEdge('Product', p.product_id, 'EXPOSES', 'Site', p.id));
      break;

    case 'standard.registered':
      add(upsertNode('Standard', p.id, { name: p.name, description: p.description }));
      break;

    case 'standard.version.registered':
      add(upsertNode('StandardVersion', p.id, {
        version: p.version,
        status: p.status || 'draft',
        registered_at: event.occurred_at,
      }));
      if (p.standard_id) add(createEdge('Standard', p.standard_id, 'HAS_VERSION', 'StandardVersion', p.id));
      if (p.previous_id) add(createEdge('StandardVersion', p.id, 'SUPERSEDES', 'StandardVersion', p.previous_id));
      break;

    case 'strategy.registered':
      add(upsertNode('Strategy', p.strategy_id, { name: p.name, description: p.description }));
      break;

    case 'strategy.version.registered':
      add(upsertNode('StrategyVersion', p.strategy_version_id, {
        version: p.version,
        status: p.status || 'candidate',
        valid_from: event.occurred_at,
      }));
      add(createEdge('Strategy', p.strategy_id, 'HAS_VERSION', 'StrategyVersion', p.strategy_version_id));
      break;

    case 'strategy.promoted':
      if (p.promoted_from) add(createEdge('StrategyVersion', p.strategy_version_id, 'SUPERSEDES', 'StrategyVersion', p.promoted_from));
      break;

    case 'observation.recorded':
      add(upsertNode('Observation', p.id, {
        metric: p.metric,
        status: 'active',
        ingested_at: event.occurred_at,
      }));
      break;

    case 'observation.invalidated':
      add(upsertNode('Observation', p.id, { status: 'invalidated' }));
      break;

    case 'experiment.created':
      add(upsertNode('Experiment', p.id, { name: p.name, created_at: event.occurred_at }));
      break;

    case 'experiment.arm.created':
      add(upsertNode('ExperimentArm', p.id, { name: p.name, allocation: p.allocation }));
      add(createEdge('Experiment', p.experiment_id, 'HAS_ARM', 'ExperimentArm', p.id));
      break;

    case 'failure.classified':
      add(upsertNode('FailureClass', p.id, { name: p.name, description: p.description }));
      break;

    default:
      break;
  }

  return statements;
}

/**
 * Project all events into Cypher queries.
 */
export function projectAll(events) {
  const all = [];
  for (const event of events) {
    all.push(...projectEvent(event));
  }
  return all;
}
