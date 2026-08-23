import http from 'node:http';
import { URL } from 'node:url';
import { ControlPlane } from '../controller/control-plane.js';
import { experimentReport } from '../experiments/report.js';
import { CapabilityResolver } from '../resolver/capability-resolver.js';
import { ProcessAttribution } from '../analytics/process-attribution.js';
import { projectEvent } from '../graph/hydradb/projector.js';
import { HydraExecutor } from '../graph/hydradb/executor.js';
import { CanonicalEventIngestor } from '../events/canonical-ingestor.js';
import { CheckpointStore } from '../events/checkpoint-store.js';
import { createEventStore } from '../events/event-store-factory.js';

async function readJson(req, maxBytes = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function send(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function authorized(req, token) {
  if (!token) return true;
  return req.headers.authorization === `Bearer ${token}`;
}

export function createControlPlaneServer({ controlPlane = ControlPlane.fromEnv(), token = process.env.CONTROL_TOKEN } = {}) {
  const resolver = new CapabilityResolver(controlPlane.graph);
  const processAttribution = new ProcessAttribution(controlPlane.graph);

  // Canonical ingestion pipeline — projections go to HydraDB when configured,
  // otherwise stay in-memory only (projection failures never block ingestion).
  const hydra = new HydraExecutor({
    baseUrl: process.env.HYDRA_URL || 'http://127.0.0.1:8443',
    token: process.env.HYDRA_TOKEN || process.env.HYDRADB_TOKEN || '',
    graphId: process.env.HYDRA_GRAPH_ID || 'finalbuilds',
    namespace: process.env.HYDRA_NAMESPACE || 'default',
    cellId: process.env.HYDRA_CELL_ID || 'cell-0',
    allowFallback: false,
  });
  const graph = String(process.env.GRAPH_BACKEND || '').toLowerCase() === 'hydra'
    ? hydra
    : { query: async () => ({ ok: true }) };
  const eventStore = createEventStore();
  const checkpointStore = new CheckpointStore(`${process.env.FINALBUILDS_ROOT || '.'}/runtime/projection-checkpoint.json`);
  const ingestor = new CanonicalEventIngestor({
    eventStore,
    graph,
    projector: projectEvent,
    checkpointStore,
  });

  // Strategy evaluation from graph evidence (not in-memory Map)
  async function evaluateStrategy(strategyVersionId, cohort = {}) {
    const builds = controlPlane.graph.findEntitiesSync
      ? controlPlane.graph.findEntitiesSync({ type: 'BuildRun' })
      : [];
    const linked = builds.filter(b => {
      const edges = controlPlane.graph.getEdgesSync ? controlPlane.graph.getEdgesSync(b.id, 'USED_STRATEGY') : [];
      return edges.some(e => e.targetId === strategyVersionId);
    });
    if (linked.length < 3) return null;
    const passed = linked.filter(b => b.data?.passed).length;
    return {
      strategy_version_id: strategyVersionId,
      total_builds: linked.length,
      success_rate: passed / linked.length,
      needs_canary: linked.length < 30,
      promotion_candidates: passed / linked.length > 0.85 && linked.length >= 5,
    };
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz' && req.method === 'GET') return send(res, 200, { ok: true });
      if (!authorized(req, token)) return send(res, 401, { error: 'unauthorized' });

      // --- Canonical Event Ingestion ---
      if (url.pathname === '/v1/events' && req.method === 'POST') {
        const event = await readJson(req);
        if (!event.event_type) return send(res, 400, { error: 'event_type required' });
        const result = await ingestor.ingest(event);
        return send(res, result.accepted ? 201 : 409, result);
      }

      if (url.pathname === '/v1/events/batch' && req.method === 'POST') {
        const { events = [] } = await readJson(req);
        const result = await ingestor.ingestBatch(events);
        return send(res, 201, result);
      }

      // --- Build Context API ---
      if (url.pathname === '/v1/build-context' && req.method === 'POST') {
        const body = await readJson(req);
        const strategies = controlPlane.graph.findEntitiesSync
          ? controlPlane.graph.findEntitiesSync({ type: 'StrategyVersion' })
          : [];
        const promoted = strategies.filter(s => s.data?.status === 'promoted');
        const failures = controlPlane.graph.findEntitiesSync
          ? controlPlane.graph.findEntitiesSync({ type: 'Failure' })
          : [];
        const classCounts = {};
        for (const f of failures) {
          const cls = f.data?.failure_class || 'UNKNOWN';
          classCounts[cls] = (classCounts[cls] || 0) + 1;
        }
        return send(res, 200, {
          context_version: '1',
          strategy_version: promoted[0]?.data || null,
          standards: [],
          known_failures: Object.entries(classCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cls, count]) => ({ failure_class: cls, occurrence_count: count })),
          successful_precedents: [],
          failed_precedents: [],
          recommended_checks: ['build_ok', 'preview_ok', 'tests_pass'],
          evidence_ids: [],
        });
      }

      // --- Strategy API ---
      if (url.pathname === '/v1/strategies' && req.method === 'GET') {
        const strategies = controlPlane.graph.findEntitiesSync
          ? controlPlane.graph.findEntitiesSync({ type: 'Strategy' })
          : [];
        return send(res, 200, { strategies: strategies.map(s => ({ id: s.id, name: s.name, ...s.data })) });
      }

      if (url.pathname.match(/^\/v1\/strategies\/[^/]+\/evaluate$/) && req.method === 'POST') {
        const id = decodeURIComponent(url.pathname.split('/')[3]);
        const body = await readJson(req).catch(() => ({}));
        const result = await evaluateStrategy(id, body.cohort);
        if (!result) return send(res, 200, { message: 'insufficient data', strategy_version_id: id });
        return send(res, 200, result);
      }

      if (url.pathname.match(/^\/v1\/strategies\/[^/]+\/promote$/) && req.method === 'POST') {
        const id = decodeURIComponent(url.pathname.split('/')[3]);
        const result = await evaluateStrategy(id);
        if (!result || !result.promotion_candidates) {
          return send(res, 400, { error: 'strategy does not meet promotion criteria', result });
        }
        await controlPlane.bus.emit('strategy.promoted', { strategy_version_id: id, promoted_from: 'candidate' });
        return send(res, 200, { promoted: true, strategy_version_id: id });
      }

      // --- Contracts API ---
      if (url.pathname === '/v1/contracts/version' && req.method === 'GET') {
        return send(res, 200, { version: 'foundry-event-contract/1.0.0' });
      }

      if (url.pathname === '/v1/contracts/events' && req.method === 'GET') {
        return send(res, 200, { version: '1.0.0', event_types: [
          'build.requested', 'build.started', 'build.attempt.started', 'build.task.completed',
          'build.failure.recorded', 'build.repair.started', 'build.repair.completed',
          'build.audit.completed', 'build.artifact.created', 'build.completed',
          'product.graduated', 'site.registered',
          'strategy.registered', 'strategy.version.registered', 'strategy.evaluated',
          'strategy.promoted', 'strategy.deprecated', 'strategy.rolled_back',
          'observation.recorded', 'observation.invalidated',
          'experiment.created', 'experiment.arm.created', 'experiment.completed',
        ]});
      }

      // --- Existing endpoints ---
      if (url.pathname === '/v1/observations' && req.method === 'POST') return send(res, 201, await controlPlane.observe(await readJson(req)));
      if (url.pathname === '/v1/failures' && req.method === 'POST') { const body = await readJson(req); await controlPlane.recordFailure(body); return send(res, 201, { ok: true }); }
      if (url.pathname === '/v1/controller/tick' && req.method === 'POST') { const body = await readJson(req); return send(res, 200, await controlPlane.factory.tick({ limit: Number(body.limit ?? 1) })); }
      if (url.pathname === '/v1/drift' && req.method === 'GET') return send(res, 200, await controlPlane.reconciler.standardDrift());
      if (url.pathname === '/v1/drift/repair' && req.method === 'POST') { const drift = await controlPlane.reconciler.standardDrift(); return send(res, 201, await controlPlane.reconciler.createRepairTasks(drift)); }
      if (url.pathname === '/v1/analytics/attribution' && req.method === 'GET') return send(res, 200, await controlPlane.analytics.usageAttribution({ metric: url.searchParams.get('metric') ?? 'api.calls' }));
      if (url.pathname === '/v1/analytics/processes' && req.method === 'GET') return send(res, 200, await processAttribution.rank({ stage: url.searchParams.get('stage'), metric: url.searchParams.get('metric') ?? 'api.calls' }));
      if (url.pathname === '/v1/analytics/products' && req.method === 'GET') return send(res, 200, await controlPlane.analytics.bestProducts({ metric: url.searchParams.get('metric') ?? 'api.calls' }));
      if (url.pathname === '/v1/capabilities/resolve' && req.method === 'GET') return send(res, 200, await resolver.search(url.searchParams.get('q') ?? '', { limit: Number(url.searchParams.get('limit') ?? 8) }));
      if (url.pathname === '/v1/experiments' && req.method === 'POST') return send(res, 201, await controlPlane.experiments.create(await readJson(req)));
      if (url.pathname.match(/^\/v1\/experiments\/[^/]+\/report$/) && req.method === 'GET') {
        const id = decodeURIComponent(url.pathname.split('/')[3]);
        return send(res, 200, await experimentReport(controlPlane.graph, id));
      }
      if (url.pathname.match(/^\/v1\/experiments\/[^/]+\/assign$/) && req.method === 'POST') {
        const id = decodeURIComponent(url.pathname.split('/')[3]);
        const body = await readJson(req);
        const sites = body.site_ids ? await Promise.all(body.site_ids.map(siteId => controlPlane.graph.getEntity(siteId))) : await controlPlane.graph.findEntities({ type: 'Site' });
        return send(res, 200, await controlPlane.experiments.assignSites(id, sites.filter(Boolean), Number(body.allocation ?? 0.5)));
      }
      return send(res, 404, { error: 'not_found' });
    } catch (error) {
      send(res, error.status ?? 500, { error: error.message });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? '127.0.0.1'; // P5-17: fail-closed default bind
  const token = process.env.CONTROL_TOKEN ?? '';
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (!loopback && !token) {
    console.error(`REFUSING STARTUP: non-loopback HOST=${host} without CONTROL_TOKEN (P5-17 fail-closed auth)`);
    process.exit(78);
  }
  if (token) console.log('auth: CONTROL_TOKEN required on mutating endpoints');
  else console.log('auth: WARNING no CONTROL_TOKEN set — loopback-only binding enforced');
  const server = createControlPlaneServer();
  server.listen(port, host, () => console.log(`finalbuilds control plane listening on ${host}:${port}`));
}
