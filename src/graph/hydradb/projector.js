/**
 * Native HydraDB projector — maps canonical events to typed Cypher queries
 * using real labels and relationship types instead of generic Entity/REL.
 */

import { NODE_SCHEMAS, RELATIONSHIP_TYPES } from './schema.js';

function cypherString(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function propsToCypher(props) {
  const parts = [];
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') parts.push(`${k}: '${cypherString(v)}'`);
    else if (typeof v === 'number' || typeof v === 'boolean') parts.push(`${k}: ${v}`);
    else parts.push(`${k}: '${cypherString(JSON.stringify(v))}'`);
  }
  return parts.join(', ');
}

function upsertNode(label, id, props) {
  const propStr = propsToCypher({ id, ...props });
  return `MERGE (n:${label} {id: '${id}'}) SET n += {${propStr}}`;
}

function createEdge(fromLabel, fromId, relType, toLabel, toId, props = {}) {
  const propStr = propsToCypher(props);
  const propClause = propStr ? ` {${propStr}}` : '';
  return `MATCH (a:${fromLabel} {id: '${fromId}'}), (b:${toLabel} {id: '${toId}'}) CREATE (a)-[:${relType}${propClause}]->(b)`;
}

/**
 * Project a canonical event into Cypher queries for HydraDB.
 * Returns an array of Cypher statements to execute.
 */
