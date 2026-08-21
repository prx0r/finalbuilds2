export class GraphStore {
  async upsertEntity(_entity) { throw new Error('Not implemented'); }
  async getEntity(_id) { throw new Error('Not implemented'); }
  async link(_fromId, _kind, _toId, _props = {}) { throw new Error('Not implemented'); }
  async neighbors(_id, _options = {}) { throw new Error('Not implemented'); }
  async findEntities(_filter = {}) { throw new Error('Not implemented'); }
  async clear() { throw new Error('Not implemented'); }

  async findPaths(fromId, { direction = 'out', kinds = null, maxDepth = 12, predicate = () => true } = {}) {
    const results = [];
    const queue = [{ id: fromId, path: [fromId], edges: [] }];
    const bestDepth = new Map([[fromId, 0]]);

    while (queue.length) {
      const current = queue.shift();
      const depth = current.edges.length;
      if (depth >= maxDepth) continue;
      const next = await this.neighbors(current.id, { direction, kinds });
      for (const item of next) {
        if (current.path.includes(item.entity.id)) continue;
        const path = [...current.path, item.entity.id];
        const edges = [...current.edges, item.edge];
        if (predicate(item.entity, path, edges)) results.push({ entity: item.entity, path, edges });
        const nextDepth = depth + 1;
        const prev = bestDepth.get(item.entity.id);
        if (prev === undefined || nextDepth <= prev + 2) {
          bestDepth.set(item.entity.id, Math.min(prev ?? Infinity, nextDepth));
          queue.push({ id: item.entity.id, path, edges });
        }
      }
    }
    return results;
  }
}
