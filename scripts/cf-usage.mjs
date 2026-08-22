#!/usr/bin/env node
/**
 * cf-usage — real production usage sensor via Cloudflare GraphQL Analytics API.
 * For each registered site with a cloudflare_worker field, pulls request/error/
 * CPU stats for the last hour and emits canonical observation.recorded events.
 * This is the api.calls metric that powers attribution and experiments.
 *
 * Free-tier friendly: read-only GraphQL, no Worker deploys, no Logpush plan.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvent } from '../contracts/index.js';

const CONTROL_URL = process.env.CONTROL_URL || 'http://127.0.0.1:8787';
const CONTROL_TOKEN = process.env.CONTROL_TOKEN || '';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* optional */ }
const WINDOW_HOURS = Number(process.env.CF_WINDOW_HOURS || 1);

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const API_TOKEN = process.env.CF_API_TOKEN;

async function graphql(query, variables) {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors?.length) throw new Error(`GraphQL: ${JSON.stringify(body.errors).slice(0, 300)}`);
  return body.data;
}

async function observe(siteId, metric, value, ok, extraUrl = null) {
  const event = createEvent(
    'observation.recorded',
    { system: 'finalbuilds2', version: '0.1.0' },
    { type: 'Site', id: siteId },
    { id: `${generateObsId()}`, site_id: siteId, url: extraUrl, metric, value, ok },
    { context: { site_id: siteId } },
  );
  const headers = {
    'Content-Type': 'application/json',
    ...(CONTROL_TOKEN ? { Authorization: `Bearer ${CONTROL_TOKEN}` } : {}),
  };
  const res = await fetch(`${CONTROL_URL}/v1/events`, { method: 'POST', headers, body: JSON.stringify(event) });
  // Legacy mirror for drift/conformance machinery
  await fetch(`${CONTROL_URL}/v1/observations`, {
    method: 'POST', headers,
    body: JSON.stringify({
      id: event.payload.id,
      sensor_id: 'sensor_usage',
      subject_id: siteId,
      metric,
      value,
      observed_at: event.occurred_at,
    }),
  }).catch(() => {});
  return res.status;
}

function generateObsId() {
  return `obs_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

async function main() {
  if (!ACCOUNT_ID || !API_TOKEN) throw new Error('CF_ACCOUNT_ID and CF_API_TOKEN required');

  // Map sites -> worker scripts from registry manifests
  const dir = path.join(ROOT, 'registry', 'sites');
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.json'));
  const pairs = [];
  for (const file of files) {
    const m = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
    if (m.cloudflare_worker) pairs.push({ siteId: m.id, script: m.cloudflare_worker });
  }
  if (!pairs.length) { console.log('no sites with cloudflare_worker field'); return; }

  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();
  const query = `query($account: String!, $filter: WorkersInvocationsAdaptiveFilter_InputObject) {
    viewer { accounts(filter:{accountTag:$account}) {
      workersInvocationsAdaptive(limit:10, filter:$filter, orderBy:[scriptName_ASC]) {
        dimensions{scriptName} sum{requests errors subrequests} quantiles{cpuTimeP50}
      }
    }}
  }`;
  const variables = {
    account: ACCOUNT_ID,
    filter: { datetimeHour_geq: since, scriptName_in: [...new Set(pairs.map(p => p.script))] },
  };

  const data = await graphql(query, variables);
  const rows = data.viewer.accounts[0].workersInvocationsAdaptive ?? [];
  const byScript = new Map(rows.map(r => [r.dimensions.scriptName, r]));

  for (const { siteId, script } of pairs) {
    const row = byScript.get(script);
    if (!row) {
      console.log(`${siteId} ${script}: no invocations in window`);
      continue;
    }
    const requests = row.sum.requests ?? 0;
    const errors = row.sum.errors ?? 0;
    const cpuP50Us = Math.round(row.quantiles.cpuTimeP50 ?? 0);
    console.log(`${siteId} ${script}: requests=${requests} errors=${errors} cpu_p50=${cpuP50Us}us`);

    const s1 = await observe(siteId, 'api.calls', requests, true);
    const s2 = await observe(siteId, 'cf.errors', errors, errors === 0);
    const s3 = await observe(siteId, 'cf.cpu_p50_us', cpuP50Us, true);
    console.log(`  -> ${s1}/${s2}/${s3}`);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
