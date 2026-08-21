/**
 * Foundry Event Contract — shared module for creating, validating, and
 * serializing canonical events across finalbuilds2, builda-v2, and agentseolab.
 *
 * Version: foundry-event-contract/1.0.0
 */

import crypto from 'node:crypto';

export const CONTRACT_VERSION = '1.0.0';

export const SYSTEMS = Object.freeze({
  FINALBUILDS2: 'finalbuilds2',
  BUILDA_V2: 'builda-v2',
  AGENTSEOLAB: 'agentseolab',
});

export const EVENT_TYPES = Object.freeze([
  'idea.created', 'idea.generator.executed', 'research.recorded',
  'capability.defined', 'capability.updated',
  'build.requested', 'build.started', 'build.attempt.started',
  'build.task.started', 'build.task.completed',
  'build.failure.recorded', 'build.repair.started', 'build.repair.completed',
  'build.audit.completed', 'build.artifact.created', 'build.completed',
  'product.graduated', 'site.registered',
  'deployment.started', 'deployment.completed', 'deployment.rolled_back',
  'observation.recorded', 'observation.invalidated',
  'hypothesis.created', 'experiment.created', 'experiment.arm.created',
  'experiment.arm.assigned', 'experiment.observation.recorded', 'experiment.completed',
  'standard.registered', 'standard.version.registered', 'standard.conformance.observed',
  'strategy.registered', 'strategy.version.registered', 'strategy.evaluated',
  'strategy.promoted', 'strategy.deprecated', 'strategy.rolled_back',
  'failure.classified',
  'model.execution.recorded',
  'artifact.created', 'artifact.invalidated',
]);

export const FAILURE_CLASSES = Object.freeze([
  'TASK_STREAM_TERMINATED', 'TASK_ZERO_EVENTS',
  'SANDBOX_NOT_READY', 'SANDBOX_CRASHED',
  'DEPENDENCY_INSTALL_FAILED', 'COMPILE_FAILED', 'TEST_FAILED',
  'PREVIEW_FAILED', 'HTTP_HEALTH_FAILED',
  'SECRET_DETECTED', 'SECURITY_GATE_FAILED',
  'MISSING_OPENAPI', 'MISSING_LLMS_TXT', 'MISSING_ROBOTS', 'MISSING_SITEMAP',
  'PORT_BINDING_FAILED',
  'PROVIDER_AUTH_FAILED', 'PROVIDER_RATE_LIMITED',
  'TIMEOUT',
  'UNKNOWN',
]);

export const ID_PREFIXES = Object.freeze({
  EVENT: 'evt',
  IDEA: 'idea',
  IDEA_GEN: 'gen',
  RESEARCH: 'res',
  CAPABILITY: 'cap',
  BUILD_RUN: 'build',
  ATTEMPT: 'attempt',
  TASK: 'task',
  FAILURE: 'fail',
  REPAIR: 'repair',
  ARTIFACT: 'art',
  PRODUCT: 'prod',
  SITE: 'site',
  DEPLOYMENT: 'deploy',
  STANDARD: 'std',
  STANDARD_VERSION: 'stdv',
  STRATEGY: 'strategy',
  STRATEGY_VERSION: 'strategyv',
  OBSERVATION: 'obs',
  HYPOTHESIS: 'hyp',
  EXPERIMENT: 'exp',
  EXPERIMENT_ARM: 'arm',
  MODEL: 'model',
  MODEL_VERSION: 'modelv',
  MODEL_CONFIG: 'mc',
  COMPONENT: 'comp',
  COMPONENT_VERSION: 'compv',
  PROCEDURE: 'proc',
  PROCEDURE_VERSION: 'procv',
  LESSON: 'lesson',
});

/**
 * Generate a stable ID with a type prefix.
 */
export function generateId(prefix, randomBytes = 8) {
  const hex = crypto.randomBytes(randomBytes).toString('hex');
  return `${prefix}_${hex}`;
}

/**
 * Compute SHA-256 of a payload.
 */
