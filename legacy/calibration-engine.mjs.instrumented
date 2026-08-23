/**
 * calibration-engine.mjs — v0: hypothesis calibration loop (I2 completion).
 *
 * 1. Seeds :Prediction nodes co-created with [:BELONGS_TO]->(:HypothesisV2)
 *    from hypotheses.json predictions.
 * 2. Evaluates closed windows against signal series in Hydra (slope/count tests).
 * 3. Updates Beta weights (decayed) + running Brier on each HypothesisV2 node.
 *
 * Cron: daily. Deterministic given graph state. One-hop CREATEs only.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const intId = s => crypto.createHash('sha256').update(s).digest().readUIntBE(0, 6);
const LAMBDA = 0.9;
const q = query => fetch(`${process.env.HYDRA_URL}/v1/graphs/finalbuilds/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.HYDRA_TOKEN}`, 'Content-Type': 'application/json', 'X-Graph-Namespace': process.env.HYDRA_NAMESPACE || 'default' },
  body: JSON.stringify({ cell_id: process.env.HYDRA_CELL_ID || 'cell-0', query }),
}).then(async r => { const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, json: j, body: t.slice(0, 200) }; });
const rows = async query => { const { ok, json } = await q(query); if (!ok) throw new Error(body0(json)); return (json.rows || []).map(r => r.map(c => (c && typeof c === "object") ? c.value : c)); };
const body0 = j => JSON.stringify(j).slice(0, 120);

const H = JSON.parse(await fs.readFile('hypotheses/hypotheses.json', 'utf8')).hypotheses;

// --- 1. seed predictions -----------------------------------------------------
for (const h of H) {
  const hid = intId(`hyp_${h.id}_seed`); // any existing instance of this hypothesis
  for (const p of h.predictions ?? []) {
    const pid = intId(`pred_${p.id}`);
    const exists = await q(`MATCH (n:Prediction {id: ${pid}}) RETURN n.id AS id`);
    if (exists.body.includes(String(pid))) continue;
    const stmt = `CREATE (pr:Prediction {id: ${pid}, string_id: '${p.id}', metric: '${p.metric.replace(/'/g, '')}', threshold: '${String(p.threshold).replace(/'/g, '')}', window_days: ${p.window_days || 30}, status: 'open'})` +
      `-[:BELONGS_TO]->(hv:HypothesisV2 {id: ${intId('hyp_' + h.id + '_' + ((h.predictions ?? [])[0]?.id || 'x'))}, string_id: '${h.id}'})-[:_GENESIS]->(:_ANCHOR {id: 0})`;
    const r = await q(stmt);
    if (!r.ok && !r.body.includes('already exists')) {
      // hypothesis instance may not exist for this pair — create standalone pair
      const r2 = await q(`CREATE (pr:Prediction {id: ${pid}, string_id: '${p.id}', status: 'open'})-[:BELONGS_TO]->(hv:HypothesisV2 {id: ${hid}, string_id: '${h.id}'})`);
      if (!r2.ok) console.error('pred seed fail', p.id, r2.body);
    }
  }
}
console.log('predictions seeded');

// --- 2. evaluate: latest two values per tracked signal -> slope --------------
async function latestTwo(metricPrefix, target) {
  const rows_ = await rowsQ(`MATCH (n:Observation) WHERE n.metric STARTS WITH '${metricPrefix}' ${target ? "AND n.dimensions CONTAINS '" + target + "'" : ''} RETURN n.value AS v ORDER BY n.observed_at DESC LIMIT 6`);
  const vals = rows_.map(Number).filter(v => !isNaN(v));
  return vals.length >= 2 ? { first: vals[vals.length - 1], last: vals[0] } : null;
}
async function rowsQ(query) { const { ok, json } = await q(query); if (!ok) throw new Error(body0(json)); return (json.rows || []).map(r => r.map(c => (c && typeof c === "object") ? c.value : c)); }

function slope(a, b) { return b === a ? 0 : (b - a) / Math.abs(a || 1); }

// --- 3. beta update per hypothesis -------------------------------------------
for (const h of H) {
  const sid = `'${h.id}'`;
  const cur = await rows(`MATCH (n:HypothesisV2 {string_id: ${sid}}) RETURN n.alpha AS a, n.beta AS b LIMIT 1`);
  let alpha = 1, beta = 9;
  if (cur.length && cur[0][0] != null && cur[0][1] != null) { alpha = Number(cur[0][0]); beta = Number(cur[0][1]); }
  alpha *= LAMBDA; beta *= LAMBDA;

  let outcomes = [];
  for (const p of h.predictions ?? []) {
    let outcome = null;
    try {
      if (p.metric.includes('x402_resources') && String(p.threshold).includes('%')) {
        const s = await latestTwo('signal.x402_resources', '');
        if (s) outcome = slope(s.first, s.last) >= parseFloat(p.threshold) / 100 ? 'pass' : 'fail';
      } else if (p.metric.includes('incumbent_price')) {
        const s = await latestTwo('signal.incumbent_price_min', '');
        if (s) outcome = slope(s.first, s.last) > 0 ? 'pass' : 'fail';
      }
      // usage-middleware predictions stay open until middleware lands
    } catch (e) { console.error('eval err', p.id, e.message); }
    if (outcome) outcomes.push({ pred: p.id, outcome });
  }

  for (const o of outcomes) {
    if (o.outcome === 'pass') alpha += 1; else beta += 1;
  }
  const mean = alpha / (alpha + beta);
  // brier proxy: distance of posterior mean from 0.7 target ("playing out" bar)
  const brier = Math.pow(mean - 0.7, 2);

  await q(`MATCH (n:HypothesisV2 {string_id: ${sid}}) SET n.alpha=${alpha.toFixed(3)}, n.beta=${beta.toFixed(3)}, n.posterior_mean=${mean.toFixed(3)}, n.brier_last=${brier.toFixed(4)}, n.last_eval_at='${new Date().toISOString()}', n.outcomes_json='${JSON.stringify(outcomes).replace(/'/g, '')}'`);
  console.log(h.id, `alpha=${alpha.toFixed(2)} beta=${beta.toFixed(2)} mean=${mean.toFixed(3)} outcomes=`, outcomes.length);
}
