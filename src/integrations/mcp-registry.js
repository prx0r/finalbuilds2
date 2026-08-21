// MCP Registry Integration
// Publishes capabilities to the official MCP Registry

export class MCPRegistryClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'https://registry.modelcontextprotocol.io';
    this.apiKey = config.apiKey;
  }

  async publish(server) {
    const response = await fetch(`${this.baseUrl}/v1/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify(server)
    });
    if (!response.ok) throw new Error(`MCP Registry: ${response.statusText}`);
    return response.json();
  }

  async getServer(serverId) {
    const response = await fetch(`${this.baseUrl}/v1/servers/${serverId}`);
    if (!response.ok) throw new Error(`MCP Registry: ${response.statusText}`);
    return response.json();
  }

  async search(query) {
    const response = await fetch(`${this.baseUrl}/v1/servers?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`MCP Registry: ${response.statusText}`);
    return response.json();
  }

  // Convert capability to MCP server.json format
  capabilityToServer(capability) {
    return {
      name: capability.id.replace('get://', '').replace('/', '-'),
      description: capability.description,
      url: capability.interfaces?.mcp,
      version: capability.version || '1.0.0',
      tools: capability.tools || [],
      metadata: {
        category: capability.category,
        pricing: capability.pricing,
        performance: capability.performance
      }
    };
  }
}

// Generate server.json for a capability
export function generateServerJson(capability) {
  return {
    schema_version: '2025-12-11',
    name: capability.name,
    description: capability.description,
    url: capability.interfaces?.mcp,
    version: capability.version || '1.0.0',
    tools: (capability.tools || []).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }))
  };
}

export default MCPRegistryClient;
