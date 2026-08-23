import fs from 'node:fs/promises';
import crypto from 'node:crypto';
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
    // Cross-process tear guard: multiple writers (server + crons + scripts) share
    // this file. O_APPEND alone tore a line under concurrency (2026-08-23), so
    // serialize appends with a spin lock. Lock is stale-safe: breaks after 5s.
    const lockPath = this.filePath + '.lock';
    const nonce = `${process.pid}-${crypto.randomUUID()}`;
    const deadline = Date.now() + 5000;
    while (true) {
      try {
        await fs.mkdir(lockPath);
        await fs.writeFile(path.join(lockPath,'owner'), nonce, 'utf8'); // ownership record
        break;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        // steal only if stale (>5s) AND we can replace the owner file atomically
        let ownerMtime = 0;
        try { ownerMtime = (await fs.stat(path.join(lockPath,'owner'))).mtimeMs; }
        catch { /* no owner file yet */ }
        if (Date.now() - ownerMtime > 5000) {
          try {
            await fs.rm(lockPath, { recursive: true, force: true });
            continue; // retry acquire immediately
          } catch { /* someone else is managing it */ }
        }
        await new Promise(r => setTimeout(r, 25));
      }
    }
    try {
      await fs.appendFile(this.filePath, `${JSON.stringify(event)}\n`, 'utf8');
    } finally {
      // release only if WE still own it (nonce match)
      try {
        const owner = await fs.readFile(path.join(lockPath,'owner'),'utf8');
        if (owner === nonce) await fs.rm(lockPath, { recursive: true, force: true });
      } catch { /* already released */ }
    }
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

  async getById(eventId) {
    const events = await this.all();
    return events.find(e => e.event_id === eventId) || null;
  }

  async appendEnvelope(event) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    // Cross-process tear guard: multiple writers (server + crons + scripts) share
    // this file. O_APPEND alone tore a line under concurrency (2026-08-23), so
    // serialize appends with a spin lock. Lock is stale-safe: breaks after 5s.
    const lockPath = this.filePath + '.lock';
    const nonce = `${process.pid}-${crypto.randomUUID()}`;
    const deadline = Date.now() + 5000;
    while (true) {
      try {
        await fs.mkdir(lockPath);
        await fs.writeFile(path.join(lockPath,'owner'), nonce, 'utf8'); // ownership record
        break;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        // steal only if stale (>5s) AND we can replace the owner file atomically
        let ownerMtime = 0;
        try { ownerMtime = (await fs.stat(path.join(lockPath,'owner'))).mtimeMs; }
        catch { /* no owner file yet */ }
        if (Date.now() - ownerMtime > 5000) {
          try {
            await fs.rm(lockPath, { recursive: true, force: true });
            continue; // retry acquire immediately
          } catch { /* someone else is managing it */ }
        }
        await new Promise(r => setTimeout(r, 25));
      }
    }
    try {
      await fs.appendFile(this.filePath, `${JSON.stringify(event)}\n`, 'utf8');
    } finally {
      // release only if WE still own it (nonce match)
      try {
        const owner = await fs.readFile(path.join(lockPath,'owner'),'utf8');
        if (owner === nonce) await fs.rm(lockPath, { recursive: true, force: true });
      } catch { /* already released */ }
    }
    return event;
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
