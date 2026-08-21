import { GraphStore } from './store.js';
import { entityMergeQuery, edgeMergeQuery, cypherString } from './cypher.js';

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
    await this.query(entityMergeQuery(entity));
    return entity;
  }

  async getEntity(id) {
    const q = `MATCH (e:Entity {id: ${cypherString(id)}}) RETURN e.id AS id, e.type AS type, e.name AS name, e.data_json AS data_json LIMIT 1`;
    const { rows } = await this.query(q);
    if (!rows.length) return null;
    const r = rows[0];
    return { id: r.id, type: r.type, name: r.name ?? '', data: parseJson(r.data_json) };
  }

  async link(fromId, kind, toId, props = {}) {
    await this.query(edgeMergeQuery(fromId, kind, toId, props));
    return { fromId, kind, toId, props };
  }

  async neighbors(id, { direction = 'out', kinds = null } = {}) {
    const kindFilter = kinds?.length ? ` AND r.kind IN [${kinds.map(cypherString).join(', ')}]` : '';
    const patterns = [];
    if (direction === 'out' || direction === 'both') patterns.push(`MATCH (a:Entity {id: ${cypherString(id)}})-[r:REL]->(e:Entity) WHERE true${kindFilter} RETURN e.id AS id, e.type AS type, e.name AS name, e.data_json AS data_json, a.id AS from_id, r.kind AS kind, e.id AS to_id, r.props_json AS props_json`);
    if (direction === 'in' || direction === 'both') patterns.push(`MATCH (e:Entity)-[r:REL]->(a:Entity {id: ${cypherString(id)}}) WHERE true${kindFilter} RETURN e.id AS id, e.type AS type, e.name AS name, e.data_json AS data_json, e.id AS from_id, r.kind AS kind, a.id AS to_id, r.props_json AS props_json`);
    const q = patterns.join(' UNION ALL ');
    const { rows } = await this.query(q);
    return rows.map(r => ({
      entity: { id: r.id, type: r.type, name: r.name ?? '', data: parseJson(r.data_json) },
      edge: { fromId: r.from_id, kind: r.kind, toId: r.to_id, props: parseJson(r.props_json) }
    }));
  }

  async findEntities({ type = null } = {}) {
    const where = type ? ` WHERE e.type = ${cypherString(type)}` : '';
    const { rows } = await this.query(`MATCH (e:Entity)${where} RETURN e.id AS id, e.type AS type, e.name AS name, e.data_json AS data_json`);
    return rows.map(r => ({ id: r.id, type: r.type, name: r.name ?? '', data: parseJson(r.data_json) }));
  }

  async clear() {
    await this.query('MATCH (n:Entity) DETACH DELETE n');
  }
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return { raw: value }; }
}
