/**
 * build-hypothesis-graph.mjs — native HydraDB knowledge graph for hypotheses.
 * Topology: (:HypothesisV2 {string_id})-[:SHRINKS]->(:LimitClass {string_id})
 *
 * Hydra v0.x constraints honored (learned by probe):
 *  - CREATE supports exactly ONE hop: (a)-[:R]->(b). No chained edges.
 *  - No MATCH+CREATE between existing nodes → pairs are co-created.
 *  - Shared classes exist as multiple instances; dedupe by string_id in queries.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const intId = s => crypto.createHash('sha256').update(s).digest().readUIntBE(0, 6);
const q = query => fetch(`${process.env.HYDRA_URL}/v1/graphs/finalbuilds/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.HYDRA_TOKEN}`, 'Content-Type': 'application/json', 'X-Graph-Namespace': process.env.HYDRA_NAMESPACE || 'default' },
  body: JSON.stringify({ cell_id: process.env.HYDRA_CELL_ID || 'cell-0', query }),
}).then(async r => ({ ok: r.ok, body: (await r.text()).slice(0, 150) }));

const CLASSES = JSON.parse(await fs.readFile('registry/chatgpt_limits.json', 'utf8')).classes.map(c => c.id);
const MAP = {
  H1_chatgpt_doomed: CLASSES,
  H2_agent_convenience: ['deterministic_verification', 'exact_format_output', 'live_data'],
  H3_subscriptions_dead: ['persistence_time_series', 'file_scale_processing'],
};

let pairs = 0, fails = 0;
for (const [hid, classes] of Object.entries(MAP)) {
  for (const cid of classes) {
    const h_id = intId(`hyp_${hid}_${cid}`), c_id = intId(`lc_${hid}_${cid}`);
    const { ok, body } = await q(
      `CREATE (h:HypothesisV2 {id: ${h_id}, string_id: '${hid}'})-[:SHRINKS]->(c:LimitClass {id: ${c_id}, string_id: '${cid}'})`);
    if (ok) pairs++; else { fails++; console.error('FAIL', hid, cid, body); }
  }
}
console.log(JSON.stringify({ pairs, fails }));
