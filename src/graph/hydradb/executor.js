/**
 * HydraDB executor — uses proven write patterns.
 * 
 * PROVEN write operations (tested against live HydraDB):
 * - CREATE (a:X {id:N})-[:REL]->(b:Y {id:M}) — creates both nodes + edge
 * - CREATE (a:X {id:N})-[:REL]->(b:Y {id:M, props}) — with properties
 * - MATCH (n:X {id:N}) SET n.prop = val — updates existing nodes
 * - MATCH (n:X {id:N}) RETURN n.prop — reads
 * 
 * NOT SUPPORTED:
 * - MERGE (any form)
 * - Standalone node CREATE/MERGE (without edge)
 * - MATCH + MERGE edge
 */

export class HydraExecutor {
  constructor({ baseUrl, token, graphId, cellId, allowFallback = true, localStore } = {}) {
    this.baseUrl = baseUrl || process.env.HYDRADB_URL || 'http://127.0.0.1:8443';
    this.token = token || process.env.HYDRADB_TOKEN || '';
    this.graphId = graphId || process.env.HYDRADB_GRAPH_ID || 'default';
    this.cellId = cellId || process.env.HYDRADB_CELL_ID || 'cell-0';
    this.allowFallback = allowFallback;
    this.localStore = localStore;
    this.stats = { attempted: 0, hydra_ok: 0, hydra_fail: 0, fallback: 0 };
  }

  async query(cypher) {
    const resp = await fetch(`${this.baseUrl}/v1/graphs/${this.graphId}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: JSON.stringify({ cell_id: this.cellId, query: cypher }),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`Hydra: ${resp.status} ${text}`);
    return JSON.parse(text);
  }

  async executeAll(statements) {
    const results = [];
    for (const stmt of statements) {
      this.stats.attempted++;
      try {
        const result = await this.query(stmt);
        this.stats.hydra_ok++;
        results.push({ statement: stmt, success: true, backend: 'hydra', result });
      } catch (err) {
        this.stats.hydra_fail++;
        if (this.allowFallback && this.localStore) {
          try {
            this.localStore.apply(stmt);
            this.stats.fallback++;
            results.push({ statement: stmt, success: true, backend: 'local', fallback: true, hydra_error: err.message });
          } catch (localErr) {
            results.push({ statement: stmt, success: false, backend: 'none', error: localErr.message });
          }
        } else if (!this.allowFallback) {
          results.push({ statement: stmt, success: false, backend: 'hydra', error: err.message, strict: true });
        } else {
          results.push({ statement: stmt, success: false, backend: 'hydra', error: err.message });
        }
      }
    }
    return results;
  }

  getStats() {
    return { ...this.stats, fallback_zero: this.stats.fallback === 0 };
  }

  async isReachable() {
    try {
      await this.query('MATCH (n:BuildRun) RETURN n.string_id LIMIT 0');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Local in-memory graph store — fallback for writes.
 */
export class LocalGraphStore {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
  }

  apply(cypher) {
    const createEdgeMatch = cypher.match(/CREATE \(a:(\w+) \{id:\s*(\d+).*?\}\)-\[:(\w+)\]->\(b:(\w+) \{id:\s*(\d+)(.*?)\}\)/);
    if (createEdgeMatch) {
      const [, aLabel, aId, rel, bLabel, bId, bProps] = createEdgeMatch;
      if (!this.nodes.has(aId)) this.nodes.set(aId, { id: aId, label: aLabel, props: {} });
      if (!this.nodes.has(bId)) this.nodes.set(bId, { id: bId, label: bLabel, props: this._parseProps(bProps) });
      this.edges.push({ from: aId, to: bId, type: rel });
      return;
    }

    const setMatch = cypher.match(/MATCH \(n:(\w+) \{id:\s*(\d+)\}\) SET (.+)/);
    if (setMatch) {
      const [, label, id, propStr] = setMatch;
      const node = this.nodes.get(id);
      if (node) Object.assign(node.props, this._parseSetProps(propStr));
      return;
    }
  }

  _parseProps(str) {
    const props = {};
    if (!str) return props;
    const m = str.match(/string_id:\s*'([^']*)'/);
    if (m) props.string_id = m[1];
    const s = str.match(/status:\s*'([^']*)'/);
    if (s) props.status = s[1];
    return props;
  }

  _parseSetProps(str) {
    const props = {};
    for (const part of str.split(', ')) {
      const [k, ...vParts] = part.split(' = ');
      const v = vParts.join(' = ').replace(/^'|'$/g, '');
      props[k.trim()] = v;
    }
    return props;
  }
}
