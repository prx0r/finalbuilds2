// Canonical Page Generator
// Generates multi-format pages for capabilities

export class CanonicalPageGenerator {
  constructor(registry) {
    this.registry = registry;
  }

  // Generate capability page in different formats
  async generate(capabilityId, format = 'html') {
    const cap = await this.registry.get(capabilityId);
    if (!cap) throw new Error(`Capability not found: ${capabilityId}`);

    switch (format) {
      case 'html': return this.toHTML(cap);
      case 'markdown': return this.toMarkdown(cap);
      case 'json': return this.toJSON(cap);
      default: throw new Error(`Unknown format: ${format}`);
    }
  }

  toHTML(cap) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cap.name} — GET</title>
  <meta name="description" content="${cap.description}">
  <link rel="canonical" href="https://g-et.com${cap.path}">
  <script type="application/ld+json">${JSON.stringify(this.toJSONLD(cap))}</script>
</head>
<body>
  <main>
    <h1>${cap.name}</h1>
    <p>${cap.description}</p>
    
    <section>
      <h2>Use when</h2>
      <p>${cap.useWhen || 'Input matches this capability.'}</p>
      
      <h2>Don't use when</h2>
      <p>${cap.dontUseWhen || 'Task requires state or authentication.'}</p>
    </section>

    <section>
      <h2>Try it</h2>
      <form id="try-form">
        <label for="input">Input</label>
        <textarea id="input" name="input" rows="5">${cap.exampleInput || ''}</textarea>
        <button type="submit">Execute</button>
      </form>
      <pre id="output"></pre>
    </section>

    <section>
      <h2>Details</h2>
      <table>
        <tr><td>Input</td><td>${cap.inputType || 'string'}</td></tr>
        <tr><td>Output</td><td>${cap.outputType || 'string'}</td></tr>
        <tr><td>Deterministic</td><td>${cap.deterministic ? 'yes' : 'no'}</td></tr>
        <tr><td>Side effects</td><td>${cap.sideEffects || 'none'}</td></tr>
        <tr><td>Auth</td><td>${cap.auth || 'none'}</td></tr>
        <tr><td>Price</td><td>${cap.pricing?.type || 'free'}</td></tr>
        <tr><td>P95</td><td>${cap.performance?.p95_ms || '?'}ms</td></tr>
        <tr><td>Last verified</td><td>${cap.lastVerified || 'never'}</td></tr>
      </table>
    </section>

    <section>
      <h2>Links</h2>
      <ul>
        <li><a href="${cap.interfaces?.http}">API</a></li>
        <li><a href="${cap.interfaces?.mcp}">MCP</a></li>
        <li><a href="${cap.interfaces?.openapi}">OpenAPI</a></li>
        <li><a href="https://chatgpt.com/app/${cap.id}">Connect to ChatGPT</a></li>
      </ul>
    </section>
  </main>
</body>
</html>`;
  }

  toMarkdown(cap) {
    return `# ${cap.name}

${cap.description}

## Use when

${cap.useWhen || 'Input matches this capability.'}

## Don't use when

${cap.dontUseWhen || 'Task requires state or authentication.'}

## Input

\`${cap.inputType || 'string'}\`

## Output

\`${cap.outputType || 'string'}\`

## Details

- Deterministic: ${cap.deterministic ? 'yes' : 'no'}
- Side effects: ${cap.sideEffects || 'none'}
- Auth: ${cap.auth || 'none'}
- Price: ${cap.pricing?.type || 'free'}
- P95: ${cap.performance?.p95_ms || '?'}ms
- Last verified: ${cap.lastVerified || 'never'}

## Links

- API: ${cap.interfaces?.http}
- MCP: ${cap.interfaces?.mcp}
- OpenAPI: ${cap.interfaces?.openapi}`;
  }

  toJSON(cap) {
    return {
      id: cap.id,
      name: cap.name,
      description: cap.description,
      status: cap.status || 'healthy',
      interfaces: cap.interfaces || {},
      pricing: cap.pricing || { type: 'free' },
      performance: cap.performance || {},
      useWhen: cap.useWhen,
      dontUseWhen: cap.dontUseWhen,
      inputType: cap.inputType,
      outputType: cap.outputType,
      deterministic: cap.deterministic,
      lastVerified: cap.lastVerified
    };
  }

  toJSONLD(cap) {
    return {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: cap.name,
      description: cap.description,
      url: `https://g-et.com${cap.path}`,
      applicationCategory: 'DeveloperApplication',
      offers: {
        '@type': 'Offer',
        price: cap.pricing?.type === 'free' ? '0' : cap.pricing?.price,
        priceCurrency: 'USD'
      }
    };
  }
}

export default CanonicalPageGenerator;
