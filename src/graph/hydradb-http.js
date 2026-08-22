import { GraphStore } from './store.js';
import { entityCreateQuery, entitySetQuery, cypherString, stringToId } from './cypher.js';

function decodeScalar(value) {
  if (value && typeof value === 'object' && 'value' in value) return value.value;
  return value;
}

function decodeRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results.flatMap(r => r.rows ?? r.data ?? []);
  return [];
}

function rowObject(row, columns = null) {
  if (row && !Array.isArray(row) && typeof row === 'object' && !('values' in row)) {
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, decodeScalar(v)]));
  }
  const values = Array.isArray(row) ? row : row?.values ?? row?.row ?? [];
  const cols = columns ?? row?.columns ?? values.map((_, i) => String(i));
  return Object.fromEntries(cols.map((c, i) => [c, decodeScalar(values[i])]));
}

export class HydraHttpGraphStore extends GraphStore {
  constructor({ baseUrl, token, graphId = 'finalbuilds', namespace = 'default', cellId = 'cell-0', fetchImpl = fetch }) {
    super();
    if (!baseUrl || !token) throw new Error('Hydra baseUrl and token are required');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.graphId = graphId;
    this.namespace = namespace;
    this.cellId = cellId;
    this.fetchImpl = fetchImpl;
  }

  async query(query) {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/graphs/${encodeURIComponent(this.graphId)}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'X-Graph-Namespace': this.namespace,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cell_id: this.cellId, query })
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HydraDB ${response.status}: ${text.slice(0, 1000)}`);
    if (!text.trim()) return { raw: null, rows: [] };
    const raw = JSON.parse(text);
    const rows = decodeRows(raw).map(r => rowObject(r, raw.columns));
    return { raw, rows };
  }

  async upsertEntity(entity) {
    // Hydra has no MERGE and no conditional write: check-then-create/set.
    const existing = await this.getEntity(entity.id);
    if (existing) {
      await this.query(entitySetQuery(entity));
    } else {
      await this.query(entityCreateQuery(entity));
    }
    return entity;
  }

  async getEntity(id) {
    const q = `MATCH (e:Entity {id: ${stringToId(id)}}) RETURN e.string_id AS id, e.type AS type, e.name AS name, e.data_json AS data_json LIMIT 1`;
    const { rows } = await this.query(q);
    if (!rows.length) return null;
    const r = rows[0];
    return { id: r.id, type: r.type, name: r.name ?? '', data: parseJson(r.data_json) };
  }

  /**
   * Edges between two pre-existing nodes are not writable in Hydra v0.x,
   * so links are stored as Edge entities keyed by from/kind/to.
   */
  async link(fromId, kind, toId, props = {}) {
    await this.upsertEntity({
      id: `rel:${fromId}:${kind}:${toId}`,
      type: 'Edge',
      name: kind,
      data: { from_id: fromId, kind, to_id: toId, ...props },
    });
    return { fromId, kind, toId, props };
  }

  async neighbors(id, { direction = 'out', kinds = null } = {}) {
    const edges = await this.findEntities({ type: 'Edge' });
    const want = new Set(kinds ?? []);
    const out = [];
    for (const edge of edges) {
      const d = edge.data ?? {};
      const matchOut = (direction === 'out' || direction === 'both') && d.from_id === id;
      const matchIn = (direction === 'in' || direction === 'both') && d.to_id === id;
      if (!matchOut && !matchIn) continue;
      if (want.size && !want.has(d.kind)) continue;
      const otherId = matchOut ? d.to_id : d.from_id;
      const entity = await this.getEntity(otherId);
      if (!entity) continue;
      out.push({
        entity,
        edge: { fromId: d.from_id, kind: d.kind, toId: d.to_id, props: Object.fromEntries(Object.entries(d).filter(([k]) => !['from_id', 'kind', 'to_id'].includes(k))) },
      });
    }
    return out;
  }

  async findEntities({ type = null } = {}) {
    const where = type ? ` WHERE e.type = ${cypherString(type)}` : '';
    const { rows } = await this.query(`MATCH (e:Entity)${where} RETURN e.string_id AS id, e.type AS type, e.name AS name, e.data_json AS data_json`);
    return rows.map(r => ({ id: r.id, type: r.type, name: r.name ?? '', data: parseJson(r.data_json) }));
  }

  async clear() {
    // Best effort; DETACH DELETE support varies. Never run against a live graph.
    try { await this.query('MATCH (n:Entity) DETACH DELETE n'); } catch { /* noop */ }
  }
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return { raw: value }; }
}
