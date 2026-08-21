// Porkbun API Client for FinalBuilds2

export class PorkbunClient {
  constructor(apiKey, secretKey, sandbox = false) {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.base = sandbox ? 'https://api-sandbox.porkbun.com/api/json/v3' : 'https://api.porkbun.com/api/json/v3';
  }

  async request(endpoint, data = {}) {
    const response = await fetch(`${this.base}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: this.apiKey, secretapikey: this.secretKey, ...data })
    });
    const result = await response.json();
    if (result.status === 'ERROR') throw new Error(`Porkbun: ${result.message}`);
    return result;
  }

  async checkDomain(domain) { return this.request('/domain/check', { domain }); }
  async getPricing(tld) { return this.request('/pricing/get', { tld }); }
  async getBalance() { return this.request('/account/balance'); }
  async listDomains() { return this.request('/domain/list'); }
  
  async registerDomain(domain, options = {}) {
    return this.request('/domain/create', {
      domain,
      ns: options.nameservers,
      registrant: options.registrant,
      email: options.email,
      private: options.private || false,
      auto_renew: options.autoRenew !== false,
      dryRun: options.dryRun ? 'yes' : undefined,
      idempotencyKey: options.idempotencyKey
    });
  }

  async updateNameservers(domain, nameservers) {
    return this.request('/domain/updateNameservers', { domain, ns: nameservers });
  }
}

export default PorkbunClient;
