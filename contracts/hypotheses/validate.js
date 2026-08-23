/**
 * Dependency-free contract validator for the hypothesis-evolution spine.
 * Deliberately validates hard invariants used at runtime; JSON Schema files remain
 * the machine-readable canonical contracts for richer tooling.
 */
import crypto from 'node:crypto';

export function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function isIso(s) {
  return typeof s === 'string' && !Number.isNaN(Date.parse(s));
}
function errors(...xs) { return xs.flat().filter(Boolean); }

export function validateForecast(f) {
  const e = errors(
    f?.schema_version !== 'forecast.v1' && 'schema_version',
    !f?.forecast_id && 'forecast_id',
    !f?.hypothesis_id && 'hypothesis_id',
    !isIso(f?.issued_at) && 'issued_at',
    !isIso(f?.window_start) && 'window_start',
    !isIso(f?.window_end) && 'window_end',
    f?.window_start >= f?.window_end && 'window_order',
    !f?.target?.metric && 'target.metric',
    !f?.target?.entity_id && 'target.entity_id',
    !f?.resolution_rule_version && 'resolution_rule_version',
    !/^[a-f0-9]{64}$/.test(f?.evidence_snapshot_hash || '') && 'evidence_snapshot_hash'
  );
  const d = f?.predictive_distribution;
  if (!d?.family) e.push('predictive_distribution.family');
  if (d?.family === 'bernoulli' && !(d.probability >= 0 && d.probability <= 1)) e.push('probability');
  return { valid: e.length === 0, errors: e };
}

export function validateResolution(r) {
  const e = errors(
    r?.schema_version !== 'resolution.v1' && 'schema_version',
    !r?.forecast_id && 'forecast_id',
    !/^[a-f0-9]{64}$/.test(r?.resolution_key || '') && 'resolution_key',
    !isIso(r?.resolved_at) && 'resolved_at',
    !r?.rule_version && 'rule_version',
    !Array.isArray(r?.observation_ids) && 'observation_ids'
  );
  return { valid: e.length === 0, errors: e };
}

export function resolutionKey(forecastId, windowEnd, ruleVersion) {
  return sha256(`${forecastId}\n${windowEnd}\n${ruleVersion}`);
}

export function brier(probability, outcome) {
  if (!(probability >= 0 && probability <= 1)) throw new Error('probability must be in [0,1]');
  if (![0,1].includes(outcome)) throw new Error('outcome must be 0 or 1');
  return (probability - outcome) ** 2;
}

export function logScore(probability, outcome, eps = 1e-12) {
  const p = Math.min(1 - eps, Math.max(eps, probability));
  return outcome ? Math.log(p) : Math.log(1 - p);
}
