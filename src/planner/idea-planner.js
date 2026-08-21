import { scoreIdea } from './score.js';

export class IdeaPlanner {
  constructor({ minBuildScore = 12 } = {}) {
    this.minBuildScore = minBuildScore;
  }

  rank(ideas) {
    return ideas
      .map(idea => ({ ...idea, evaluation: scoreIdea(idea.scores) }))
      .sort((a, b) => b.evaluation.total - a.evaluation.total || a.id.localeCompare(b.id));
  }

  select(ideas, { limit = 1, activeCount = 0, maxBuilding = 2 } = {}) {
    const capacity = Math.max(0, maxBuilding - activeCount);
    return this.rank(ideas)
      .filter(i => i.evaluation.total >= this.minBuildScore)
      .slice(0, Math.min(limit, capacity));
  }
}
