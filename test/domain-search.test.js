import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainSearchEngine } from '../src/domain-search/engine.js';

test('DomainSearchEngine generates candidates', () => {
  const engine = new DomainSearchEngine();
  const candidates = engine.generateCandidates('get', ['com', 'xyz']);
  assert.ok(candidates.length > 50);
  assert.ok(candidates.includes('get200.com'));
  assert.ok(candidates.includes('getapi.com'));
  assert.ok(candidates.includes('get-fn.com'));
});

test('DomainSearchEngine scores domains correctly', () => {
  const engine = new DomainSearchEngine();
  assert.ok(engine.scoreDomain('get200.com', 'get') > engine.scoreDomain('get-super-long-domain.com', 'get'));
  assert.ok(engine.scoreDomain('get.com', 'get') > engine.scoreDomain('get-api.com', 'get'));
});

test('DomainSearchEngine tracks clicks', () => {
  const engine = new DomainSearchEngine();
  engine.queries.set('q1', { concept: 'get' });
  const result = engine.trackClick('q1', 'get200.com');
  assert.equal(result.clicks, 1);
  const result2 = engine.trackClick('q1', 'get200.com');
  assert.equal(result2.clicks, 2);
});

test('DomainSearchEngine returns analytics', () => {
  const engine = new DomainSearchEngine();
  engine.queries.set('q1', { concept: 'get' });
  engine.clicks.set('get200.com', 5);
  engine.clicks.set('get42.com', 3);
  const analytics = engine.getAnalytics();
  assert.equal(analytics.totalQueries, 1);
  assert.equal(analytics.totalClicks, 8);
  assert.equal(analytics.topDomains[0].domain, 'get200.com');
});

test('DomainSearchEngine returns hosting options', () => {
  const engine = new DomainSearchEngine();
  const options = engine.getHostingOptions('get200.com');
  assert.ok(options.length > 0);
  assert.ok(options.some(o => o.provider === 'Cloudflare'));
});
