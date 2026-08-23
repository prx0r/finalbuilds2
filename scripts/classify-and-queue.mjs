/**
 * classify-and-queue.mjs — builds the FULL idea queue.
 *
 * For every registry idea:
 *   1. Classify -> limit_classes (keyword match against chatgpt_limits.json;
 *      deterministic + auditable; LLM refinement later if needed)
 *   2. Stamp hypothesis_parents (H1 always candidate; H2/H3 by class mapping)
 *   3. Instantiate standard acceptance suite (admission ticket)
 *   4. Seed into graph via ControlPlane bus (idempotent upsert)
 *
 * Result: the entire registry becomes an ordered admission queue ranked by
 * cross-rubric score + hypothesis alignment.
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const m = await import('/root/finalbuilds2/src/controller/control-plane.js');
const cp = m.ControlPlane.fromEnv();

const REG = JSON.parse(await fs.readFile('/root/unbundled/registry/ideas.registry.json','utf8'));
const LIMITS = JSON.parse(await fs.readFile('registry/chatgpt_limits.json','utf8')).classes;

const CLASS_KEYWORDS = {
  live_data:                 /price|pricing|availab|current|status|uptime|live|now|rate.limit|stock|weather|listing/i,
  deterministic_verification:/verif|validat|check|confirm|audit|compar|diff|score|eligib|polic/i,
  file_scale_processing:     /pdf|csv|batch|ocr|extract|convert|scan|parse|compress|merge/i,
  real_world_side_effects:   /register|purchase|send|deploy|submit|book|negotiat|cancel|pay/i,
  persistence_time_series:   /track|history|monitor|trend|over time|snapshot|archive|log/i,
  exact_format_output:       /normali[sz]|schema|format|json|xml|conform|canonical|e\.164/i,
};
const CLASS_HYPOTHESES = {
  live_data: ['H1_chatgpt_doomed','H2_agent_convenience'],
  deterministic_verification: ['H1_chatgpt_doomed','H2_agent_convenience'],
  file_scale_processing: ['H1_chatgpt_doomed','H3_subscriptions_dead'],
  real_world_side_effects: ['H2_agent_convenience','H7_micropay_arbitrage'],
  persistence_time_series: ['H2_agent_convenience','H7_micropay_arbitrage'],
  exact_format_output: ['H1_chatgpt_doomed'],
};

const existing = await cp.graph.findEntities({ type: 'Idea' });
const have = new Set(existing.map(i => i.id));

let queued = 0, already = 0;
for (const idea of REG.ideas) {
  const id = idea.id;
  const text = `${idea.name ?? ''} ${idea.what ?? ''} ${idea.problem ?? ''}`;
  const classes = Object.entries(CLASS_KEYWORDS)
    .filter(([,re]) => re.test(text)).map(([c]) => c);
  if (!classes.length) classes.push('deterministic_verification'); // conservative default
  const parents = [...new Set(classes.flatMap(c => CLASS_HYPOTHESES[c] ?? []))];

  // 1. stamp registry record (idempotent)
  idea.limit_classes = idea.limit_classes ?? classes;
  idea.hypothesis_parents = idea.hypothesis_parents ?? parents;

  // 2. standard acceptance suite
  const dir = `/root/finalbuilds2/acceptance/${id}`;
  try { await fs.access(dir); } catch {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/test_accept.py`,
`"""STANDARD alignment contract for ${id}."""
import importlib.util, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
PROD = ROOT / "platform" / "products" / "${id}"
def _load():
    p = PROD / "align.py"
    assert p.exists(), f"missing platform/products/${id}/align.py"
    s = importlib.util.spec_from_file_location("align", p)
    m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
def test_product_dir_exists():
    assert PROD.is_dir() and any(PROD.iterdir()), "product directory empty"
def test_align_demo_ok():
    r = _load().demo()
    assert isinstance(r, dict) and r.get("ok") is True, f"demo not ok: {r}"
`);
  }

  // 3. graph seed (idempotent upsert)
  if (!have.has(id)) {
    await cp.bus.emit('idea.seeded', {
      id, name: idea.name ?? id, generator_id: idea.generator_id ?? 'registry_queue_v1',
      problem: String(idea.what ?? idea.problem ?? '').slice(0, 300),
      scores: idea.scores ?? idea.opportunity_score ? { delta: Math.min(3, Math.round((idea.opportunity_score ?? 12)/8)) } : {},
      artifact_type: idea.artifact_type ?? 'cli',
      limit_classes: classes, hypothesis_parents: parents,
      source: 'registry_queue_v1',
    });
    queued++;
  } else already++;
}
await fs.writeFile('/root/unbundled/registry/ideas.registry.json', JSON.stringify(REG, null, 2));
console.log(JSON.stringify({ queued_new: queued, already_in_graph: already, queue_total: REG.ideas.length }));
process.exit(0);
