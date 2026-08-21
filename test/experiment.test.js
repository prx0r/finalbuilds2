import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryGraphStore } from '../src/graph/inmemory.js';
import { InMemoryEventStore } from '../src/event/jsonl-store.js';
import { EventBus } from '../src/event/bus.js';
import { ExperimentEngine } from '../src/experiments/engine.js';
import { experimentReport } from '../src/experiments/report.js';

 test('experiment assignment is stable and report measures treatment lift', async () => {
  const graph = new InMemoryGraphStore();
  const bus = new EventBus({ eventStore: new InMemoryEventStore(), graph });
  const engine = new ExperimentEngine({ bus, graph });
  const { experiment } = await engine.create({ id: 'exp', name: 'SEO', hypothesis: 'x', metric: 'agent.referrals', allocation: 0.5 });
  const sites = [];
  for (let i = 0; i < 100; i++) {
    const site = { id: `s${i}`, type: 'Site', name: `S${i}`, data: {} };
    await graph.upsertEntity(site);
    sites.push(site);
  }
  const a1 = await engine.assignSites(experiment.id, sites, 0.5);
  const a2 = sites.map(s => engine.assign(s.id, experiment.id, 0.5));
  assert.deepEqual(a1.map(x => x.arm), a2.map(x => x.arm));
  assert.ok(a1.some(x => x.arm === 'control'));
  assert.ok(a1.some(x => x.arm === 'treatment'));
  let n = 0;
  for (const a of a1) await bus.emit('observation.recorded', { id: `o${n++}`, subject_id: a.site_id, experiment_id: experiment.id, metric: 'agent.referrals', value: a.arm === 'treatment' ? 110 : 100 });
  const report = await experimentReport(graph, 'exp');
  assert.equal(report.comparison.absolute_lift, 10);
  assert.equal(report.comparison.relative_lift, 0.1);
});
