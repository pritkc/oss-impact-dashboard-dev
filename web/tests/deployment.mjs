import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { githubPagesBase } from '../../scripts/base-path.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function withEnv(env, fn) {
  const original = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

assert(
  withEnv({ GITHUB_REPOSITORY: 'csrc-sdsu/oss-impact-dashboard', VITE_BASE_PATH: '' }, () =>
    githubPagesBase()
  ) === '/oss-impact-dashboard/',
  'repository base should be derived from GITHUB_REPOSITORY'
);

assert(
  withEnv(
    {
      GITHUB_REPOSITORY: 'csrc-sdsu/oss-impact-dashboard',
      VITE_BASE_PATH: '/oss-impact-dashboard/pr-preview/pr-999/'
    },
    () => githubPagesBase()
  ) === '/oss-impact-dashboard/pr-preview/pr-999/',
  'explicit PR preview base should win'
);

for (const basePath of ['/oss-impact-dashboard/', '/oss-impact-dashboard/pr-preview/pr-999/']) {
  const dom = new JSDOM('<!doctype html><main></main>', {
    url: `https://example.test${basePath}report.html`
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;

  const { localLink } = await import(`../src/safe-dom.js?base=${encodeURIComponent(basePath)}`);
  const link = localLink('Download latest PDF', './reports/latest.pdf');
  assert(
    link.href === `https://example.test${basePath}reports/latest.pdf`,
    `PDF link should resolve within base path: ${basePath}`
  );
}

const refreshWorkflow = readFileSync('.github/workflows/refresh-deploy.yml', 'utf8');
assert(refreshWorkflow.includes('branches:\n      - main'), 'production deploy must stay on main');
assert(refreshWorkflow.includes('vars.PROJECT_CONFIG'), 'production deploy must use PROJECT_CONFIG variable');
assert(refreshWorkflow.includes('project_config:'), 'production deploy must allow manual project_config override');
assert(refreshWorkflow.includes('clean-exclude:'), 'production deploy must preserve previews');
assert(refreshWorkflow.includes('pr-preview/'), 'production deploy must preserve pr-preview/');
assert(refreshWorkflow.includes('metrics-history-dev.json'), 'production deploy must preserve dev snapshot history');
assert(refreshWorkflow.includes('".github/workflows/**"'), 'production deploy must watch workflows');
assert(refreshWorkflow.includes('"scripts/**"'), 'production deploy must watch scripts');
assert(refreshWorkflow.includes('GOATCOUNTER_API_KEY: ${{ secrets.GOATCOUNTER_API_KEY }}'), 'production data collection needs GoatCounter API secret');
assert(refreshWorkflow.includes('GOATCOUNTER_SITE_URL: ${{ vars.GOATCOUNTER_SITE_URL }}'), 'production build needs public GoatCounter site URL');

const previewWorkflow = readFileSync('.github/workflows/pr-preview.yml', 'utf8');
assert(
  previewWorkflow.includes('github.event.pull_request.head.repo.full_name == github.repository'),
  'PR preview must be limited to same-repository pull requests'
);
assert(previewWorkflow.includes('pull_request:'), 'PR preview must use pull_request');
assert(!previewWorkflow.includes('pull_request_target'), 'PR preview must not use pull_request_target');
assert(
  previewWorkflow.includes('/pr-preview/pr-${{ github.event.number }}/'),
  'PR preview must use nested base path'
);
assert(previewWorkflow.includes('wait-for-pages-deployment: true'), 'PR preview wait must be true');
assert(previewWorkflow.includes('pr-preview-action@v1'), 'PR preview action must publish previews');
assert(previewWorkflow.includes('qr-code: false'), 'PR preview QR code must be disabled');
assert(!previewWorkflow.includes('secrets.OSS_DASHBOARD_GITHUB_TOKEN'), 'PR preview must not expose GitHub dashboard secret');
assert(!previewWorkflow.includes('secrets.GOATCOUNTER_API_KEY'), 'PR preview must not expose GoatCounter API key');

const reportWorkflow = readFileSync('.github/workflows/generate-report.yml', 'utf8');
assert(reportWorkflow.includes('vars.PROJECT_CONFIG'), 'report workflow must use PROJECT_CONFIG variable');
assert(reportWorkflow.includes('project_config:'), 'report workflow must allow manual project_config override');
assert(reportWorkflow.includes('node scripts/wait-for-url.mjs'), 'report workflow must wait for preview');
assert(reportWorkflow.includes('node scripts/publish-report-pdf.mjs'), 'report PDF publish script missing');
assert(reportWorkflow.includes('ref: gh-pages'), 'report workflow must checkout gh-pages');
assert(reportWorkflow.includes('git add reports/latest.pdf'), 'report workflow must only stage latest PDF');

const diagnosticsWorkflow = readFileSync('.github/workflows/integration-diagnostics.yml', 'utf8');
assert(diagnosticsWorkflow.includes('workflow_dispatch:'), 'diagnostics must be manual only');
assert(diagnosticsWorkflow.includes("github.ref == 'refs/heads/main'"), 'diagnostics must run from main');
assert(diagnosticsWorkflow.includes('doctor --project "$PROJECT_CONFIG"'), 'diagnostics must run doctor command');

console.log('deployment tests ok');
