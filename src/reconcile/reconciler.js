import { EntityType, RelKind } from '../model/types.js';
import { randomId } from '../util/id.js';

export class Reconciler {
  constructor({ graph, bus }) { this.graph = graph; this.bus = bus; }

  async standardDrift() {
    const sites = await this.graph.findEntities({ type: EntityType.SITE });
    const observations = await this.graph.findEntities({ type: EntityType.OBSERVATION });
    const compliance = new Map();
    for (const o of observations) {
      if (o.data?.metric !== 'standard.compliance') continue;
      const key = `${o.data.subject_id}\u001f${o.data.standard_version_id}`;
      const previous = compliance.get(key);
      if (!previous || String(o.data.observed_at ?? '') > String(previous.data.observed_at ?? '')) compliance.set(key, o);
    }
    const drift = [];
    for (const site of sites) {
      const desired = await this.graph.neighbors(site.id, { direction: 'out', kinds: [RelKind.CONFORMS_TO] });
      for (const d of desired) {
        const key = `${site.id}\u001f${d.entity.id}`;
        const observed = compliance.get(key);
        if (!observed || observed.data?.value !== 1) {
          drift.push({ site_id: site.id, site_name: site.name, standard_version_id: d.entity.id, reason: observed ? 'noncompliant' : 'unobserved', observation_id: observed?.id ?? null });
        }
      }
    }
    return drift;
  }

  async createRepairTasks(drift) {
    const tasks = [];
    for (const item of drift) {
      const task = {
        id: randomId('task'),
        title: `Reconcile ${item.site_id} to ${item.standard_version_id}`,
        subject_id: item.site_id,
        kind: 'standard-reconcile',
        payload: item,
        risk_class: 1,
        status: 'ready'
      };
      await this.bus.emit('task.created', task);
      tasks.push(task);
    }
    return tasks;
  }
}
