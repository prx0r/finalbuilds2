/** evidence-digest.mjs — export a bounded evidence neighborhood for abduction. */
import fs from 'node:fs/promises';
const m = await import('/root/finalbuilds2/src/controller/control-plane.js');
const cp = m.ControlPlane.fromEnv();
const reports = await cp.graph.findEntities({ type: 'ResearchReport' });
const ideas = await cp.graph.findEntities({ type: 'Idea' });
const digest = {
  generated_at: new Date().toISOString(),
  research_claims: reports.slice(0, 60).map(r => ({
    id: r.id, title: (r.name || '').slice(0, 80),
    finding: String(r.data?.finding ?? '').slice(0, 220),
  })),
  existing_ideas: ideas.map(i => i.id),
};
await fs.writeFile('runtime/evidence-digest.json', JSON.stringify(digest, null, 1));
console.log(`digest: ${digest.research_claims.length} claims, ${digest.existing_ideas.length} existing ideas`);
