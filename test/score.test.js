import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreIdea } from '../src/planner/score.js';

 test('idea scoring clamps fields and applies thresholds', () => {
  assert.equal(scoreIdea({ delta: 3, pain: 3, cost_collapse: 3, composability: 3, evidence: 3, build_leverage: 3 }).decision, 'build-immediately');
  assert.equal(scoreIdea({ delta: 0, pain: 0, cost_collapse: 0, composability: 0, evidence: 0, build_leverage: 10 }).total, 3);
  assert.equal(scoreIdea({ delta: 0, pain: 0, cost_collapse: 0, composability: 0, evidence: 0, build_leverage: 10 }).decision, 'kill');
});
