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
  constructor({ outboxDispatcher, agentbuild = null, workorder = null } = {}) {
    this.outbox = outboxDispatcher;
    this.agentbuild = agentbuild;
    this.workorder = workorder ?? null;
    this.dispatchedBuilds = new Set();
    this.buildResults = new Map();
  }

  async dispatch(task) {
    const buildTransport = this.workorder ?? this.agentbuild;
    if (task?.kind === 'product-build' && buildTransport) {
      if (this.buildResults.has(task.id)) {
        return this.buildResults.get(task.id);
      }
      if (this.dispatchedBuilds.has(task.id)) {
        // concurrent in-flight duplicate: don't double-spawn
        return { accepted: true, transport: 'in-flight', task_id: task.id };
      }
      this.dispatchedBuilds.add(task.id);
      let result;
      try {
        result = await buildTransport.dispatch(task);
      } catch (err) {
        // Build attempt failed before/without receipt: record it in the
        // durable outbox so the failure is visible and re-drivable.
        await this.outbox.dispatch({ ...task, status: 'dispatch-failed', error: String(err.message ?? err).slice(0, 300) }).catch(() => {});
        result = { accepted: false, transport: this.workorder ? 'workorder' : 'agentbuild', task_id: task.id, error: String(err.message ?? err).slice(0, 300) };
      }
      this.buildResults.set(task.id, result);
      return result;
    }
    return this.outbox.dispatch(task);
  }
}
