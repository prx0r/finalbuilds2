/**
 * import-venturelab.mjs — wire venturelab's completed research into Hydra.
 * Imports: 91 scored ideas (idea.created), 16 evidence claims + 72 research
 * entries (research.recorded). Uses canonical envelopes via ControlPlane bus.
 */
const m = await import('/root/finalbuilds2/src/controller/control-plane.js');
const cp = m.ControlPlane.fromEnv();
import fs from 'node:fs/promises';

const VL = '/root/venturelab/data';
const read = async p => (await fs.readFile(p, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);

let ideas, evidence, research;
try { ideas = await read(`${VL}/ideas.jsonl`); } catch { ideas = []; }
try { evidence = await read(`${VL}/evidence.jsonl`); } catch { evidence = []; }
try { research = await read(`${VL}/research.jsonl`); } catch { research = []; }

let ni = 0, nr = 0;
for (const i of ideas) {
  try {
    await cp.bus.emit('idea.created', {
      id: i.idea_id?.toLowerCase() || `vl_${ni}`,
      name: i.idea || i.idea_id,
      generator_id: 'venturelab_deterministic_v1',
      problem: `VentureLab candidate. Scores: ${JSON.stringify(i.scores ?? {})}. Total: ${i.total ?? ''}`,
      scores: i.scores ?? {},
      source: 'venturelab',
    });
    ni++;
  } catch (e) { console.error('idea fail', i.idea_id, e.message.slice(0, 60)); }
}

for (const e of evidence) {
  try {
    await cp.bus.emit('research.recorded', {
      id: `vl_ev_${crypto.randomUUID().slice(0, 8)}`,
      title: `[venturelab] ${e.theme}`,
      source_url: e.source || '',
      finding: e.finding,
      applies_to: e.applies_to || '',
      recorded_at: new Date().toISOString(),
    });
    nr++;
  } catch (err) { console.error('ev fail', err.message.slice(0, 60)); }
}

for (const r of research) {
  try {
    await cp.bus.emit('research.recorded', {
      id: `vl_re_${crypto.randomUUID().slice(0, 8)}`,
      title: r.title || r.topic || '[venturelab research]',
      source_url: r.source || r.url || '',
      finding: r.finding || r.summary || JSON.stringify(r).slice(0, 300),
      recorded_at: new Date().toISOString(),
    });
    nr++;
  } catch (err) { console.error('res fail', err.message.slice(0, 60)); }
}
console.log(JSON.stringify({ ideas_imported: ni, research_evidence_imported: nr }));
process.exit(0);
