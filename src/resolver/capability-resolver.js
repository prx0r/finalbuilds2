import { EntityType } from '../model/types.js';

function tokens(text) {
  return new Set(String(text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

function overlap(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n;
}

export class CapabilityResolver {
  constructor(graph) { this.graph = graph; }

  async search(task, { limit = 8 } = {}) {
    const q = tokens(task);
    const caps = await this.graph.findEntities({ type: EntityType.CAPABILITY });
    return caps
      .map(cap => {
        const text = [cap.name, cap.data?.description, ...(cap.data?.tags ?? [])].join(' ');
        const c = tokens(text);
        const lexical = overlap(q, c);
        const successRate = Number(cap.data?.success_rate ?? 0);
        const cost = Number(cap.data?.marginal_cost_usd ?? 0);
        const score = lexical * 10 + successRate * 2 - Math.min(cost, 1);
        return { capability: cap, score, lexical };
      })
      .filter(x => x.lexical > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
