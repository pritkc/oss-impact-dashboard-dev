import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const dist = join(root, 'dist');
const pages = ['index.html', 'operations.html', 'impact.html', 'report.html'];
const basePath = process.env.GITHUB_REPOSITORY
  ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
  : '/';

function assertExists(path, label) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label}: ${path}`);
  }
}

function assetPathFromUrl(url) {
  if (!url.startsWith(basePath)) {
    throw new Error(`Asset URL does not use expected base ${basePath}: ${url}`);
  }
  return join(dist, url.slice(basePath.length));
}

assertExists(dist, 'dist directory');
assertExists(join(dist, 'data', 'dashboard.json'), 'dashboard dataset');

for (const page of pages) {
  const pagePath = join(dist, page);
  assertExists(pagePath, page);

  const html = readFileSync(pagePath, 'utf8');
  const assetUrls = [
    ...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+\.(?:js|css))"/g),
  ].map((match) => match[1]);

  if (assetUrls.length === 0) {
    throw new Error(`No JS/CSS assets referenced by ${page}`);
  }

  for (const assetUrl of assetUrls) {
    assertExists(assetPathFromUrl(assetUrl), `${page} asset ${assetUrl}`);
  }
}

console.log(`postbuild ok: ${pages.length} pages, dataset, and referenced assets exist`);

