import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryGraphStore } from '../src/graph/inmemory.js';
import { InMemoryEventStore } from '../src/event/jsonl-store.js';
import { EventBus } from '../src/event/bus.js';
import { Reconciler } from '../src/reconcile/reconciler.js';

 test('reconciler finds unobserved and noncompliant desired standards', async () => {
  const graph = new InMemoryGraphStore();
  const store = new InMemoryEventStore();
  const bus = new EventBus({ eventStore: store, graph });
  await bus.emit('site.registered', { id: 's1', name: 'S1', domain: 's1.test' });
  await bus.emit('site.registered', { id: 's2', name: 'S2', domain: 's2.test' });
  await bus.emit('standard.version.registered', { id: 'v2', standard_id: 'std', standard_name: 'agent', version: '2' });
  await bus.emit('site.standard.desired', { site_id: 's1', standard_version_id: 'v2' });
  await bus.emit('site.standard.desired', { site_id: 's2', standard_version_id: 'v2' });
  await bus.emit('observation.recorded', { id: 'o1', subject_id: 's1', metric: 'standard.compliance', value: 1, standard_version_id: 'v2', observed_at: '2026-01-01T00:00:00Z' });
  const r = new Reconciler({ graph, bus });
  const drift = await r.standardDrift();
  assert.deepEqual(drift.map(d => d.site_id), ['s2']);
  const tasks = await r.createRepairTasks(drift);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].risk_class, 1);
});
