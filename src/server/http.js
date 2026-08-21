import http from 'node:http';
import { URL } from 'node:url';
import crypto from 'node:crypto';
import { ControlPlane } from '../controller/control-plane.js';
import { experimentReport } from '../experiments/report.js';
import { CapabilityResolver } from '../resolver/capability-resolver.js';
import { ProcessAttribution } from '../analytics/process-attribution.js';
import { projectEvent } from '../graph/hydradb/projector.js';

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

// Strategy evaluation engine
const strategyStats = new Map();

function recordBuildForStrategy(strategyVersionId, passed) {
  if (!strategyStats.has(strategyVersionId)) {
    strategyStats.set(strategyVersionId, { builds: 0, passed: 0, failures: [], durations: [] });
  }
  const s = strategyStats.get(strategyVersionId);
  s.builds++;
  if (passed) s.passed++;
}

function evaluateStrategy(strategyVersionId) {
  const s = strategyStats.get(strategyVersionId);
  if (!s || s.builds < 3) return null;
  return {
    strategy_version_id: strategyVersionId,
    total_builds: s.builds,
    success_rate: s.passed / s.builds,
    needs_canary: s.builds < 30,
    promotion_candidates: s.passed / s.builds > 0.85 && s.builds >= 5,
  };
}

// BuildContext retrieval
function buildContext(blueprint, graph) {
  const blueprintLower = (blueprint || '').toLowerCase();
  const strategies = graph.findEntitiesSync ? graph.findEntitiesSync({ type: 'StrategyVersion' }) : [];
  const promoted = strategies.filter(s => s.data?.status === 'promoted');

  const knownFailures = [];
  if (graph.findEntitiesSync) {
    const failures = graph.findEntitiesSync({ type: 'Failure' });
    const classCounts = {};
    for (const f of failures) {
      const cls = f.data?.failure_class || 'UNKNOWN';
      classCounts[cls] = (classCounts[cls] || 0) + 1;
    }
    for (const [cls, count] of Object.entries(classCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      knownFailures.push({ failure_class: cls, occurrence_count: count });
    }
  }

  return {
    context_version: '1',
    strategy_version: promoted[0]?.data || null,
    standards: [],
    known_failures: knownFailures,
    successful_precedents: [],
    failed_precedents: [],
    recommended_checks: ['build_ok', 'preview_ok', 'tests_pass'],
    evidence_ids: [],
  };
}

export function createControlPlaneServer({ controlPlane = ControlPlane.fromEnv(), token = process.env.CONTROL_TOKEN } = {}) {
  const resolver = new CapabilityResolver(controlPlane.graph);
  const processAttribution = new ProcessAttribution(controlPlane.graph);
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz' && req.method === 'GET') return send(res, 200, { ok: true });
      if (!authorized(req, token)) return send(res, 401, { error: 'unauthorized' });

      // --- Events API ---
      if (url.pathname === '/v1/events' && req.method === 'POST') {
        const event = await readJson(req);
        if (!event.event_type) return send(res, 400, { error: 'event_type required' });
        await controlPlane.bus.emit(event.event_type, event.payload);
        // Project into Hydra
        const queries = projectEvent(event);
        return send(res, 201, { accepted: true, event_id: event.event_id, hydra_queries: queries.length });
      }

      if (url.pathname === '/v1/events/batch' && req.method === 'POST') {
        const { events = [] } = await readJson(req);
        let accepted = 0;
        for (const event of events) {
          if (event.event_type) {
            await controlPlane.bus.emit(event.event_type, event.payload);
            accepted++;
          }
        }
        return send(res, 201, { accepted, total: events.length });
      }

      // --- Build Context API ---
      if (url.pathname === '/v1/build-context' && req.method === 'POST') {
        const body = await readJson(req);
        const ctx = buildContext(body.blueprint, controlPlane.graph);
        return send(res, 200, ctx);
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
        const result = evaluateStrategy(id);
        if (!result) return send(res, 200, { message: 'insufficient data', strategy_version_id: id });
        return send(res, 200, result);
      }

      if (url.pathname.match(/^\/v1\/strategies\/[^/]+\/promote$/) && req.method === 'POST') {
        const id = decodeURIComponent(url.pathname.split('/')[3]);
        const result = evaluateStrategy(id);
        if (!result || !result.promotion_candidates) {
          return send(res, 400, { error: 'strategy does not meet promotion criteria', result });
        }
        await controlPlane.bus.emit('strategy.promoted', { strategy_version_id: id, promoted_from: 'candidate' });
        return send(res, 200, { promoted: true, strategy_version_id: id });
      }

      // --- Contracts API ---
      if (url.pathname === '/v1/contracts/version' && req.method === 'GET') {
        return send(res, 200, { version: 'foundry-event-contract/1.0.0', contract: 'foundry-event-contract' });
      }

      if (url.pathname === '/v1/contracts/events' && req.method === 'GET') {
        return send(res, 200, { version: '1.0.0', event_types: [
          'build.requested', 'build.started', 'build.attempt.started', 'build.task.completed',
          'build.failure.recorded', 'build.repair.started', 'build.repair.completed',
          'build.audit.completed', 'build.artifact.created', 'build.completed',
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
  const server = createControlPlaneServer();
  server.listen(port, () => console.log(`finalbuilds control plane listening on :${port}`));
}
