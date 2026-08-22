/**
 * ConformanceEvaluator — closes the standards loop.
 *
 * For every site and each standard version it desires (CONFORMS_TO), evaluate
 * the version's requirements against the site's latest observations, then emit
 * a `standard.compliance` observation. Drift = desired but not compliant, which
 * /v1/drift turns into agent repair tasks via /v1/drift/repair.
 */

const CHECKS = {
  'llms-txt': latest => latest('llms_txt.present')?.value === 1,
  'robots-txt': latest => latest('robots_txt.present')?.value === 1,
  'agent-discovery-files': latest => latest('llms_txt.present')?.value === 1 && latest('robots_txt.present')?.value === 1,
  'http-health': latest => {
    const o = latest('http.status');
    return !!o && o.value > 0 && o.value < 500;
  },
  'usage-telemetry': latest => {
    if (latest('api.calls')) return true;
    return false; // required-if-applicable sites without telemetry fail soft below
  },
};

export class ConformanceEvaluator {
  constructor({ graph }) {
    this.graph = graph;
  }

  async loadLatestObservations() {
    const obs = await this.graph.findEntities({ type: 'Observation' });
    const latest = new Map(); // subject_id -> metric -> observation
    for (const o of obs) {
      const { subject_id: sid, metric } = o.data ?? {};
      if (!sid || !metric) continue;
      const bucket = latest.get(sid) ?? new Map();
      const prev = bucket.get(metric);
      if (!prev || String(o.data.observed_at ?? '') >= String(prev.observed_at ?? '')) bucket.set(metric, o.data);
      latest.set(sid, bucket);
    }
    return latest;
  }

  async evaluateSite(site) {
    const allLatest = await this.loadLatestObservations();
    const latest = metric => allLatest.get(site.id)?.get(metric) ?? null;
    const desired = await this.graph.neighbors(site.id, { direction: 'out', kinds: ['CONFORMS_TO'] });
    const results = [];

    for (const d of desired) {
      const versionId = d.entity.id;
      const requirements = d.entity.data?.requirements ?? [];
      const failedRequired = [];
      const failedSoft = [];

      for (const req of requirements) {
        const check = CHECKS[req.id];
        const applicable = req.severity !== 'required-if-applicable' || isApplicable(req.id, site);
        if (!applicable) continue;
        let pass = false;
        try { pass = check ? !!check(latest) : true; } catch { pass = false; }
        if (!pass) (req.severity === 'required' ? failedRequired : failedSoft).push(req.id);
      }

      results.push({
        site_id: site.id,
        standard_version_id: versionId,
        compliant: failedRequired.length === 0,
        failed_required: failedRequired,
        failed_recommended: failedSoft,
      });
    }
    return results;
  }

  async recordCompliance(controlPlane, results) {
    for (const r of results) {
      await controlPlane.observe({
        id: `obs_conf_${r.site_id}_${r.standard_version_id}`.replaceAll(/[^a-zA-Z0-9_]/g, '_'),
        sensor_id: 'sensor_conformance',
        subject_id: r.site_id,
        metric: 'standard.compliance',
        value: r.compliant ? 1 : 0,
        standard_version_id: r.standard_version_id,
        dimensions: { failed_required: r.failed_required.join(','), failed_recommended: r.failed_recommended.join(',') },
      });
    }
    return results.length;
  }
}

function isApplicable(requirementId, site) {
  if (requirementId === 'usage-telemetry') {
    if (site.data?.telemetry_exemptions?.includes('usage-telemetry')) return false;
    return site.data?.runtime === 'cloudflare-workers' || !!site.data?.cloudflare_worker;
  }
  return true;
}
