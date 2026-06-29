import { request } from 'node:https';

const markerUrl = process.argv[2];
const expectedBuildId = process.argv[3];
const timeoutMs = Number(process.argv[4] || 120_000);

if (!markerUrl || !expectedBuildId) {
  throw new Error('Usage: node scripts/wait-for-deployment.mjs <marker_url> <expected_build_id> [timeout_ms]');
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function fetchOnce(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          status: response.statusCode || 0,
          location: response.headers.location,
          buffer: Buffer.concat(chunks)
        });
      });
    });
    req.setTimeout(10_000, () => {
      req.destroy(new Error(`Request timed out: ${url}`));
    });
    req.on('error', reject).end();
  });
}

// Follow redirects so the github.io URL works even when Pages serves a custom domain.
async function fetchJson(url, maxRedirects = 5) {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const { status, location, buffer } = await fetchOnce(current);
    if (REDIRECT_STATUSES.has(status) && location) {
      current = new URL(location, current).toString();
      continue;
    }
    if (status < 200 || status >= 300) {
      return { status, body: null };
    }
    try {
      return { status, body: JSON.parse(buffer.toString('utf8')) };
    } catch {
      return { status, body: null };
    }
  }
  return { status: 0, body: null };
}

const started = Date.now();

while (Date.now() - started < timeoutMs) {
  try {
    const { status, body } = await fetchJson(`${markerUrl}?t=${Date.now()}`);
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
