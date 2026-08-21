/**
 * BlueprintCompiler — compiles a normalized idea into an AgentBuild blueprint.
 * 
 * Takes an idea + context and produces a deterministic markdown blueprint
 * with challenge nonce for anti-cheat verification.
 */

import crypto from 'node:crypto';

/**
 * Compile an idea into a Builda-compatible blueprint.
 * @param {Object} idea - Normalized idea from IdeaImporter
 * @param {Object} context - BuildContext from FinalBuilds (standards, failures, precedents)
 * @param {Object} opts - Options: { challenge, buildId }
 * @returns {string} Markdown blueprint
 */
export function compileBlueprint(idea, context = {}, opts = {}) {
  const challenge = opts.challenge || crypto.randomBytes(8).toString('hex');
  const buildId = opts.buildId || `build_${Date.now()}`;

  const sections = [];

  sections.push(`# Blueprint: ${idea.name || idea.key}`);
  sections.push('');
  sections.push(`**Build ID:** ${buildId}`);
  sections.push(`**Challenge:** ${challenge}`);
  sections.push('');

  // Core job
  sections.push('## What to build');
  sections.push('');
  sections.push(idea.description || idea.mini_thesis || '');
  sections.push('');

  // Pain replaced
  if (idea.pain_replaced) {
    sections.push('## Pain replaced');
    sections.push('');
    sections.push(idea.pain_replaced);
    sections.push('');
  }

  // Capability delta
  if (idea.delta) {
    sections.push('## Capability delta');
    sections.push('');
    sections.push(idea.delta);
    sections.push('');
  }

  // Deterministic requirement
  if (idea.why_deterministic) {
    sections.push('## Why this must be deterministic');
    sections.push('');
    sections.push(idea.why_deterministic);
    sections.push('');
  }

  // Interfaces
  const interfaces = idea.interfaces || idea.mcp || '';
  if (interfaces) {
    sections.push('## Interfaces');
    sections.push('');
    if (interfaces.includes('rest') || interfaces.includes('API')) sections.push('- REST API endpoint');
    if (interfaces.includes('mcp') || interfaces.includes('MCP')) sections.push('- MCP tool');
    if (interfaces.includes('web') || interfaces.includes('HTML')) sections.push('- Human-readable web page');
    if (interfaces.includes('worker')) sections.push('- Cloudflare Worker');
    if (!interfaces.includes('rest') && !interfaces.includes('mcp') && !interfaces.includes('web')) {
      sections.push('- REST API');
      sections.push('- Web interface');
    }
    sections.push('');
  }

  // Implementation hints
  if (idea.implementation) {
    sections.push('## Implementation approach');
    sections.push('');
    sections.push(idea.implementation);
    sections.push('');
  }

  // BuildContext: known failures
  if (context.known_failures?.length) {
    sections.push('## Known failure patterns to avoid');
    sections.push('');
    for (const f of context.known_failures.slice(0, 3)) {
      sections.push(`- ${f.failure_class}: occurred ${f.occurrence_count} times`);
    }
    sections.push('');
  }

  // BuildContext: strategy
  if (context.strategy_version) {
    sections.push('## Recommended strategy');
    sections.push('');
    sections.push(`Use approach proven by strategy version ${context.strategy_version.version || 'unknown'}`);
    sections.push('');
  }

  // Technical requirements
  sections.push('## Technical requirements');
  sections.push('');
  sections.push('- React + Vite frontend (sandbox default)');
  sections.push('- Node.js backend API on the same port');
  sections.push('- Include README.md, robots.txt, sitemap.xml, llms.txt');
  sections.push('- Include at least one test for core deterministic behavior');
  sections.push('- Bind dev server to 0.0.0.0 on the sandbox-provided port');
  sections.push('- Semantic accessible HTML');
  sections.push('- Never hardcode credentials');
  sections.push('');

  // Anti-cheat challenge
  sections.push('## Verification challenge');
  sections.push('');
  sections.push(`Expose the build challenge from GET /_foundry-proof`);
  sections.push(`The response must be: {"challenge": "${challenge}"}`);
  sections.push(`This proves the app was built for this specific run.`);
  sections.push('');

  // Acceptance criteria
  sections.push('## Acceptance criteria');
  sections.push('');
  sections.push('1. The app builds without errors');
  sections.push('2. The preview URL serves a working page');
  sections.push('3. Core functionality is implemented (not just a shell)');
  sections.push(`4. GET /_foundry-proof returns {"challenge": "${challenge}"}`);
  sections.push('5. At least one test passes');
  sections.push('');

  return sections.join('\n');
}
