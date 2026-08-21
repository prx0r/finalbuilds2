import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryGraphStore } from '../src/graph/inmemory.js';

 test('graph stores entities, edges and bounded paths', async () => {
  const g = new InMemoryGraphStore();
  await g.upsertEntity({ id: 'a', type: 'A', data: {} });
  await g.upsertEntity({ id: 'b', type: 'B', data: {} });
  await g.upsertEntity({ id: 'c', type: 'C', data: {} });
  await g.link('a', 'NEXT', 'b');
  await g.link('b', 'NEXT', 'c');
  const paths = await g.findPaths('a', { maxDepth: 3, predicate: e => e.id === 'c' });
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0].path, ['a', 'b', 'c']);
});
