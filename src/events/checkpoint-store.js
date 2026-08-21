/**
 * Projection checkpoint store — tracks which events have been projected into Hydra.
 * Survives restarts. Enables catch-up after Hydra outage.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export class CheckpointStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async get() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch {
      return { projection: 'hydra-main', last_event_id: null, last_event_time: null, updated_at: null };
    }
  }

  async update(eventId, eventTime) {
    const current = await this.get();
    const updated = {
      ...current,
      last_event_id: eventId,
      last_event_time: eventTime,
      updated_at: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  }

  async reset() {
    const empty = { projection: 'hydra-main', last_event_id: null, last_event_time: null, updated_at: null };
    await fs.writeFile(this.filePath, JSON.stringify(empty, null, 2), 'utf8');
    return empty;
  }
}
