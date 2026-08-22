#!/usr/bin/env node
/**
 * observe-sites — fleet sensor.
 * Reads registry/sites/*.json, probes each site (homepage, llms.txt,
 * robots.txt) and emits canonical observation.recorded events to the
 * control plane. Designed for cron; safe to re-run any time.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvent, generateId } from '../contracts/index.js';

const CONTROL_URL = process.env.CONTROL_URL || 'http://127.0.0.1:8787';
const CONTROL_TOKEN = process.env.CONTROL_TOKEN || '';
const TIMEOUT_MS = Number(process.env.SENSOR_TIMEOUT_MS || 10000);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function postEvent(event) {
  const res = await fetch(`${CONTROL_URL}/v1/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(CONTROL_TOKEN ? { Authorization: `Bearer ${CONTROL_TOKEN}` } : {}),
    },
    body: JSON.stringify(event),
  });
  return { status: res.status, body: await res.json() };
}

async function probe(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { status: res.status, latency_ms: Date.now() - started };
  } catch (err) {
    return { status: 0, latency_ms: Date.now() - started, error: String(err.cause?.code || err.message).slice(0, 120) };
  }
}

async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

async function observe(siteId, url, metric, value, ok) {
  const event = createEvent(
    'observation.recorded',
    { system: 'finalbuilds2', version: '0.1.0' },
    { type: 'Site', id: siteId },
    { id: generateId('obs'), site_id: siteId, url, metric, value, ok },
    { context: { site_id: siteId } },
  );
  return postEvent(event);
}

async function main() {
  const dir = path.join(ROOT, 'registry', 'sites');
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.json'));
  let recorded = 0;
  let failed = 0;

  for (const file of files) {
    const manifest = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
    const siteId = manifest.id;
    const base = `https://${manifest.domain}`;

    // Homepage health
    const home = await probe(base);
    {
      const ok = home.status > 0 && home.status < 500;
      const { status, body } = await observe(siteId, base, 'http.status', home.status, ok);
      console.log(`${siteId} http.status=${home.status} ${home.latency_ms}ms -> ${status} ${body.projection ?? ''}`);
      status === 201 ? recorded++ : failed++;
    }

    if (!home.status) console.log(`${siteId} unreachable: ${home.error || 'unknown'}`);

    // Agent-discovery standard probes
    for (const [metric, file_] of [['llms_txt.present', 'llms.txt'], ['robots_txt.present', 'robots.txt']]) {
      const ok = await reachable(`${base}/${file_}`);
      const { status } = await observe(siteId, `${base}/${file_}`, metric, ok ? 1 : 0, ok);
      console.log(`${siteId} ${metric}=${ok} -> ${status}`);
      status === 201 ? recorded++ : failed++;
    }
  }
  console.log(`sensor done: ${recorded} observations recorded, ${failed} rejected`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
