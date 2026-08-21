import http from 'node:http';
import { URL } from 'node:url';
import { ControlPlane } from '../controller/control-plane.js';
import { experimentReport } from '../experiments/report.js';
import { CapabilityResolver } from '../resolver/capability-resolver.js';
import { ProcessAttribution } from '../analytics/process-attribution.js';

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
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz' && req.method === 'GET') return send(res, 200, { ok: true });
      if (!authorized(req, token)) return send(res, 401, { error: 'unauthorized' });

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
