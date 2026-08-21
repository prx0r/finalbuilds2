import fs from 'node:fs/promises';
import path from 'node:path';
import { randomId } from '../util/id.js';
import { nowIso } from '../util/time.js';

export class JsonlEventStore {
  constructor(filePath = 'runtime/events.jsonl', { clock } = {}) {
    this.filePath = filePath;
    this.clock = clock;
  }

  async append(type, payload, meta = {}) {
    const event = {
      event_id: randomId('evt'),
      type,
      at: nowIso(this.clock),
      payload: structuredClone(payload),
      meta: structuredClone(meta)
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(event)}\n`, 'utf8');
    return event;
  }

  async all() {
    try {
      const text = await fs.readFile(this.filePath, 'utf8');
      return text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async reset() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, '', 'utf8');
  }
}

export class InMemoryEventStore {
  constructor({ clock } = {}) { this.events = []; this.clock = clock; }
  async append(type, payload, meta = {}) {
    const event = { event_id: randomId('evt'), type, at: nowIso(this.clock), payload: structuredClone(payload), meta: structuredClone(meta) };
    this.events.push(event);
    return structuredClone(event);
  }
  async all() { return structuredClone(this.events); }
  async reset() { this.events = []; }
}
