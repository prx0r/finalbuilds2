#!/usr/bin/env node
/**
 * conformance — evaluate every registered site against its desired standards,
 * emit standard.compliance observations, print a verdict table.
 * Exit 1 when any required requirement fails (gate-able in CI/cron).
 *
 * Prereq: bootstrap-registry ran at least once (sites + desires exist).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ControlPlane } from '../src/controller/control-plane.js';
import { ConformanceEvaluator } from '../src/standards/conformance.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* optional */ }
process.chdir(ROOT);

const cp = ControlPlane.fromEnv();
const evaluator = new ConformanceEvaluator({ graph: cp.graph });
const sites = await cp.graph.findEntities({ type: 'Site' });

if (!sites.length) {
  console.error('no Site entities found — run scripts/bootstrap-registry.mjs first');
  process.exit(2);
}

let failures = 0;
for (const site of sites.sort((a, b) => a.id.localeCompare(b.id))) {
  const results = await evaluator.evaluateSite(site);
  if (!results.length) {
    console.log(`${site.id}: no desired standards`);
    continue;
  }
  for (const r of results) {
    const mark = r.compliant ? 'ok  ' : 'FAIL';
    const why = [...r.failed_required, ...r.failed_recommended.map(x => `${x}(soft)`)];
    if (!r.compliant) failures++;
    console.log(`${site.id} ${r.standard_version_id} ${mark}${why.length ? ` missing=${why.join(',')}` : ''}`);
  }
  await evaluator.recordCompliance(cp, results);
}

console.log(`\nconformance done: ${failures} non-compliant site/standard pairs`);
process.exit(failures ? 1 : 0);
