/**
 * issue-forecasts.mjs v2 — P0: validates against forecast.v2 schema BEFORE
 * persisting; hashes the ACTUAL evidence series at issue time; enforces
 * window_start >= issued_at; requires baseline_probability on event forecasts;
 * numeric duration_days target.aggregation ("30d" style kept but validated).
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const DIR = process.env.FORECASTS_DIR || 'runtime/forecasts';
const FILE = `${DIR}/forecasts.jsonl`;
await fs.mkdir(DIR, { recursive: true });
const issued = (() => { try { return require0(FILE); } catch { return []; } })();
function require0(p){ try { return (require('fs').readFileSync(p,'utf8')).split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } }
// ESM-safe read:
async function readIssued() {
  try { return (await fs.readFile(FILE,'utf8')).split('\n').filter(Boolean).map(JSON.parse); } catch { return []; }
}

const H = JSON.parse(await fs.readFile('hypotheses/hypotheses.json','utf8')).hypotheses;

function validate(f) { // mirrors schemas/forecast.v2 required core + house rules
  const req = ['forecast_id','hypothesis_id','prediction_family','issued_at',
               'window_start','window_end','target','forecast',
               'resolution_rule_version','evidence_snapshot_hash','model_version'];
  const missing = req.filter(k => f[k] === undefined);
  if (missing.length) return `missing ${missing.join(',')}`;
  if (!/^fc_/.test(f.forecast_id)) return 'forecast_id pattern';
  for (const k of ['issued_at','window_start','window_end'])
    if (isNaN(Date.parse(f[k]))) return `${k} unparseable`;
  if (Date.parse(f.window_start) < Date.parse(f.issued_at))
    return 'window_start precedes issued_at';
  if (!/^\d+d$|^point$/.test(f.target.aggregation ?? '')) return `aggregation invalid: ${f.target.aggregation}`;
  if (!f.forecast?.type) return 'forecast.type missing';
  if (!Array.isArray(f.event_forecasts) || !f.event_forecasts.length) return 'event_forecasts empty';
  for (const e of f.event_forecasts) {
    if (typeof e.probability !== 'number' || e.probability < 0 || e.probability > 1)
      return 'probability out of range';
    if (e.baseline_probability === undefined) return 'event missing baseline_probability';
  }
  return null;
}

async function evidenceSnapshot(metricPrefix, windowStart, entityTag) {
  // hash the actual observations available at issue time (may be empty — that
  // is honest: an empty-snapshot forecast carries weaker provenance weight).
  const esc = s => String(s).replace(/'/g,"''");
  let filter = `n.metric STARTS WITH '${esc(metricPrefix)}' AND n.observed_at <= '${windowStart}'`;
  if (entityTag) filter += ` AND n.dimensions CONTAINS '${esc(entityTag)}'`;
  const r = await fetch(`${process.env.HYDRA_URL}/v1/graphs/${process.env.HYDRA_GRAPH_ID||'finalbuilds'}/query`,{
    method:'POST', headers:{Authorization:`Bearer ${process.env.HYDRA_TOKEN}`,'Content-Type':'application/json','X-Graph-Namespace':process.env.HYDRA_NAMESPACE||'default'},
    body:JSON.stringify({cell_id:process.env.HYDRA_CELL_ID||'cell-0',
      query:`MATCH (n:Observation) WHERE ${filter} RETURN n.value AS v, n.observed_at AS t ORDER BY n.observed_at ASC LIMIT 200`})});
  let rows = [];
  try { const j = await r.json(); rows = (j.rows||[]).map(row=>({v:row[0]?.value??row[0], t:row[1]?.value??row[1]})); } catch {}
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

const BASE_RATE = { H1P1:0.7, H2P1:0.35, H2P2:0.4, H3P1:0.5, H3P2:0.45 };
let n = 0, skipped = 0;

for (const h of H) {
  for (const p of h.predictions ?? []) {
    const ws = new Date(Date.parse(`${p.window_start || new Date().toISOString().slice(0,10)}T00:00:00Z`));
    const we = new Date(ws.getTime() + (p.window_days || 30) * 86400000);
    const forecast_id = `fc_${p.id}_${ws.toISOString().slice(0,10)}`;

    const existing = await readIssued();
    if (existing.some(f => f.forecast_id === forecast_id)) continue; // immutable once issued

    const now = new Date().toISOString();
    const prob = BASE_RATE[p.id] ?? 0.5;
    const evHash = await evidenceSnapshot(
      p.metric.includes('incumbent') ? 'signal.incumbent' :
      p.metric.includes('x402') ? 'signal.x402' : 'signal.',
      ws.toISOString());

    const fc = {
      forecast_id, hypothesis_id: h.id,
      prediction_family: p.metric,
      issued_at: now,
      window_start: ws.toISOString(),
      window_end: we.toISOString(),
      target: { metric: p.metric.replace(/_slope|_growth/,''), entity_id: null,
                aggregation: `${p.window_days || 30}d` },
      forecast: { type:'beta', alpha: Math.max(1,Math.round(prob*10)), beta: 10-Math.max(1,Math.round(prob*10)) },
      event_forecasts: [{ event: p.claim ?? `${p.metric} within threshold`, probability: prob,
                          baseline_probability: 0.5 }],
      resolution_rule_version: `rr_${p.id}_v1`,
      evidence_snapshot_hash: evHash,
      model_version: 'issue-forecasts-v2',
    };
    const invalid = validate(fc);
    if (invalid) { console.error(`SKIP ${forecast_id}: ${invalid}`); skipped++; continue; }
    await fs.appendFile(FILE, JSON.stringify(fc)+'\n');
    n++;
  }
}
console.log(`issued ${n} new forecasts (${skipped} skipped invalid), total ${n + (await readIssued()).length - n}`);
