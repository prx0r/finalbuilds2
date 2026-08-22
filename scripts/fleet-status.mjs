#!/usr/bin/env node
/**
 * fleet-status — read-side of observability.
 * Queries live HydraDB for every Site and its latest observations,
 * prints a per-site health table. Read-only.
 */

const HYDRA_URL = process.env.HYDRA_URL || 'http://127.0.0.1:8443';
const TOKEN = process.env.HYDRA_TOKEN || 'local-development-token-32-bytes';
const GRAPH_ID = process.env.HYDRA_GRAPH_ID || 'finalbuilds';
const NAMESPACE = process.env.HYDRA_NAMESPACE || 'default';
const CELL_ID = process.env.HYDRA_CELL_ID || 'cell-0';

async function cypher(query) {
  const res = await fetch(`${HYDRA_URL}/v1/graphs/${GRAPH_ID}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Graph-Namespace': NAMESPACE, Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ cell_id: CELL_ID, query }),
  });
  if (!res.ok) throw new Error(`Hydra ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const raw = await res.json();
  return (raw.rows ?? []).map(row => Object.fromEntries((raw.columns ?? []).map((c, i) => [c, row[i]?.value ?? row[i]])));
}

async function main() {
  const sites = await cypher("MATCH (n:Site) RETURN n.string_id AS id, n.url AS url, n.registered_at AS registered_at");
  const obs = await cypher('MATCH (n:Observation) RETURN n.site_id AS site_id, n.metric AS metric, n.value AS value, n.ok AS ok, n.recorded_at AS recorded_at ORDER BY n.recorded_at DESC LIMIT 2000');

  const latest = new Map();
  for (const o of obs) {
    const key = `${o.site_id}:${o.metric}`;
    if (!latest.has(key)) latest.set(key, o);
  }

  let down = 0;
  for (const site of sites.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    console.log(`\n${site.id}  ${site.url}`);
    const metrics = ['http.status', 'api.calls', 'cf.errors', 'llms_txt.present', 'robots_txt.present'];
    for (const m of metrics) {
      const o = latest.get(`${site.id}:${m}`);
      if (!o) continue;
      if (m === 'http.status') {
        const bad = !(o.value > 0 && o.value < 500);
        if (bad) down++;
        console.log(`   ${m.padEnd(20)} ${String(o.value).padEnd(6)} ${bad ? 'FAIL' : 'ok  '} (${String(o.recorded_at).slice(0, 19)}Z)`);
      } else {
        console.log(`   ${m.padEnd(20)} ${String(o.value).padEnd(6)} (${String(o.recorded_at).slice(0, 19)}Z)`);
      }
    }
    if (!latest.has(`${site.id}:http.status`)) console.log('   no observations yet');
  }
  console.log(`\n${sites.length} sites, ${down} down (latest observations from live HydraDB)`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
