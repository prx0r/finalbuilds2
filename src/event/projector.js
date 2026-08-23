import { EntityType, RelKind } from '../model/types.js';

/** Keep only the listed keys (graph nodes store scalars, not documents). */
function slim(obj, keys) {
  return Object.fromEntries(keys.filter(k => obj?.[k] !== undefined).map(k => [k, obj[k]]));
}

export async function projectEvent(graph, event) {
  const p = event.payload ?? {};
  switch (event.type) {
    case 'idea.generator.registered':
      await graph.upsertEntity({ id: p.id, type: EntityType.IDEA_GENERATOR, name: p.name, data: { ...p, registered_at: event.at } });
      break;
    case 'idea.seeded':
      await graph.upsertEntity({ id: p.id, type: EntityType.IDEA, name: p.name, data: { ...p, seeded_at: event.at } });
      if (p.generator_id) await graph.link(p.generator_id, RelKind.GENERATED, p.id, { at: event.at });
      break;
    case 'research.recorded':
      await graph.upsertEntity({ id: p.id, type: EntityType.RESEARCH_REPORT, name: p.title, data: { ...p, recorded_at: event.at } });
      if (p.idea_id) await graph.link(p.idea_id, RelKind.RESEARCHED_BY, p.id, { at: event.at });
      if (p.supports_standard_version_id) await graph.link(p.id, RelKind.SUPPORTS, p.supports_standard_version_id, { at: event.at });
      break;
    case 'capability.defined':
      await graph.upsertEntity({ id: p.id, type: EntityType.CAPABILITY, name: p.name, data: { ...p, defined_at: event.at } });
      if (p.idea_id) await graph.link(p.idea_id, RelKind.PROPOSES, p.id, { at: event.at });
      break;
    case 'build.started':
    case 'build.completed': {
      // explicit payload.status wins (P2: truthful states); type-derived fallback.
      const status = p.status ?? (event.type === 'build.completed' ? 'completed' : 'running');
      // Hydra caps queries ~1024B — store scalars only; full payload stays in the event log.
      await graph.upsertEntity({
        id: p.id, type: EntityType.BUILD_RUN, name: p.name ?? p.id,
        data: { ...slim(p, ['id', 'name', 'idea_id', 'status', 'build_run_id', 'process_id', 'rejected_reason']), status, [`${status}_at`]: event.at },
      });
      if (p.idea_id) await graph.link(p.idea_id, RelKind.BUILT_BY, p.id, { at: event.at });
      break;
    }
    case 'product.graduated':
      await graph.upsertEntity({ id: p.id, type: EntityType.PRODUCT, name: p.name, data: { ...p, graduated_at: event.at } });
      if (p.build_run_id) await graph.link(p.build_run_id, RelKind.PRODUCED, p.id, { at: event.at });
      for (const capabilityId of p.capability_ids ?? []) await graph.link(p.id, RelKind.IMPLEMENTS, capabilityId, { at: event.at });
      break;
    case 'site.registered':
      // Hydra caps queries ~1024B — store query-relevant scalars only.
      // Full manifests live in registry files + the durable event log.
      await graph.upsertEntity({
        id: p.id, type: EntityType.SITE, name: p.name,
        data: slim(p, ['id', 'name', 'domain', 'runtime', 'cloudflare_worker', 'product_id', 'telemetry_exemptions']),
      });
      if (p.product_id) await graph.link(p.product_id, RelKind.EXPOSES, p.id, { at: event.at });
      break;
    case 'deployment.recorded':
      await graph.upsertEntity({ id: p.id, type: EntityType.DEPLOYMENT, name: p.name ?? p.id, data: { ...p, deployed_at: event.at } });
      if (p.site_id) await graph.link(p.site_id, RelKind.DEPLOYED_AS, p.id, { at: event.at });
      break;
    case 'standard.registered':
      await graph.upsertEntity({ id: p.id, type: EntityType.STANDARD, name: p.name, data: { ...p, registered_at: event.at } });
      break;
    case 'standard.version.registered':
      // requirements slimmed to {id, severity} — descriptions live in files/events
      await graph.upsertEntity({
        id: p.id, type: EntityType.STANDARD_VERSION,
        name: `${p.standard_name ?? p.standard_id}@${p.version}`,
        data: {
          ...slim(p, ['id', 'standard_id', 'standard_name', 'version', 'status', 'previous_id']),
          requirements: (p.requirements ?? []).map(r => ({ id: r.id, severity: r.severity })),
          registered_at: event.at,
        },
      });
      if (p.previous_id && await graph.getEntity(p.previous_id)) await graph.link(p.id, RelKind.SUPERSEDES, p.previous_id, { at: event.at });
      if (p.standard_id && await graph.getEntity(p.standard_id)) await graph.link(p.standard_id, RelKind.EXPOSES, p.id, { at: event.at });
      break;
    case 'site.standard.desired':
      await graph.link(p.site_id, RelKind.CONFORMS_TO, p.standard_version_id, { desired: true, at: event.at, source: p.source ?? 'registry' });
      break;
    case 'sensor.registered':
      await graph.upsertEntity({ id: p.id, type: EntityType.SENSOR, name: p.name, data: { ...p, registered_at: event.at } });
      break;
    case 'observation.recorded':
      await graph.upsertEntity({ id: p.id, type: EntityType.OBSERVATION, name: p.metric, data: { ...p, ingested_at: event.at } });
      if (p.sensor_id) await graph.link(p.sensor_id, RelKind.OBSERVED, p.id, { at: event.at });
      if (p.subject_id) await graph.link(p.subject_id, RelKind.OBSERVED_BY, p.id, { at: event.at });
      if (p.experiment_id) await graph.link(p.experiment_id, RelKind.MEASURES, p.id, { at: event.at });
      break;
    case 'experiment.created':
      await graph.upsertEntity({ id: p.id, type: EntityType.EXPERIMENT, name: p.name, data: { ...p, created_at: event.at } });
      if (p.standard_version_id) await graph.link(p.id, RelKind.TESTS, p.standard_version_id, { at: event.at });
      break;
    case 'experiment.arm.created':
      await graph.upsertEntity({ id: p.id, type: EntityType.EXPERIMENT_ARM, name: p.name, data: { ...p, created_at: event.at } });
      if (p.experiment_id) await graph.link(p.experiment_id, RelKind.HAS_ARM, p.id, { at: event.at });
      break;
    case 'experiment.arm.assigned':
      await graph.link(p.arm_id, RelKind.ASSIGNED_TO, p.site_id, { at: event.at, bucket: p.bucket });
      break;
    case 'failure.recorded':
      await graph.upsertEntity({ id: p.id, type: EntityType.FAILURE, name: p.name ?? p.code ?? p.id, data: { ...p, recorded_at: event.at } });
      if (p.subject_id) await graph.link(p.subject_id, RelKind.FAILED_WITH, p.id, { at: event.at });
      break;
    case 'task.created':
      // build_brief excluded — large document; lives in the event log only.
      await graph.upsertEntity({
        id: p.id, type: EntityType.TASK, name: p.title,
        data: { ...slim(p, ['id', 'title', 'subject_id', 'kind', 'risk_class', 'status', 'build_run_id']), created_at: event.at },
      });
      if (p.subject_id) await graph.link(p.subject_id, RelKind.TRIGGERED, p.id, { at: event.at });
      break;
    case 'process.registered':
      await graph.upsertEntity({ id: p.id, type: EntityType.PROCESS, name: p.name, data: { ...p, registered_at: event.at } });
      break;
    case 'process.run.started':
    case 'process.run.completed': {
      const status = event.type === 'process.run.completed' ? 'completed' : 'running';
      await graph.upsertEntity({ id: p.id, type: EntityType.PROCESS_RUN, name: p.name ?? p.id, data: { ...p, status, [`${status}_at`]: event.at } });
      if (p.process_id) await graph.link(p.process_id, RelKind.EXECUTED, p.id, { at: event.at });
      for (const inputId of p.input_ids ?? []) if (await graph.getEntity(inputId)) await graph.link(inputId, RelKind.INPUT_TO, p.id, { at: event.at });
      for (const outputId of p.output_ids ?? []) if (await graph.getEntity(outputId)) await graph.link(p.id, RelKind.OUTPUT_OF, outputId, { at: event.at });
      break;
    }
    default:
      break;
  }
}

export async function rebuildProjection(graph, eventStore) {
  await graph.clear();
  const events = await eventStore.all();
  for (const event of events) await projectEvent(graph, event);
  return events.length;
}
