// Gmail Integration for FinalBuilds2
// Email as inter-agent handoff layer

export class GmailIntegration {
  constructor(config = {}) {
    this.mcpEndpoint = config.mcpEndpoint || 'stdio';
    this.account = config.account || 'agent@tinytools.xyz';
  }

  // Create job email template
  createJobEmail(job) {
    return {
      to: job.to || this.account,
      subject: `[JOB] ${job.type}: ${job.title}`,
      body: this.formatJobBody(job),
      labels: [`JOB/${job.type.toUpperCase()}`, 'pending']
    };
  }

  formatJobBody(job) {
    return `JOB_ID: ${job.id}
TYPE: ${job.type}
REPO: ${job.repo || 'N/A'}
PRIORITY: ${job.priority || 'normal'}
REQUIRES_HUMAN_APPROVAL: ${job.requiresApproval || false}

OBJECTIVE:
${job.objective}

${job.research ? `RESEARCH:\n${job.research}\n` : ''}
${job.criteria ? `ACCEPTANCE_CRITERIA:\n${job.criteria}\n` : ''}
${job.sources ? `SOURCES:\n${job.sources}\n` : ''}`;
  }

  // Parse job email
  parseJobEmail(emailBody) {
    const job = {};
    const lines = emailBody.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('JOB_ID:')) job.id = line.split(':').slice(1).join(':').trim();
      if (line.startsWith('TYPE:')) job.type = line.split(':').slice(1).join(':').trim();
      if (line.startsWith('REPO:')) job.repo = line.split(':').slice(1).join(':').trim();
      if (line.startsWith('PRIORITY:')) job.priority = line.split(':').slice(1).join(':').trim();
    }
    
    // Extract sections
    const sections = emailBody.split(/\n[A-Z_]+:\n/);
    for (let i = 1; i < sections.length; i++) {
      const header = sections[i-1].split('\n').pop()?.trim() || '';
      const content = sections[i].trim();
      if (header === 'OBJECTIVE') job.objective = content;
      if (header === 'RESEARCH') job.research = content;
      if (header === 'ACCEPTANCE_CRITERIA') job.criteria = content;
      if (header === 'SOURCES') job.sources = content;
    }
    
    return job;
  }

  // Create completion email
  createCompletionEmail(job, result) {
    return {
      to: job.replyTo || this.account,
      subject: `[DONE] ${job.type}: ${job.title}`,
      body: `JOB_ID: ${job.id}
STATUS: completed
${result.summary ? `SUMMARY:\n${result.summary}\n` : ''}
${result.artifacts ? `ARTIFACTS:\n${result.artifacts.join('\n')}\n` : ''}
${result.metrics ? `METRICS:\n${JSON.stringify(result.metrics, null, 2)}\n` : ''}`,
      labels: [`JOB/${job.type.toUpperCase()}`, 'completed']
    };
  }

  // Create failure email
  createFailureEmail(job, error) {
    return {
      to: job.replyTo || this.account,
      subject: `[FAIL] ${job.type}: ${job.title}`,
      body: `JOB_ID: ${job.id}
STATUS: failed
ERROR:
${error.message}
${error.stack ? `\nSTACK:\n${error.stack}` : ''}`,
      labels: [`JOB/${job.type.toUpperCase()}`, 'failed']
    };
  }

  // Search for pending jobs
  getPendingJobsQuery() {
    return 'label:JOB/pending -label:JOB/completed -label:JOB/failed';
  }

  // Get MCP tools for Gmail
  getMcpTools() {
    return [
      { name: 'gmail_send', description: 'Send an email', inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] } },
      { name: 'gmail_search', description: 'Search Gmail', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
      { name: 'gmail_read', description: 'Read an email', inputSchema: { type: 'object', properties: { messageId: { type: 'string' } }, required: ['messageId'] } },
      { name: 'gmail_label', description: 'Add label to email', inputSchema: { type: 'object', properties: { messageId: { type: 'string' }, label: { type: 'string' } }, required: ['messageId', 'label'] } }
    ];
  }
}

export default GmailIntegration;
