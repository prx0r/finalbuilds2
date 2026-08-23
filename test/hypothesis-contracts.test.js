import test from 'node:test';
import assert from 'node:assert/strict';
import { validateForecast, resolutionKey, brier, logScore } from '../contracts/hypotheses/validate.js';

const h64 = 'a'.repeat(64);
const forecast = {
  schema_version: 'forecast.v1',
  forecast_id: 'fc_H2P1_site_x_20260823',
  hypothesis_id: 'H2_agent_convenience',
  issued_at: '2026-08-23T07:00:00Z',
  window_start: '2026-08-24T00:00:00Z',
  window_end: '2026-09-23T00:00:00Z',
  target: { metric: 'api_to_web_ratio', entity_id: 'site_x', aggregation: '30d' },
  predictive_distribution: { family: 'bernoulli', event: 'ratio >= 3', probability: 0.7 },
  resolution_rule_version: 'usage_ratio_v1',
  evidence_snapshot_hash: h64,
  baseline_forecast_id: null,
  model_version: null
};

test('forecast contract accepts valid forecast', () => {
  assert.deepEqual(validateForecast(forecast), { valid: true, errors: [] });
});

test('forecast contract rejects inverted window', () => {
  const bad = { ...forecast, window_start: '2026-10-01T00:00:00Z' };
  assert.equal(validateForecast(bad).valid, false);
});

test('resolution key is deterministic and idempotent', () => {
  const a = resolutionKey(forecast.forecast_id, forecast.window_end, forecast.resolution_rule_version);
  const b = resolutionKey(forecast.forecast_id, forecast.window_end, forecast.resolution_rule_version);
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
});

test('Brier is a proper binary forecast score implementation', () => {
  assert.ok(Math.abs(brier(0.7, 1) - 0.09) < 1e-12);
  assert.ok(Math.abs(brier(0.7, 0) - 0.49) < 1e-12);
});

test('log score rewards the more accurate probability', () => {
  assert.ok(logScore(0.9, 1) > logScore(0.6, 1));
});
