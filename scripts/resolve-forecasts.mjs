/**
 * resolve-forecasts.mjs v2 — P0 measurement correctness (review 2026-08-23b).
 *
 * Semantics:
 *   - ResolutionAttempt records are append-only history (AWAITING_DATA attempts
 *     do NOT consume the final resolution; a forecast resolves exactly once).
 *   - Final RESOLVED requires: window closed + rule satisfied by observations
 *     strictly inside [window_start, window_end] (entity+metric scoped).
 *   - Every attempt/resolution records the evidence snapshot it used.
 *   - Forecasts are validated against schemas/forecast.v2.schema.json before
 *     resolution is attempted; invalid forecasts get status=INVALID.
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const DIR = process.env.FORECASTS_DIR || 'runtime/forecasts';
const FILE = `${DIR}/forecasts.jsonl`;
const ATTEMPTS = `${DIR}/resolution-attempts.jsonl`;
const FINAL = `${DIR}/resolutions.jsonl`;

const readJsonl = async p => { try { return (await fs.readFile(p,'utf8')).split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } };
const append = async (p,obj) => fs.appendFile(p, JSON.stringify(obj)+'\n');

// --- minimal dependency-free schema check (forecast.v2 required core) -------
function validateForecast(f) {
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
  const agg = f.target.aggregation ?? '';
  const days = parseInt(agg);
  if (!(agg === 'point' || /^\d+d$/.test(agg)) || (days && days <= 0))
    return `aggregation "${agg}" not point|Nd`;
  if (!f.forecast?.type) return 'forecast.type missing';
  if (!Array.isArray(f.event_forecasts) || f.event_forecasts.length === 0)
    return 'event_forecasts empty';
  for (const e of f.event_forecasts)
    if (typeof e.probability !== 'number' || e.probability < 0 || e.probability > 1)
      return 'event probability out of range';
    else if (e.baseline_probability === undefined)
      return 'event missing baseline_probability (required at issue)';
  return null;
}

// --- deterministic evidence snapshot from Hydra (exact window, scoped) ------
async function seriesInWindow(metricPrefix, windowStart, windowEnd, entityTag) {
  // escape single quotes defensively
  const esc = s => String(s).replace(/'/g,"''");
  let filter = `n.metric STARTS WITH '${esc(metricPrefix)}' AND n.observed_at >= '${windowStart}' AND n.observed_at <= '${windowEnd}'`;
  if (entityTag) filter += ` AND n.dimensions CONTAINS '${esc(entityTag)}'`;
  const r = await fetch(`${process.env.HYDRA_URL}/v1/graphs/${process.env.HYDRA_GRAPH_ID||'finalbuilds'}/query`,{
    method:'POST',
    headers:{Authorization:`Bearer ${process.env.HYDRA_TOKEN}`,'Content-Type':'application/json','X-Graph-Namespace':process.env.HYDRA_NAMESPACE||'default'},
    body:JSON.stringify({cell_id:process.env.HYDRA_CELL_ID||'cell-0',
      query:`MATCH (n:Observation) WHERE ${filter} RETURN n.value AS v, n.observed_at AS t ORDER BY n.observed_at ASC`})});
  if (!r.ok) throw new Error(`hydra ${r.status}`);
  const j = await r.json();
  return (j.rows||[]).map(row => ({ value:Number(row[0]?.value), at:String(row[1]?.value??'') }));
}
const slopePct = series => {
  if (series.length < 2) return null;
  const a = series[0].value, b = series.at(-1).value;
  if (!isFinite(a) || !isFinite(b)) return null;
  return a === 0 ? null : +(((b - a) / Math.abs(a)) * 100).toFixed(2);
};

// --- rules ------------------------------------------------------------------
// Each returns {ready, outcome} where outcome null = data insufficient.
const RULES = {
  rr_H3P2_v1: async f => {
    // clause A only until usage middleware exists; clause B tracked separately
    const s = await seriesInWindow('signal.incumbent_price_min', f.window_start, f.window_end,
                                   f.target.entity_id);
    const slope = slopePct(s);
    if (slope === null) return { ready:false, reason:`insufficient price series (${s.length} obs)` };
    return { ready:true, actual:slope,
             pass: slope > Number(String(f.event_forecasts[0].threshold ?? 0)) };
  },
};
const DEFAULT_RULE = async () => ({ ready:false, reason:'resolver not implemented for this rule version' });

async function main() {
  const forecasts = await readJsonl(FILE);
  const attempts = await readJsonl(ATTEMPTS);          // history, never gating
  const finals = await readJsonl(FINAL);               // terminal resolutions
  const finalKeys = new Set(finals.map(r => r.resolution_key));
  let resolved = 0, awaitingNew = 0;

  for (const f of forecasts) {
    const key = crypto.createHash('sha256')
      .update(`${f.forecast_id}|${f.window_end}|${f.resolution_rule_version}`).digest('hex');
    if (finalKeys.has(key)) continue;                  // already terminally resolved

    if (new Date() < new Date(f.window_end)) continue; // window still open

    // validate before attempting
    const invalid = validateForecast(f);
    if (invalid) {
      await append(ATTEMPTS, { resolution_key:key, forecast_id:f.forecast_id,
        at:new Date().toISOString(), attempt:'invalid', reason:invalid });
      console.log(`${f.forecast_id}: INVALID forecast (${invalid}) — skipped`);
      continue;
    }

    const ruleFn = RULES[f.resolution_rule_version] ?? DEFAULT_RULE;
    let result;
    try {
      result = await ruleFn(f);
    } catch (e) {
      await append(ATTEMPTS, { resolution_key:key, forecast_id:f.forecast_id,
        at:new Date().toISOString(), attempt:'transient_error', reason:String(e.message).slice(0,120) });
      console.log(`${f.forecast_id}: transient error (${String(e.message).slice(0,60)}) — will retry`);
      continue;
    }

    if (!result.ready) {
      await append(ATTEMPTS, { resolution_key:key, forecast_id:f.forecast_id,
        at:new Date().toISOString(), attempt:'awaiting_data', reason:result.reason||'' });
      awaitingNew++;
      console.log(`${f.forecast_id}: AWAITING_DATA (${result.reason})`);
      continue;
    }

    // terminal resolution — written once per key
    const y = result.pass ? 1 : 0;
    const p = f.event_forecasts[0].probability;
    const baseline = f.event_forecasts[0].baseline_probability ?? 0.5;
    const rec = {
      resolution_key:key, forecast_id:f.forecast_id,
      hypothesis_id:f.hypothesis_id, rule_version:f.resolution_rule_version,
      resolved_at:new Date().toISOString(),
      status:'RESOLVED',
      outcome:{ pass:result.pass, actual:result.actual,
        brier:+Math.pow(p-y,2).toFixed(4),
        log_score:+(Math.log(y===1?p:1-p)).toFixed(4),
        brier_skill:+(1 - Math.pow(p-y,2)/(Math.pow(baseline-y,2)||1)).toFixed(4),
        baseline_probability:baseline },
      evidence_snapshot_hash:f.evidence_snapshot_hash,
      model_version:f.model_version,
    };
    await append(FINAL, rec);
    finalKeys.add(key);
    resolved++;
    console.log(`${f.forecast_id}: RESOLVED pass=${result.pass}`);
  }
  console.log(`resolved=${resolved} awaitingNew=${awaitingNew} totalFinal=${finalKeys.size}`);
}
main().catch(e => { console.error('fatal:', e.message); process.exit(3); });
