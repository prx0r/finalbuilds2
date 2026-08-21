import test from 'node:test';
import assert from 'node:assert/strict';
import { CanonicalPageGenerator } from '../src/canonical/generator.js';
import { CapabilityRegistry } from '../src/registry/capability-registry.js';
import { MCPRegistryClient, generateServerJson } from '../src/integrations/mcp-registry.js';
import { ChatGPTAppsSDK } from '../src/integrations/chatgpt-apps.js';

// Setup test registry
async function setupRegistry() {
  const registry = new CapabilityRegistry();
  await registry.register({
    slug: 'repair',
    category: 'json',
    name: 'Repair malformed JSON',
    description: 'Fix trailing commas, quoting errors and malformed structures.',
    useWhen: 'Input is intended to be JSON but fails parsing.',
    dontUseWhen: 'You need to infer missing semantic information.',
    inputType: 'string',
    outputType: 'valid JSON',
    deterministic: true,
    pricing: { type: 'free' },
    performance: { p50_ms: 18, p95_ms: 43, success_rate_30d: 0.9998 },
    tools: [{ name: 'json_repair', description: 'Repair JSON', inputSchema: { type: 'object', properties: { input: { type: 'string' } } } }]
  });
  return registry;
}

test('CapabilityRegistry registers and retrieves capabilities', async () => {
  const registry = await setupRegistry();
  const cap = await registry.get('get://json/repair');
  assert.ok(cap);
  assert.equal(cap.name, 'Repair malformed JSON');
  assert.equal(cap.status, 'healthy');
});

test('CapabilityRegistry searches capabilities', async () => {
  const registry = await setupRegistry();
  const results = await registry.search('JSON');
  assert.ok(results.length > 0);
  assert.ok(results.some(c => c.name.includes('JSON')));
});

test('CapabilityRegistry counts capabilities', async () => {
  const registry = await setupRegistry();
  const count = await registry.count();
  assert.equal(count, 1);
});

test('CanonicalPageGenerator generates HTML', async () => {
  const registry = await setupRegistry();
  const generator = new CanonicalPageGenerator(registry);
  const html = await generator.generate('get://json/repair', 'html');
  assert.ok(html.includes('Repair malformed JSON'));
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('application/ld+json'));
});

test('CanonicalPageGenerator generates Markdown', async () => {
  const registry = await setupRegistry();
  const generator = new CanonicalPageGenerator(registry);
  const md = await generator.generate('get://json/repair', 'markdown');
  assert.ok(md.includes('# Repair malformed JSON'));
  assert.ok(md.includes('Deterministic: yes'));
});

test('CanonicalPageGenerator generates JSON', async () => {
  const registry = await setupRegistry();
  const generator = new CanonicalPageGenerator(registry);
  const json = await generator.generate('get://json/repair', 'json');
  assert.equal(json.id, 'get://json/repair');
  assert.equal(json.name, 'Repair malformed JSON');
  assert.ok(json.interfaces);
});

test('MCPRegistryClient generates server.json', async () => {
  const cap = {
    id: 'get://json/repair',
    name: 'Repair malformed JSON',
    description: 'Fix trailing commas and quoting errors.',
    interfaces: { mcp: 'https://mcp.g-et.com/data' },
    tools: [{ name: 'json_repair', description: 'Repair JSON', inputSchema: {} }]
  };
  const serverJson = generateServerJson(cap);
  assert.equal(serverJson.name, 'Repair malformed JSON');
  assert.ok(serverJson.tools.length > 0);
});

test('ChatGPTAppsSDK generates manifest', async () => {
  const sdk = new ChatGPTAppsSDK();
  const capabilities = [{
    id: 'get://json/repair',
    name: 'Repair malformed JSON',
    description: 'Fix trailing commas.',
    path: '/json/repair'
  }];
  const manifest = sdk.generateManifest(capabilities);
  assert.equal(manifest.name, 'GET');
  assert.ok(manifest.tools.length > 0);
});

test('ChatGPTAppsSDK generates connect link', async () => {
  const sdk = new ChatGPTAppsSDK();
  const cap = { id: 'get://json/repair' };
  const link = sdk.generateConnectLink(cap);
  assert.ok(link.includes('chatgpt.com'));
  assert.ok(link.includes('json_repair'));
});
