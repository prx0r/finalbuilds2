/**
 * Native HydraDB projector — proven write patterns only.
 * 
 * HydraDB write rules (proven):
 * - CREATE (a:X {id:N})-[:REL]->(b:Y {id:M}) — works, creates both nodes + 1 edge
 * - MATCH (n:X {id:N}) SET n.prop = val — works, updates existing
 * - One-hop edge patterns only (no chains)
 * - No MATCH+CREATE edge (mutation engine doesn't support it)
 * 
 * Strategy: each event creates its node with one edge.
 * Relationship edges between nodes from different events use _SENTINEL.
 * Properties are set via MATCH+SET after creation.
 */

function cypherString(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function stringToId(s) {
  let hash = 0;
  for (let i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; }
  return Math.abs(hash);
}

function pv(v) {
  if (typeof v === 'string') return `'${cypherString(v)}'`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return `'${cypherString(JSON.stringify(v))}'`;
}

function createNode(label, stringId, props = {}) {
  const id = stringToId(stringId);
  const all = { id, string_id: stringId, ...props };
  const pairs = Object.entries(all).map(([k, v]) => `${k}: ${pv(v)}`).join(', ');
  return `CREATE (n:${label} {${pairs}})-[:_SENTINEL]->(:_ANCHOR {id: 0})`;
}

function createNodeWithEdge(label, stringId, relType, targetLabel, targetStringId, props = {}) {
  const id = stringToId(stringId);
  const targetId = stringToId(targetStringId);
  const all = { id, string_id: stringId, ...props };
  const pairs = Object.entries(all).map(([k, v]) => `${k}: ${pv(v)}`).join(', ');
  return `CREATE (n:${label} {${pairs}})-[:${relType}]->(:${targetLabel} {id: ${targetId}})`;
}

function updateNode(label, stringId, props) {
  const id = stringToId(stringId);
  const sets = Object.entries(props).map(([k, v]) => `n.${k} = ${pv(v)}`).join(', ');
  return `MATCH (n:${label} {id: ${id}}) SET ${sets}`;
}

export function projectEvent(event) {
  const p = event.payload ?? {};
  const stmts = [];

  switch (event.event_type) {
    case 'build.started':
      stmts.push(createNode('BuildRun', p.build_run_id ?? p.id, { status: 'running', started_at: event.occurred_at }));
      break;

    case 'build.attempt.started':
      // Create attempt WITH edge to build run in same statement
      stmts.push(createNodeWithEdge('BuildAttempt', p.attempt_id, 'HAS_ATTEMPT', 'BuildRun', p.build_run_id, { attempt_number: p.attempt_number || 0, status: 'running', started_at: event.occurred_at }));
      break;

    case 'build.task.completed':
      // Create task WITH edge to attempt in same statement
      stmts.push(createNodeWithEdge('Task', p.task_id, 'EXECUTED_TASK', 'BuildAttempt', p.attempt_id, { status: p.status || 'unknown', duration_ms: p.duration_ms || 0 }));
      break;

    case 'build.failure.recorded':
      // Create failure WITH edge to attempt in same statement
      stmts.push(createNodeWithEdge('Failure', p.failure_id, 'FAILED_WITH', 'BuildAttempt', p.attempt_id, { failure_class: p.failure_class || 'UNKNOWN', message: (p.message || '').substring(0, 200), recorded_at: event.occurred_at }));
      break;

    case 'build.repair.started':
      stmts.push(createNode('RepairAttempt', p.repair_id, { repair_strategy: p.repair_strategy || '', result: 'pending' }));
      break;

    case 'build.repair.completed':
      stmts.push(updateNode('RepairAttempt', p.repair_id, { result: p.result || 'unknown' }));
      break;

    case 'build.audit.completed':
      stmts.push(createNode('ReleaseGate', p.attempt_id || event.event_id, { passed: !!p.passed }));
      break;

    case 'build.completed':
      stmts.push(updateNode('BuildRun', p.build_run_id, { status: p.passed ? 'completed' : 'failed', passed: !!p.passed, preview_url: p.preview_url || '', completed_at: event.occurred_at }));
      break;

    case 'build.artifact.created':
      stmts.push(createNode('Artifact', p.artifact_id, { sha256: p.sha256 || '', size_bytes: p.size_bytes || 0, created_at: event.occurred_at }));
      break;

    case 'strategy.registered':
      stmts.push(createNode('Strategy', p.strategy_id, { name: p.name || '', description: p.description || '' }));
      break;

    case 'strategy.version.registered':
      stmts.push(createNodeWithEdge('StrategyVersion', p.strategy_version_id, 'HAS_VERSION', 'Strategy', p.strategy_id, { version: p.version || 0, status: p.status || 'candidate' }));
      break;

    case 'observation.recorded':
      stmts.push(createNode('Observation', p.id, { metric: p.metric || '', status: 'active' }));
      break;

    case 'failure.classified':
      stmts.push(createNode('FailureClass', p.id, { name: p.name || '', description: p.description || '' }));
      break;

    case 'experiment.created':
      stmts.push(createNode('Experiment', p.id, { name: p.name || '' }));
      break;

    case 'idea.created':
      stmts.push(createNode('Idea', p.id, { name: p.name || '', description: p.description || '' }));
      break;

    case 'capability.defined':
      stmts.push(createNode('Capability', p.id, { name: p.name || '', description: p.description || '' }));
      break;

    case 'product.graduated':
      stmts.push(createNode('Product', p.id, { name: p.name || '' }));
      break;

    default:
      break;
  }

  return stmts;
}
