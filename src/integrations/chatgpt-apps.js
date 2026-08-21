// ChatGPT Apps SDK Integration
// Generates manifests for ChatGPT app submission

export class ChatGPTAppsSDK {
  constructor(config = {}) {
    this.appId = config.appId;
    this.baseUrl = config.baseUrl || 'https://g-et.com';
  }

  // Generate app manifest for ChatGPT
  generateManifest(capabilities) {
    return {
      name: 'GET',
      description: 'Tiny tools that just work. No signup.',
      version: '1.0.0',
      tools: capabilities.map(cap => ({
        name: cap.id.replace('get://', '').replace(/\//g, '_'),
        description: cap.description,
        endpoint: `${this.baseUrl}/api${cap.path}`,
        parameters: cap.inputSchema || { type: 'object', properties: {} }
      }))
    };
  }

  // Generate MCP server config for ChatGPT
  generateMCPConfig(capabilities) {
    return {
      mcpServers: {
        get: {
          url: 'https://mcp.g-et.com',
          capabilities: {
            tools: capabilities.map(cap => ({
              name: cap.id.replace('get://', '').replace(/\//g, '_'),
              description: cap.description
            }))
          }
        }
      }
    };
  }

  // Generate "Connect to ChatGPT" link
  generateConnectLink(capability) {
    const toolName = capability.id.replace('get://', '').replace(/\//g, '_');
    return `https://chatgpt.com/app?url=${encodeURIComponent(`https://mcp.g-et.com`)}&tool=${toolName}`;
  }

  // Generate plugin manifest for Plugin Directory
  generatePluginManifest(capability) {
    return {
      schema_version: 'v1',
      name: capability.name,
      description: capability.description,
      auth: { type: 'none' },
      api: {
        type: 'openapi',
        url: `${this.baseUrl}/openapi.json`
      },
      logo: `${this.baseUrl}/logo.png`,
      contact: 'support@g-et.com',
      legal: 'https://g-et.com/legal'
    };
  }
}

export default ChatGPTAppsSDK;
