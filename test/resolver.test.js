import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryGraphStore } from '../src/graph/inmemory.js';
import { CapabilityResolver } from '../src/resolver/capability-resolver.js';

 test('resolver retrieves a small relevant capability set instead of all tools', async () => {
  const g = new InMemoryGraphStore();
  await g.upsertEntity({ id: 'domain', type: 'Capability', name: 'domain.check', data: { description: 'live domain availability lookup', tags: ['domain', 'availability'], success_rate: 0.99 } });
  await g.upsertEntity({ id: 'pdf', type: 'Capability', name: 'pdf.metadata', data: { description: 'extract PDF metadata', tags: ['pdf'] } });
  const rows = await new CapabilityResolver(g).search('check domain availability');
  assert.equal(rows[0].capability.id, 'domain');
  assert.equal(rows.length, 1);
});
