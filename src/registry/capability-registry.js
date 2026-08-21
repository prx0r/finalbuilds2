// Capability Registry
// Central registry for all GET capabilities

export class CapabilityRegistry {
  constructor() {
    this.capabilities = new Map();
  }

  async register(capability) {
    const id = capability.id || `get://${capability.category}/${capability.slug}`;
    const entry = {
      id,
      name: capability.name,
      slug: capability.slug,
      category: capability.category,
      description: capability.description,
      path: `/${capability.category}/${capability.slug}`,
      status: 'healthy',
      interfaces: capability.interfaces || {},
      pricing: capability.pricing || { type: 'free' },
      performance: capability.performance || {},
      useWhen: capability.useWhen,
      dontUseWhen: capability.dontUseWhen,
      inputType: capability.inputType || 'string',
      outputType: capability.outputType || 'string',
      deterministic: capability.deterministic !== false,
      sideEffects: capability.sideEffects || 'none',
      auth: capability.auth || 'none',
      tools: capability.tools || [],
      examples: capability.examples || [],
      version: capability.version || '1.0.0',
      lastVerified: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    this.capabilities.set(id, entry);
    return entry;
  }

  async get(id) {
    return this.capabilities.get(id) || null;
  }

  async list(filter = {}) {
    let results = [...this.capabilities.values()];
    if (filter.category) results = results.filter(c => c.category === filter.category);
    if (filter.status) results = results.filter(c => c.status === filter.status);
    return results;
  }

  async search(query, { limit = 10 } = {}) {
    const q = query.toLowerCase();
    return [...this.capabilities.values()]
      .filter(c => 
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      )
      .slice(0, limit);
  }

  async update(id, updates) {
    const cap = this.capabilities.get(id);
    if (!cap) throw new Error(`Capability not found: ${id}`);
    Object.assign(cap, updates, { updated_at: new Date().toISOString() });
    return cap;
  }

  async remove(id) {
    return this.capabilities.delete(id);
  }

  async count() {
    return this.capabilities.size;
  }

  // Export all capabilities as JSON
  async export() {
    return [...this.capabilities.values()];
  }

  // Import capabilities from JSON
  async import(capabilities) {
    for (const cap of capabilities) {
      await this.register(cap);
    }
    return capabilities.length;
  }
}

export default CapabilityRegistry;
