#!/usr/bin/env node
/**
 * supervisor.mjs — the foundry's unattended loop (no sandboxd).
 * For every BuildRun in RUNNING state whose candidate branch has commits beyond
 * base_commit AND whose kanban task is no longer running:
 *   1. run verify-candidate.sh  (independent verifier)
 *   2. PASS -> promote-candidate.sh (merge --no-ff, status PROMOTED)
 *   3. FAIL/ERROR -> record REJECTED/ERROR, leave branch as evidence
 * Idempotent: runs already VERIFIED/REJECTED/PROMOTED are skipped.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* optional */ }
const RUNS_DIR = path.join(ROOT, 'runtime', 'build-runs');
const REPO = process.env.FACTORY_REPO || '/root/unbundled';
const BOARD = process.env.FACTORY_BOARD || 'unbundled';

async function main() {
  let runIds = [];
  try { runIds = (await fs.readdir(RUNS_DIR)).filter(d => d.startsWith('run_')); } catch { return; }
  if (!runIds.length) return;

  let boardText = '';
  try { boardText = (await exec('hermes', ['kanban', '--board', BOARD, 'list'], { timeout: 30_000 })).stdout; } catch {}

  for (const rid of runIds) {
    const dir = path.join(RUNS_DIR, rid);
    const statusFile = path.join(dir, 'run.json.status');
    let history = [];
    try { history = (await fs.readFile(statusFile, 'utf8')).trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch {}
    const last = history.at(-1)?.status;
    if (last && last !== 'RUNNING') continue;

    // branch must exist
    let head = '';
    try {
      const run = JSON.parse(await fs.readFile(path.join(dir, 'run.json'), 'utf8'));
      head = (await exec('git', ['-C', REPO, 'rev-parse', `build/${rid}`], { timeout: 15_000 })).stdout.trim();
      if (head === run.base_commit) continue; // builder hasn't committed yet
    } catch { continue; }

    // kanban task for this run must not be actively running
    if (boardText.includes(rid) && /● .*running/.test(boardText.split('\n').find(l => l.includes(rid)) ?? '')) continue;

    console.log(`supervising ${rid} (head ${head.slice(0, 8)})`);
    let verdict = 'ERROR', exitCode = 3;
    try {
      await exec('bash', [path.join(ROOT, 'scripts', 'verify-candidate.sh'), rid], { timeout: 600_000 });
      verdict = 'VERIFIED'; exitCode = 0;
    } catch (e) {
      exitCode = e.code ?? 1;
      verdict = exitCode === 1 ? 'REJECTED' : 'ERROR';
      if (exitCode === 0) { verdict = 'VERIFIED'; }
    }
    await fs.appendFile(statusFile, JSON.stringify({ status: verdict, at: new Date().toISOString(), head: head.slice(0, 12) }) + '\n');

    if (verdict === 'VERIFIED') {
      try {
        await exec('bash', [path.join(ROOT, 'scripts', 'promote-candidate.sh'), rid], { timeout: 60_000 });
        console.log(`${rid}: PROMOTED`);
      } catch (e) { console.error(`${rid}: promote failed: ${String(e.message).slice(0, 120)}`); }
    } else {
      console.log(`${rid}: ${verdict} (verify exit ${exitCode}) — branch kept as evidence`);
    }
  }
}

main().catch(e => { console.error('supervisor error:', e.message); process.exit(3); });
