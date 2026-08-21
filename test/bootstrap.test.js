import test from 'node:test';
import assert from 'node:assert/strict';
import { ControlPlane } from '../src/controller/control-plane.js';
import { InMemoryGraphStore } from '../src/graph/inmemory.js';
import { InMemoryEventStore } from '../src/event/jsonl-store.js';
import { EventBus } from '../src/event/bus.js';
import { ExperimentEngine } from '../src/experiments/engine.js';
import { StandardsCatalog } from '../src/standards/catalog.js';
import { Reconciler } from '../src/reconcile/reconciler.js';
import { LineageAnalytics } from '../src/analytics/lineage.js';
import { bootstrapRegistry } from '../src/registry/bootstrap.js';

class Dispatcher { async dispatch() { return { accepted: true }; } }

test('registry bootstrap materializes sites, standards, capabilities and desired compliance', async () => {
  const graph = new InMemoryGraphStore();
  const eventStore = new InMemoryEventStore();
  const bus = new EventBus({ eventStore, graph });
  const cp = new ControlPlane({ graph, eventStore, bus, dispatcher: new Dispatcher(), factory: null, experiments: new ExperimentEngine({ bus, graph }), standards: new StandardsCatalog({ bus, graph }), reconciler: new Reconciler({ graph, bus }), analytics: new LineageAnalytics(graph) });
  const result = await bootstrapRegistry(cp, { root: new URL('..', import.meta.url).pathname.replace(/\/$/, '') });
  assert.equal(result.sites, 2);
  assert.ok(result.capabilities >= 6);
  assert.ok((await graph.getEntity('site_domain_tool')));
  const drift = await cp.reconciler.standardDrift();
  assert.ok(drift.length >= 2);
});
