/**
 * convergence-detector.mjs — data-first hypothesis generation (I2 completion).
 *
 * Thesis: a hypothesis is not authored; it CRYSTALLIZES where independent
 * evidence overlaps. This tool scans accumulated evidence in Hydra, computes
 * convergence per niche, and emits :ClusterCandidate nodes when density +
 * triangulation cross thresholds. Candidates are the induction queue for
 * schema-constrained LLM hypothesis drafting (grounded: must cite evidence).
 *
 * Convergence features per niche:
 *   evidence_count        total observations
 *   families              distinct metric families (triangulation)
 *   sensors               distinct sources
 *   series_depth          max points in any single series (time depth)
 *   recency_days          since newest evidence
 *
 * Fire rule v0: evidence_count >= 6 AND families >= 2 AND recency <= 30d.
 */
import crypto from 'node:crypto';
const m = await import('/root/finalbuilds2/src/controller/control-plane.js');
const cp = m.ControlPlane.fromEnv();
import fs from 'node:fs/promises';
const q = query => fetch(`${process.env.HYDRA_URL}/v1/graphs/finalbuilds/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${process.env.HYDRA_TOKEN}`, 'Content-Type': 'application/json', 'X-Graph-Namespace': process.env.HYDRA_NAMESPACE || 'default' },
  body: JSON.stringify({ cell_id: process.env.HYDRA_CELL_ID || 'cell-0', query }),
}).then(async r => ({ ok: r.ok, body: (await r.text()).slice(0, 160) }));

const obs = await cp.graph.findEntities({ type: 'Observation' });
const niches = {};
for (const o of obs) {
  const d = o.data || {};
  const metric = String(d.metric || o.name || '');
  if (!metric.startsWith('signal.') && !metric.startsWith('usage.')) continue;
  const niche = d.dimensions?.target || null;
  if (!niche) continue;
  const fam = metric.split('.').slice(0, 2).join('.');
  const k = niche;
  niches[k] = niches[k] || { evidence_ids: [], families: new Set(), sensors: new Set(), latest: '', series_max: {} };
  const n = niches[k];
  n.evidence_ids.push(o.id);
  n.families.add(fam);
  if (d.sensor_id) n.sensors.add(d.sensor_id);
  const sk = `${metric}`;
  n.series_max[sk] = Math.max(n.series_max[sk] || 0, 1);
  if (d.observed_at > n.latest) n.latest = d.observed_at;
}

const NOW = Date.now();
let fired = 0, scanned = 0;
for (const [niche, ev] of Object.entries(niches)) {
  scanned++;
  const features = {
    evidence_count: ev.evidence_ids.length,
    families: [...ev.families],
    sensor_count: ev.sensors.size,
    recency_days: Math.round((NOW - Date.parse(ev.latest)) / 86400000),
  };
  const fire = features.evidence_count >= 6 && features.families.length >= 2 && features.recency_days <= 30;
  const cid = 'cand_' + crypto.createHash('sha256').update(niche + ev.latest).digest('hex').slice(0, 12);
  if (!(features.evidence_count >= 6 && features.families.length >= 2 && features.recency_days <= 30)) continue;
  const create = `CREATE (n:ClusterCandidate {id: ${intId(cid)}, string_id: '${cid}', niche: '${niche.replace(/'/g, '')}', evidence_count: ${features.evidence_count}, families: '${[...ev.families].join(',')}', sensor_count: ${features.sensor_count}, cited_evidence: '${ev.evidence_ids.slice(0, 20).join(',')}', status: 'open_for_induction'})`;
  const r = await q(create);
  if (r.ok) { fired++; console.log(`CLUSTER FIRED: ${niche} (${JSON.stringify(features)})`); }
}
console.log(JSON.stringify({ scanned, fired, note: 'candidates below threshold accumulate silently; check daily' }));

function intId(s) { return crypto.createHash('sha256').update(s).digest().readUIntBE(0, 6); }
