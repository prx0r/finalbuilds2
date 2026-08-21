import { EntityType } from '../model/types.js';

export class LineageAnalytics {
  constructor(graph) { this.graph = graph; }

  async downstream(originId, { maxDepth = 16 } = {}) {
    return this.graph.findPaths(originId, { direction: 'out', maxDepth, predicate: () => true });
  }

  async usageAttribution({ metric = 'api.calls', maxDepth = 20 } = {}) {
    const generators = await this.graph.findEntities({ type: EntityType.IDEA_GENERATOR });
    const rows = [];
    for (const generator of generators) {
      const paths = await this.downstream(generator.id, { maxDepth });
      const observations = paths.filter(p => p.entity.type === EntityType.OBSERVATION && p.entity.data?.metric === metric);
      const total = observations.reduce((sum, p) => sum + Number(p.entity.data?.value ?? 0), 0);
      const uniqueObservations = new Set(observations.map(o => o.entity.id)).size;
      rows.push({ generator_id: generator.id, generator_name: generator.name, metric, total, observations: uniqueObservations });
    }
    return rows.sort((a, b) => b.total - a.total);
  }

  async bestProducts({ metric = 'api.calls' } = {}) {
    const products = await this.graph.findEntities({ type: EntityType.PRODUCT });
    const rows = [];
    for (const product of products) {
      const paths = await this.downstream(product.id, { maxDepth: 10 });
      const obs = paths.filter(p => p.entity.type === EntityType.OBSERVATION && p.entity.data?.metric === metric);
      rows.push({ product_id: product.id, product_name: product.name, total: obs.reduce((s, p) => s + Number(p.entity.data?.value ?? 0), 0), metric });
    }
    return rows.sort((a, b) => b.total - a.total);
  }
}
