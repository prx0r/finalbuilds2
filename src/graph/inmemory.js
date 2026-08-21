import { GraphStore } from './store.js';

export class InMemoryGraphStore extends GraphStore {
  constructor() {
    super();
    this.entities = new Map();
    this.edges = new Map();
    this.outEdges = new Map();
    this.inEdges = new Map();
  }

  async upsertEntity(entity) {
    if (!entity?.id || !entity?.type) throw new Error('entity requires id and type');
    const previous = this.entities.get(entity.id) ?? {};
    const merged = { ...previous, ...structuredClone(entity), data: { ...(previous.data ?? {}), ...(entity.data ?? {}) } };
    this.entities.set(entity.id, merged);
    return structuredClone(merged);
  }

  async getEntity(id) {
    const entity = this.entities.get(id);
    return entity ? structuredClone(entity) : null;
  }

  async link(fromId, kind, toId, props = {}) {
    if (!this.entities.has(fromId) || !this.entities.has(toId)) throw new Error(`link endpoints must exist: ${fromId} -> ${toId}`);
    const key = `${fromId}\u001f${kind}\u001f${toId}`;
    const edge = { fromId, kind, toId, props: structuredClone(props) };
    this.edges.set(key, edge);
    addIndex(this.outEdges, fromId, key);
    addIndex(this.inEdges, toId, key);
    return structuredClone(edge);
  }

  async neighbors(id, { direction = 'out', kinds = null } = {}) {
    const allowed = kinds ? new Set(kinds) : null;
    const result = [];
    if (direction === 'out' || direction === 'both') {
      for (const key of this.outEdges.get(id) ?? []) {
        const edge = this.edges.get(key);
        if (allowed && !allowed.has(edge.kind)) continue;
        result.push({ edge: structuredClone(edge), entity: structuredClone(this.entities.get(edge.toId)) });
      }
    }
    if (direction === 'in' || direction === 'both') {
      for (const key of this.inEdges.get(id) ?? []) {
        const edge = this.edges.get(key);
        if (allowed && !allowed.has(edge.kind)) continue;
        result.push({ edge: structuredClone(edge), entity: structuredClone(this.entities.get(edge.fromId)) });
      }
    }
    return result;
  }

  async findEntities({ type = null, where = null } = {}) {
    return [...this.entities.values()]
      .filter(e => !type || e.type === type)
      .filter(e => !where || where(e))
      .map(e => structuredClone(e));
  }

  async clear() {
    this.entities.clear();
    this.edges.clear();
    this.outEdges.clear();
    this.inEdges.clear();
  }
}

function addIndex(index, id, key) {
  let set = index.get(id);
  if (!set) { set = new Set(); index.set(id, set); }
  set.add(key);
}
