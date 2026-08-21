import test from 'node:test';
import assert from 'node:assert/strict';
import { GmailIntegration } from '../src/integrations/gmail.js';

test('GmailIntegration creates job email', () => {
  const gmail = new GmailIntegration();
  const email = gmail.createJobEmail({
    id: 'job-001',
    type: 'research',
    title: 'Domain Research',
    objective: 'Find available domains for agent tools',
    to: 'agent@example.com'
  });
  assert.equal(email.to, 'agent@example.com');
  assert.ok(email.subject.includes('JOB'));
  assert.ok(email.body.includes('JOB_ID: job-001'));
  assert.ok(email.labels.some(l => l.includes('JOB')));
});

test('GmailIntegration parses job email', () => {
  const gmail = new GmailIntegration();
  const body = `JOB_ID: tinytools-20260821-0042
TYPE: research_handoff
REPO: prx0r/tinytools
PRIORITY: normal

OBJECTIVE:
Find available domains for agent tools`;
  
  const job = gmail.parseJobEmail(body);
  assert.equal(job.id, 'tinytools-20260821-0042');
  assert.equal(job.type, 'research_handoff');
  assert.equal(job.repo, 'prx0r/tinytools');
});

test('GmailIntegration creates completion email', () => {
  const gmail = new GmailIntegration();
  const email = gmail.createCompletionEmail(
    { id: 'job-001', type: 'research', title: 'Domain Research', replyTo: 'boss@example.com' },
    { summary: 'Found 8 available domains', artifacts: ['report.md', 'domains.json'] }
  );
  assert.equal(email.to, 'boss@example.com');
  assert.ok(email.subject.includes('DONE'));
  assert.ok(email.body.includes('STATUS: completed'));
  assert.ok(email.labels.some(l => l.includes('JOB')));
});

test('GmailIntegration creates failure email', () => {
  const gmail = new GmailIntegration();
  const email = gmail.createFailureEmail(
    { id: 'job-001', type: 'build', title: 'Build App' },
    { message: 'Compilation failed', stack: 'Error at line 42' }
  );
  assert.ok(email.subject.includes('FAIL'));
  assert.ok(email.body.includes('STATUS: failed'));
  assert.ok(email.body.includes('Compilation failed'));
});

test('GmailIntegration returns MCP tools', () => {
  const gmail = new GmailIntegration();
  const tools = gmail.getMcpTools();
  assert.ok(tools.length > 0);
  assert.ok(tools.some(t => t.name === 'gmail_send'));
  assert.ok(tools.some(t => t.name === 'gmail_search'));
});

test('GmailIntegration generates search query', () => {
  const gmail = new GmailIntegration();
  const query = gmail.getPendingJobsQuery();
  assert.ok(query.includes('label:JOB/pending'));
  assert.ok(query.includes('-label:JOB/completed'));
});
