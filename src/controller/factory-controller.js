import { EntityType } from '../model/types.js';
import { IdeaPlanner } from '../planner/idea-planner.js';
import { randomId } from '../util/id.js';
import fs from 'node:fs/promises';

export class FactoryController {
  constructor({ graph, bus, dispatcher, minBuildScore = 12, maxBuilding = 2 }) {
    this.graph = graph;
    this.bus = bus;
    this.dispatcher = dispatcher;
    this.planner = new IdeaPlanner({ minBuildScore });
    this.maxBuilding = maxBuilding;
  }

  async tick({ limit = 1 } = {}) {
    const ideas = await this.graph.findEntities({ type: EntityType.IDEA });
    const builds = await this.graph.findEntities({ type: EntityType.BUILD_RUN });
    const active = builds.filter(b => b.data?.status === 'running').length;
    // only live/completed builds exclude an idea — rejected/failed runs re-admit it
    const already = new Set(builds.filter(b => !['rejected', 'failed'].includes(b.data?.status)).map(b => b.data?.idea_id).filter(Boolean));
    // H1 filter (hypotheses/hypotheses.json): ideas must declare at least one
    // chatgpt_limits class their core job depends on. Unaligned ideas are
    // deprioritized (not blocked) until the registry catches up.
    let limits = [];
    try { limits = JSON.parse(await fs.readFile('/root/finalbuilds2/registry/chatgpt_limits.json', 'utf8')).classes.map(c => c.id); } catch {}
    const candidates = ideas.filter(i => !already.has(i.id)).map(i => {
      const parents = i.data?.hypothesis_parents ?? [];
      const aligned = parents.length > 0 && parents.includes('H1_chatgpt_doomed') && (i.data?.limit_classes ?? []).some(c => limits.includes(c));
      return { id: i.id, name: i.name, scores: i.data?.scores ?? {}, data: i.data, aligned };
    }).sort((a, b) => Number(b.aligned) - Number(a.aligned));
    const selected = this.planner.select(candidates, { limit, activeCount: active, maxBuilding: this.maxBuilding });
    const dispatched = [];
    for (const idea of selected) {
      const build = { id: randomId('build'), name: `Build ${idea.name}`, idea_id: idea.id, status: 'running', evaluation: idea.evaluation };
      await this.bus.emit('build.started', { ...build, status: 'queued' });
      const task = {
        id: randomId('task'),
        title: `Build ${idea.name}`,
        subject_id: idea.id,
        kind: 'product-build',
        risk_class: 2,
        status: 'ready',
        build_run_id: build.id,
        build_brief: {
          idea: idea.data,
          evaluation: idea.evaluation,
          invariant: 'Build only the missing capability delta; reuse shared standards and primitives.'
        }
      };
      await this.bus.emit('task.created', task);
      const result = await this.dispatcher.dispatch(task);
      // status reflects reality only after the dispatcher answers (P2)
      const finalStatus = result.accepted ? 'running' : 'rejected';
      await this.bus.emit(result.accepted ? 'build.started' : 'build.completed', { ...build, status: finalStatus, rejected_reason: result.accepted ? undefined : String(result.error ?? result.transport).slice(0, 200) });
      dispatched.push({ idea: idea.id, build: build.id, task: task.id, dispatch: result });
    }
    return { active_before: active, selected: dispatched };
  }
}
