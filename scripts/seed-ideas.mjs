#!/usr/bin/env node
/**
 * seed-ideas.mjs — materialize registry/ideas/seed.json into the graph the
 * FactoryController reads (Entity model via ControlPlane bus). Idempotent:
 * upsertEntity overwrites deterministically.
 *
 * Run: node --env-file=.env scripts/seed-ideas.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ControlPlane } from '../src/controller/control-plane.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const { default: fs } = await import('node:fs/promises');
const seed = JSON.parse(await fs.readFile(path.join(ROOT, 'registry', 'ideas', 'seed.json'), 'utf8'));

const cp = ControlPlane.fromEnv();
for (const g of seed.generators ?? []) {
  await cp.registerIdeaGenerator(g);
}
for (const i of seed.ideas ?? []) {
  const { site_id, status, ...data } = i;
  await cp.seedIdea({ ...data, ...(site_id ? { existing_site_id: site_id } : {}), ...(status ? { prior_status: status } : {}) });
}
console.log(`seeded ${seed.ideas?.length ?? 0} ideas, ${seed.generators?.length ?? 0} generators`);
const ideas = await cp.graph.findEntities({ type: 'idea' });
for (const i of ideas) {
  console.log(' ', i.id, 'score=', Object.values(i.data?.scores ?? {}).reduce((a, b) => a + b, 0));
}
