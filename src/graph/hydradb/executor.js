/**
 * HydraDB executor — routes writes to available backend.
 * 
 * Current HydraDB limitation: node creation via query API is not supported.
 * Strategy: events are the durable truth. Projection into Hydra is best-effort.
 * Falls back to local graph store when Hydra writes fail.
 */

export class HydraExecutor {
  constructor({ baseUrl, token, graphId, cellId, localStore } = {}) {
    this.baseUrl = baseUrl || process.env.HYDRADB_URL || 'http://127.0.0.1:8443';
    this.token = token || process.env.HYDRADB_TOKEN || '';
    this.graphId = graphId || process.env.HYDRADB_GRAPH_ID || 'default';
    this.cellId = cellId || process.env.HYDRADB_CELL_ID || 'cell-0';
    this.localStore = localStore; // fallback for writes
    this._hydraAvailable = null;
  }

  async isHydraAvailable() {
    if (this._hydraAvailable !== null) return this._hydraAvailable;
    try {
      const resp = await fetch(`${this.baseUrl}/v1/graphs/${this.graphId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: JSON.stringify({ cell_id: this.cellId, query: 'MATCH (n) RETURN n LIMIT 0' }),
      });
      this._hydraAvailable = resp.ok;
    } catch {
      this._hydraAvailable = false;
    }
    return this._hydraAvailable;
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
    const canWrite = await this.isHydraAvailable();
    for (const stmt of statements) {
      try {
        if (canWrite) {
          // Try Hydra write — may fail on unsupported operations
          const result = await this.query(stmt);
          results.push({ statement: stmt, success: true, backend: 'hydra', result });
        } else {
          throw new Error('Hydra unavailable');
        }
      } catch (err) {
        // Fall back to local store
        if (this.localStore) {
          try {
            this.localStore.apply(stmt);
            results.push({ statement: stmt, success: true, backend: 'local', fallback: true });
          } catch (localErr) {
            results.push({ statement: stmt, success: false, error: localErr.message });
          }
        } else {
          results.push({ statement: stmt, success: false, error: err.message });
        }
      }
    }
    return results;
  }
}

/**
 * Local in-memory graph store — fallback when Hydra writes aren't available.
 * Stores nodes and edges in memory with typed labels.
 */
export class LocalGraphStore {
  constructor() {
    this.nodes = new Map(); // id -> { label, props }
    this.edges = []; // [{ from, to, type, props }]
  }

  apply(cypher) {
    // Simple parser for MERGE/SET/MATCH patterns
    const mergeNodeMatch = cypher.match(/MERGE \(n:(\w+)\s*\{id:\s*(\d+)\}\)/);
    const setMatch = cypher.match(/SET n \+= \{(.+)\}/);
    const createEdgeMatch = cypher.match(/MERGE \(a\)-\[r:(\w+)\]->\(b\)/);

    if (mergeNodeMatch) {
      const [, label, id] = mergeNodeMatch;
      if (!this.nodes.has(id)) {
        this.nodes.set(id, { id, label, props: {} });
      }
      if (setMatch) {
        const props = this._parseProps(setMatch[1]);
        Object.assign(this.nodes.get(id).props, props);
      }
    }

    if (createEdgeMatch) {
      const [, relType] = createEdgeMatch;
      const fromMatch = cypher.match(/MATCH \(a:\w+ \{id:\s*(\d+)\}\)/);
      const toMatch = cypher.match(/MATCH.*\(b:\w+ \{id:\s*(\d+)\}\)/);
      if (fromMatch && toMatch) {
        this.edges.push({ from: fromMatch[1], to: toMatch[1], type: relType, props: {} });
      }
    }
  }

  _parseProps(str) {
    const props = {};
    const parts = str.split(', ');
    for (const part of parts) {
      const [k, ...vParts] = part.split(': ');
      const v = vParts.join(': ').replace(/^'|'$/g, '');
      props[k.trim()] = v;
    }
    return props;
  }

  findNode(id) {
    return this.nodes.get(String(id)) || null;
  }

  findNodesByLabel(label) {
    return [...this.nodes.values()].filter(n => n.label === label);
  }

  findEdges(fromId, type) {
    return this.edges.filter(e => e.from === String(fromId) && (!type || e.type === type));
  }
}
