import assert from 'node:assert/strict';
import { ControlPlane } from '../src/controller/control-plane.js';
import { InMemoryGraphStore } from '../src/graph/inmemory.js';
import { InMemoryEventStore } from '../src/event/jsonl-store.js';
import { EventBus } from '../src/event/bus.js';
import { FactoryController } from '../src/controller/factory-controller.js';
import { ExperimentEngine } from '../src/experiments/engine.js';
import { StandardsCatalog } from '../src/standards/catalog.js';
import { Reconciler } from '../src/reconcile/reconciler.js';
import { LineageAnalytics } from '../src/analytics/lineage.js';
import { experimentReport } from '../src/experiments/report.js';

class MemoryDispatcher { constructor() { this.tasks = []; } async dispatch(task) { this.tasks.push(structuredClone(task)); return { accepted: true }; } }

function makeControlPlane() {
  const graph = new InMemoryGraphStore();
  const eventStore = new InMemoryEventStore();
  const bus = new EventBus({ eventStore, graph });
  const dispatcher = new MemoryDispatcher();
  return new ControlPlane({
    graph, eventStore, bus, dispatcher,
    factory: new FactoryController({ graph, bus, dispatcher, minBuildScore: 12, maxBuilding: 2 }),
    experiments: new ExperimentEngine({ bus, graph }),
    standards: new StandardsCatalog({ bus, graph }),
    reconciler: new Reconciler({ graph, bus }),
    analytics: new LineageAnalytics(graph)
  });
}

const cp = makeControlPlane();
await cp.registerIdeaGenerator({ id: 'gen-gap', name: 'Capability Gap', method: 'missing external capability', version: '1' });
await cp.registerIdeaGenerator({ id: 'gen-price', name: 'Pricing Mismatch', method: 'obsolete subscription economics', version: '1' });
await cp.seedIdea({ id: 'idea-domain', name: 'Domain Intelligence', generator_id: 'gen-gap', scores: { delta: 3, pain: 3, cost_collapse: 2, composability: 3, evidence: 3, build_leverage: 3 } });
await cp.seedIdea({ id: 'idea-url', name: 'URL Inspector', generator_id: 'gen-price', scores: { delta: 2, pain: 2, cost_collapse: 3, composability: 3, evidence: 3, build_leverage: 3 } });

await cp.defineCapability({ id: 'cap-domain-check', name: 'domain.check', idea_id: 'idea-domain', description: 'Verify live domain availability', tags: ['domain', 'availability'] });
await cp.bus.emit('build.started', { id: 'build-domain', name: 'Domain build', idea_id: 'idea-domain' });
await cp.completeBuild({ id: 'build-domain', name: 'Domain build', idea_id: 'idea-domain' });
await cp.graduateProduct({ id: 'product-domain', name: 'Domain Tool', build_run_id: 'build-domain', capability_ids: ['cap-domain-check'] });
await cp.registerSite({ id: 'site-domain', name: 'Domain Tool', domain: 'domains.example.com', product_id: 'product-domain' });

await cp.registerSensor({ id: 'sensor-usage', name: 'Usage Sensor', kind: 'telemetry' });
await cp.observe({ id: 'obs-calls-1', sensor_id: 'sensor-usage', subject_id: 'site-domain', metric: 'api.calls', value: 1200, unit: 'calls' });
await cp.observe({ id: 'obs-calls-2', sensor_id: 'sensor-usage', subject_id: 'site-domain', metric: 'api.calls', value: 800, unit: 'calls' });

const attribution = await cp.analytics.usageAttribution({ metric: 'api.calls' });
assert.equal(attribution[0].generator_id, 'gen-gap');
assert.equal(attribution[0].total, 2000);

await cp.standards.registerStandard({ id: 'std-agent', name: 'agent-discovery' });
await cp.standards.registerVersion({ id: 'std-agent-v2', standard_id: 'std-agent', standard_name: 'agent-discovery', version: '2.0.0', status: 'experimental' });
await cp.standards.desire('site-domain', 'std-agent-v2');
await cp.registerSite({ id: 'site-url', name: 'URL Inspector', domain: 'inspect.example.com', product_id: null });
await cp.standards.desire('site-url', 'std-agent-v2');
await cp.observe({ id: 'obs-std-domain', sensor_id: 'sensor-usage', subject_id: 'site-domain', metric: 'standard.compliance', value: 1, standard_version_id: 'std-agent-v2' });

const drift = await cp.reconciler.standardDrift();
assert.equal(drift.length, 1);
assert.equal(drift[0].site_id, 'site-url');

const { experiment } = await cp.experiments.create({
  id: 'exp-seo-1',
  name: 'Agent discovery metadata test',
  hypothesis: 'The treatment increases agent referrals.',
  metric: 'agent.referrals',
  standard_version_id: 'std-agent-v2',
  allocation: 0.5,
  treatment: { describedby: true },
  control: { describedby: false }
});
const sites = [];
for (let i = 0; i < 20; i++) {
  const site = { id: `site-exp-${i}`, name: `Experiment Site ${i}`, domain: `exp-${i}.example.com` };
  await cp.registerSite(site);
  sites.push(site);
}
const assignments = await cp.experiments.assignSites(experiment.id, sites, 0.5);
for (const a of assignments) {
  await cp.observe({ sensor_id: 'sensor-usage', subject_id: a.site_id, experiment_id: experiment.id, metric: 'agent.referrals', value: a.arm === 'treatment' ? 14 : 10 });
}
const report = await experimentReport(cp.graph, experiment.id);
assert.ok(report.comparison.treatment_mean > report.comparison.control_mean);

console.log(JSON.stringify({
  ok: true,
  usage_attribution: attribution,
  standard_drift: drift,
  experiment: report.comparison,
  total_events: (await cp.eventStore.all()).length
}, null, 2));
