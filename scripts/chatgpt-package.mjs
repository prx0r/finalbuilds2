// chatgpt-package: emit + validate a ChatGPT plugin submission bundle from a site manifest.
// Usage: node scripts/chatgpt-package.mjs registry/sites/domainnamechecker.json [--base-url https://...] [--out bundle.json]
// Exit non-zero when the bundle fails target-state validation (docs/CHATGPT_SUBMISSION_TARGET.md).
import { readFileSync, writeFileSync } from 'node:fs';
import { ChatGPTAppsSDK } from '../src/integrations/chatgpt-apps.js';

const args = process.argv.slice(2);
const manifestPath = args.find(a => !a.startsWith('--'));
if (!manifestPath) {
  console.error('usage: node scripts/chatgpt-package.mjs <site-manifest.json> [--base-url URL] [--out file]');
  process.exit(2);
}
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const baseUrl = opt('--base-url', process.env.CHATGPT_BASE_URL || 'https://domainnamechecker.tradesprior.workers.dev');
const outPath = opt('--out', null);

const site = JSON.parse(readFileSync(manifestPath, 'utf8'));
const chatgpt = site.chatgpt ?? {};
const tools = chatgpt.tools ?? [];
const listing = {
  name: chatgpt.pluginName ?? site.name,
  shortDescription: chatgpt.shortDescription ?? '',
  longDescription: chatgpt.longDescription ?? '',
  category: chatgpt.category ?? 'productivity',
  website: `https://${site.custom_domain ?? site.domain}`,
  supportUrl: `https://${site.custom_domain ?? site.domain}/support`,
  privacyPolicyUrl: `https://${site.custom_domain ?? site.domain}/privacy`,
  termsUrl: `https://${site.custom_domain ?? site.domain}/terms`,
};
// Starter test skeleton: prompts exist; full 5+3 cases are authored per-plugin
// in registry and merged here. Domain checker ships prompts; cases come from eval runs.
const testCases = site.chatgptTestCases ?? { positive: [], negative: [] };

const sdk = new ChatGPTAppsSDK({ baseUrl });
const bundle = sdk.generateSubmissionBundle({
  site,
  listing,
  tools,
  prompts: chatgpt.starterPrompts ?? [],
  testCases,
  availability: site.chatgptAvailability ?? ['GB', 'US'],
  releaseNotes: `Initial submission: ${listing.name}. MCP-only plugin, no UI.`,
});

const json = JSON.stringify(bundle, null, 2);
if (outPath) writeFileSync(outPath, json);
else process.stdout.write(json + '\n');

if (!bundle.validation.valid) {
  console.error('\nCHATGPT PACKAGE INVALID:');
  for (const e of [...bundle.validation.toolErrors, ...bundle.validation.listingErrors, ...bundle.validation.testErrors]) {
    console.error(' - ' + e);
  }
  process.exit(1);
} else {
  console.error(`\nchatgpt-package OK: ${tools.length} tools, ${bundle.prompts.length} prompts.`);
}
