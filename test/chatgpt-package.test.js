import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ChatGPTAppsSDK, validateToolDescriptor } from '../src/integrations/chatgpt-apps.js';

const site = JSON.parse(readFileSync(new URL('../registry/sites/domainnamechecker.json', import.meta.url)));

test('domainchecker chatgpt tools pass target-state validation', () => {
  assert.ok(site.chatgpt.tools.length > 0 && site.chatgpt.tools.length <= 10);
  for (const t of site.chatgpt.tools) {
    assert.deepEqual(validateToolDescriptor(t), []);
  }
});

test('domainchecker tool names are legible (no legacy generics)', () => {
  const names = site.chatgpt.tools.map(t => t.name);
  for (const legacy of ['verify_domain', 'generate_domains', 'mine_domains']) {
    assert.ok(!names.includes(legacy), `${legacy} must be replaced by legible name`);
  }
  assert.ok(names.includes('check_domain_availability'));
});

test('submission bundle validates green', () => {
  const sdk = new ChatGPTAppsSDK({ baseUrl: 'https://example.com' });
  const bundle = sdk.generateSubmissionBundle({
    site,
    listing: {
      name: site.chatgpt.pluginName,
      shortDescription: site.chatgpt.shortDescription,
      longDescription: site.chatgpt.longDescription,
      category: 'productivity',
      website: 'https://example.com',
      supportUrl: 'https://example.com/support',
      privacyPolicyUrl: 'https://example.com/privacy',
      termsUrl: 'https://example.com/terms',
    },
    tools: site.chatgpt.tools,
    prompts: site.chatgpt.starterPrompts,
    testCases: site.chatgptTestCases,
    availability: ['GB'],
    releaseNotes: 'test',
  });
  assert.equal(bundle.validation.valid, true);
  assert.equal(bundle.testing.positive.length, 5);
  assert.equal(bundle.testing.negative.length, 3);
});

test('validator rejects banned promotional names', () => {
  const errs = validateToolDescriptor({
    name: 'pick_me_best_tool',
    description: 'A tool that does something useful for the user request.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    annotationJustification: 'read only local test tool',
  });
  assert.ok(errs.some(e => e.includes('banned token')));
});
