import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createControlPlaneServer } from '../src/server/http.js';
import { ControlPlane } from '../src/controller/control-plane.js';
import { InMemoryGraphStore } from '../src/graph/inmemory.js';
import { InMemoryEventStore } from '../src/event/jsonl-store.js';
import { EventBus } from '../src/event/bus.js';
import { ExperimentEngine } from '../src/experiments/engine.js';
import { StandardsCatalog } from '../src/standards/catalog.js';
import { Reconciler } from '../src/reconcile/reconciler.js';
import { LineageAnalytics } from '../src/analytics/lineage.js';

class Dispatcher { async dispatch() { return { accepted: true }; } }
function cp() {
  const graph = new InMemoryGraphStore();
  const eventStore = new InMemoryEventStore();
  const bus = new EventBus({ eventStore, graph });
  return new ControlPlane({ graph, eventStore, bus, dispatcher: new Dispatcher(), factory: { tick: async () => ({ selected: [] }) }, experiments: new ExperimentEngine({ bus, graph }), standards: new StandardsCatalog({ bus, graph }), reconciler: new Reconciler({ graph, bus }), analytics: new LineageAnalytics(graph) });
}

test('HTTP control plane enforces bearer token and records observations', async t => {
  const controlPlane = cp();
  await controlPlane.registerSite({ id: 's', name: 'S', domain: 's.test' });
  const server = createControlPlaneServer({ controlPlane, token: 'secret' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/v1/drift`)).status, 401);
  const response = await fetch(`${base}/v1/observations`, {
    method: 'POST',
    headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
    body: JSON.stringify({ subject_id: 's', metric: 'api.calls', value: 5 })
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.metric, 'api.calls');
});
