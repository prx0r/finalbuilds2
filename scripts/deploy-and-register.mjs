#!/usr/bin/env node
/**
 * deploy-and-register.mjs — the D in build→deploy→observe.
 * Takes a successful agentbuild release receipt, extracts the workspace,
 * deploys the static output to Cloudflare Pages, registers the site in the
 * fleet registry, and triggers immediate observe+conformance so the graph
 * reflects reality within one tick.
 *
 * Usage:
 *   node scripts/deploy-and-register.mjs <receipt.json> <site-id> [--project <cf-project>] \
 *     [--dist <subdir>] [--product <product_id>] [--repo <url>]
 *
 * Preconditions: receipt.release_passed === true; CF_API_TOKEN + CF_ACCOUNT_ID set (.env).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* optional */ }

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || i + 1 === argv.length ? true : argv[++i];
    else args._.push(argv[i]);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const [receiptPath, siteId] = args._;
if (!receiptPath || !siteId) {
  console.error('usage: deploy-and-register.mjs <receipt.json> <site-id> [--project P] [--dist D] [--product P] [--repo U]');
  process.exit(2);
}

const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
if (receipt.release_passed !== true) {
  console.error(`refusing to deploy: ${receipt.run_id ?? receiptPath} release_passed=${receipt.release_passed}`);
  process.exit(1);
}
if (!process.env.CF_API_TOKEN || !process.env.CF_ACCOUNT_ID) {
  console.error('CF_API_TOKEN / CF_ACCOUNT_ID missing from .env');
  process.exit(1);
}

// 1. Extract workspace
const artifact = receipt.artifact_path;
if (!artifact || !(await fs.stat(artifact).catch(() => null))) {
  console.error(`artifact missing: ${artifact}`);
  process.exit(1);
}
const stage = path.join(ROOT, '.agentbuild', 'deploys', `${receipt.run_id}-${siteId}`);
await fs.rm(stage, { recursive: true, force: true });
await fs.mkdir(stage, { recursive: true });
await exec('unzip', ['-q', path.resolve(artifact), '-d', stage]);

// 2. Locate static dist (common output dirs, or --dist override)
const candidates = args.dist ? [args.dist] : ['dist', 'build', 'out', 'public', '.'];
let distDir = null;
for (const c of candidates) {
  const p = path.join(stage, c);
  if (await fs.stat(p).catch(() => null)) { distDir = p; break; }
}
if (!distDir) { console.error('no static output dir found (dist/build/out/public)'); process.exit(1); }

// 3. Deploy to Cloudflare Pages
const project = typeof args.project === 'string' ? args.project : siteId.replace(/^site_/, '');
await exec('npx', ['wrangler', 'pages', 'deploy', distDir, `--project-name=${project}`, '--branch=main', '--commit-dirty=true'], {
  cwd: ROOT,
  env: { ...process.env, CLOUDFLARE_API_TOKEN: process.env.CF_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: process.env.CF_ACCOUNT_ID },
  timeout: 180_000,
});
const domain = `${project}.pages.dev`;

// 4. Register in fleet registry (manifest scaffold + registration)
await exec('node', ['scripts/site-add.mjs', siteId, domain,
  ...(typeof args.product === 'string' ? ['--product', args.product] : []),
  ...(typeof args.repo === 'string' ? ['--repo', args.repo] : []),
], { cwd: ROOT, timeout: 30_000 });
await exec('node', ['scripts/register-sites.mjs'], { cwd: ROOT, timeout: 60_000 });

// 5. Immediate observe + conformance so the graph sees the new site now
await exec('node', ['scripts/observe-sites.mjs'], { cwd: ROOT, timeout: 120_000 });
await exec('node', ['scripts/conformance.mjs'], { cwd: ROOT, timeout: 60_000 });

console.log(JSON.stringify({ deployed: domain, site_id: siteId, run_id: receipt.run_id }, null, 2));
