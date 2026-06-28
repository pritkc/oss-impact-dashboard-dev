import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

function normalizeBasePath(value) {
  if (!value) {
    return null;
  }
  if (value === '/') {
    return '/';
  }
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'oss-impact-dashboard';
const explicitBase = normalizeBasePath(process.env.VITE_BASE_PATH);
const githubPagesBase =
  process.env.GITHUB_ACTIONS === 'true' ? `/${repositoryName}/` : '/';
const root = fileURLToPath(new URL('web', import.meta.url));

export default defineConfig({
  base: explicitBase || githubPagesBase,
  root,
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        settings: resolve(root, 'settings.html'),
        report: resolve(root, 'report.html')
      }
    }
  }
});
