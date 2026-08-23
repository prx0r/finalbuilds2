// Cross-rubric score normalization — every idea source maps to the canonical
// 6-field scale (0..3 each, max 18). Unknown rubrics degrade honestly to zero
// so admission never invents quality.
export const SCORE_FIELDS = Object.freeze([
  'delta',            // how much better than status quo
  'pain',             // how acute the problem
  'cost_collapse',    // how much cheaper to serve than incumbents
  'composability',    // reusable capability / agent-callable
  'evidence',         // demand/usage proof available
  'build_leverage'    // how little new code per outcome
]);

const clamp03 = v => Math.max(0, Math.min(3, Number.isFinite(+v) ? +v : 0));

/** venturelab 10-dim (0-10 each) -> canonical 6 */
function fromVenturelab(s = {}) {
  const avg = (...keys) => {
    const vals = keys.map(k => s[k]).filter(v => v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  return {
    delta:          avg('market_timing') / 3.33,
    pain:           avg('pain_severity', 'wtp') / 3.33,
    cost_collapse:  avg('mvp_buildability') / 3.33,
    composability:  avg('api_fit', 'standards') / 3.33,
    evidence:       avg('whitespace') / 3.33,
    build_leverage: avg('expansion', 'reg_simplicity') / 3.33,
  };
}

/** QDW 10-feature (0-1) -> canonical 6 */
function fromQdw(q = {}) {
  const f = q.features ?? {};
  const g = k => clamp01(f[k]);
  const clamp01 = v => (Number.isFinite(+v) ? Math.max(0, Math.min(1, +v)) : 0);
  return {
    delta:          (g('need') + g('actionability')) / 2 * 3,
    pain:           g('need') * 3,
    cost_collapse:  g('low_integration_cost') * 3,
    composability:  g('artifact_shape_ok') === undefined ? g('low_competition') * 3 : g('low_competition') * 3,
    evidence:       (g('acceptance_ok') || g('real_implementation_ok')) ? 2 : g('low_competition'),
    build_leverage: g('low_integration_cost') * 3,
  };
}
const clamp01 = v => (Number.isFinite(+v) ? Math.max(0, Math.min(1, +v)) : 0);

export function normalizeScores(scores = {}, source) {
  if (!scores || typeof scores !== 'object') return null;
  if (source === 'venturelab' || ('market_timing' in scores && 'wtp' in scores))
    return mapInto(fromVenturelab(scores));
  if (('features' in scores) || ('need' in scores))
    return mapInto(fromQdw(scores));
  // native rubric: pass through known fields only
  if (SCORE_FIELDS.some(f => f in scores))
    return mapInto(Object.fromEntries(SCORE_FIELDS.map(f => [f, clamp03(scores[f])])));
  return null;
}
function mapInto(o) { return Object.fromEntries(SCORE_FIELDS.map(f => [f, clamp03(o[f])])); }

export function scoreIdea(scores = {}, source) {
  const normalized = normalizeScores(scores, source);
  if (!normalized) return { total: 0, max: 18, decision: 'unscored',
    scores: {}, normalized: false };
  const total = Object.values(normalized).reduce((a, b) => a + b, 0);
  const decision = total >= 15 ? 'build-immediately'
                 : total >= 12 ? 'prototype'
                 : total >= 8 ? 'backlog'
                 : 'kill';
  return { total, max: 18, decision, scores: normalized, normalized: true };
}

/** Hypothesis-alignment bonus — makes the layer bite on ordering.
 *  Aligned ideas (declared parents + limit classes within chatgpt_limits)
 *  earn +1.5 evidence; unaligned pay no penalty but sort below aligned peers. */
export function alignmentBonus(ideaData = {}, limitClassIds = []) {
  const parents = ideaData.hypothesis_parents ?? [];
  if (!parents.length) return 0;
  let bonus = 0.5;                                   // declared at all
  if (parents.includes('H1_chatgpt_doomed')) bonus += 0.5;
  if ((ideaData.limit_classes ?? []).some(c => limitClassIds.includes(c))) bonus += 0.5;
  return bonus;
}
