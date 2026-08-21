import { EntityType, RelKind } from '../model/types.js';
import { compareMeans } from './stats.js';

export async function experimentReport(graph, experimentId) {
  const experiment = await graph.getEntity(experimentId);
  if (!experiment || experiment.type !== EntityType.EXPERIMENT) throw new Error(`Unknown experiment ${experimentId}`);
  const armLinks = await graph.neighbors(experimentId, { direction: 'out', kinds: [RelKind.HAS_ARM] });
  const samples = { control: [], treatment: [] };
  const assignments = { control: new Set(), treatment: new Set() };
  for (const { entity: arm } of armLinks) {
    const role = arm.data?.name ?? arm.name;
    const links = await graph.neighbors(arm.id, { direction: 'out', kinds: [RelKind.ASSIGNED_TO] });
    for (const link of links) assignments[role]?.add(link.entity.id);
  }
  const obs = await graph.findEntities({ type: EntityType.OBSERVATION });
  for (const o of obs) {
    if (o.data?.experiment_id !== experimentId) continue;
    const siteId = o.data?.subject_id;
    const value = Number(o.data?.value);
    if (!Number.isFinite(value)) continue;
    if (assignments.control.has(siteId)) samples.control.push(value);
    if (assignments.treatment.has(siteId)) samples.treatment.push(value);
  }
  return { experiment, assignments: { control: [...assignments.control], treatment: [...assignments.treatment] }, samples, comparison: compareMeans(samples.control, samples.treatment) };
}
