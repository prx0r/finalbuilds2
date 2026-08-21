/**
 * HydraDB Bolt executor — uses the Bolt protocol for writes.
 * The HTTP query engine has limited write support; Bolt is the proper write path.
 */

import neo4j from 'neo4j-driver';

export class HydraBoltExecutor {
  constructor({ url, token, database } = {}) {
    this.url = url || process.env.HYDRADB_BOLT_URL || 'bolt://127.0.0.1:7687';
    this.token = token || process.env.HYDRADB_TOKEN || '';
    this.database = database || process.env.HYDRADB_GRAPH_ID || 'default';
    this._driver = null;
  }

  _getDriver() {
    if (!this._driver) {
      const auth = this.token
        ? neo4j.auth.bearer(this.token)
        : neo4j.auth.none();
      this._driver = neo4j.driver(this.url, auth, { maxConnectionPoolSize: 5 });
    }
    return this._driver;
  }

  async query(cypher, params = {}) {
    const driver = this._getDriver();
    const session = driver.session({ database: this.database });
    try {
      const result = await session.run(cypher, params);
      return {
        records: result.records.map(r => r.toObject()),
        summary: result.summary,
      };
    } finally {
      await session.close();
    }
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

  async close() {
    if (this._driver) {
      await this._driver.close();
      this._driver = null;
    }
  }
}
