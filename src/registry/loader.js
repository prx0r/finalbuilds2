import fs from 'node:fs/promises';
import path from 'node:path';

export async function loadJsonDirectory(dir) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = entries.filter(e => e.isFile() && e.name.endsWith('.json')).map(e => e.name).sort();
  const values = [];
  for (const file of files) {
    const full = path.join(dir, file);
    values.push(JSON.parse(await fs.readFile(full, 'utf8')));
  }
  return values;
}

export function validateSiteManifest(site) {
  const errors = [];
  for (const key of ['id', 'name', 'domain']) if (!site?.[key]) errors.push(`missing ${key}`);
  if (!site?.source?.path) errors.push('missing source.path');
  if (!site?.standards || typeof site.standards !== 'object') errors.push('missing standards object');
  return { ok: errors.length === 0, errors };
}

export function validateIdeaSeed(idea) {
  const errors = [];
  for (const key of ['id', 'name', 'generator_id']) if (!idea?.[key]) errors.push(`missing ${key}`);
  if (!idea?.scores || typeof idea.scores !== 'object') errors.push('missing scores');
  return { ok: errors.length === 0, errors };
}
