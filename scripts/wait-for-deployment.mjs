import { request } from 'node:https';

const markerUrl = process.argv[2];
const expectedBuildId = process.argv[3];
const timeoutMs = Number(process.argv[4] || 120_000);

if (!markerUrl || !expectedBuildId) {
  throw new Error('Usage: node scripts/wait-for-deployment.mjs <marker_url> <expected_build_id> [timeout_ms]');
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const status = response.statusCode || 0;
        if (status < 200 || status >= 300) {
          resolve({ status, body: null });
          return;
        }
        try {
          resolve({ status, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        } catch {
          resolve({ status, body: null });
        }
      });
    });
    req.setTimeout(10_000, () => {
      req.destroy(new Error(`Request timed out: ${url}`));
    });
    req.on('error', reject).end();
  });
}

const started = Date.now();

while (Date.now() - started < timeoutMs) {
  try {
    const { status, body } = await fetchJson(markerUrl);
    if (body && body.build_id === expectedBuildId) {
      console.log(`Deployment confirmed: build_id=${expectedBuildId}`);
      process.exit(0);
    }
    if (body && body.build_id !== expectedBuildId) {
      console.log(`Waiting for deployment propagation (got build_id=${body.build_id}, expected ${expectedBuildId})`);
    } else {
      console.log(`Waiting for deployment (status ${status})`);
    }
  } catch {
    console.log('Waiting for deployment (request failed)');
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

throw new Error(`Timed out waiting for deployment marker ${markerUrl} with build_id=${expectedBuildId}`);
