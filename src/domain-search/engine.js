// GET Domain Search Engine
// Each request = query, track intent + clicks, show hosting + prices

export class DomainSearchEngine {
  constructor() {
    this.queries = new Map();
    this.clicks = new Map();
  }

  async search(concept, options = {}) {
    const { tlds = ['com', 'xyz', 'site', 'dev'], limit = 20 } = options;
    const candidates = this.generateCandidates(concept, tlds);
    const available = await this.batchRdapCheck(candidates);
    const scored = available.map(d => ({
      ...d,
      score: this.scoreDomain(d.domain, concept),
      hosting: this.getHostingOptions(d.domain)
    }));
    scored.sort((a, b) => b.score - a.score);
    const queryId = `q-${Date.now()}`;
    this.queries.set(queryId, { concept, timestamp: new Date().toISOString(), results: scored.length, topResult: scored[0]?.domain });
    return { queryId, concept, total_candidates: candidates.length, available: scored.length, results: scored.slice(0, limit) };
  }

  trackClick(queryId, domain) {
    const count = this.clicks.get(domain) || 0;
    this.clicks.set(domain, count + 1);
    const query = this.queries.get(queryId);
    if (query) { query.clicked = domain; query.clickedAt = new Date().toISOString(); }
    return { domain, clicks: count + 1 };
  }

  getAnalytics() {
    const topDomains = [...this.clicks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([domain, clicks]) => ({ domain, clicks }));
    return { totalQueries: this.queries.size, totalClicks: [...this.clicks.values()].reduce((a, b) => a + b, 0), topDomains, recentQueries: [...this.queries.values()].slice(-10) };
  }

  async rdapCheck(domain) {
    try {
      const response = await fetch(`https://rdap.verisign.com/com/v1/domain/${domain}`);
      if (response.status === 200) return { domain, registered: true };
      if (response.status === 404) return { domain, registered: false };
      return { domain, registered: null };
    } catch (e) { return { domain, registered: null, error: e.message }; }
  }

  async batchRdapCheck(domains) {
    const results = [];
    for (let i = 0; i < domains.length; i += 10) {
      const batch = domains.slice(i, i + 10);
      const batchResults = await Promise.all(batch.map(d => this.rdapCheck(d)));
      results.push(...batchResults.filter(r => r.registered === false));
    }
    return results;
  }

  generateCandidates(concept, tlds) {
    const candidates = [];
    const word = concept.toLowerCase();
    if (word.length >= 3) { const s = word.split('').join('-'); for (const t of tlds) candidates.push(`${s}.${t}`); }
    for (let i = 2; i < word.length; i++) { for (const t of tlds) candidates.push(`${word.slice(0, i)}-${word.slice(i)}.${t}`); }
    const suffixes = ['api', 'tool', 'util', 'ops', 'fn', 'run', 'hub', 'lab', 'kit', 'pro', 'go', 'now', 'io', 'net', 'dev'];
    for (const s of suffixes) { for (const t of tlds) { candidates.push(`${word}${s}.${t}`); candidates.push(`${word}-${s}.${t}`); } }
    const codes = ['200', '204', '206', '301', '404', '418', '42', '64', '101'];
    for (const c of codes) { for (const t of tlds) candidates.push(`${word}${c}.${t}`); }
    return [...new Set(candidates)];
  }

  scoreDomain(domain, concept) {
    let score = 0;
    const name = domain.split('.')[0];
    if (name.length <= 4) score += 3; else if (name.length <= 6) score += 2; else if (name.length <= 8) score += 1;
    const hyphens = (name.match(/-/g) || []).length;
    if (hyphens === 0) score += 2; else if (hyphens === 1) score += 1;
    if (domain.endsWith('.com')) score += 2; else if (domain.endsWith('.xyz')) score += 1;
    if (name.includes(concept)) score += 2;
    if (!name.includes('--')) score += 1;
    return score;
  }

  getHostingOptions(domain) {
    return [
      { provider: 'Cloudflare', type: 'Workers', cost: 0, note: 'Free, instant' },
      { provider: 'Cloudflare', type: 'Custom Domain', cost: 0, note: 'Free with zone' },
      { provider: 'Vercel', type: 'Deployment', cost: 0, note: 'Free tier' },
      { provider: 'Netlify', type: 'Site', cost: 0, note: 'Free tier' }
    ];
  }
}

export default DomainSearchEngine;
