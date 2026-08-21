import { randomId, stableBucket } from '../util/id.js';

export class ExperimentEngine {
  constructor({ bus, graph }) {
    this.bus = bus;
    this.graph = graph;
  }

  async create({ id = randomId('exp'), name, hypothesis, metric, standard_version_id = null, treatment = {}, control = {}, allocation = 0.5 }) {
    if (!(allocation > 0 && allocation < 1)) throw new Error('allocation must be between 0 and 1');
    const experiment = { id, name, hypothesis, metric, standard_version_id, allocation, status: 'running' };
    await this.bus.emit('experiment.created', experiment);
    const controlArm = { id: `${id}:control`, experiment_id: id, name: 'control', config: control };
    const treatmentArm = { id: `${id}:treatment`, experiment_id: id, name: 'treatment', config: treatment };
    await this.bus.emit('experiment.arm.created', controlArm);
    await this.bus.emit('experiment.arm.created', treatmentArm);
    return { experiment, arms: { control: controlArm, treatment: treatmentArm } };
  }

  assign(siteId, experimentId, allocation = 0.5) {
    const bucket = stableBucket(`${experimentId}:${siteId}`, 10000);
    const arm = bucket < Math.round(allocation * 10000) ? 'treatment' : 'control';
    return { site_id: siteId, arm, bucket };
  }

  async assignSites(experimentId, sites, allocation = 0.5) {
    const assignments = [];
    for (const site of sites) {
      const a = this.assign(site.id, experimentId, allocation);
      const armId = `${experimentId}:${a.arm}`;
      await this.bus.emit('experiment.arm.assigned', { experiment_id: experimentId, arm_id: armId, site_id: site.id, bucket: a.bucket });
      assignments.push(a);
    }
    return assignments;
  }
}