export function sha256(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Create a canonical event envelope.
 */
export function createEvent(eventType, source, subject, payload, options = {}) {
  if (!EVENT_TYPES.includes(eventType)) {
    throw new Error(`Unknown event type: ${eventType}. Valid types: ${EVENT_TYPES.join(', ')}`);
  }

  const now = new Date().toISOString();
  const event = {
    event_id: generateId(ID_PREFIXES.EVENT),
    event_type: eventType,
    schema_version: CONTRACT_VERSION,
    occurred_at: options.occurred_at || now,
    recorded_at: now,
    source: {
      system: source.system,
      version: source.version || '0.0.0',
      repo: source.repo || null,
      commit_sha: source.commit_sha || null,
    },
    subject: {
      type: subject.type,
      id: subject.id,
    },
    context: options.context || {},
    payload,
    artifact_refs: options.artifact_refs || [],
    causation_id: options.causation_id || null,
    correlation_id: options.correlation_id || null,
    integrity: {
      payload_sha256: sha256(payload),
      previous_event_id: options.previous_event_id || null,
    },
  };

  return event;
}

/**
 * Validate an event envelope (basic structural validation).
 */
export function validateEvent(event) {
  const errors = [];
  if (!event.event_id || typeof event.event_id !== 'string') errors.push('missing event_id');
  if (!event.event_type || !EVENT_TYPES.includes(event.event_type)) errors.push(`invalid event_type: ${event.event_type}`);
  if (event.schema_version !== CONTRACT_VERSION) errors.push(`schema_version mismatch: ${event.schema_version} != ${CONTRACT_VERSION}`);
  if (!event.occurred_at) errors.push('missing occurred_at');
  if (!event.recorded_at) errors.push('missing recorded_at');
  if (!event.source?.system || !SYSTEMS[event.source.system.toUpperCase().replace(/-/g, '_')]) {
    errors.push(`invalid source.system: ${event.source?.system}`);
  }
  if (!event.subject?.type || !event.subject?.id) errors.push('missing subject.type or subject.id');
  if (!event.payload || typeof event.payload !== 'object') errors.push('missing payload');
  return { valid: errors.length === 0, errors };
}

/**
 * Classify a raw error message into a FailureClass.
 */
export function classifyFailure(errorMessage) {
  const msg = (errorMessage || '').toLowerCase();
  if (msg.includes('stream ended') || msg.includes('stream terminated')) return 'TASK_STREAM_TERMINATED';
  if (msg.includes('zero events')) return 'TASK_ZERO_EVENTS';
  if (msg.includes('not running') || msg.includes('sandbox not ready')) return 'SANDBOX_NOT_READY';
  if (msg.includes('sandbox') && (msg.includes('crash') || msg.includes('oom'))) return 'SANDBOX_CRASHED';
  if (msg.includes('install') && msg.includes('fail')) return 'DEPENDENCY_INSTALL_FAILED';
  if (msg.includes('compile') || msg.includes('build_error')) return 'COMPILE_FAILED';
  if (msg.includes('test') && msg.includes('fail')) return 'TEST_FAILED';
  if (msg.includes('preview') && msg.includes('fail')) return 'PREVIEW_FAILED';
  if (msg.includes('http') && msg.includes('health')) return 'HTTP_HEALTH_FAILED';
  if (msg.includes('secret') || msg.includes('hardcoded')) return 'SECRET_DETECTED';
  if (msg.includes('security')) return 'SECURITY_GATE_FAILED';
  if (msg.includes('openapi')) return 'MISSING_OPENAPI';
  if (msg.includes('llms.txt')) return 'MISSING_LLMS_TXT';
  if (msg.includes('robots')) return 'MISSING_ROBOTS';
  if (msg.includes('sitemap')) return 'MISSING_SITEMAP';
  if (msg.includes('port') && msg.includes('bind')) return 'PORT_BINDING_FAILED';
  if (msg.includes('auth') || msg.includes('unauthorized')) return 'PROVIDER_AUTH_FAILED';
  if (msg.includes('rate limit')) return 'PROVIDER_RATE_LIMITED';
  if (msg.includes('timeout')) return 'TIMEOUT';
  return 'UNKNOWN';
}
