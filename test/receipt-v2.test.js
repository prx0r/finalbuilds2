import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBuildReceipt } from '../src/receipt/receipt-v2.js';

describe('Receipt v2 false-pass prevention', () => {
  it('empty verification → passed is false', () => {
    const r = createBuildReceipt({ run_id: 'test', verification: {} });
    assert.equal(r.passed, false);
  });

  it('undefined verification → passed is false', () => {
    const r = createBuildReceipt({ run_id: 'test' });
    assert.equal(r.passed, false);
  });

  it('partial verification → passed is false', () => {
    const r = createBuildReceipt({ run_id: 'test', verification: { source_ok: true, build_ok: true } });
    assert.equal(r.passed, false);
  });

  it('all gates true → passed is true', () => {
    const r = createBuildReceipt({ run_id: 'test', verification: {
      source_ok: true, tests_ok: true, build_ok: true, runtime_ok: true,
      user_journey_ok: true, artifact_rebuild_ok: true, foundry_proof_ok: true,
    }});
    assert.equal(r.passed, true);
  });

  it('one gate false → passed is false', () => {
    const r = createBuildReceipt({ run_id: 'test', verification: {
      source_ok: true, tests_ok: true, build_ok: true, runtime_ok: true,
      user_journey_ok: true, artifact_rebuild_ok: true, foundry_proof_ok: false,
    }});
    assert.equal(r.passed, false);
  });

  it('explicit false values → passed is false', () => {
    const r = createBuildReceipt({ run_id: 'test', verification: {
      source_ok: false, tests_ok: false, build_ok: false, runtime_ok: false,
      user_journey_ok: false, artifact_rebuild_ok: false, foundry_proof_ok: false,
    }});
    assert.equal(r.passed, false);
  });

  it('verification object has all 7 gates', () => {
    const r = createBuildReceipt({ run_id: 'test', verification: {} });
    const gates = Object.keys(r.verification);
    assert.equal(gates.length, 7);
    assert.ok(gates.includes('source_ok'));
    assert.ok(gates.includes('tests_ok'));
    assert.ok(gates.includes('build_ok'));
    assert.ok(gates.includes('runtime_ok'));
    assert.ok(gates.includes('user_journey_ok'));
    assert.ok(gates.includes('artifact_rebuild_ok'));
    assert.ok(gates.includes('foundry_proof_ok'));
  });
});
