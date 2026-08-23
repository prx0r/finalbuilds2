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

const [ideaId] = process.argv.slice(2);
if (!ideaId) { console.error('usage: create-build-run.mjs <idea_id>'); process.exit(2); }

const sh = async (cmd, args, opts = {}) => (await exec(cmd, args, { timeout: 30_000, ...opts })).stdout.trim();

// 1. Load idea from graph (FinalBuilds2 owns admission — not markdown, not local priorities)
const { ControlPlane } = await import('../src/controller/control-plane.js');
process.chdir(ROOT);
const cp = ControlPlane.fromEnv();
const ideas = await cp.graph.findEntities({ type: 'Idea' });
const idea = ideas.find(i => i.id === ideaId);
if (!idea) { console.error(`unknown idea: ${ideaId}`); process.exit(1); }
const score = Object.values(idea.data?.scores ?? {}).reduce((a, b) => a + b, 0);
if (!Number.isFinite(score) || score <= 0) { console.error(`idea ${ideaId} unscored — admission denied`); process.exit(1); }

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
await fs.appendFile(path.join(runDir, 'run.json.status'), JSON.stringify({ status: 'RUNNING', at: new Date().toISOString() }) + '\n');

// 5. WorkOrder -> hermes kanban (execution substrate)
const body = [
  `BuildRun: ${runId} (artifact_type=${run.artifact_type})`,
  `WORKTREE: ${run.workspace}`,
  `BRANCH: ${branch} (commit EVERYTHING here; never touch main)`,
  '', '## SPEC', spec, '',
  '## Rules',
  '- Modify ONLY your worktree. Acceptance files are frozen and hash-pinned.',
  '- Include real implementation files (py/rs/js/ts/go) — no README-only candidates.',
  '- Finish by committing all changes and reporting files changed + how to run.',
].join('\n');
await exec('hermes', ['kanban', '--board', BOARD, 'create',
  `[wq:${ideaId}] ${runId}`,
  '--body', body,
  '--idempotency-key', `workorder-${runId}`], { timeout: 60_000 });

console.log(JSON.stringify({ run_id: runId, branch, workspace: run.workspace, spec_digest: run.spec_digest }, null, 2));
