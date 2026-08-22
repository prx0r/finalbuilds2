#!/usr/bin/env node
/**
 * register-sites — one-time registration of fleet sites.
 * Reads registry/sites/*.json and emits canonical site.registered events.
 * Run again only when the registry changes (CREATE is not idempotent).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvent } from '../contracts/index.js';

const CONTROL_URL = process.env.CONTROL_URL || 'http://127.0.0.1:8787';
const CONTROL_TOKEN = process.env.CONTROL_TOKEN || '';
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
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  const dir = path.join(ROOT, 'registry', 'sites');
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.json'));
  let ok = 0;
  for (const file of files) {
    const manifest = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
    const event = createEvent(
      'site.registered',
      { system: 'finalbuilds2', version: '0.1.0' },
      { type: 'Site', id: manifest.id },
      {
        id: manifest.id,
        name: manifest.name,
        url: `https://${manifest.domain}`,
        domain: manifest.domain,
        runtime: manifest.runtime || '',
        product_id: manifest.product_id || '',
      },
      { context: { site_id: manifest.id, product_id: manifest.product_id || null } },
    );
    const { status, body } = await postEvent(event);
    console.log(`${manifest.id} -> ${status} projection=${body.projection ?? '-'}`);
    if (status === 201) ok++;
  }
  console.log(`registered ${ok}/${files.length} sites`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
