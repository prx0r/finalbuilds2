export const SCORE_FIELDS = Object.freeze([
  'delta',
  'pain',
  'cost_collapse',
  'composability',
  'evidence',
  'build_leverage'
]);

export function scoreIdea(scores = {}) {
  const normalized = {};
  for (const field of SCORE_FIELDS) {
    const value = Number(scores[field] ?? 0);
    normalized[field] = Math.max(0, Math.min(3, Number.isFinite(value) ? value : 0));
  }
  const total = Object.values(normalized).reduce((a, b) => a + b, 0);
  const decision = total >= 15 ? 'build-immediately' : total >= 12 ? 'prototype' : total >= 8 ? 'backlog' : 'kill';
  return { total, max: 18, decision, scores: normalized };
}
