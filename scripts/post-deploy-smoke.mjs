import { request } from 'node:https';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    request(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          status: response.statusCode || 0,
          headers: response.headers,
          body: Buffer.concat(chunks)
        });
      });
    }).on('error', reject).end();
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasSecretLikeValue(text) {
  return /(ghp_|github_pat_|Bearer\s+[A-Za-z0-9._-]+|GOATCOUNTER_API_KEY|OSS_DASHBOARD_GITHUB_TOKEN)/.test(text);
}

async function expectPath(baseUrl, path, { contentType, json = false } = {}) {
  const url = new URL(path, baseUrl).toString();
  const response = await fetchUrl(url);
  assert(response.status >= 200 && response.status < 300, `${url} returned ${response.status}`);
  const actualType = String(response.headers['content-type'] || '');
  if (contentType) assert(actualType.includes(contentType), `${url} content type was ${actualType}`);
  assert(!hasSecretLikeValue(response.body.toString('utf8')), `${url} contains a secret-like value`);
  return json ? JSON.parse(response.body.toString('utf8')) : response;
}

async function main() {
  const [baseUrl, projectId, environment, historyPath = 'metrics-history-dev.json', mode = 'site'] = process.argv.slice(2);
  assert(baseUrl, 'base URL is required');
  assert(projectId, 'project id is required');
  assert(environment, 'environment is required');

  if (mode === 'report') {
    const pdf = await expectPath(baseUrl, 'reports/latest.pdf');
    assert(pdf.body.subarray(0, 5).equals(Buffer.from('%PDF-')), 'latest PDF is missing magic bytes');
    assert(pdf.body.length >= 1024, 'latest PDF is too small');
    const status = await expectPath(baseUrl, 'report-status.json', { contentType: 'application/json', json: true });
    assert(status.available === true, 'report status should be available after report publish');
    return;
  }

  await expectPath(baseUrl, 'index.html', { contentType: 'text/html' });
  await expectPath(baseUrl, 'operations.html', { contentType: 'text/html' });
  await expectPath(baseUrl, 'impact.html', { contentType: 'text/html' });
  await expectPath(baseUrl, 'report.html', { contentType: 'text/html' });
  await expectPath(baseUrl, 'rtd-goatcounter.js', { contentType: 'javascript' });
  await expectPath(baseUrl, historyPath, { contentType: 'application/json', json: true });
  const dataset = await expectPath(baseUrl, 'data/dashboard.json', {
    contentType: 'application/json',
    json: true
  });
  assert(dataset.project?.id === projectId, `dataset project id mismatch: ${dataset.project?.id}`);
  assert(dataset.project?.environment === environment, `dataset environment mismatch: ${dataset.project?.environment}`);
  const generatedAt = new Date(dataset.generated_at);
  assert(!Number.isNaN(generatedAt.valueOf()), 'dataset generated_at is invalid');
  assert(Date.now() - generatedAt.valueOf() < 72 * 3600 * 1000, 'dataset generated_at is stale');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
