import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the contract module
const { validateEvent, createEvent, classifyFailure, CONTRACT_VERSION, EVENT_TYPES, FAILURE_CLASSES } = await import('../contracts/index.js');

describe('Foundry Event Contract', () => {
  describe('envelope', () => {
    it('creates valid event envelope', () => {
      const event = createEvent('build.started', { system: 'builda-v2', version: '0.4.0' }, { type: 'BuildRun', id: 'build_001' }, { build_run_id: 'build_001' });
      assert.equal(event.schema_version, CONTRACT_VERSION);
      assert.equal(event.source.system, 'builda-v2');
      assert.equal(event.subject.type, 'BuildRun');
      assert.equal(event.subject.id, 'build_001');
      assert.ok(event.event_id.startsWith('evt_'));
      assert.ok(event.occurred_at);
      assert.ok(event.integrity.payload_sha256);
    });

    it('rejects unknown event types', () => {
      assert.throws(() => createEvent('fake.event', { system: 'builda-v2' }, { type: 'X', id: 'x' }, {}), /Unknown event type/);
    });

    it('validates correct event', () => {
      const event = createEvent('build.completed', { system: 'builda-v2', version: '0.4.0' }, { type: 'BuildRun', id: 'build_001' }, { passed: true });
      const result = validateEvent(event);
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });
  });

  describe('fixture validation', () => {
    it('all fixture events are valid', () => {
      const fixture = JSON.parse(readFileSync(path.join(__dirname, '../contracts/fixtures/events.json'), 'utf8'));
      for (const event of fixture.events) {
        const result = validateEvent(event);
        assert.ok(result.valid, `Event ${event.event_id}: ${result.errors.join(', ')}`);
      }
    });

    it('fixture event types are in canonical list', () => {
      const fixture = JSON.parse(readFileSync(path.join(__dirname, '../contracts/fixtures/events.json'), 'utf8'));
      for (const event of fixture.events) {
        assert.ok(EVENT_TYPES.includes(event.event_type), `Unknown type: ${event.event_type}`);
      }
    });
  });

  describe('failure classification', () => {
    it('classifies known patterns', () => {
      assert.equal(classifyFailure('stream ended without terminal event'), 'TASK_STREAM_TERMINATED');
      assert.equal(classifyFailure('zero events'), 'TASK_ZERO_EVENTS');
      assert.equal(classifyFailure('sandbox not ready'), 'SANDBOX_NOT_READY');
      assert.equal(classifyFailure('compile failed'), 'COMPILE_FAILED');
      assert.equal(classifyFailure('tests failed'), 'TEST_FAILED');
      assert.equal(classifyFailure('preview failed'), 'PREVIEW_FAILED');
      assert.equal(classifyFailure('secret detected in source'), 'SECRET_DETECTED');
      assert.equal(classifyFailure('timeout exceeded'), 'TIMEOUT');
      assert.equal(classifyFailure('unauthorized'), 'PROVIDER_AUTH_FAILED');
    });

    it('returns UNKNOWN for unrecognized messages', () => {
      assert.equal(classifyFailure('something weird happened'), 'UNKNOWN');
      assert.equal(classifyFailure(''), 'UNKNOWN');
    });
  });

  describe('ontology', () => {
    it('node types have ID prefixes', () => {
      const nodeTypes = JSON.parse(readFileSync(path.join(__dirname, '../contracts/ontology/node-types.json'), 'utf8'));
      assert.ok(Object.keys(nodeTypes.definitions).length > 20);
    });

    it('relationship types are defined', () => {
      const relTypes = JSON.parse(readFileSync(path.join(__dirname, '../contracts/ontology/relationship-types.json'), 'utf8'));
      assert.ok(Object.keys(relTypes.definitions).length > 30);
    });
  });
});