export function projectEvent(event) {
  const p = event.payload ?? {};
  const queries = [];

  switch (event.event_type) {
    case 'idea.created':
      queries.push(upsertNode('Idea', p.id, { name: p.name, description: p.description, scores: p.scores, seeded_at: event.occurred_at }));
      break;

    case 'idea.generator.executed':
      queries.push(upsertNode('IdeaGenerator', p.id, { name: p.name, description: p.description, registered_at: event.occurred_at }));
      break;

    case 'research.recorded':
      queries.push(upsertNode('ResearchReport', p.id, { title: p.title, recorded_at: event.occurred_at }));
      if (p.idea_id) queries.push(createEdge('Idea', p.idea_id, 'RESEARCHED_BY', 'ResearchReport', p.id));
      break;

    case 'capability.defined':
      queries.push(upsertNode('Capability', p.id, { name: p.name, description: p.description, defined_at: event.occurred_at }));
      if (p.idea_id) queries.push(createEdge('Idea', p.idea_id, 'PROPOSES', 'Capability', p.id));
      break;

    case 'build.started':
      queries.push(upsertNode('BuildRun', p.build_run_id ?? p.id, {
        name: p.name ?? p.id,
        status: 'running',
        started_at: event.occurred_at,
      }));
      if (p.idea_id) queries.push(createEdge('Idea', p.idea_id, 'BUILT_BY', 'BuildRun', p.build_run_id ?? p.id));
      if (p.strategy_version_id) queries.push(createEdge('BuildRun', p.build_run_id ?? p.id, 'USED_STRATEGY', 'StrategyVersion', p.strategy_version_id));
      break;

    case 'build.attempt.started':
      queries.push(upsertNode('BuildAttempt', p.attempt_id, {
        attempt_number: p.attempt_number,
        status: 'running',
        started_at: event.occurred_at,
      }));
      if (p.build_run_id) queries.push(createEdge('BuildRun', p.build_run_id, 'HAS_ATTEMPT', 'BuildAttempt', p.attempt_id));
      break;

    case 'build.task.completed': {
      queries.push(upsertNode('Task', p.task_id, { status: p.status }));
      if (p.attempt_id) queries.push(createEdge('BuildAttempt', p.attempt_id, 'EXECUTED_TASK', 'Task', p.task_id, {
        duration_ms: p.duration_ms,
        build_ok: p.build_ok,
        preview_ok: p.preview_ok,
      }));
      break;
    }

    case 'build.failure.recorded':
      queries.push(upsertNode('Failure', p.failure_id, {
        failure_class: p.failure_class,
        message: p.message,
        recorded_at: event.occurred_at,
      }));
      if (p.attempt_id) queries.push(createEdge('BuildAttempt', p.attempt_id, 'FAILED_WITH', 'Failure', p.failure_id));
      break;

    case 'build.repair.started':
      queries.push(upsertNode('RepairAttempt', p.repair_id, {
        repair_strategy: p.repair_strategy,
        result: 'pending',
      }));
      if (p.triggering_failure_id) queries.push(createEdge('Failure', p.triggering_failure_id, 'FIXED_BY', 'RepairAttempt', p.repair_id));
      break;

    case 'build.repair.completed':
      queries.push(upsertNode('RepairAttempt', p.repair_id, { result: p.result }));
      break;

    case 'build.completed':
      queries.push(upsertNode('BuildRun', p.build_run_id, {
        status: p.passed ? 'completed' : 'failed',
        passed: p.passed,
        preview_url: p.preview_url,
        completed_at: event.occurred_at,
      }));
      break;

    case 'build.artifact.created':
      queries.push(upsertNode('Artifact', p.artifact_id, {
        sha256: p.sha256,
        size_bytes: p.size_bytes,
        media_type: p.media_type,
        storage_uri: p.storage_uri,
        created_at: event.occurred_at,
      }));
      if (p.build_run_id) queries.push(createEdge('BuildRun', p.build_run_id, 'CREATED_ARTIFACT', 'Artifact', p.artifact_id));
      break;

    case 'product.graduated':
      queries.push(upsertNode('Product', p.id, { name: p.name, graduated_at: event.occurred_at }));
      if (p.build_run_id) queries.push(createEdge('BuildRun', p.build_run_id, 'PRODUCED', 'Product', p.id));
      break;

    case 'site.registered':
      queries.push(upsertNode('Site', p.id, { name: p.name, url: p.url, registered_at: event.occurred_at }));
      if (p.product_id) queries.push(createEdge('Product', p.product_id, 'EXPOSES', 'Site', p.id));
      break;

    case 'standard.registered':
      queries.push(upsertNode('Standard', p.id, { name: p.name, description: p.description }));
      break;

    case 'standard.version.registered':
      queries.push(upsertNode('StandardVersion', p.id, {
        version: p.version,
        status: p.status || 'draft',
        requirements: p.requirements,
        registered_at: event.occurred_at,
      }));
      if (p.standard_id) queries.push(createEdge('Standard', p.standard_id, 'HAS_VERSION', 'StandardVersion', p.id));
      if (p.previous_id) queries.push(createEdge('StandardVersion', p.id, 'SUPERSEDES', 'StandardVersion', p.previous_id));
      break;

    case 'strategy.registered':
      queries.push(upsertNode('Strategy', p.strategy_id, { name: p.name, description: p.description }));
      break;

    case 'strategy.version.registered':
      queries.push(upsertNode('StrategyVersion', p.strategy_version_id, {
        version: p.version,
        status: p.status || 'candidate',
        instructions: p.instructions,
        valid_from: event.occurred_at,
      }));
      queries.push(createEdge('Strategy', p.strategy_id, 'HAS_VERSION', 'StrategyVersion', p.strategy_version_id));
      break;

    case 'strategy.promoted':
      if (p.promoted_from) queries.push(createEdge('StrategyVersion', p.strategy_version_id, 'SUPERSEDES', 'StrategyVersion', p.promoted_from));
      break;

    case 'observation.recorded':
      queries.push(upsertNode('Observation', p.id, {
        metric: p.metric,
        value: p.value,
        status: 'active',
        ingested_at: event.occurred_at,
      }));
      break;

    case 'observation.invalidated':
      queries.push(upsertNode('Observation', p.id, { status: 'invalidated' }));
      break;

    case 'experiment.created':
      queries.push(upsertNode('Experiment', p.id, { name: p.name, created_at: event.occurred_at }));
      break;

    case 'experiment.arm.created':
      queries.push(upsertNode('ExperimentArm', p.id, { name: p.name, allocation: p.allocation }));
      queries.push(createEdge('Experiment', p.experiment_id, 'HAS_ARM', 'ExperimentArm', p.id));
      break;

    case 'failure.classified':
      queries.push(upsertNode('FailureClass', p.id, { name: p.name, description: p.description }));
      break;

    default:
      break;
  }

  return queries;
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
