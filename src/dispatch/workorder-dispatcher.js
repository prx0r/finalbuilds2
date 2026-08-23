import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/**
 * WorkOrderDispatcher — sandboxd-free product-build transport.
 * FinalBuilds2 decides (graph admission + scoring); execution goes to the
 * hermes builder via a durable WorkOrder kanban task bound to an immutable
 * BuildRun (worktree + candidate branch). Verification is handled by
 * scripts/supervisor.mjs, never by the builder.
 */
export class WorkOrderDispatcher {
  constructor({ root = '.', outboxDispatcher = null } = {}) {
    this.root = root;
    this.outbox = outboxDispatcher;
  }

  async dispatch(task) {
    const ideaId = task.subject_id ?? task.build_brief?.idea?.id;
    if (!ideaId) return { accepted: false, transport: 'workorder', task_id: task.id, error: 'no subject_id' };
    try {
      const { stdout } = await exec('node', ['scripts/create-build-run.mjs', ideaId], {
        cwd: this.root, timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
      });
      const jsonStart = stdout.indexOf('{');
      const run = JSON.parse(stdout.slice(jsonStart));
      // Durable mirror of the dispatch decision (event log retains everything).
      if (this.outbox) await this.outbox.dispatch({ ...task, status: 'workorder-created', run_id: run.run_id }).catch(() => {});
      return { accepted: true, transport: 'workorder', task_id: task.id, run };
    } catch (err) {
      return { accepted: false, transport: 'workorder', task_id: task.id, error: String(err.message ?? err).slice(0, 300) };
    }
  }
}
