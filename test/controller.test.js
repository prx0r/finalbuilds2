import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryGraphStore } from '../src/graph/inmemory.js';
import { InMemoryEventStore } from '../src/event/jsonl-store.js';
import { EventBus } from '../src/event/bus.js';
import { FactoryController } from '../src/controller/factory-controller.js';

class Dispatcher { constructor() { this.tasks = []; } async dispatch(task) { this.tasks.push(task); return { accepted: true }; } }

 test('factory selects only high-scoring ideas and respects concurrency', async () => {
  const graph = new InMemoryGraphStore();
  const bus = new EventBus({ eventStore: new InMemoryEventStore(), graph });
  const dispatcher = new Dispatcher();
  const controller = new FactoryController({ graph, bus, dispatcher, minBuildScore: 12, maxBuilding: 1 });
  await bus.emit('idea.generator.registered', { id: 'g', name: 'g' });
  await bus.emit('idea.seeded', { id: 'good', name: 'Good', generator_id: 'g', scores: { delta: 3, pain: 3, cost_collapse: 3, composability: 3, evidence: 3, build_leverage: 3 } });
  await bus.emit('idea.seeded', { id: 'bad', name: 'Bad', generator_id: 'g', scores: { delta: 0, pain: 0, cost_collapse: 0, composability: 0, evidence: 0, build_leverage: 3 } });
  const tick = await controller.tick({ limit: 10 });
  assert.equal(tick.selected.length, 1);
  assert.equal(tick.selected[0].idea, 'good');
  const second = await controller.tick({ limit: 10 });
  assert.equal(second.selected.length, 0);
});
