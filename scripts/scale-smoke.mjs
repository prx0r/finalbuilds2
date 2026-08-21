import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { InMemoryGraphStore } from '../src/graph/inmemory.js';
import { CapabilityResolver } from '../src/resolver/capability-resolver.js';

const graph = new InMemoryGraphStore();
const total = 10_000;
const started = performance.now();
for (let i = 0; i < total; i++) {
  const special = i === 7321;
  await graph.upsertEntity({
    id: `cap-${i}`,
    type: 'Capability',
    name: special ? 'domain.authoritative_availability' : `utility.capability_${i}`,
    data: {
      description: special ? 'authoritative live domain availability and registrar verification' : `generic deterministic utility ${i}`,
      tags: special ? ['domain', 'availability', 'registrar'] : ['utility'],
      success_rate: 0.99,
      marginal_cost_usd: 0
    }
  });
}
const buildMs = performance.now() - started;
const resolver = new CapabilityResolver(graph);
const q0 = performance.now();
const rows = await resolver.search('live domain availability registrar', { limit: 8 });
const queryMs = performance.now() - q0;
assert.equal(rows[0].capability.id, 'cap-7321');
assert.equal(rows.length, 1);
console.log(JSON.stringify({ ok: true, capabilities: total, build_ms: Math.round(buildMs * 100) / 100, resolve_ms: Math.round(queryMs * 100) / 100, top: rows[0].capability.id }, null, 2));
