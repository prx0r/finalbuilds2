#!/usr/bin/env node
/**
 * health-probe.mjs — P6 startup gate. Admit no new work unless every
 * subsystem answers. Exit 0 = healthy; nonzero lists failures.
 */
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch {}
try { process.loadEnvFile(path.join(ROOT, '.env.local')); } catch {}

const checks = [];
async function check(name, fn) {
  try { await fn(); checks.push([name, 'ok']); }
  catch (e) { checks.push([name, `FAIL: ${String(e.message ?? e).slice(0, 90)}`]); }
}

const fetchJson = async (url, headers = {}) => {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

await check('control-plane', () => fetchJson('http://127.0.0.1:8787/healthz'));
await check('hydra', async () => {
  const url = `${process.env.HYDRA_URL || 'http://127.0.0.1:8443'}/v1/graphs/${process.env.HYDRA_GRAPH_ID || 'finalbuilds'}/query`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.HYDRA_TOKEN}`, 'Content-Type': 'application/json', 'X-Graph-Namespace': process.env.HYDRA_NAMESPACE || 'default' },
    body: JSON.stringify({ cell_id: process.env.HYDRA_CELL_ID || 'cell-0', query: 'MATCH (n) RETURN count(n) LIMIT 1' }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
});
await check('provider-zen', async () => {
  const key = process.env.OPENCODE_GO_API_KEY;
  if (!key) throw new Error('no OPENCODE_GO_API_KEY in env');
  const r = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'ox-alpha-free', messages: [{ role: 'user', content: 'ping' }], max_tokens: 4 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`gateway HTTP ${r.status} (credits/quota?)`);
});
await check('hermes-cli', async () => {
  const { stdout } = await exec('hermes', ['kanban', '--board', process.env.FACTORY_BOARD || 'unbundled', 'stats'], { timeout: 20_000 });
  if (!stdout.includes('running')) throw new Error('unexpected kanban output');
});
await check('build-repo', async () => {
  const repo = process.env.FACTORY_REPO || '/root/unbundled';
  await exec('git', ['-C', repo, 'status'], { timeout: 10_000 }); // throws if not a repo / locked index
});
await check('acceptance-suites-present', async () => {
  const entries = await fs.readdir(path.join(ROOT, 'acceptance'));
  if (!entries.length) throw new Error('no frozen suites at all');
});
await check('ram-headroom', async () => {
  const mem = await fs.readFile('/proc/meminfo', 'utf8');
  const availKb = Number(mem.match(/MemAvailable:\s+(\d+)/)?.[1] ?? 0);
  if (availKb < 500_000) throw new Error(`only ${Math.round(availKb / 1024)}MB available`);
});

let fail = 0;
for (const [name, status] of checks) {
  console.log(`${status === 'ok' ? 'PASS' : 'FAIL'}  ${name}${status === 'ok' ? '' : ' — ' + status}`);
  if (status !== 'ok') fail++;
}
process.exit(fail ? 1 : 0);
