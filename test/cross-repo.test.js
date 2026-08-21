import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let server, tmpDir;
const PORT = 18788;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foundry-cross-'));
  process.env.FINALBUILDS_ROOT = tmpDir;
  process.env.EVENT_STORE_BACKEND = 'jsonl';
  const { createControlPlaneServer } = await import('../src/server/http.js');
  server = createControlPlaneServer();
  await new Promise(r => server.listen(PORT, r));
});

after(async () => { server?.close(); await fs.rm(tmpDir, { recursive: true, force: true }); });

function post(p, body) {
  return new Promise((resolve, reject) => {
    const d = JSON.stringify(body);
    const req = http.request(`http://127.0.0.1:${PORT}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
    }); req.on('error', reject); req.write(d); req.end();
  });
}

function get(p) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${p}`, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) })); }).on('error', reject);
  });
}

const ts = () => new Date().toISOString();
const eid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

describe('Cross-Repo: FinalBuilds <-> Builda', () => {
  it('health endpoint', async () => { const r = await get('/healthz'); assert.equal(r.body.ok, true); });

  it('accepts canonical build.started', async () => {
    const r = await post('/v1/events', { event_id: eid('evt_cs'), event_type: 'build.started', schema_version: '1.0.0', occurred_at: ts(), recorded_at: ts(), source: { system: 'builda-v2', version: '0.4.0' }, subject: { type: 'BuildRun', id: 'cs_build' }, payload: { build_run_id: 'cs_build' }, integrity: {} });
    assert.ok(r.status >= 200 && r.status < 300);
  });

  it('accepts batch events', async () => {
    const runId = `cs_batch_${Date.now()}`;
    const r = await post('/v1/events/batch', { events: [
      { event_id: eid('evt_b1'), event_type: 'build.attempt.started', schema_version: '1.0.0', occurred_at: ts(), recorded_at: ts(), source: { system: 'builda-v2', version: '0.4.0' }, subject: { type: 'BuildAttempt', id: `${runId}_att` }, payload: { attempt_id: `${runId}_att`, build_run_id: runId, attempt_number: 1 }, integrity: {} },
      { event_id: eid('evt_b2'), event_type: 'build.completed', schema_version: '1.0.0', occurred_at: ts(), recorded_at: ts(), source: { system: 'builda-v2', version: '0.4.0' }, subject: { type: 'BuildRun', id: runId }, payload: { build_run_id: runId, passed: true }, integrity: {} },
    ]});
    assert.equal(r.body.accepted.length, 2, JSON.stringify(r.body));
  });

  it('BuildContext returns structure', async () => {
    const r = await post('/v1/build-context', { project_id: 't', blueprint: 'Build API', blueprint_hash: 'h' });
    assert.equal(r.body.context_version, '1');
    assert.ok(Array.isArray(r.body.known_failures));
  });

  it('strategies endpoint', async () => { const r = await get('/v1/strategies'); assert.ok(Array.isArray(r.body.strategies)); });

  it('contract version', async () => { const r = await get('/v1/contracts/version'); assert.ok(r.body.version.includes('1.0.0')); });

  it('rejects invalid event type', async () => {
    const r = await post('/v1/events', { event_id: 'bad', event_type: 'fake.x', schema_version: '1.0.0', occurred_at: ts(), recorded_at: ts(), source: { system: 'builda-v2', version: '0.4.0' }, subject: { type: 'X', id: 'x' }, payload: {}, integrity: {} });
    assert.ok(r.status >= 400);
  });
});
