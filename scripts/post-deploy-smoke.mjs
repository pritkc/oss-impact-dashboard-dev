import { request } from 'node:https';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const REQUEST_TIMEOUT_MS = 30000;

// Match the *values* of leaked credentials, never the variable names that
// legitimately appear in human-readable diagnostics (e.g. "requires GH_PAT_MOLE").
const SECRET_VALUE_PATTERNS = [
  /\bgh[oprsu]_[A-Za-z0-9]{36,}\b/, // GitHub PAT / OAuth / app / refresh / user-to-server tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, // GitHub fine-grained PAT
  /\bBearer\s+[A-Za-z0-9._-]{20,}\b/ // Authorization bearer tokens
];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          status: response.statusCode || 0,
          headers: response.headers,
          body: Buffer.concat(chunks)
        });
      });
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`));
    });
    req.on('error', reject).end();
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function hasSecretLikeValue(text) {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(text));
}

async function expectPath(baseUrl, path, { contentType, json = false } = {}) {
  const url = new URL(path, baseUrl).toString();
  const response = await fetchUrl(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`);
  assert(response.status >= 200 && response.status < 300, `${url} returned ${response.status}`);
  const actualType = String(response.headers['content-type'] || '');
  if (contentType) assert(actualType.includes(contentType), `${url} content type was ${actualType}`);
  assert(!hasSecretLikeValue(response.body.toString('utf8')), `${url} contains a secret-like value`);
  return json ? JSON.parse(response.body.toString('utf8')) : response;
}

async function main() {
  const [
    baseUrl,
    projectId,
    environment,
    historyPath = 'metrics-history.json',
    mode = 'site',
    expectedBuildId = '',
    expectedCommitShaOrWorkflowStart = '',
    workflowStartedAt = ''
  ] = process.argv.slice(2);
  assert(baseUrl, 'base URL is required');
  assert(projectId, 'project id is required');
  assert(environment, 'environment is required');

  if (mode === 'report') {
    assert(expectedBuildId, 'expected build id is required for report smoke');
    assert(expectedCommitShaOrWorkflowStart, 'workflow start time is required for report smoke');
    const pdf = await expectPath(baseUrl, 'reports/latest.pdf');
    assert(pdf.body.subarray(0, 5).equals(Buffer.from('%PDF-')), 'latest PDF is missing magic bytes');
    assert(pdf.body.length >= 1024, 'latest PDF is too small');
    const status = await expectPath(baseUrl, 'report-status.json', { contentType: 'application/json', json: true });
    assert(status.available === true, 'report status should be available after report publish');
    assert(status.project_id === projectId, `report project id mismatch: ${status.project_id}`);
    assert(status.environment === environment, `report environment mismatch: ${status.environment}`);
    assert(status.build_id === expectedBuildId, `report build id mismatch: ${status.build_id}`);
    const generatedAt = new Date(status.generated_at);
    const workflowStart = new Date(expectedCommitShaOrWorkflowStart);
    assert(!Number.isNaN(generatedAt.valueOf()), 'report generated_at is invalid');
    assert(!Number.isNaN(workflowStart.valueOf()), 'workflow start time is invalid');
    assert(generatedAt.valueOf() >= workflowStart.valueOf(), 'report generated_at is older than workflow start');
    return;
  }

  assert(expectedBuildId, 'expected build id is required for site smoke');
  assert(expectedCommitShaOrWorkflowStart, 'expected commit sha is required for site smoke');
  assert(workflowStartedAt, 'workflow start time is required for site smoke');

  await expectPath(baseUrl, 'index.html', { contentType: 'text/html' });
  await expectPath(baseUrl, 'settings.html', { contentType: 'text/html' });
  await expectPath(baseUrl, 'report.html', { contentType: 'text/html' });
  await expectPath(baseUrl, 'rtd-goatcounter.js', { contentType: 'javascript' });
  await expectPath(baseUrl, historyPath, { contentType: 'application/json', json: true });
  const marker = await expectPath(baseUrl, 'deployment-marker.json', {
    contentType: 'application/json',
    json: true
  });
  assert(marker.build_id === expectedBuildId, `deployment build id mismatch: ${marker.build_id}`);
  assert(marker.commit_sha === expectedCommitShaOrWorkflowStart, `deployment commit sha mismatch: ${marker.commit_sha}`);
  const markerGeneratedAt = new Date(marker.generated_at);
  const workflowStart = new Date(workflowStartedAt);
  assert(!Number.isNaN(markerGeneratedAt.valueOf()), 'deployment marker generated_at is invalid');
  assert(!Number.isNaN(workflowStart.valueOf()), 'workflow start time is invalid');
  assert(markerGeneratedAt.valueOf() >= workflowStart.valueOf(), 'deployment marker is older than workflow start');
  const dataset = await expectPath(baseUrl, 'data/dashboard.json', {
    contentType: 'application/json',
    json: true
  });
  assert(dataset.project?.id === projectId, `dataset project id mismatch: ${dataset.project?.id}`);
  assert(dataset.project?.environment === environment, `dataset environment mismatch: ${dataset.project?.environment}`);
  assert(dataset.schema_version >= 5, `dataset schema version should be >= 5, got ${dataset.schema_version}`);
  assert(dataset.security !== undefined, 'dataset missing security section');
  assert(dataset.community_standards !== undefined, 'dataset missing community_standards section');
  assert(dataset.adoption !== undefined, 'dataset missing adoption section');
  assert(dataset.governance !== undefined, 'dataset missing governance section');
  assert(dataset.targets_progress !== undefined, 'dataset missing targets_progress section');
  assert(dataset.operations?.newcomer_funnel !== undefined, 'dataset missing newcomer_funnel in operations');
  const generatedAt = new Date(dataset.generated_at);
  assert(!Number.isNaN(generatedAt.valueOf()), 'dataset generated_at is invalid');
  assert(generatedAt.valueOf() >= workflowStart.valueOf(), 'dataset generated_at is older than workflow start');
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath === modulePath) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
