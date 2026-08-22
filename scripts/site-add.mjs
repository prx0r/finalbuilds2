#!/usr/bin/env node
/**
 * site-add — scaffold a fleet site manifest that satisfies the
 * site-onboarding v1 standard, then validate it.
 *
 * Usage:
 *   node scripts/site-add.mjs <id> <domain> [--name "Pretty Name"] \
 *     [--runtime cloudflare-workers|node-ssr|static] [--worker <cf-script-name>] \
 *     [--product <product_id>] [--repo <url>]
 *
 * After scaffolding: register-sites.mjs, then observe + conformance pick it up
 * on their next cron tick (or run them manually).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || i + 1 === argv.length ? true : argv[++i];
    else args._.push(argv[i]);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const [id, domain] = args._;
if (!id || !domain) {
  console.error('usage: site-add.mjs <id> <domain> [--name N] [--runtime R] [--worker W] [--product P] [--repo U]');
  process.exit(2);
}

const runtime = args.runtime ?? (args.worker ? 'cloudflare-workers' : 'static');
const name = typeof args.name === 'string' ? args.name : id;
const sensors = ['sensor_uptime', 'sensor_agent_visibility'];
if (args.worker) sensors.push('sensor_usage');

const manifest = {
  id: id.startsWith('site_') ? id : `site_${id}`,
  name,
  domain,
  product_id: typeof args.product === 'string' ? args.product : `product_${id}`,
  source: { path: args.repo ? new URL(args.repo).pathname.slice(1) : `apps/${id}`, repo: args.repo ?? null },
  capabilities: [],
  interfaces: { web: true },
  standards: {
    'agent-discovery': 'standard_agent_discovery_v2',
    'seo-core': 'standard_seo_core_v1',
    'site-onboarding': 'standard_site_onboarding_v1',
  },
  ...(args.worker ? { cloudflare_worker: args.worker } : {}),
  sensors,
  automation: { risk_class: 1, auto_patch: false, auto_merge: { metadata: true, code: false } },
  dependencies: [],
  runtime,
  language: 'javascript',
};

const out = path.join(ROOT, 'registry', 'sites', `${manifest.id.replace(/^site_/, '')}.json`);
await fs.writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${out}`);

// Validate against registry loader rules before declaring success
const { validateSiteManifest } = await import('../src/registry/loader.js');
const validation = validateSiteManifest(manifest);
if (!validation.ok) {
  console.error(`INVALID: ${validation.errors.join(', ')}`);
  process.exit(1);
}
console.log('manifest valid per site-onboarding v1');
console.log('next: node scripts/register-sites.mjs && node scripts/observe-sites.mjs && node scripts/conformance.mjs');
