import { scoreIdea, alignmentBonus } from './score.js';

const LIMIT_CLASSES = JSON.parse(await (await import('node:fs/promises'))
  .readFile(new URL('../../registry/chatgpt_limits.json', import.meta.url), 'utf8'))
  .classes.map(c => c.id);

export class IdeaPlanner {
  constructor({ minBuildScore = 12 } = {}) {
    this.minBuildScore = minBuildScore;
  }

  rank(ideas) {
    return ideas
      .map(idea => {
        const evaluation = scoreIdea(idea.scores ?? idea.data?.scores, idea.data?.source);
        const alignment = alignmentBonus(idea.data ?? {}, LIMIT_CLASSES);
        // hypothesis layer bites here: aligned ideas outrank equally-scored peers
        return { ...idea, evaluation: { ...evaluation, total: evaluation.total + alignment,
                                        base_total: evaluation.total, alignment_bonus: alignment } };
      })
      .sort((a, b) => b.evaluation.total - a.evaluation.total || a.id.localeCompare(b.id));
  }

  select(ideas, { limit = 1, activeCount = 0, maxBuilding = 2 } = {}) {
    const capacity = Math.max(0, maxBuilding - activeCount);
    return this.rank(ideas)
      .filter(i => i.evaluation.total >= this.minBuildScore)
      .slice(0, Math.min(limit, capacity));
  }
}
