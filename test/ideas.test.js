import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLedger, parseNewIdeas, importIdeas } from '../src/ideas/importer.js';
import { compileBlueprint } from '../src/ideas/blueprint-compiler.js';

describe('IdeaImporter', () => {
  it('parses ledger format', () => {
    const text = `### 1. web.redirect.explain

**Capability:** Resolve a URL's redirect chain.
**Pain replaced:** curl -I, browser DevTools.
**Why deterministic:** An LLM cannot know what a server returns.

---

### 2. email.dmarc.explain

**Capability:** Explain DMARC policy.
**Pain replaced:** Manual DMARC analysis.
`;
    const ideas = parseLedger(text);
    assert.equal(ideas.length, 2);
    assert.equal(ideas[0].key, 'web.redirect.explain');
    assert.ok(ideas[0].description.includes('redirect chain'));
    assert.equal(ideas[1].key, 'email.dmarc.explain');
  });

  it('parses new ideas format', () => {
    const text = `## 21. ToolPrice

**Thesis:** Agents need to compare tool economics.
**Job:** "What will this cost?"
**Delta:** structural need for price comparison.
**Score:** 17/18
`;
    const ideas = parseNewIdeas(text);
    assert.equal(ideas.length, 1);
    assert.equal(ideas[0].name, 'ToolPrice');
    assert.ok(ideas[0].description.includes('compare tool economics'));
  });

  it('imports from real finalbuildideas', async () => {
    const ideas = await importIdeas('/root/finalbuildideas');
    assert.ok(ideas.length > 20, `Expected >20 ideas, got ${ideas.length}`);
    const redirectIdea = ideas.find(i => i.key === 'web.redirect.explain');
    assert.ok(redirectIdea, 'Should find web.redirect.explain');
    assert.ok(redirectIdea.idea_id.startsWith('idea_'));
    assert.equal(redirectIdea.source_repo, 'finalbuildideas');
    assert.ok(redirectIdea.tags.includes('web'));
  });

  it('infers tags correctly', async () => {
    const ideas = await importIdeas('/root/finalbuildideas');
    const mcpIdea = ideas.find(i => i.key === 'dns.caa.authorize');
    assert.ok(mcpIdea?.tags.includes('dns'));
  });
});

describe('BlueprintCompiler', () => {
  it('compiles blueprint from idea', () => {
    const idea = { name: 'test-tool', description: 'A test tool', key: 'test-tool' };
    const blueprint = compileBlueprint(idea, {}, { challenge: 'abc123' });
    assert.ok(blueprint.includes('# Blueprint: test-tool'));
    assert.ok(blueprint.includes('abc123'));
    assert.ok(blueprint.includes('/_foundry-proof'));
  });

  it('includes known failures from context', () => {
    const idea = { name: 'x', description: 'y', key: 'x' };
    const ctx = { known_failures: [{ failure_class: 'TEST_FAILED', occurrence_count: 5 }] };
    const blueprint = compileBlueprint(idea, ctx);
    assert.ok(blueprint.includes('TEST_FAILED'));
    assert.ok(blueprint.includes('5 times'));
  });

  it('generates unique challenge per build', () => {
    const idea = { name: 'x', description: 'y', key: 'x' };
    const b1 = compileBlueprint(idea);
    const b2 = compileBlueprint(idea);
    const c1 = b1.match(/"challenge": "([^"]+)"/)[1];
    const c2 = b2.match(/"challenge": "([^"]+)"/)[1];
    assert.notEqual(c1, c2);
  });
});
