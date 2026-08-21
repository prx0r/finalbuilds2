/**
 * IdeaImporter — imports ideas from finalbuildideas markdown ledger.
 * 
 * Parses TINYTOOLS_LEDGER.md and detailed idea files into normalized
 * idea objects with source provenance.
 */

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Parse the TINYTOOLS_LEDGER.md format.
 * Each idea block starts with ### and contains labeled fields.
 */
export function parseLedger(text) {
  const ideas = [];
  const blocks = text.split(/^### /m);

  for (const block of blocks) {
    const lines = block.split('\n');
    const titleLine = lines.find(l => l.trim().length > 0);
    if (!titleLine) continue;

    const rawKey = titleLine.trim();
    const key = rawKey.replace(/^\d+\.\s*/, '').trim();
    if (!key || key.startsWith('#')) continue;

    const fields = {};
    for (const line of lines) {
      const m = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
      if (m) {
        const fieldKey = m[1].toLowerCase().replace(/[\s-]+/g, '_');
        fields[fieldKey] = m[2].trim();
      }
    }

    if (fields.capability || fields.description || fields.thesis) {
      ideas.push({
        key,
        name: key,
        description: fields.capability || fields.description || fields.thesis || '',
        pain_replaced: fields.pain_replaced || fields.pain || '',
        why_deterministic: fields.why_deterministic || '',
        implementation: fields.implementation || '',
        cost: fields.cost || '',
        mcp: fields.mcp || '',
        flywheel: fields.flywheel || '',
        mini_thesis: fields['mini-thesis'] || fields.mini_thesis || '',
      });
    }
  }

  return ideas;
}

/**
 * Parse the NEW_IDEAS markdown format.
 */
export function parseNewIdeas(text) {
  const ideas = [];
  const blocks = text.split(/^## \d+\./m);

  for (const block of blocks) {
    const lines = block.split('\n');
    const titleLine = lines.find(l => l.trim().length > 0 && !l.startsWith('#'));
    if (!titleLine) continue;

    const name = titleLine.trim().replace(/\*\*/g, '');
    const fields = {};
    let currentField = null;

    for (const line of lines) {
      const m = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
      if (m) {
        currentField = m[1].toLowerCase().replace(/[\s-]+/g, '_');
        fields[currentField] = m[2].trim();
      } else if (currentField && line.trim() && !line.startsWith('#')) {
        fields[currentField] += ' ' + line.trim();
      }
    }

    if (fields.thesis || fields.job) {
      ideas.push({
        key: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        name,
        description: fields.thesis || fields.job || '',
        score: fields.score || '',
        engine: fields.engine || '',
        delta: fields.delta || '',
        interfaces: fields.tools || '',
      });
    }
  }

  return ideas;
}

/**
 * Import ideas from a finalbuildideas repo path.
 * Returns normalized idea objects with source provenance.
 */
export async function importIdeas(repoPath) {
  const ideas = [];
  const sourceSha = sha256(repoPath + Date.now());

  // Parse ledger
  try {
    const ledger = await fs.readFile(path.join(repoPath, 'TINYTOOLS_LEDGER.md'), 'utf8');
    const ledgerIdeas = parseLedger(ledger);
    for (const idea of ledgerIdeas) {
      ideas.push({
        idea_id: `idea_${sha256(idea.key).slice(0, 12)}`,
        source_repo: 'finalbuildideas',
        source_file: 'TINYTOOLS_LEDGER.md',
        source_section: idea.key,
        source_sha256: sha256(JSON.stringify(idea)),
        ...idea,
        status: 'candidate',
        tags: inferTags(idea),
      });
    }
  } catch {}

  // Parse NEW_IDEAS files
  for (const file of ['NEW_IDEAS_20.md', 'NEW_IDEAS_21_40.md', 'NEW_IDEAS_41_60.md']) {
    try {
      const text = await fs.readFile(path.join(repoPath, file), 'utf8');
      const newIdeas = parseNewIdeas(text);
      for (const idea of newIdeas) {
        ideas.push({
          idea_id: `idea_${sha256(idea.key).slice(0, 12)}`,
          source_repo: 'finalbuildideas',
          source_file: file,
          source_section: idea.key,
          source_sha256: sha256(JSON.stringify(idea)),
          ...idea,
          status: 'candidate',
          tags: inferTags(idea),
        });
      }
    } catch {}
  }

  return ideas;
}

function inferTags(idea) {
  const text = `${idea.description} ${idea.mcp || ''} ${idea.implementation || ''}`.toLowerCase();
  const tags = [];
  if (text.includes('rest') || text.includes('api')) tags.push('rest');
  if (text.includes('mcp')) tags.push('mcp');
  if (text.includes('web') || text.includes('html')) tags.push('web');
  if (text.includes('worker') || text.includes('cloudflare')) tags.push('worker');
  if (text.includes('dns')) tags.push('dns');
  if (text.includes('email') || text.includes('smtp')) tags.push('email');
  if (text.includes('security')) tags.push('security');
  if (text.includes('package') || text.includes('npm')) tags.push('package');
  return tags;
}
