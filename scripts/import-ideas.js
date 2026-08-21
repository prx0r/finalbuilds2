#!/usr/bin/env node
/**
 * Import ideas from finalbuildideas repo.
 * 
 * Usage:
 *   node scripts/import-ideas.js /path/to/finalbuildideas
 *   node scripts/import-ideas.js --list
 */

import { importIdeas } from '../src/ideas/importer.js';
import { compileBlueprint } from '../src/ideas/blueprint-compiler.js';

const args = process.argv.slice(2);

if (args.includes('--list') || args.length === 0) {
  const ideas = await importIdeas('/root/finalbuildideas');
  console.log(`Found ${ideas.length} ideas:\n`);
  for (const idea of ideas) {
    const tags = idea.tags?.length ? ` [${idea.tags.join(', ')}]` : '';
    console.log(`  ${idea.idea_id.slice(0, 18)}  ${(idea.name || idea.key).padEnd(35)}${tags}`);
  }
} else if (args.includes('--compile')) {
  const idx = args.indexOf('--compile');
  const key = args[idx + 1];
  const ideas = await importIdeas('/root/finalbuildideas');
  const idea = ideas.find(i => i.key === key || i.name === key || i.idea_id.startsWith(key));
  if (!idea) { console.error(`Idea "${key}" not found`); process.exit(1); }
  const blueprint = compileBlueprint(idea, {}, { challenge: 'test_challenge_abc' });
  console.log(blueprint);
} else {
  const ideas = await importIdeas(args[0]);
  console.log(JSON.stringify(ideas, null, 2));
}
