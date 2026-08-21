// Domain Oracle — decides domain lifecycle strategy

export class DomainOracle {
  constructor(config = {}) {
    this.rootDomain = config.rootDomain || 'tinytools.xyz';
    this.thresholds = {
      subdomain: config.subdomainThreshold || 100,
      standalone: config.standaloneThreshold || 1000,
      dotcom: config.dotcomThreshold || 10000
    };
  }

  async decide(product, metrics = {}) {
    const { dailyCalls = 0, uniqueCallers = 0, revenue = 0 } = metrics;
    const score = this.calculateScore(metrics);

    if (dailyCalls < 10) {
      return { decision: 'EXPERIMENT', hostname: `${product.slug}.workers.dev`, level: 0, score };
    }
    if (dailyCalls < this.thresholds.subdomain) {
      return { decision: 'SUBDOMAIN', hostname: `${product.slug}.${this.rootDomain}`, level: 1, score };
    }
    if (dailyCalls < this.thresholds.standalone) {
      return { decision: 'STANDALONE', hostname: `${product.slug}.xyz`, level: 2, score, candidates: this.generateCandidates(product.slug) };
    }
    if (dailyCalls < this.thresholds.dotcom) {
      return { decision: 'BRAND', hostname: `${product.slug}.com`, level: 3, score, candidates: this.generateCandidates(product.slug) };
    }
    return { decision: 'PREMIUM', hostname: `${product.slug}.com`, level: 4, score, candidates: this.generateCandidates(product.slug) };
  }

  calculateScore(metrics) {
    const w = { dailyCalls: 0.3, uniqueCallers: 0.2, revenue: 0.2, recurring: 0.15, agentCalls: 0.15 };
    return Math.round(
      (Math.min((metrics.dailyCalls || 0) / 10000, 1) * w.dailyCalls +
       Math.min((metrics.uniqueCallers || 0) / 1000, 1) * w.uniqueCallers +
       Math.min((metrics.revenue || 0) / 100, 1) * w.revenue +
       Math.min((metrics.recurringCallers || 0) / 100, 1) * w.recurring +
       Math.min((metrics.agentCalls || 0) / 5000, 1) * w.agentCalls) * 100
    );
  }

  generateCandidates(slug) {
    return ['xyz', 'site', 'dev', 'app'].map(tld => ({
      domain: `${slug}.${tld}`,
      tld,
      cost: this.getCost(tld)
    }));
  }

  getCost(tld) {
    const costs = { xyz: { reg: 2.04, renewal: 16 }, site: { reg: 1.76, renewal: 12 }, dev: { reg: 12, renewal: 12 }, app: { reg: 12, renewal: 12 } };
    return costs[tld] || { reg: 15, renewal: 15 };
  }
}

export default DomainOracle;
