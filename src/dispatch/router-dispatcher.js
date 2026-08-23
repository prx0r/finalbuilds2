import { AgentBuildDispatcher } from './agentbuild-dispatcher.js';

/**
 * RouterDispatcher — one dispatch seam, two transports.
 *   kind 'product-build' -> agentbuild CLI (sandboxd isolated build, receipt)
 *   everything else      -> JsonlTaskOutbox (hermes kanban repair flow)
 *
 * Idempotent per process for product-builds: FactoryController.tick emits
 * task.created (bus dispatches) AND calls dispatcher.dispatch directly; the
 * router collapses that double-delivery to a single build.
 */
export class RouterDispatcher {
  constructor({ outboxDispatcher, agentbuild = null } = {}) {
    this.outbox = outboxDispatcher;
    this.agentbuild = agentbuild;
    this.dispatchedBuilds = new Set();
  }

  async dispatch(task) {
    if (task?.kind === 'product-build' && this.agentbuild) {
      if (this.dispatchedBuilds.has(task.id)) {
        return { accepted: true, transport: 'dedup', task_id: task.id };
      }
      this.dispatchedBuilds.add(task.id);
      try {
        return await this.agentbuild.dispatch(task);
      } catch (err) {
        // Build attempt failed before/without receipt: record it in the
        // durable outbox so the failure is visible and re-drivable.
        await this.outbox.dispatch({ ...task, status: 'dispatch-failed', error: String(err.message ?? err).slice(0, 300) }).catch(() => {});
        return { accepted: false, transport: 'agentbuild', task_id: task.id, error: String(err.message ?? err).slice(0, 300) };
      }
    }
    return this.outbox.dispatch(task);
  }
}
