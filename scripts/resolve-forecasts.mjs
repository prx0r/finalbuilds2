/**
 * resolve-forecasts.mjs — idempotent resolution (v1 rules).
 *
 * resolution_key = sha256(forecast_id + window_end + rule_version).
 * One resolution per key, ever: reruns produce ZERO state change.
 * Rules implemented:
 *   rr_H3P2_v1 : incumbent_price_min slope > 0 over exact window (clause A).
 *                clause B (platform usage slope) -> AWAITING_DATA until middleware.
 *   usage-based rules (H1P1/H2P1/H2P2/H3P1) -> AWAITING_DATA(usage_middleware).
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const DIR = process.env.FORECASTS_DIR || 'runtime/forecasts';
const FILE = `${DIR}/forecasts.jsonl`;
const RES = `${DIR}/resolutions.jsonl`;
const readLinesRaw = p => { try { return fs0.readFileSync(p,'utf8').split('\n'); } catch { return []; } };
const token = (() => { let t=''; for (const l of readLinesRaw('.env')) if (l.startsWith('CONTROL_TOKEN=')) t=l.split('=')[1].trim(); return t; })();
import fs0 from 'node:fs';
const readLines = p => { try { return fs0.readFileSync(p,'utf8').split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } };
const lines = p => readLines(p);

const q = async query => {
  const r = await fetch(`${process.env.HYDRA_URL}/v1/graphs/finalbuilds/query`, {
    method:'POST', headers:{Authorization:`Bearer ${process.env.HYDRA_TOKEN}`,'Content-Type':'application/json','X-Graph-Namespace':process.env.HYDRA_NAMESPACE||'default'},
    body: JSON.stringify({cell_id:process.env.HYDRA_CELL_ID||'cell-0',query})});
  const j = await r.json();
  return (j.rows||[]).map(row=>row.map(c=>(c&&typeof c==='object')?c.value:c));
};
const seriesInWindow = async (metric, w) => rows(`MATCH (n:Observation) WHERE n.metric STARTS WITH '${metric}' AND n.observed_at >= '${w.window_start}' AND n.observed_at <= '${w.window_end}' RETURN n.value AS v, n.observed_at AS t ORDER BY n.observed_at ASC`);

const brier = (p,y)=>+( (p-y)**2 ).toFixed(4);
const logsc = (p,y)=>+(Math.log(y===1?p:1-p)).toFixed(4);

let resolutions = [];
try { resolutions = [...lines(RES)]; } catch {}
await fs.mkdir(DIR,{recursive:true});
const keys = new Set(resolutions.map(r=>r.resolution_key));
let n=0;

for (const f of [...lines(FILE)]) {
  const key = crypto.createHash('sha256').update(f.forecast_id+f.window_end+f.resolution_rule_version).digest('hex');
  if (keys.has(key)) continue;
  const now = new Date();
  const rule = f.resolution_rule_version;

  if (now < new Date(f.window_end)) continue; // window still open

  if (rule === 'rr_H3P2_v1') {
    const s = await seriesInWindow('signal.incumbent_price_min', f);
    if (!s || s.length < 2) { resolutions.push({resolution_key:key,forecast_id:f.forecast_id,resolved_at:now.toISOString(),rule_version:rule,status:'AWAITING_DATA',outcome:null,notes:'need >=2 price observations in window'}); }
    else {
      const slope = (s.at(-1)[0]-s[0][0])/(Math.abs(s[0][0])||1);
      // clause B requires platform usage slope — not yet instrumented
      resolutions.push({resolution_key:key,forecast_id:f.forecast_id,resolved_at:now.toISOString(),rule_version:rule,
        status:'AWAITING_DATA',
        outcome:{actual:slope,brier:null,log_score:null,baseline_probability:null,brier_skill:null,
                 reason:'clause A measured; clause B awaits usage middleware'}});
    }
  } else if (rule.startsWith('rr_H1P1')||rule.startsWith('rr_H2P')||rule.startsWith('rr_H3P1')) {
    resolutions.push({resolution_key:key,forecast_id:f.forecast_id,resolved_at:now.toISOString(),rule_version:rule,
      status:'AWAITING_DATA',outcome:{reason:'usage_middleware_not_deployed'}});
  } else {
    resolutions.push({resolution_key:key,forecast_id:f.forecast_id,resolved_at:now.toISOString(),rule_version:rule,
      status:'AWAITING_DATA',outcome:{reason:`no resolver implemented for ${rule}`}});
  }
  await fs.appendFile(RES, JSON.stringify(resolutions.at(-1))+'\n');
  n++;
}
console.log(`resolved/annotated ${n} forecasts (idempotent: ${keys.size} pre-existing keys honored)`);
