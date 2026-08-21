import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainOracle } from '../src/integrations/domain-oracle.js';
import { PorkbunClient } from '../src/integrations/porkbun/client.js';
import { CloudflareClient } from '../src/integrations/cloudflare/client.js';

test('DomainOracle returns EXPERIMENT for low usage', async () => {
  const oracle = new DomainOracle();
  const decision = await oracle.decide({ slug: 'json-repair' }, { dailyCalls: 5 });
  assert.equal(decision.decision, 'EXPERIMENT');
  assert.equal(decision.level, 0);
  assert.ok(decision.hostname.includes('workers.dev'));
});

test('DomainOracle returns SUBDOMAIN for medium usage', async () => {
  const oracle = new DomainOracle();
  const decision = await oracle.decide({ slug: 'json-repair' }, { dailyCalls: 50 });
  assert.equal(decision.decision, 'SUBDOMAIN');
  assert.equal(decision.level, 1);
  assert.ok(decision.hostname.includes('tinytools.xyz'));
});

test('DomainOracle returns STANDALONE for high usage', async () => {
  const oracle = new DomainOracle();
  const decision = await oracle.decide({ slug: 'json-repair' }, { dailyCalls: 500 });
  assert.equal(decision.decision, 'STANDALONE');
  assert.equal(decision.level, 2);
  assert.ok(decision.candidates.length > 0);
});

test('DomainOracle returns BRAND for very high usage', async () => {
  const oracle = new DomainOracle();
  const decision = await oracle.decide({ slug: 'json-repair' }, { dailyCalls: 5000 });
  assert.equal(decision.decision, 'BRAND');
  assert.equal(decision.level, 3);
});

test('DomainOracle calculates score correctly', async () => {
  const oracle = new DomainOracle();
  const score = oracle.calculateScore({ dailyCalls: 5000, uniqueCallers: 500, revenue: 50 });
  assert.ok(score > 0 && score <= 100);
});

test('DomainOracle generates candidates', async () => {
  const oracle = new DomainOracle();
  const candidates = oracle.generateCandidates('json-repair');
  assert.equal(candidates.length, 4);
  assert.ok(candidates.some(c => c.domain === 'json-repair.xyz'));
});

test('PorkbunClient constructs correctly', () => {
  const client = new PorkbunClient('test-key', 'test-secret', true);
  assert.ok(client.base.includes('sandbox'));
});

test('CloudflareClient constructs correctly', () => {
  const client = new CloudflareClient('test-token', 'test-account');
  assert.equal(client.accountId, 'test-account');
});
