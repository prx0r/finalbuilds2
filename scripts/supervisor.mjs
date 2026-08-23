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
  try { boardText = (await exec('hermes', ['kanban', '--board', BOARD, 'list'], { timeout: 30_000 })).stdout; } catch { return; }

  // ---- lane A: worktree BuildRuns (wq: pipeline) -> verify + promote --------
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
        // Canonical event: graph must reflect reality the moment promotion lands.
        try {
          const run = JSON.parse(await fs.readFile(path.join(dir, 'run.json'), 'utf8'));
          const receipt = JSON.parse(await fs.readFile(path.join(dir, 'receipt.json'), 'utf8'));
          const crypto = await import('node:crypto');
          await fetch(`${process.env.CONTROL_URL || 'http://127.0.0.1:8787'}/v1/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(process.env.CONTROL_TOKEN ? { Authorization: `Bearer ${process.env.CONTROL_TOKEN}` } : {}) },
            body: JSON.stringify({
              event_id: `evt_build_completed_${rid}`,
              event_type: 'build.completed',
              schema_version: '1.0.0',
              occurred_at: new Date().toISOString(),
              recorded_at: new Date().toISOString(),
              source: { system: 'foundry-supervisor', version: '1.0.0' },
              subject: { type: 'build_run', id: rid },
              context: {},
              payload: {
                id: rid, name: `BuildRun ${rid}`, idea_id: run.idea_id, status: 'completed',
                candidate_commit: receipt.candidate_commit, artifact_digest: receipt.artifact_digest,
                receipt_result: receipt.result,
              },
              integrity: { payload_sha256: crypto.createHash('sha256').update(JSON.stringify({
                id: rid, name: `BuildRun ${rid}`, idea_id: run.idea_id, status: 'completed',
                candidate_commit: receipt.candidate_commit, artifact_digest: receipt.artifact_digest,
                receipt_result: receipt.result,
              })).digest('hex'), previous_event_id: null },
            }),
          }).then(r => console.log(`${rid}: build.completed event -> ${r.status}`));
        } catch (e) { console.error(`${rid}: event emission failed (promotion stands): ${String(e.message).slice(0, 80)}`); }
        console.log(`${rid}: PROMOTED`);
      } catch (e) { console.error(`${rid}: promote failed: ${String(e.message).slice(0, 120)}`); }
    } else {
      console.log(`${rid}: ${verdict} (verify exit ${exitCode}) — branch kept as evidence`);
    }
  }
  // ---- lane B: registry builds ([idea_id] tasks) -> post_build v2 integration
  try {
    const stateP = '/root/unbundled/registry/postbuild-state.json';
    let done = {};
    try { done = JSON.parse(await fs.readFile(stateP,'utf8')); } catch {}
    const reg = JSON.parse(await fs.readFile('/root/unbundled/registry/ideas.registry.json','utf8'));
    const statusById = Object.fromEntries(reg.ideas.map(i => [i.id, i.status]));
    for (const line of boardText.split('\n')) {
      const tm = line.match(/(t_[0-9a-f]{8})\s+done\s+\S*\s*\[([a-z0-9_]+)\]/);
      if (!tm) continue;
      const taskId = tm[1], ideaId = tm[2];
      if (done[taskId]) continue;
      if (!(ideaId in statusById)) continue;
      if (statusById[ideaId] === 'BUILT_PLATFORM') { done[taskId] = 'already-integrated'; continue; }
      console.log(`lane B: integrating ${taskId} -> ${ideaId}`);
      try {
        await exec('bash', ['/root/unbundled/scripts/post_build.sh', taskId, ideaId], { timeout: 300000 });
        done[taskId] = 'integrated';
        console.log(`${ideaId}: post_build integrated`);
      } catch (e) {
        done[taskId] = `failed: ${String(e.message).slice(0,80)}`;
        console.error(`${ideaId}: post_build failed`, String(e.message).slice(0,80));
      }
    }
    await fs.writeFile(stateP, JSON.stringify(done, null, 1));
  } catch (e) { console.error('lane B error:', e.message); }
}

main().catch(e => { console.error('supervisor error:', e.message); process.exit(3); });
