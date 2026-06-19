const url = process.argv[2];
const timeoutMs = Number(process.argv[3] || 30_000);
const started = Date.now();

if (!url) {
  throw new Error('Usage: node scripts/wait-for-url.mjs <url> [timeout_ms]');
}

while (Date.now() - started < timeoutMs) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (response.ok) {
      console.log(`URL ready: ${url}`);
      process.exit(0);
    }
  } catch {
    // Retry until timeout.
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

throw new Error(`Timed out waiting for ${url}`);
