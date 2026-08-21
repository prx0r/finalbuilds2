import assert from 'node:assert/strict';
import { HydraHttpGraphStore } from '../src/graph/hydradb-http.js';
import { InMemoryEventStore } from '../src/event/jsonl-store.js';
import { EventBus } from '../src/event/bus.js';
import { LineageAnalytics } from '../src/analytics/lineage.js';

const graph = new HydraHttpGraphStore({
  baseUrl: process.env.HYDRA_URL ?? 'http://127.0.0.1:8443',
  token: process.env.HYDRA_TOKEN ?? 'local-development-token-32-bytes',
  graphId: process.env.HYDRA_GRAPH_ID ?? 'finalbuilds',
  namespace: process.env.HYDRA_NAMESPACE ?? 'default',
  cellId: process.env.HYDRA_CELL_ID ?? 'cell-0'
});
const events = new InMemoryEventStore();
const bus = new EventBus({ eventStore: events, graph });
await graph.clear();

await bus.emit('idea.generator.registered', { id: 'hydra-gen', name: 'Hydra integration generator', method: 'test', version: '1' });
await bus.emit('idea.seeded', { id: 'hydra-idea', name: 'Hydra integration idea', generator_id: 'hydra-gen', scores: { delta: 3 } });
await bus.emit('build.started', { id: 'hydra-build', name: 'Build', idea_id: 'hydra-idea' });
await bus.emit('build.completed', { id: 'hydra-build', name: 'Build', idea_id: 'hydra-idea' });
await bus.emit('product.graduated', { id: 'hydra-product', name: 'Hydra product', build_run_id: 'hydra-build', capability_ids: [] });
await bus.emit('site.registered', { id: 'hydra-site', name: 'Hydra site', domain: 'hydra.example.com', product_id: 'hydra-product' });
await bus.emit('observation.recorded', { id: 'hydra-obs', sensor_id: null, subject_id: 'hydra-site', metric: 'api.calls', value: 42, observed_at: new Date().toISOString() });

const analytics = new LineageAnalytics(graph);
const attribution = await analytics.usageAttribution({ metric: 'api.calls' });
assert.equal(attribution[0].total, 42);
const site = await graph.getEntity('hydra-site');
assert.equal(site.name, 'Hydra site');
console.log(JSON.stringify({ ok: true, attribution, site }, null, 2));
