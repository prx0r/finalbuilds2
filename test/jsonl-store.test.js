import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonlEventStore } from '../src/event/jsonl-store.js';

 test('JSONL event store persists immutable event sequence', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'finalbuilds-events-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = new JsonlEventStore(path.join(dir, 'events.jsonl'));
  await store.append('x', { n: 1 });
  await store.append('y', { n: 2 });
  const events = await store.all();
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(e => e.type), ['x', 'y']);
  assert.notEqual(events[0].event_id, events[1].event_id);
});
