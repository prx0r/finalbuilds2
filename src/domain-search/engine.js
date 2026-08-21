// GET Domain Search Engine — v2 with semantic scoring

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
      meaning: this.getMeaning(d.domain),
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
    
    // Fully separated
    if (word.length >= 3) { 
      const s = word.split('').join('-'); 
      for (const t of tlds) candidates.push(`${s}.${t}`); 
    }
    
    // Split variants
    for (let i = 2; i < word.length; i++) { 
      for (const t of tlds) candidates.push(`${word.slice(0, i)}-${word.slice(i)}.${t}`); 
    }
    
    // Compounds with semantic suffixes
    const suffixes = ['api', 'tool', 'util', 'ops', 'fn', 'run', 'hub', 'lab', 'kit', 'pro', 'go', 'now', 'io', 'net', 'dev', 'cap', 'cmd', 'do'];
    for (const s of suffixes) { 
      for (const t of tlds) { 
        candidates.push(`${word}${s}.${t}`); 
        candidates.push(`${word}-${s}.${t}`); 
      } 
    }
    
    // HTTP status codes (with semantic meaning)
    const codes = ['200', '204', '206', '301', '404', '418', '42', '64', '101'];
    for (const c of codes) { 
      for (const t of tlds) candidates.push(`${word}${c}.${t}`); 
    }
    
    return [...new Set(candidates)];
  }

  scoreDomain(domain, concept) {
    let score = 0;
    const name = domain.split('.')[0];
    const tld = domain.split('.')[1];
    
    // Length (shorter = better, max 4 points)
    if (name.length <= 3) score += 4;
    else if (name.length <= 4) score += 3;
    else if (name.length <= 6) score += 2;
    else if (name.length <= 8) score += 1;
    
    // Hyphens (fewer = better, max 3 points)
    const hyphens = (name.match(/-/g) || []).length;
    if (hyphens === 0) score += 3;
    else if (hyphens === 1) score += 2;
    else if (hyphens === 2) score += 1;
    
    // TLD (max 3 points)
    if (tld === 'com') score += 3;
    else if (tld === 'xyz') score += 2;
    else if (tld === 'dev') score += 2;
    else if (tld === 'site') score += 1;
    
    // Semantic match with concept (max 3 points)
    if (name === concept) score += 3;
    else if (name.startsWith(concept)) score += 2;
    else if (name.includes(concept)) score += 1;
    
    // Semantic meaning bonus (max 4 points)
    const meaning = this.getMeaning(domain);
    if (meaning.strength === 'strong') score += 4;
    else if (meaning.strength === 'medium') score += 2;
    else if (meaning.strength === 'weak') score += 1;
    
    // Developer/agent relevance (max 3 points)
    if (meaning.developerNative) score += 2;
    if (meaning.agentNative) score += 1;
    
    return score;
  }

  getMeaning(domain) {
    const name = domain.split('.')[0].replace(/-/g, '');
    
    const meanings = {
      'get200': { meaning: 'GET something successfully (HTTP 200 OK)', strength: 'strong', developerNative: true, agentNative: true },
      'get204': { meaning: 'GET succeeded with no content (HTTP 204)', strength: 'medium', developerNative: true, agentNative: false },
      'get206': { meaning: 'Partial content (HTTP 206)', strength: 'weak', developerNative: true, agentNative: false },
      'get301': { meaning: 'Redirect (HTTP 301)', strength: 'weak', developerNative: true, agentNative: false },
      'get404': { meaning: 'Not found (ironic for a utility)', strength: 'weak', developerNative: true, agentNative: false },
      'get418': { meaning: 'I am a teapot (hacker culture)', strength: 'weak', developerNative: true, agentNative: false },
      'get42': { meaning: 'Answer to everything', strength: 'medium', developerNative: true, agentNative: false },
      'get64': { meaning: 'Base64/computing', strength: 'weak', developerNative: true, agentNative: false },
      'get101': { meaning: 'Primitives/fundamentals', strength: 'medium', developerNative: true, agentNative: true },
      'getapi': { meaning: 'GET an API', strength: 'strong', developerNative: true, agentNative: true },
      'gettool': { meaning: 'GET a tool', strength: 'strong', developerNative: true, agentNative: true },
      'getutil': { meaning: 'GET a utility', strength: 'medium', developerNative: true, agentNative: true },
      'getops': { meaning: 'GET operations', strength: 'medium', developerNative: true, agentNative: true },
      'getfn': { meaning: 'GET function', strength: 'strong', developerNative: true, agentNative: true },
      'getrun': { meaning: 'GET and run', strength: 'medium', developerNative: true, agentNative: true },
      'gethub': { meaning: 'GET hub', strength: 'medium', developerNative: true, agentNative: false },
      'getlab': { meaning: 'GET lab', strength: 'medium', developerNative: true, agentNative: false },
      'getkit': { meaning: 'GET kit', strength: 'medium', developerNative: true, agentNative: false },
      'getpro': { meaning: 'GET pro', strength: 'medium', developerNative: true, agentNative: false },
      'getgo': { meaning: 'GET go', strength: 'medium', developerNative: true, agentNative: true },
      'getnow': { meaning: 'GET now', strength: 'medium', developerNative: true, agentNative: true },
      'getio': { meaning: 'GET I/O', strength: 'medium', developerNative: true, agentNative: false },
      'getnet': { meaning: 'GET network', strength: 'medium', developerNative: true, agentNative: false },
      'getdev': { meaning: 'GET dev', strength: 'medium', developerNative: true, agentNative: false },
      'getcap': { meaning: 'GET capabilities', strength: 'strong', developerNative: true, agentNative: true },
      'getcmd': { meaning: 'GET command', strength: 'medium', developerNative: true, agentNative: true },
      'getdo': { meaning: 'GET do', strength: 'medium', developerNative: true, agentNative: true },
    };
    
    return meanings[name] || { meaning: `${name} (custom)`, strength: 'weak', developerNative: false, agentNative: false };
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
