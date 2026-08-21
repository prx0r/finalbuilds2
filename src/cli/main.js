#!/usr/bin/env node
import fs from 'node:fs/promises';
import { ControlPlane } from '../controller/control-plane.js';
import { rebuildProjection } from '../event/projector.js';
import { experimentReport } from '../experiments/report.js';
import { bootstrapRegistry } from '../registry/bootstrap.js';
import { ProcessAttribution } from '../analytics/process-attribution.js';

function usage() {
  console.log(`finalbuilds control plane\n\nCommands:\n  seed <ideas.json>\n  bootstrap [root]\n  rebuild\n  tick [limit]\n  drift\n  repair\n  attribution [metric]\n  process-attribution [stage] [metric]\n  experiment-report <experiment-id>\n  entities [type]\n`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command) return usage();
  const cp = ControlPlane.fromEnv();

  if (command === 'seed') {
    const file = args[0];
    if (!file) throw new Error('seed requires a JSON file');
    const payload = JSON.parse(await fs.readFile(file, 'utf8'));
    for (const generator of payload.generators ?? []) await cp.registerIdeaGenerator(generator);
    for (const idea of payload.ideas ?? []) await cp.seedIdea(idea);
    console.log(JSON.stringify({ seeded: (payload.ideas ?? []).length }, null, 2));
    return;
  }
  if (command === 'bootstrap') {
    console.log(JSON.stringify(await bootstrapRegistry(cp, { root: args[0] ?? process.cwd() }), null, 2));
    return;
  }
  if (command === 'rebuild') {
    const count = await rebuildProjection(cp.graph, cp.eventStore);
    console.log(JSON.stringify({ projected_events: count }, null, 2));
    return;
  }
  if (command === 'tick') {
    console.log(JSON.stringify(await cp.factory.tick({ limit: Number(args[0] ?? 1) }), null, 2));
    return;
  }
  if (command === 'drift') {
    console.log(JSON.stringify(await cp.reconciler.standardDrift(), null, 2));
    return;
  }
  if (command === 'repair') {
    const drift = await cp.reconciler.standardDrift();
    console.log(JSON.stringify(await cp.reconciler.createRepairTasks(drift), null, 2));
    return;
  }
  if (command === 'attribution') {
    console.log(JSON.stringify(await cp.analytics.usageAttribution({ metric: args[0] ?? 'api.calls' }), null, 2));
    return;
  }
  if (command === 'process-attribution') {
    const analytics = new ProcessAttribution(cp.graph);
    console.log(JSON.stringify(await analytics.rank({ stage: args[0] ?? null, metric: args[1] ?? 'api.calls' }), null, 2));
    return;
  }
  if (command === 'experiment-report') {
    if (!args[0]) throw new Error('experiment-report requires id');
    console.log(JSON.stringify(await experimentReport(cp.graph, args[0]), null, 2));
    return;
  }
  if (command === 'entities') {
    console.log(JSON.stringify(await cp.graph.findEntities({ type: args[0] ?? null }), null, 2));
    return;
  }
  usage();
}

main().catch(error => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
