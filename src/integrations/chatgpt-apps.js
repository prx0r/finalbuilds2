// ChatGPT Plugin submission bundle generator.
// Target: docs/CHATGPT_SUBMISSION_TARGET.md (spec-fetched 2026-09-11).
// Input: site manifest (registry/sites/*.json) + tool descriptors.
// Output: portal-ready bundle (Info/MCP/Prompts/Testing/Global skeleton) + validation report.

const REQUIRED_ANNOTATIONS = ['readOnlyHint', 'openWorldHint', 'destructiveHint'];
const BANNED_NAME_TOKENS = ['pick_me', 'best', 'official', 'number_one', 'top_rated'];

export function validateToolDescriptor(t) {
  const errors = [];
  if (!t.name) errors.push('missing name');
  else {
    if (!/^[a-z][a-z0-9_]*$/.test(t.name)) errors.push(`name "${t.name}" must be snake_case verb-led`);
    for (const tok of BANNED_NAME_TOKENS) {
      if (t.name.includes(tok)) errors.push(`name "${t.name}" contains banned token "${tok}"`);
    }
  }
  if (!t.description || t.description.length < 20) errors.push(`tool "${t.name}": description too short (<20 chars)`);
  if (!t.inputSchema || t.inputSchema.type !== 'object') errors.push(`tool "${t.name}": inputSchema must be object`);
  // Minimal-inputs: flag suspicious catch-all fields
  const props = Object.keys(t.inputSchema?.properties ?? {});
  for (const p of ['conversation_history', 'chat_transcript', 'full_context', 'raw_chat']) {
    if (props.includes(p)) errors.push(`tool "${t.name}": input "${p}" violates minimal-inputs rule`);
  }
  if (t.outputSchema && (!t.outputSchema.type || t.outputSchema.type !== 'object')) {
    errors.push(`tool "${t.name}": outputSchema must be object when present`);
  }
  for (const a of REQUIRED_ANNOTATIONS) {
    if (!t.annotations || typeof t.annotations[a] !== 'boolean') {
      errors.push(`tool "${t.name}": annotation "${a}" must be boolean`);
    }
  }
  // Annotation coherence
  if (t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === true) {
    errors.push(`tool "${t.name}": readOnly + destructive is incoherent`);
  }
  if (!t.annotationJustification || t.annotationJustification.length < 10) {
    errors.push(`tool "${t.name}": annotationJustification required (>=10 chars)`);
  }
  return errors;
}

export function validateListing(listing) {
  const errors = [];
  for (const f of ['name', 'shortDescription', 'longDescription', 'website', 'supportUrl', 'privacyPolicyUrl', 'termsUrl', 'category']) {
    if (!listing?.[f]) errors.push(`listing missing "${f}"`);
  }
  if (listing?.name && listing.name.split(/\s+/).length < 2) {
    errors.push('plugin name too generic (single-word dictionary terms rejected)');
  }
  return errors;
}

export class ChatGPTAppsSDK {
  constructor(config = {}) {
    this.baseUrl = (config.baseUrl || '').replace(/\/$/, '');
  }

  // Canonical tool descriptor builder: enforces target-state shape at creation.
  static tool({ name, description, inputSchema, outputSchema, annotations, annotationJustification, meta }) {
    return { name, description, inputSchema, outputSchema, annotations, annotationJustification, _meta: meta };
  }

  generateManifest(site, tools) {
    return {
      schema: 'chatgpt-plugin-manifest/v1',
      plugin: {
        name: site.name,
        mcpServerUrl: `${this.baseUrl}/mcp`,
        urlType: 'Universal',
        domainVerification: `${this.baseUrl}/.well-known/openai-apps-challenge`,
      },
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        outputSchema: t.outputSchema,
        annotations: t.annotations,
        _meta: t._meta,
      })),
    };
  }

  generateSubmissionBundle({ site, listing, tools, prompts = [], testCases = { positive: [], negative: [] }, availability = [], releaseNotes = '' }) {
    const toolErrors = tools.flatMap(validateToolDescriptor);
    const listingErrors = validateListing(listing);
    const testErrors = [];
    if (testCases.positive.length < 5) testErrors.push(`need 5 positive test cases, have ${testCases.positive.length}`);
    if (testCases.negative.length < 3) testErrors.push(`need 3 negative test cases, have ${testCases.negative.length}`);
    for (const tc of [...testCases.positive, ...testCases.negative]) {
      if (!tc.prompt || !tc.expected) testErrors.push('test case missing prompt/expected');
    }
    if (!prompts.length) testErrors.push('need starter prompts');
    if (!availability.length) testErrors.push('need country availability');

    return {
      info: { ...listing, developerIdentity: 'VERIFY_IN_PORTAL' },
      mcp: {
        serverUrl: `${this.baseUrl}/mcp`,
        urlType: 'Universal',
        domainVerification: `${this.baseUrl}/.well-known/openai-apps-challenge`,
        scanTools: 'run in portal after deploy',
      },
      tools,
      prompts,
      testing: testCases,
      global: availability,
      releaseNotes,
      validation: { valid: toolErrors.length + listingErrors.length + testErrors.length === 0, toolErrors, listingErrors, testErrors },
    };
  }
}

export default ChatGPTAppsSDK;
