#!/usr/bin/env node
/**
 * Build a specific idea from finalbuildideas using AgentBuild.
 *
 * Usage:
 *   node scripts/build-idea.js "web.redirect.explain"
 *   node scripts/build-idea.js --idea-id 003
 *   node scripts/build-idea.js --list
 *
 * This script:
 * 1. Reads the idea from the TinyTools ledger
 * 2. Generates an AgentBuild blueprint
 * 3. Runs `agentbuild build`
 * 4. Records the receipt
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateBlueprint, recordReceipt } from '../src/dispatch/agentbuild-dispatcher.js';
import { InMemoryEventStore } from '../src/event/jsonl-store.js';
import { EventBus } from '../src/event/bus.js';
import { InMemoryGraphStore } from '../src/graph/inmemory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LEDGER_PATH = path.join('/root/finalbuildideas', 'TINYTOOLS_LEDGER.md');

async function readLedger() {
  const raw = await fs.readFile(LEDGER_PATH, 'utf8');
  const ideas = [];
  const blocks = raw.split(/^---$/m);

  for (const block of blocks) {
    const lines = block.split('\n');
    const titleMatch = lines.find(l => l.startsWith('### '));
    if (!titleMatch) continue;

    const rawKey = titleMatch.replace('### ', '').trim();
    const key = rawKey.replace(/^\d+\.\s*/, '');
    const fields = {};

    for (const line of lines) {
      const m = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
      if (m) fields[m[1].toLowerCase().replace(/\s+/g, '_')] = m[2];
    }

    if (fields.capability) {
      ideas.push({
        key,
        name: key,
        description: fields.capability || fields.thesis || '',
        pain_replaced: fields.pain_replaced || '',
        delta: fields.delta || '',
        why_deterministic: fields.why_deterministic || '',
        implementation: fields.implementation || '',
        cost: fields.cost || '',
        policy: fields.policy || '',
        mcp: fields.mcp || '',
      });
    }
  }

  return ideas;
}

async function listIdeas() {
  const ideas = await readLedger();
  console.log(`Found ${ideas.length} ideas in ledger:\n`);
  for (const idea of ideas) {
    console.log(`  ${idea.key.padEnd(35)} ${idea.description.slice(0, 60)}`);
  }
}

async function buildIdea(key) {
  const ideas = await readLedger();
  const idea = ideas.find(i => i.key === key || i.name === key);

  if (!idea) {
    console.error(`Idea "${key}" not found. Use --list to see available ideas.`);
    process.exit(1);
  }

  console.log(`Building: ${idea.key}`);
  console.log(`Description: ${idea.description}`);
  console.log('');

  const blueprint = generateBlueprint(idea, {}, 'Build the complete tool. Include tests. Deploy preview.');

  const blueprintDir = path.join('/root/agentbuild2', 'blueprints');
  await fs.mkdir(blueprintDir, { recursive: true });
  const blueprintPath = path.join(blueprintDir, `${idea.key.replace(/\./g, '-')}.md`);
  await fs.writeFile(blueprintPath, blueprint, 'utf8');
  console.log(`Blueprint written to: ${blueprintPath}`);
  console.log('');

  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  console.log('Starting AgentBuild...');
  try {
    const { stdout } = await execFileAsync('agentbuild', [
      'build', blueprintPath, '--mode', 'direct', '--root', '/root/agentbuild2'
    ], {
      cwd: '/root/agentbuild2',
      timeout: 600_000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
    });

    const receipt = JSON.parse(stdout);
    console.log('');
    console.log(`Build ${receipt.release_passed ? 'PASSED' : 'FAILED'}`);
    console.log(`  Run ID:     ${receipt.run_id}`);
    console.log(`  Preview:    ${receipt.preview_url}`);
    console.log(`  Artifact:   ${receipt.artifact_path}`);
    console.log(`  Tasks:      ${receipt.task_ids?.length ?? 0}`);
    console.log(`  Repairs:    ${receipt.repair_loops ?? 0}`);

    const graph = new InMemoryGraphStore();
    const eventStore = new InMemoryEventStore();
    const bus = new EventBus(eventStore, graph);

    await recordReceipt(bus, graph, {
      id: `build-${receipt.run_id}`,
      title: idea.key,
      subject_id: idea.key,
      build_run_id: `build-${receipt.run_id}`,
    }, receipt);

    const events = await eventStore.all();
    console.log(`  Events:     ${events.length} recorded to event store`);

    return receipt;
  } catch (err) {
    console.error('Build failed:', err.message);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args.includes('--list')) {
  await listIdeas();
} else if (args.length > 0 && !args[0].startsWith('--')) {
  await buildIdea(args[0]);
} else {
  console.log('Usage:');
  console.log('  node scripts/build-idea.js --list              List all ideas');
  console.log('  node scripts/build-idea.js "web.redirect.explain"  Build a specific idea');
}
