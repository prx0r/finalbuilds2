#!/usr/bin/env node
/**
 * Import ideas from finalbuildideas repo.
 * 
 * Usage:
 *   node scripts/import-ideas.js /path/to/finalbuildideas
 *   node scripts/import-ideas.js --list
 *   node scripts/import-ideas.js --compile <idea-key>
 */

import { importIdeas } from '../src/ideas/importer.js';
import { compileBlueprint } from '../src/ideas/blueprint-compiler.js';

const args = process.argv.slice(2);
const DEFAULT_IDEAS_REPO = process.env.FINALBUILDIDEAS_PATH || process.env.HOME + '/finalbuildideas';

function getRepoPath() {
  const nonFlag = args.find(a => !a.startsWith('--'));
  return nonFlag || DEFAULT_IDEAS_REPO;
}

if (args.includes('--list') || args.length === 0) {
  const repo = getRepoPath();
  const ideas = await importIdeas(repo);
  console.log(`Found ${ideas.length} ideas from ${repo}:\n`);
  for (const idea of ideas) {
    const tags = idea.tags?.length ? ` [${idea.tags.join(', ')}]` : '';
    console.log(`  ${idea.idea_id.slice(0, 18)}  ${(idea.name || idea.key).padEnd(35)}${tags}`);
  }
} else if (args.includes('--compile')) {
  const idx = args.indexOf('--compile');
  const key = args[idx + 1];
  const repo = getRepoPath();
  const ideas = await importIdeas(repo);
  const idea = ideas.find(i => i.key === key || i.name === key || i.idea_id.startsWith(key));
  if (!idea) { console.error(`Idea "${key}" not found in ${repo}`); process.exit(1); }
  const blueprint = compileBlueprint(idea, {}, { challenge: 'test_challenge_abc' });
  console.log(blueprint);
} else {
  const repo = getRepoPath();
  const ideas = await importIdeas(repo);
  console.log(JSON.stringify(ideas, null, 2));
}
