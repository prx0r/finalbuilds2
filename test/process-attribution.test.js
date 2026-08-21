import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryGraphStore } from '../src/graph/inmemory.js';
import { InMemoryEventStore } from '../src/event/jsonl-store.js';
import { EventBus } from '../src/event/bus.js';
import { ProcessAttribution } from '../src/analytics/process-attribution.js';

 test('generic process lineage attributes downstream outcomes to pipeline methods', async () => {
  const graph = new InMemoryGraphStore();
  const bus = new EventBus({ eventStore: new InMemoryEventStore(), graph });
  await bus.emit('process.registered', { id: 'proc-a', name: 'Idea gap v1', stage: 'idea-generation', version: '1' });
  await bus.emit('idea.seeded', { id: 'idea-a', name: 'A', scores: {} });
  await bus.emit('process.run.completed', { id: 'run-a', name: 'run', process_id: 'proc-a', output_ids: ['idea-a'] });
  await bus.emit('build.started', { id: 'build-a', idea_id: 'idea-a' });
  await bus.emit('product.graduated', { id: 'product-a', name: 'A', build_run_id: 'build-a', capability_ids: [] });
  await bus.emit('site.registered', { id: 'site-a', name: 'A', domain: 'a.test', product_id: 'product-a' });
  await bus.emit('observation.recorded', { id: 'obs-a', subject_id: 'site-a', metric: 'api.calls', value: 99 });
  const rows = await new ProcessAttribution(graph).rank({ stage: 'idea-generation', metric: 'api.calls' });
  assert.equal(rows[0].metric_total, 99);
  assert.equal(rows[0].product_count, 1);
});
