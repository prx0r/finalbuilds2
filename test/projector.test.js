import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryGraphStore } from '../src/graph/inmemory.js';
import { InMemoryEventStore } from '../src/event/jsonl-store.js';
import { EventBus } from '../src/event/bus.js';
import { rebuildProjection } from '../src/event/projector.js';

 test('graph projection is rebuildable entirely from append-only events', async () => {
  const graph = new InMemoryGraphStore();
  const events = new InMemoryEventStore();
  const bus = new EventBus({ eventStore: events, graph });
  await bus.emit('idea.generator.registered', { id: 'g', name: 'G' });
  await bus.emit('idea.seeded', { id: 'i', name: 'I', generator_id: 'g', scores: {} });
  await graph.clear();
  assert.equal(await graph.getEntity('i'), null);
  const count = await rebuildProjection(graph, events);
  assert.equal(count, 2);
  assert.equal((await graph.getEntity('i')).name, 'I');
});
