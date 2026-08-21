/**
 * HydraDB Cypher executor — runs statements against HydraDB.
 * Uses MERGE not CREATE for idempotent replay.
 */

export class HydraExecutor {
  constructor({ baseUrl, token, graphId = 'default', namespace = 'default' } = {}) {
    this.baseUrl = baseUrl || process.env.HYDRADB_URL || 'http://127.0.0.1:8443';
    this.token = token || process.env.HYDRADB_TOKEN || '';
    this.graphId = graphId;
    this.namespace = namespace;
  }

  async query(cypher) {
    const response = await fetch(`${this.baseUrl}/v1/graphs/${this.graphId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
        'X-Graph-Namespace': this.namespace,
      },
      body: JSON.stringify({ query: cypher }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Hydra query failed: ${response.status} ${text}`);
    }
    return response.json();
  }

  async executeAll(statements) {
    const results = [];
    for (const stmt of statements) {
      try {
        const result = await this.query(stmt);
        results.push({ statement: stmt, success: true, result });
      } catch (err) {
        results.push({ statement: stmt, success: false, error: err.message });
      }
    }
    return results;
  }
}

/**
 * Projection runner — catches up events from checkpoint into Hydra.
 */
export class ProjectionRunner {
  constructor({ eventStore, checkpointStore, projector, executor }) {
    this.eventStore = eventStore;
    this.checkpointStore = checkpointStore;
    this.projector = projector;
    this.executor = executor;
  }

  async catchUp() {
    const checkpoint = await this.checkpointStore.get();
    const since = checkpoint.last_event_time || undefined;
    const events = await this.eventStore.scan({ since, limit: 1000 });
    let projected = 0;
    let failed = 0;

    for (const event of events) {
      if (event.event_id === checkpoint.last_event_id) continue;
      const statements = this.projector(event);
      const results = await this.executor.executeAll(statements);
      const allOk = results.every(r => r.success);
      if (allOk) {
        await this.checkpointStore.update(event.event_id, event.occurred_at);
        projected++;
      } else {
        failed++;
        break;
      }
    }
    return { projected, failed, last_event_id: checkpoint.last_event_id };
  }

  async rebuild() {
    await this.checkpointStore.reset();
    return this.catchUp();
  }
}
