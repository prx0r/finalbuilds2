/**
 * issue-forecasts.mjs — issues immutable Forecast v2 objects from
 * hypotheses.json predictions. Append-only: runtime/forecasts/forecasts.jsonl.
 * Idempotent per (hypothesis, family, window_start): duplicates skipped.
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const DIR = 'runtime/forecasts';
const FILE = `${DIR}/forecasts.jsonl`;
await fs.mkdir(DIR, { recursive: true });
let issued = [];
try { issued = (await fs.readFile(FILE, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); } catch {}

const H = JSON.parse(await fs.readFile('hypotheses/hypotheses.json', 'utf8')).hypotheses;
const now = new Date().toISOString();
let n = 0;

for (const h of H) {
  for (const p of h.predictions ?? []) {
    const ws = new Date(Date.parse(`${p.window_start || now.slice(0, 10)}T00:00:00Z`));
    const we = new Date(ws.getTime() + (p.window_days || 30) * 86400000);
    const forecast_id = `fc_${p.id}_${ws.toISOString().slice(0, 10)}`;
    if (issued.some(f => f.forecast_id === forecast_id)) continue;
    // event probability: rubric-informed prior until usage middleware exists.
    // H1/H2 usage predictions: base rate 0.3 (most new products plateau).
    const prob = { H1P1: 0.7, H2P1: 0.35, H2P2: 0.4, H3P1: 0.5, H3P2: 0.45 }[p.id] ?? 0.5;
    const fc = {
      forecast_id,
      hypothesis_id: h.id,
      prediction_family: p.metric,
      issued_at: now,
      window_start: ws.toISOString(),
      window_end: we.toISOString(),
      target: { metric: p.metric.replace(/_slope|_growth/, ''), entity_id: null, aggregation: `${p.window_days || 30}d` },
      forecast: { type: 'beta', alpha: Math.round(prob * 10), beta: 10 - Math.round(prob * 10) },
      event_forecasts: [{ event: p.claim, probability: prob }],
      resolution_rule_version: `rr_${p.id}_v1`,
      evidence_snapshot_hash: crypto.createHash('sha256').update(JSON.stringify({ id: p.id, at: ws })).digest('hex').slice(0, 16),
      model_version: 'issue-forecasts-v1',
    };
    await fs.appendFile(FILE, JSON.stringify(fc) + '\n');
    n++;
  }
}
console.log(`issued ${n} forecasts (total ${issued.length + n})`);
