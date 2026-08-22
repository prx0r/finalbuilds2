import { projectEvent } from './projector.js';

export class EventBus {
  constructor({ eventStore, graph, dispatcher = null }) {
    this.eventStore = eventStore;
    this.graph = graph;
    this.handlers = new Map();
    // Tasks created anywhere flow to the agent outbox (fire-and-forget:
    // a dispatch failure must not fail the emitting operation).
    if (dispatcher) {
      this.on('task.created', task => dispatcher.dispatch(task).catch(() => {}));
    }
  }

  /** Minimal subscription: handlers run on matching emit. */
  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(handler);
  }

  async emit(type, payload, meta = {}) {
    const event = await this.eventStore.append(type, payload, meta);
    await projectEvent(this.graph, event);
    for (const handler of this.handlers.get(type) ?? []) {
      await handler(event.payload ?? payload);
    }
    return event;
  }
}
