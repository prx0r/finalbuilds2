#!/usr/bin/env node
/**
 * outbox-consumer — closes the control loop.
 * Tails runtime/hermes-outbox.jsonl (agent task queue written by drift/repair),
 * turns each unconsumed task into an agent-ready repair brief, and optionally
 * executes a repair command (REPAIR_CMD env, e.g. "opencode run") with the
 * brief path as argument. Emits repair.dispatched observations so the graph
 * records that the loop acted.
 *
 * No overengineering: one file, idempotent via consumed-offset state,
 * failures stay in the log and are retried next tick only if not marked done.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* optional */ }

const OUTBOX = path.join(ROOT, 'runtime', 'hermes-outbox.jsonl');
const STATE = path.join(ROOT, 'runtime', 'consumer-state.json');
const REPAIRS_DIR = path.join(ROOT, 'runtime', 'repairs');
const CONTROL_URL = process.env.CONTROL_URL || 'http://127.0.0.1:8787';
const HYDRA_URL = process.env.HYDRA_URL || 'http://127.0.0.1:8443';
const HYDRA_TOKEN = process.env.HYDRA_TOKEN || '';
const GRAPH_ID = process.env.HYDRA_GRAPH_ID || 'finalbuilds';
const REPAIR_CMD = process.env.REPAIR_CMD || ''; // e.g. "opencode run" — brief path appended

async function cypher(query) {
  const res = await fetch(`${HYDRA_URL}/v1/graphs/${GRAPH_ID}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Graph-Namespace': 'default', Authorization: `Bearer ${HYDRA_TOKEN}` },
    body: JSON.stringify({ cell_id: 'cell-0', query }),
  });
  if (!res.ok) throw new Error(`Hydra ${res.status}`);
  const raw = await res.json();
  return (raw.rows ?? []).map(row => Object.fromEntries((raw.columns ?? []).map((c, i) => [c, row[i]?.value ?? row[i]])));
}

async function latestObservations(siteId) {
  const rows = await cypher(`MATCH (n:Observation) WHERE n.site_id = '${siteId}' RETURN n.metric AS metric, n.value AS value, n.recorded_at AS at ORDER BY n.recorded_at DESC LIMIT 20`);
  const latest = new Map();
  for (const r of rows) if (!latest.has(r.metric)) latest.set(r.metric, `${r.value} (${String(r.at).slice(0, 19)}Z)`);
  return latest;
}

async function standardRequirements(versionId) {
  const rows = await cypher(`MATCH (e:Entity {id: ${intId(versionId)}}) RETURN e.data_json AS data LIMIT 1`);
  return (rows[0]?.data ? JSON.parse(rows[0].data).requirements : null) ?? [];
}

function intId(s) {
  return crypto.createHash('sha256').update(s).digest().readUIntBE(0, 6);
}

async function readJsonSafe(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function main() {
  const state = await readJsonSafe(STATE, { consumed: [] });
  const consumed = new Set(state.consumed);
  let lines = [];
  try { lines = (await fs.readFile(OUTBOX, 'utf8')).split('\n').filter(Boolean); } catch { lines = []; }

  await fs.mkdir(REPAIRS_DIR, { recursive: true });
  let acted = 0;

  for (const line of lines) {
    let task;
    try { task = JSON.parse(line); } catch { continue; }
    if (!task?.id || consumed.has(task.id)) continue;

    const payload = task.payload ?? {};
    const siteId = payload.site_id ?? task.subject_id ?? 'unknown_site';
    const versionId = payload.standard_version_id ?? '';
    const obs = await latestObservations(siteId);
    const reqs = versionId ? await standardRequirements(versionId) : [];

    const brief = [
      `# Repair task: ${task.title ?? task.id}`,
      '',
      `- Task ID: ${task.id}`,
      `- Site: ${siteId}`,
      `- Standard: ${versionId || 'n/a'} (${payload.reason ?? 'drift'})`,
      `- Kind: ${task.kind ?? 'unknown'}`,
      '',
      '## Failed requirement checks',
      ...(reqs.length ? reqs.map(r => `- [${r.severity}] ${r.id}`) : ['- (requirement list unavailable; see standard file)']),
      '',
      '## Latest observations for this site',
      ...(obs.size ? [...obs.entries()].map(([k, v]) => `- ${k}: ${v}`) : ['- none']),
      '',
      '## Expected of the repairing agent',
      '1. Locate the site repo locally (see registry/sites manifests for source.path).',
      '2. Fix the failing requirements (e.g. publish llms.txt / robots.txt, restore uptime).',
      '3. Deploy or commit per the repo convention.',
      `4. Verify: node scripts/observe-sites.mjs && node scripts/conformance.mjs (exit 0 for ${siteId}).`,
      '',
    ].join('\n');

    const briefPath = path.join(REPAIRS_DIR, `${task.id}.md`);
    await fs.writeFile(briefPath, brief);

    let executedBy = 'brief-only';
    if (REPAIR_CMD) {
      try {
        const { spawn } = await import('node:child_process');
        const [cmd, ...args] = REPAIR_CMD.split(' ');
        await new Promise((resolve, reject) => {
          const p = spawn(cmd, [...args, briefPath], { cwd: ROOT, stdio: 'ignore' });
          p.on('exit', code => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
          p.on('error', reject);
        });
        executedBy = REPAIR_CMD;
      } catch (err) {
        executedBy = `failed: ${String(err.message).slice(0, 80)}`;
      }
    }

    // Record loop action in both graphs
    const headers = { 'Content-Type': 'application/json' };
    await fetch(`${CONTROL_URL}/v1/observations`, {
      method: 'POST', headers,
      body: JSON.stringify({
        id: `obs_repair_${task.id}`, sensor_id: 'sensor_conformance',
        subject_id: siteId, metric: 'repair.dispatched', value: 1,
        dimensions: { task_id: task.id, executed_by: executedBy },
        observed_at: new Date().toISOString(),
      }),
    }).catch(() => {});

    consumed.add(task.id);
    acted++;
    console.log(`${task.id}: brief -> ${path.relative(ROOT, briefPath)} (${executedBy})`);
  }

  // Bound the consumed list
  state.consumed = [...consumed].slice(-500);
  await fs.writeFile(STATE, JSON.stringify(state));
  console.log(`consumer done: ${acted} tasks processed`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
