import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryGraphStore } from '../src/graph/inmemory.js';
import { InMemoryEventStore } from '../src/event/jsonl-store.js';
import { EventBus } from '../src/event/bus.js';
import { LineageAnalytics } from '../src/analytics/lineage.js';

 test('usage is attributable from idea generator through build/product/site', async () => {
  const graph = new InMemoryGraphStore();
  const bus = new EventBus({ eventStore: new InMemoryEventStore(), graph });
  await bus.emit('idea.generator.registered', { id: 'gen', name: 'Gap scanner' });
  await bus.emit('idea.seeded', { id: 'idea', name: 'Tool', generator_id: 'gen', scores: {} });
  await bus.emit('build.started', { id: 'build', idea_id: 'idea' });
  await bus.emit('product.graduated', { id: 'prod', name: 'Product', build_run_id: 'build', capability_ids: [] });
  await bus.emit('site.registered', { id: 'site', name: 'Site', product_id: 'prod', domain: 'x.test' });
  await bus.emit('observation.recorded', { id: 'o1', subject_id: 'site', metric: 'api.calls', value: 12 });
  await bus.emit('observation.recorded', { id: 'o2', subject_id: 'site', metric: 'api.calls', value: 8 });
  const rows = await new LineageAnalytics(graph).usageAttribution({ metric: 'api.calls' });
  assert.deepEqual(rows.map(r => [r.generator_id, r.total]), [['gen', 20]]);
});
