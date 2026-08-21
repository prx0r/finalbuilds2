import { EntityType } from '../model/types.js';

export class ProcessAttribution {
  constructor(graph) { this.graph = graph; }

  async rank({ stage = null, metric = 'api.calls', maxDepth = 20 } = {}) {
    const processes = await this.graph.findEntities({ type: EntityType.PROCESS });
    const rows = [];
    for (const process of processes.filter(p => !stage || p.data?.stage === stage)) {
      const paths = await this.graph.findPaths(process.id, { direction: 'out', maxDepth, predicate: () => true });
      const observations = paths.filter(p => p.entity.type === EntityType.OBSERVATION && p.entity.data?.metric === metric);
      const failures = paths.filter(p => p.entity.type === EntityType.FAILURE);
      const products = new Set(paths.filter(p => p.entity.type === EntityType.PRODUCT).map(p => p.entity.id));
      rows.push({
        process_id: process.id,
        process_name: process.name,
        stage: process.data?.stage ?? null,
        version: process.data?.version ?? null,
        metric,
        metric_total: observations.reduce((sum, p) => sum + Number(p.entity.data?.value ?? 0), 0),
        observation_count: new Set(observations.map(p => p.entity.id)).size,
        product_count: products.size,
        failure_count: new Set(failures.map(p => p.entity.id)).size,
        note: 'Observational attribution; use controlled experiments for causal claims.'
      });
    }
    return rows.sort((a, b) => b.metric_total - a.metric_total || a.failure_count - b.failure_count);
  }
}
