import { EntityType } from '../model/types.js';
import { IdeaPlanner } from '../planner/idea-planner.js';
import { randomId } from '../util/id.js';

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
    const already = new Set(builds.map(b => b.data?.idea_id).filter(Boolean));
    const candidates = ideas.filter(i => !already.has(i.id)).map(i => ({ id: i.id, name: i.name, scores: i.data?.scores ?? {}, data: i.data }));
    const selected = this.planner.select(candidates, { limit, activeCount: active, maxBuilding: this.maxBuilding });
    const dispatched = [];
    for (const idea of selected) {
      const build = { id: randomId('build'), name: `Build ${idea.name}`, idea_id: idea.id, status: 'running', evaluation: idea.evaluation };
      await this.bus.emit('build.started', build);
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
      dispatched.push({ idea: idea.id, build: build.id, task: task.id, dispatch: result });
    }
    return { active_before: active, selected: dispatched };
  }
}
