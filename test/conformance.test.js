import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryGraphStore } from '../src/graph/inmemory.js';
import { ConformanceEvaluator } from '../src/standards/conformance.js';

function obs(id, subjectId, metric, value, observedAt) {
  return { id, type: 'Observation', name: metric, data: { id, sensor_id: 'sensor_test', subject_id: subjectId, metric, value, observed_at: observedAt } };
}

test('conformance passes compliant site and fails missing discovery files', async () => {
  const graph = new InMemoryGraphStore();
  const site = { id: 'site_a', type: 'Site', name: 'A', data: { runtime: 'cloudflare-workers', cloudflare_worker: 'a-worker' } };
  const version = {
    id: 'standard_site_onboarding_v1', type: 'StandardVersion', name: 'site-onboarding@1',
    data: { requirements: [
      { id: 'uptime-probe', severity: 'required' },
      { id: 'agent-discovery-files', severity: 'required' },
      { id: 'usage-telemetry', severity: 'required-if-applicable' },
      { id: 'health-endpoint', severity: 'recommended' },
    ] },
  };
  await graph.upsertEntity(site);
  await graph.upsertEntity(version);
  await graph.link('site_a', 'CONFORMS_TO', 'standard_site_onboarding_v1');
  const now = new Date().toISOString();
  await graph.upsertEntity(obs('obs1', 'site_a', 'http.status', 200, now));
  await graph.upsertEntity(obs('obs2', 'site_a', 'llms_txt.present', 1, now));
  await graph.upsertEntity(obs('obs3', 'site_a', 'robots_txt.present', 0, now));

  // robots missing -> agent-discovery-files fails; usage-telemetry applicable (cf worker declared)
  let results = await new ConformanceEvaluator({ graph }).evaluateSite(site);
  assert.equal(results.length, 1);
  assert.equal(results[0].compliant, false);
  assert.deepEqual(results[0].failed_required, ['agent-discovery-files']);

  // fix robots + add api.calls -> fully compliant
  await graph.upsertEntity(obs('obs4', 'site_a', 'robots_txt.present', 1, now));
  await graph.upsertEntity(obs('obs5', 'site_a', 'api.calls', 42, now));
  results = await new ConformanceEvaluator({ graph }).evaluateSite(site);
  assert.equal(results[0].compliant, true);
});

test('conformance exempts usage-telemetry when exempted or non-applicable runtime', async () => {
  const graph = new InMemoryGraphStore();
  const site = { id: 'site_b', type: 'Site', name: 'B', data: { runtime: 'static', telemetry_exemptions: ['usage-telemetry'] } };
  const version = {
    id: 'standard_site_onboarding_v1', type: 'StandardVersion', name: 'site-onboarding@1',
    data: { requirements: [{ id: 'usage-telemetry', severity: 'required-if-applicable' }] },
  };
  await graph.upsertEntity(site);
  await graph.upsertEntity(version);
  await graph.link('site_b', 'CONFORMS_TO', 'standard_site_onboarding_v1');

  const results = await new ConformanceEvaluator({ graph }).evaluateSite(site);
  assert.equal(results.length, 1); // version evaluated...
  assert.equal(results[0].compliant, true); // ...but requirement skipped as not applicable
});
