#!/usr/bin/env node
/**
 * create-build-run.mjs — P2+P3 of DEV-PLAN-2026-08-23 (sandboxd-free edition).
 * One invocation = one immutable BuildRun:
 *   runtime/build-runs/<run_id>/run.json   (append-only status history)
 *   worktree /root/unbundled/worktrees/<run_id> on branch build/<run_id>
 *   hermes kanban WorkOrder task with worktree + frozen-acceptance contract
 *
 * Usage: node scripts/create-build-run.mjs <idea_id>
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* optional */ }

const REPO = process.env.FACTORY_REPO ?? '/root/unbundled';
const WORKTREES = process.env.FACTORY_WORKTREES || '/root/unbundled/worktrees';
const RUNS_DIR = path.join(ROOT, 'runtime', 'build-runs');
const BOARD = process.env.FACTORY_BOARD || 'unbundled';

const args = process.argv.slice(2);
const ideaId = args[0];
const importUrl = args[1]; // optional: --import mode, clones upstream into the worktree
if (!ideaId) { console.error('usage: create-build-run.mjs <idea_id> [upstream_git_url]'); process.exit(2); }

const sh = async (cmd, args, opts = {}) => (await exec(cmd, args, { timeout: 30_000, ...opts })).stdout.trim();

// 1. Load idea from graph (FinalBuilds2 owns admission — not markdown, not local priorities)
const { ControlPlane } = await import('../src/controller/control-plane.js');
process.chdir(ROOT);
const cp = ControlPlane.fromEnv();
// Import mode bypasses idea-graph lookup: the upstream repo IS the spec.
let idea, score = 1;
if (importUrl) {
  idea = { id: ideaId, name: ideaId.replace(/_/g, ' '), data: { problem: `Vendored import of ${importUrl}, aligned to platform conventions.` } };
} else {
  const ideas = await cp.graph.findEntities({ type: 'Idea' });
  idea = ideas.find(i => i.id === ideaId);
}
if (!idea) { console.error(`unknown idea: ${ideaId}`); process.exit(1); }
if (!importUrl) {
  score = Object.values(idea.data?.scores ?? {}).reduce((a, b) => a + b, 0);
  if (!Number.isFinite(score) || score <= 0) { console.error(`idea ${ideaId} unscored — admission denied`); process.exit(1); }
}

// Admission gate: no frozen acceptance suite -> no build (P5 invariant).
const acceptDir = path.join(ROOT, 'acceptance', ideaId);
try { await fs.access(acceptDir); } catch {
  console.error(`no frozen acceptance suite at acceptance/${ideaId} — admission denied`);
  process.exit(1);
}

// 2. Immutable run identity
const runId = `run_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
const branch = `build/${runId}`;
const runDir = path.join(RUNS_DIR, runId);
await fs.mkdir(runDir, { recursive: true });
const baseCommit = await sh('git', ['-C', REPO, 'rev-parse', 'HEAD']);
const now = new Date().toISOString();

const run = {
  run_id: runId,
  idea_id: ideaId,
  import_url: importUrl ?? null,
  artifact_type: idea.data?.artifact_type ?? 'cli',
  status_history: [{ status: 'QUEUED', at: now }],
  base_commit: baseCommit,
  candidate_branch: branch,
  workspace: path.join(WORKTREES, runId),
  model_provider: 'opencode-go/ox-alpha-free',
  created_at: now,
};
await fs.writeFile(path.join(runDir, 'run.json'), JSON.stringify(run, null, 2));

// 3. Spec snapshot (digest pins what was promised)
const specPath = path.join(runDir, 'spec.md');
const spec = [
  `# Spec ${runId} — ${idea.name}`, '',
  `**Idea:** ${ideaId}  **Score:** ${score}  **Artifact type:** ${run.artifact_type}`, '',
  '## Problem', idea.data?.problem ?? idea.data?.description ?? '(none recorded)', '',
  '## Invariant', 'Build only the missing capability delta; reuse shared standards and primitives.', '',
  '## Acceptance', 'Frozen suite at acceptance/' + ideaId + '/ decides success — builder MUST NOT modify it.',
].join('\n');
await fs.writeFile(specPath, spec);
run.spec_digest = crypto.createHash('sha256').update(await fs.readFile(specPath)).digest('hex');
await fs.writeFile(path.join(runDir, 'run.json'), JSON.stringify(run, null, 2));

// 4. Worktree + candidate branch (isolation without docker)
await sh('git', ['-C', REPO, 'worktree', 'add', '-b', branch, path.join(WORKTREES, runId), baseCommit]);

// 4b. Import mode: vendor upstream snapshot into the worktree
let upstreamInfo = '';
if (importUrl) {
  const tmp = `/tmp/import_${runId}`;
  await sh('git', ['clone', '--depth', '1', importUrl, tmp], { timeout: 120_000 });
  const sha = (await sh('git', ['-C', tmp, 'rev-parse', 'HEAD'])).slice(0, 12);
  await exec('cp', ['-a', `${tmp}/.`, path.join(WORKTREES, runId, `platform/products/${ideaId}`)]);
  await fs.rm(path.join(WORKTREES, runId, `platform/products/${ideaId}/.git`), { recursive: true, force: true });
  
  await sh('git', ['-C', path.join(WORKTREES, runId), 'add', '-A']);
  await sh('git', ['-C', path.join(WORKTREES, runId), 'commit', '-qm', `import upstream ${importUrl}@${sha}`]);
  upstreamInfo = ` (@${sha})`;
  await fs.rm(tmp, { recursive: true, force: true });
}
await fs.appendFile(path.join(runDir, 'run.json.status'), JSON.stringify({ status: 'RUNNING', at: new Date().toISOString() }) + '\n');

// 5. WorkOrder -> hermes kanban (execution substrate)
const body = [
  `BuildRun: ${runId} (artifact_type=${run.artifact_type})${upstreamInfo}`,
  `WORKTREE: ${run.workspace}`,
  `BRANCH: ${branch} (commit EVERYTHING here; never touch main)`,
  '', '## SPEC', spec, '',
  '## Rules',
  '- Modify ONLY your worktree. Acceptance files are frozen and hash-pinned.',
  '- Include real implementation files (py/rs/js/ts/go) — no README-only candidates.',
  '- Finish by committing all changes and reporting files changed + how to run.',
  `- When done, call kanban_complete for this task. Verification is performed independently afterwards; do NOT claim success yourself.`,
].join('\n');
await exec('hermes', ['kanban', '--board', BOARD, 'create',
  `[wq:${ideaId}] ${runId}`,
  '--body', body,
  '--idempotency-key', `workorder-${runId}`], { timeout: 60_000 });

console.log(JSON.stringify({ run_id: runId, branch, workspace: run.workspace, spec_digest: run.spec_digest }, null, 2));
