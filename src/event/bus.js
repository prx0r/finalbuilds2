import { projectEvent } from './projector.js';

export class EventBus {
  constructor({ eventStore, graph }) {
    this.eventStore = eventStore;
    this.graph = graph;
  }

  async emit(type, payload, meta = {}) {
    const event = await this.eventStore.append(type, payload, meta);
    await projectEvent(this.graph, event);
    return event;
  }
}
