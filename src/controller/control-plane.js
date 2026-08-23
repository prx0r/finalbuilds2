import { createGraphStore } from '../graph/factory.js';
import { JsonlEventStore } from '../event/jsonl-store.js';
import { EventBus } from '../event/bus.js';
import { JsonlTaskOutbox } from '../dispatch/outbox.js';
import { RouterDispatcher } from '../dispatch/router-dispatcher.js';
import { AgentBuildDispatcher } from '../dispatch/agentbuild-dispatcher.js';
import { FactoryController } from './factory-controller.js';
import { ExperimentEngine } from '../experiments/engine.js';
import { StandardsCatalog } from '../standards/catalog.js';
import { Reconciler } from '../reconcile/reconciler.js';
import { LineageAnalytics } from '../analytics/lineage.js';
import { randomId } from '../util/id.js';

export class ControlPlane {
  constructor({ graph, eventStore, bus, dispatcher, factory, experiments, standards, reconciler, analytics }) {
    Object.assign(this, { graph, eventStore, bus, dispatcher, factory, experiments, standards, reconciler, analytics });
  }

  static fromEnv(env = process.env) {
    const graph = createGraphStore(env);
    const eventStore = new JsonlEventStore(env.EVENT_STORE_PATH ?? 'runtime/events.jsonl');
    const outbox = new JsonlTaskOutbox(env.HERMES_OUTBOX_PATH ?? 'runtime/hermes-outbox.jsonl');
    // product-build tasks execute through agentbuild/sandboxd when enabled;
    // repairs and drift tasks always flow to the hermes outbox.
    const dispatcher = new RouterDispatcher({
      outboxDispatcher: outbox,
      agentbuild: String(env.FACTORY_DISPATCHER ?? '').toLowerCase() === 'agentbuild'
        ? new AgentBuildDispatcher({ root: env.FACTORY_ROOT ?? '.', mode: env.AGENTBUILD_MODE ?? 'direct' })
        : null,
    });
    const bus = new EventBus({ eventStore, graph, dispatcher });
    return new ControlPlane({
      graph,
      eventStore,
      bus,
      dispatcher,
      factory: new FactoryController({ graph, bus, dispatcher, minBuildScore: Number(env.FACTORY_MIN_BUILD_SCORE ?? 12), maxBuilding: Number(env.FACTORY_MAX_BUILDING ?? 2) }),
      experiments: new ExperimentEngine({ bus, graph }),
      standards: new StandardsCatalog({ bus, graph }),
      reconciler: new Reconciler({ graph, bus }),
      analytics: new LineageAnalytics(graph)
    });
  }

  async registerIdeaGenerator({ id, name, method, version = '1' }) {
    await this.bus.emit('idea.generator.registered', { id, name, method, version });
  }

  async seedIdea(idea) {
    await this.bus.emit('idea.seeded', idea);
  }

  async recordResearch(report) {
    await this.bus.emit('research.recorded', report);
  }

  async defineCapability(capability) {
    await this.bus.emit('capability.defined', capability);
  }

  async completeBuild(build) {
    await this.bus.emit('build.completed', build);
  }

  async graduateProduct(product) {
    await this.bus.emit('product.graduated', product);
  }

  async registerSite(site) {
    await this.bus.emit('site.registered', site);
  }

  async recordDeployment(deployment) {
    await this.bus.emit('deployment.recorded', deployment);
  }

  async registerSensor(sensor) {
    await this.bus.emit('sensor.registered', sensor);
  }

  async observe({ id = randomId('obs'), sensor_id, subject_id, metric, value, unit = null, dimensions = {}, experiment_id = null, standard_version_id = null, observed_at = new Date().toISOString() }) {
    const payload = { id, sensor_id, subject_id, metric, value, unit, dimensions, experiment_id, standard_version_id, observed_at };
    await this.bus.emit('observation.recorded', payload);
    return payload;
  }

  async registerProcess(process) {
    await this.bus.emit('process.registered', process);
  }

  async startProcessRun(run) {
    await this.bus.emit('process.run.started', run);
  }

  async completeProcessRun(run) {
    await this.bus.emit('process.run.completed', run);
  }

  async recordFailure(failure) {
    await this.bus.emit('failure.recorded', { id: failure.id ?? randomId('fail'), ...failure });
  }
}
