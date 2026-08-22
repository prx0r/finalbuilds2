import fs from 'node:fs/promises';
import { loadJsonDirectory, validateSiteManifest } from './loader.js';

export async function bootstrapRegistry(controlPlane, { root = process.cwd() } = {}) {
  const siteDir = `${root}/registry/sites`;
  const standardsRoot = `${root}/standards`;
  const sites = await loadJsonDirectory(siteDir);
  // Load every standards/<name>/*.json directory
  const standardDirs = [];
  try {
    const entries = await fs.readdir(standardsRoot, { withFileTypes: true });
    for (const entry of entries) if (entry.isDirectory()) standardDirs.push(`${standardsRoot}/${entry.name}`);
  } catch { /* no standards dir yet */ }
  const standards = (await Promise.all(standardDirs.map(dir => loadJsonDirectory(dir)))).flat();
  const registeredParents = new Set();
  let standardCount = 0;

  for (const version of standards) {
    if (!registeredParents.has(version.standard_id)) {
      await controlPlane.standards.registerStandard({ id: version.standard_id, name: version.standard_name, description: `Parent standard for ${version.standard_name}` });
      registeredParents.add(version.standard_id);
    }
    await controlPlane.standards.registerVersion(version);
    standardCount += 1;
  }

  const capabilityIds = new Set();
  const sensorIds = new Set();
  for (const site of sites) {
    const validation = validateSiteManifest(site);
    if (!validation.ok) throw new Error(`Invalid site manifest ${site.id ?? '<unknown>'}: ${validation.errors.join(', ')}`);
    for (const capability of site.capabilities ?? []) {
      if (capabilityIds.has(capability)) continue;
      await controlPlane.defineCapability({ id: capability, name: capability, description: `Registry capability ${capability}`, tags: capability.split('.') });
      capabilityIds.add(capability);
    }
    for (const sensor of site.sensors ?? []) {
      if (sensorIds.has(sensor)) continue;
      await controlPlane.registerSensor({ id: sensor, name: sensor, kind: 'registry-declared' });
      sensorIds.add(sensor);
    }
    if (site.product_id) {
      await controlPlane.graduateProduct({ id: site.product_id, name: site.name, build_run_id: null, capability_ids: site.capabilities ?? [], registry_bootstrap: true });
    }
    await controlPlane.registerSite({ ...site, product_id: site.product_id ?? null });
    for (const versionId of Object.values(site.standards ?? {})) await controlPlane.standards.desire(site.id, versionId, 'manifest');
  }

  return { sites: sites.length, standard_versions: standardCount, capabilities: capabilityIds.size, sensors: sensorIds.size };
}
