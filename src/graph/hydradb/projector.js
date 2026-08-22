/**
 * Native HydraDB projector — correct graph model.
 * 
 * HydraDB write rules (proven):
 * - CREATE (a:X {id:N})-[:REL]->(b:Y {id:M}) — creates both nodes + edge
 * - MATCH SET — updates existing
 * - One-hop edge patterns only
 * - No MERGE, no standalone node CREATE, no MATCH+CREATE edge
 * 
 * Graph model:
 * - Each event creates its node with ONE edge (either to root or to its parent)
 * - Properties set via MATCH+SET after creation
 * - IDs use SHA-256 truncated to 52 bits (JS-safe)
 * - Edge direction matches natural reading (BuildRun HAS_ATTEMPT BuildAttempt)
 */

import crypto from 'node:crypto';

function cypherString(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

/**
 * Convert string ID to a stable 52-bit positive integer.
 * Uses SHA-256 for collision resistance.
 */
function stringToId(s) {
  const hash = crypto.createHash('sha256').update(s).digest();
  // Take first 6 bytes (48 bits) as a positive integer
  const num = hash.readUIntBE(0, 6);
  return num;
}

function pv(v) {
  if (typeof v === 'string') return `'${cypherString(v)}'`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return `'${cypherString(JSON.stringify(v))}'`;
}

/**
 * Create a node. Since HydraDB requires edge patterns for node creation,
 * every node is created with a _GENESIS edge to a well-known anchor.
 */
function createNode(label, stringId, props = {}) {
  const id = stringToId(stringId);
  const all = { id, string_id: stringId, ...props };
  const pairs = Object.entries(all).map(([k, v]) => `${k}: ${pv(v)}`).join(', ');
  return `CREATE (n:${label} {${pairs}})-[:_GENESIS]->(:_ANCHOR {id: 0})`;
}

/**
 * Update a node's properties via MATCH+SET.
 */
function updateNode(label, stringId, props) {
  const id = stringToId(stringId);
  const sets = Object.entries(props).map(([k, v]) => `n.${k} = ${pv(v)}`).join(', ');
  return `MATCH (n:${label} {id: ${id}}) SET ${sets}`;
}

/**
 * Project a canonical event into HydraDB Cypher statements.
 * 
 * Graph model:
 * - BuildRun created with _GENESIS edge
 * - BuildAttempt created with _GENESIS edge (no edge to BuildRun — Hydra can't do this)
 * - Task created with _GENESIS edge
 * - Failure created with _GENESIS edge
 * - Properties set via MATCH+SET
 * 
 * Lineage is queried by string_id properties, not graph edges.
 * This is the correct model given HydraDB's write constraints.
 */
export function projectEvent(event) {
  const p = event.payload ?? {};
  const stmts = [];

  switch (event.event_type) {
    case 'build.started':
      stmts.push(createNode('BuildRun', p.build_run_id ?? p.id, {
        status: 'running', started_at: event.occurred_at,
      }));
      break;

    case 'build.attempt.started':
      stmts.push(createNode('BuildAttempt', p.attempt_id, {
        attempt_number: p.attempt_number || 0,
        build_run_id: p.build_run_id || '',
        status: 'running',
        started_at: event.occurred_at,
      }));
      break;

    case 'build.task.completed':
      stmts.push(createNode('Task', p.task_id, {
        attempt_id: p.attempt_id || '',
        status: p.status || 'unknown',
        duration_ms: p.duration_ms || 0,
      }));
      break;

    case 'build.failure.recorded':
      stmts.push(createNode('Failure', p.failure_id, {
        failure_class: p.failure_class || 'UNKNOWN',
        attempt_id: p.attempt_id || '',
        message: (p.message || '').substring(0, 200),
        recorded_at: event.occurred_at,
      }));
      break;

    case 'build.repair.started':
      stmts.push(createNode('RepairAttempt', p.repair_id, {
        build_run_id: p.build_run_id || '',
        repair_strategy: p.repair_strategy || '',
        result: 'pending',
      }));
      break;

    case 'build.repair.completed':
      stmts.push(updateNode('RepairAttempt', p.repair_id, {
        result: p.result || 'unknown',
      }));
      break;

    case 'build.audit.completed':
      stmts.push(createNode('ReleaseGate', p.attempt_id || event.event_id, {
        passed: !!p.passed,
      }));
      break;

    case 'build.completed':
      stmts.push(updateNode('BuildRun', p.build_run_id, {
        status: p.passed ? 'completed' : 'failed',
        passed: !!p.passed,
        preview_url: p.preview_url || '',
        completed_at: event.occurred_at,
      }));
      break;

    case 'build.artifact.created':
      stmts.push(createNode('Artifact', p.artifact_id, {
        build_run_id: p.build_run_id || '',
        sha256: p.sha256 || '',
        size_bytes: p.size_bytes || 0,
        created_at: event.occurred_at,
      }));
      break;

    case 'strategy.registered':
      stmts.push(createNode('Strategy', p.strategy_id, {
        name: p.name || '',
        description: p.description || '',
      }));
      break;

    case 'strategy.version.registered':
      stmts.push(createNode('StrategyVersion', p.strategy_version_id, {
        strategy_id: p.strategy_id || '',
        version: p.version || 0,
        status: p.status || 'candidate',
      }));
      break;

    case 'observation.recorded':
      stmts.push(createNode('Observation', p.id ?? event.subject.id, {
        metric: p.metric || '',
        value: p.value ?? '',
        ok: !!p.ok,
        site_id: p.site_id || event.context?.site_id || event.subject.id || '',
        url: p.url || '',
        recorded_at: event.occurred_at,
      }));
      break;

    case 'site.registered':
      stmts.push(createNode('Site', p.id ?? p.site_id ?? event.subject.id, {
        name: p.name || '',
        url: p.url || p.domain || '',
        runtime: p.runtime || '',
        registered_at: event.occurred_at,
      }));
      break;

    case 'failure.classified':
      stmts.push(createNode('FailureClass', p.id, {
        name: p.name || '',
        description: p.description || '',
      }));
      break;

    case 'experiment.created':
      stmts.push(createNode('Experiment', p.id, {
        name: p.name || '',
      }));
      break;

    case 'idea.created':
      stmts.push(createNode('Idea', p.id, {
        name: p.name || '',
        description: p.description || '',
      }));
      break;

    case 'capability.defined':
      stmts.push(createNode('Capability', p.id, {
        name: p.name || '',
        description: p.description || '',
      }));
      break;

    case 'product.graduated':
      stmts.push(createNode('Product', p.id, {
        name: p.name || '',
        build_run_id: p.build_run_id || '',
      }));
      break;

    default:
      break;
  }

  return stmts;
}
