// Cloudflare API Client for FinalBuilds2

export class CloudflareClient {
  constructor(apiToken, accountId) {
    this.apiToken = apiToken;
    this.accountId = accountId;
    this.headers = { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' };
    this.base = 'https://api.cloudflare.com/client/v4';
  }

  async request(method, path, data = null) {
    const opts = { method, headers: this.headers };
    if (data) opts.body = JSON.stringify(data);
    const res = await fetch(`${this.base}${path}`, opts);
    const json = await res.json();
    if (!json.success) throw new Error(`Cloudflare: ${JSON.stringify(json.errors)}`);
    return json;
  }

  async createZone(name) { return this.request('POST', '/zones', { name, account: { id: this.accountId } }); }
  async getZone(zoneId) { return this.request('GET', `/zones/${zoneId}`); }
  async listZones(name = '') { return this.request('GET', `/zones${name ? `?name=${name}` : ''}`); }
  
  async listDNSRecords(zoneId, type = null) {
    const params = type ? `?type=${type}` : '';
    return this.request('GET', `/zones/${zoneId}/dns_records${params}`);
  }

  async createDNSRecord(zoneId, type, name, content, opts = {}) {
    return this.request('POST', `/zones/${zoneId}/dns_records`, { type, name, content, ttl: opts.ttl || 1, proxied: opts.proxied !== false });
  }

  async createWorker(name, script) {
    return this.request('PUT', `/accounts/${this.accountId}/workers/scripts/${name}`, script);
  }

  async attachCustomDomain(workerName, hostname) {
    return this.request('PUT', `/accounts/${this.accountId}/workers/domains`, { hostname, service: workerName, environment: 'production' });
  }

  async waitForZoneActive(zoneId, maxWait = 300000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const zone = await this.getZone(zoneId);
      if (zone.result.status === 'active') return zone.result;
      await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error('Zone activation timeout');
  }
}

export default CloudflareClient;
