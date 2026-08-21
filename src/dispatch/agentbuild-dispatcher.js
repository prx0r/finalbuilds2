import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * AgentBuild dispatcher — replaces JsonlTaskOutbox.
 * Generates a blueprint from the task's build_brief, calls `agentbuild build`,
 * and returns the receipt. The FactoryController doesn't need to know the difference.
 */
export class AgentBuildDispatcher {
  constructor({ agentbuildBin = 'agentbuild', root = '.', mode = 'direct', timeoutMs = 600_000 } = {}) {
    this.agentbuildBin = agentbuildBin;
    this.root = path.resolve(root);
    this.mode = mode;
    this.timeoutMs = timeoutMs;
  }

  async dispatch(task) {
    const brief = task.build_brief ?? {};
    const idea = brief.idea ?? {};
    const evaluation = brief.evaluation ?? {};

    const blueprint = generateBlueprint(idea, evaluation, brief.invariant);
    const blueprintPath = path.join(this.root, '.agentbuild', 'blueprints', `${task.id}.md`);

    await fs.mkdir(path.dirname(blueprintPath), { recursive: true });
    await fs.writeFile(blueprintPath, blueprint, 'utf8');

    const receipt = await this._runBuild(blueprintPath);
    return { accepted: true, transport: 'agentbuild', task_id: task.id, receipt };
  }

  _runBuild(blueprintPath) {
    return new Promise((resolve, reject) => {
      const args = ['build', blueprintPath, '--mode', this.mode, '--quiet'];
      const child = execFile(this.agentbuildBin, args, {
        cwd: this.root,
        timeout: this.timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      }, async (error, stdout, stderr) => {
        if (error && !stdout) return reject(error);
        const receipt = await this._parseReceipt(stdout);
        resolve(receipt);
      });
    });
  }

  async _parseReceipt(stdout) {
    try {
      return JSON.parse(stdout);
    } catch {
      return { raw: stdout, release_passed: false };
    }
  }
}

/**
 * Generate an AgentBuild blueprint from a FinalBuilds2 idea.
 */
export function generateBlueprint(idea, evaluation = {}, invariant = '') {
  const name = idea.name ?? 'Untitled';
  const description = idea.description ?? '';
  const capabilities = idea.capabilities ?? [];
  const painReplaced = idea.pain_replaced ?? '';
  const delta = idea.delta ?? '';
  const tools = idea.tools ?? [];
  const score = evaluation.total ?? '';

  const sections = [
    `# Blueprint: ${name}`,
    '',
    '## What to build',
    '',
    description,
    '',
  ];

  if (painReplaced) {
    sections.push('## Pain replaced', '', painReplaced, '');
  }

  if (delta) {
    sections.push('## Capability delta (what the agent can\'t already do)', '', delta, '');
  }

  if (capabilities.length) {
    sections.push('## Required capabilities', '',
      capabilities.map(c => typeof c === 'string' ? `- ${c}` : `- ${c.name}: ${c.description ?? ''}`).join('\n'), '');
  }

  if (tools.length) {
    sections.push('## Tools / MCP endpoints', '',
      tools.map(t => typeof t === 'string' ? `- \`${t}\`` : `- \`${t.name}\`: ${t.description ?? ''}`).join('\n'), '');
  }

  sections.push(
    '## Technical requirements', '',
    '- React + Vite frontend (sandbox default)',
    '- Node.js backend API on the same port',
    '- Include README.md, robots.txt, sitemap.xml, llms.txt',
    '- Include at least one test for core deterministic behavior',
    '- Bind dev server to 0.0.0.0 on the sandbox-provided port',
    '- Semantic accessible HTML',
    '- Never hardcode credentials',
    '',
  );

  if (invariant) {
    sections.push('## Invariant', '', invariant, '');
  }

  if (score) {
    sections.push('## Idea score', '', `Score: ${score}/18`, '');
  }

  sections.push(
    '## Deterministic success checks', '',
    '- The app builds without errors',
    '- The preview URL serves a working page',
    '- Core functionality is implemented (not just a shell)',
    '',
  );

  return sections.join('\n');
}

/**
 * Record an AgentBuild receipt back into FinalBuilds2's event bus.
 */
export async function recordReceipt(bus, graph, task, receipt) {
  const buildRunId = task.build_run_id ?? task.id;

  await bus.emit('build.completed', {
    id: buildRunId,
    name: `Build ${task.title}`,
    idea_id: task.subject_id,
    status: receipt.release_passed ? 'completed' : 'failed',
    release_passed: receipt.release_passed,
    preview_url: receipt.preview_url,
    artifact_path: receipt.artifact_path,
    task_ids: receipt.task_ids,
    repair_loops: receipt.repair_loops,
    task_failures: receipt.task_failures,
    sandbox_restarts: receipt.sandbox_restarts,
    mode: receipt.mode,
    run_id: receipt.run_id,
  });

  if (receipt.release_passed && receipt.preview_url) {
    const productId = `product-${buildRunId}`;
    await bus.emit('product.graduated', {
      id: productId,
      name: task.title,
      build_run_id: buildRunId,
      capability_ids: [],
      preview_url: receipt.preview_url,
    });
  }

  return { buildRunId, passed: receipt.release_passed };
}
