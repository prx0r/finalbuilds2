/**
 * Live HydraDB integration test.
 * 
 * Prerequisites:
 * - HydraDB running on localhost:8443
 * - Auth token in env or default
 * 
 * Run: HYDRADB_TOKEN=... node --test test/hydra-live.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { HydraExecutor } from '../src/graph/hydradb/executor.js';
import { projectEvent } from '../src/graph/hydradb/projector.js';
import { createEvent } from '../contracts/index.js';

const HYDRA_URL = process.env.HYDRADB_URL || 'http://127.0.0.1:8443';
const HYDRA_TOKEN = process.env.HYDRADB_TOKEN || 'iolauz-test-token-32-chars-long!!';
const GRAPH_ID = process.env.HYDRADB_GRAPH_ID || 'default';
const CELL_ID = process.env.HYDRADB_CELL_ID || 'cell-0';

describe('Live HydraDB Integration', () => {
  let executor;
  let testIds = [];

  before(() => {
    executor = new HydraExecutor({
      baseUrl: HYDRA_URL,
      token: HYDRA_TOKEN,
      graphId: GRAPH_ID,
      cellId: CELL_ID,
    });
  });

  after(async () => {
    // Clean up test nodes
    for (const id of testIds) {
      try {
        await executor.query(`MATCH (n {id: '${id}'}) DETACH DELETE n`);
      } catch {}
    }
  });

  it('Hydra is reachable', async () => {
    const result = await executor.query('MATCH (n:BuildRun) RETURN n.id LIMIT 1');
    assert.ok(result.query_id, 'Hydra should return a query_id');
  });

  it('can create and query a BuildRun node', async () => {
    const testId = `build_test_live_${Date.now()}`;
    testIds.push(testId);

    const statements = projectEvent({
      event_id: `evt_test_${Date.now()}`,
      event_type: 'build.started',
      schema_version: '1.0.0',
      occurred_at: new Date().toISOString(),
      recorded_at: new Date().toISOString(),
      source: { system: 'builda-v2', version: '0.4.0' },
      subject: { type: 'BuildRun', id: testId },
      payload: {
        build_run_id: testId,
        blueprint_hash: 'abc123',
      },
      artifact_refs: [],
      integrity: { payload_sha256: 'abc123' },
    });

    assert.ok(statements.length > 0, 'projectEvent should return Cypher statements');

    const results = await executor.executeAll(statements);
    const allOk = results.every(r => r.success);
    assert.ok(allOk, `All statements should execute: ${JSON.stringify(results.filter(r => !r.success))}`);

    // Verify the node exists
    const query = await executor.query(`MATCH (n:BuildRun {id: '${testId}'}) RETURN n.id, n.status`);
    assert.ok(query.rows.length > 0, 'BuildRun node should exist in Hydra');
    assert.equal(query.rows[0][0], testId);
  });

  it('can create a FailureClass node', async () => {
    const statements = projectEvent({
      event_id: `evt_failclass_${Date.now()}`,
      event_type: 'failure.classified',
      schema_version: '1.0.0',
      occurred_at: new Date().toISOString(),
      recorded_at: new Date().toISOString(),
      source: { system: 'finalbuilds2', version: '1.0.0' },
      subject: { type: 'FailureClass', id: 'TEST_FAILED' },
      payload: { id: 'TEST_FAILED', name: 'Test Failed', description: 'Unit tests failed' },
      integrity: { payload_sha256: 'test' },
    });

    const results = await executor.executeAll(statements);
    assert.ok(results.every(r => r.success));

    const query = await executor.query(`MATCH (n:FailureClass {id: 'TEST_FAILED'}) RETURN n.name`);
    assert.ok(query.rows.length > 0);
    assert.equal(query.rows[0][0], 'Test Failed');
  });

  it('can create Strategy and StrategyVersion with HAS_VERSION edge', async () => {
    const strategyId = `strategy_test_${Date.now()}`;
    const versionId = `strategyv_test_${Date.now()}`;
    testIds.push(strategyId, versionId);

    // Create strategy
    const stmts1 = projectEvent({
      event_id: `evt_strat_${Date.now()}`,
      event_type: 'strategy.registered',
      schema_version: '1.0.0',
      occurred_at: new Date().toISOString(),
      recorded_at: new Date().toISOString(),
      source: { system: 'finalbuilds2', version: '1.0.0' },
      subject: { type: 'Strategy', id: strategyId },
      payload: { strategy_id: strategyId, name: 'Test Strategy', description: 'E2E test' },
      integrity: { payload_sha256: 'test' },
    });
    await executor.executeAll(stmts1);

    // Create version
    const stmts2 = projectEvent({
      event_id: `evt_stratv_${Date.now()}`,
      event_type: 'strategy.version.registered',
      schema_version: '1.0.0',
      occurred_at: new Date().toISOString(),
      recorded_at: new Date().toISOString(),
      source: { system: 'finalbuilds2', version: '1.0.0' },
      subject: { type: 'StrategyVersion', id: versionId },
      payload: {
        strategy_id: strategyId,
        strategy_version_id: versionId,
        version: 1,
        status: 'promoted',
        instructions: { architecture: 'test' },
      },
      integrity: { payload_sha256: 'test' },
    });
    await executor.executeAll(stmts2);

    // Verify strategy
    const q1 = await executor.query(`MATCH (s:Strategy {id: '${strategyId}'}) RETURN s.name`);
    assert.equal(q1.rows[0][0], 'Test Strategy');

    // Verify version
    const q2 = await executor.query(`MATCH (v:StrategyVersion {id: '${versionId}'}) RETURN v.status`);
    assert.equal(q2.rows[0][0], 'promoted');

    // Verify edge
    const q3 = await executor.query(`MATCH (s:Strategy {id: '${strategyId}'})-[:HAS_VERSION]->(v:StrategyVersion {id: '${versionId}'}) RETURN v.version`);
    assert.equal(q3.rows[0][0], 1);
  });

  it('MERGE is idempotent — replaying same event does not create duplicates', async () => {
    const testId = `build_idem_${Date.now()}`;
    testIds.push(testId);

    const event = {
      event_id: `evt_idem_${Date.now()}`,
      event_type: 'build.started',
      schema_version: '1.0.0',
      occurred_at: new Date().toISOString(),
      recorded_at: new Date().toISOString(),
      source: { system: 'builda-v2', version: '0.4.0' },
      subject: { type: 'BuildRun', id: testId },
      payload: { build_run_id: testId, blueprint_hash: 'idem_test' },
      integrity: { payload_sha256: 'idem_test' },
    };

    const stmts = projectEvent(event);
    await executor.executeAll(stmts);
    await executor.executeAll(stmts); // replay

    const q = await executor.query(`MATCH (n:BuildRun {id: '${testId}'}) RETURN n.id`);
    assert.equal(q.rows.length, 1, 'Should have exactly one node, not duplicates');
  });
});
