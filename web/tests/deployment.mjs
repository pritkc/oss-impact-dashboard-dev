import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { githubPagesBase } from '../../scripts/base-path.mjs';
import { hasSecretLikeValue } from '../../scripts/post-deploy-smoke.mjs';

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

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
assert(packageJson.scripts.test, 'package.json must define npm run test');
assert(packageJson.scripts['build:site'], 'package.json must define npm run build:site');
assert(packageJson.scripts.ci, 'package.json must define npm run ci');

const ciCheckScript = readFileSync('scripts/ci-check.sh', 'utf8');
assert(ciCheckScript.includes('CI_MODE'), 'ci-check.sh must support CI_MODE');
assert(
  ciCheckScript.includes('--projects projects/example.yml'),
  'build step must use projects/example.yml for CI'
);
assert(
  packageJson.scripts['build:data'],
  'package.json must define npm run build:data'
);
assert(
  packageJson.scripts['build:ui'],
  'package.json must define npm run build:ui'
);
assert(ciCheckScript.includes('ci_test'), 'ci-check.sh must define test phase');
assert(ciCheckScript.includes('ci_build_site'), 'ci-check.sh must define build phase');

const refreshWorkflow = readFileSync('.github/workflows/refresh-deploy.yml', 'utf8');
const testWorkflow = readFileSync('.github/workflows/test.yml', 'utf8');
assert(testWorkflow.includes('run: npm run ci'), 'test workflow must run full npm run ci');
assert(
  refreshWorkflow.includes('run: npm run build:site'),
  'deploy workflow must build site artifact only'
);
assert(
  !refreshWorkflow.includes('run: npm run ci'),
  'deploy workflow must not rerun full CI'
);
assert(refreshWorkflow.includes('branches:\n      - main'), 'production deploy must stay on main');
assert(refreshWorkflow.includes('group: gh-pages-write'), 'production deploy must use shared gh-pages concurrency');
assert(refreshWorkflow.includes('DEPLOY_PROJECT'), 'production deploy must set DEPLOY_PROJECT');
assert(refreshWorkflow.includes('npm run build:site -- --projects "$DEPLOY_PROJECT"'), 'production deploy must pass explicit projects to build:site');
assert(refreshWorkflow.includes('project_config:'), 'production deploy must allow manual project_config override');
assert(refreshWorkflow.includes('clean-exclude:'), 'production deploy must preserve previews');
assert(refreshWorkflow.includes('pr-preview/'), 'production deploy must preserve pr-preview/');
assert(
  refreshWorkflow.includes('force: false'),
  'production deploy must rebase instead of force-pushing so concurrent gh-pages writers are not clobbered'
);
assert(
  refreshWorkflow.includes('for path in metrics-history.json'),
  'deploy must restore snapshot history file'
);
assert(
  refreshWorkflow.includes('printf \'{"schema_version":1,"snapshots":[]}\\n\' > "$path"'),
  'deploy must create missing history files for first deployment'
);
assert(
  refreshWorkflow.includes('cp metrics-history.json dist/'),
  'deploy must publish snapshot history file'
);
assert(refreshWorkflow.includes('node scripts/restore-report-pdf.mjs'), 'deploy must restore existing PDF report');
assert(refreshWorkflow.includes('report-status.json'), 'deploy must publish report status');
assert(refreshWorkflow.includes('node scripts/post-deploy-smoke.mjs'), 'deploy must run post-deployment smoke');
assert(refreshWorkflow.includes('node scripts/wait-for-deployment.mjs'), 'deploy smoke must wait for deployment marker propagation');
assert(refreshWorkflow.includes('${BASE_URL}deployment-marker.json'), 'deploy smoke must poll deployment marker URL');
const cleanExcludeBlock = refreshWorkflow.split('clean-exclude:')[1] || '';
assert(!cleanExcludeBlock.includes('metrics-history.json'), 'production history must not be clean-excluded');
assert(refreshWorkflow.includes('".github/workflows/**"'), 'production deploy must watch workflows');
assert(refreshWorkflow.includes('"scripts/**"'), 'production deploy must watch scripts');
assert(
  refreshWorkflow.includes('GOATCOUNTER_API_KEY_MOLE: ${{ secrets.GOATCOUNTER_API_KEY_MOLE }}'),
  'production data collection needs project-specific GoatCounter API secret'
);
assert(
  refreshWorkflow.includes('bash scripts/restore-rtd-cache.sh'),
  'production deploy must restore Read the Docs cache from gh-pages'
);
assert(
  refreshWorkflow.includes('uses: ./.github/workflows/collect-rtd-analytics.yml'),
  'weekly production deploy must invoke Read the Docs collection workflow'
);
assert(
  !refreshWorkflow.includes('RTD_PASSWORD_MOLE'),
  'production deploy must not run Read the Docs login directly'
);
assert(
  refreshWorkflow.includes('GH_PAT_MOLE: ${{ secrets.GH_PAT_MOLE }}'),
  'production deploy needs project-specific GitHub token secret'
);
assert(
  !refreshWorkflow.includes('secrets.GITHUB_TOKEN_MOLE'),
  'production deploy must not use GITHUB_-prefixed PAT secret names'
);
assert(
  !refreshWorkflow.includes('OSS_DASHBOARD_GITHUB_TOKEN'),
  'production deploy must not use legacy OSS_DASHBOARD_GITHUB_TOKEN secret names'
);
assert(refreshWorkflow.includes('node scripts/deployment-marker.mjs dist'), 'deploy must write deployment marker');

const previewWorkflow = readFileSync('.github/workflows/pr-preview.yml', 'utf8');
assert(
  previewWorkflow.includes('run: npm run build:site'),
  'PR preview must build site artifact only'
);
assert(
  !previewWorkflow.includes('run: npm run ci'),
  'PR preview must not rerun full CI'
);
assert(
  previewWorkflow.includes('github.event.pull_request.head.repo.full_name == github.repository'),
  'PR preview must be limited to same-repository pull requests'
);
assert(previewWorkflow.includes('pull_request:'), 'PR preview must use pull_request');
assert(!previewWorkflow.includes('pull_request_target'), 'PR preview must not use pull_request_target');
assert(previewWorkflow.includes('group: gh-pages-write'), 'PR preview must use shared gh-pages concurrency');
assert(
  previewWorkflow.includes('group: gh-pages-cleanup-pr-${{ github.event.number }}'),
  'PR preview cleanup must use an isolated per-PR group so merging a PR never cancels the production deploy'
);
assert(previewWorkflow.includes('publish:'), 'PR preview must have a publish job');
assert(previewWorkflow.includes("github.event.action != 'closed'"), 'PR preview publish job must skip closed events');
assert(
  previewWorkflow.includes('/pr-preview/pr-${{ github.event.number }}/'),
  'PR preview must use nested base path'
);
assert(previewWorkflow.includes('wait-for-pages-deployment: true'), 'PR preview wait must be true');
assert(previewWorkflow.includes('pr-preview-action@v1'), 'PR preview action must publish previews');
assert(previewWorkflow.includes('cleanup:'), 'PR preview must have a cleanup job');
assert(previewWorkflow.includes("github.event.action == 'closed'"), 'PR preview cleanup must run only on closed events');
assert(previewWorkflow.includes('git rm -r --ignore-unmatch "$preview_dir"'), 'PR preview cleanup must remove only the PR preview directory');
assert(!previewWorkflow.split('cleanup:')[1].includes('actions/setup-node'), 'PR preview cleanup must not install Node');
assert(!previewWorkflow.split('cleanup:')[1].includes('actions/setup-python'), 'PR preview cleanup must not install Python');
assert(previewWorkflow.includes('qr-code: false'), 'PR preview QR code must be disabled');
assert(
  !previewWorkflow.includes('secrets.GH_PAT_MOLE }}'),
  'PR preview must not expose project-specific GitHub token secret'
);
assert(
  !previewWorkflow.includes('RTD_USERNAME_MOLE'),
  'PR preview must not expose Read the Docs credentials'
);
assert(
  !previewWorkflow.includes('collect-rtd-analytics'),
  'PR preview must not run Read the Docs collection'
);
assert(
  previewWorkflow.includes('npm run build:site -- --projects projects/example.yml'),
  'PR preview must build example project config'
);
assert(
  !previewWorkflow.includes('snapshot-append'),
  'PR preview must not append snapshot history'
);
assert(
  !previewWorkflow.includes('deployment-marker.mjs'),
  'PR preview must not write deployment markers'
);

const reportWorkflow = readFileSync('.github/workflows/generate-report.yml', 'utf8');
assert(
  reportWorkflow.includes('run: npm run build:site'),
  'report workflow must build site artifact only'
);
assert(
  !reportWorkflow.includes('run: npm run ci'),
  'report workflow must not rerun full CI'
);
assert(reportWorkflow.includes('group: gh-pages-write'), 'report workflow must use shared gh-pages concurrency');
assert(reportWorkflow.includes('DEPLOY_PROJECT'), 'report workflow must set DEPLOY_PROJECT');
assert(reportWorkflow.includes('npm run build:site -- --projects "$DEPLOY_PROJECT"'), 'report workflow must pass explicit projects to build:site');
assert(reportWorkflow.includes('project_config:'), 'report workflow must allow manual project_config override');
assert(reportWorkflow.includes('node scripts/wait-for-url.mjs'), 'report workflow must wait for preview');
assert(reportWorkflow.includes('node scripts/publish-report-pdf.mjs'), 'report PDF publish script missing');
assert(reportWorkflow.includes('ref: gh-pages'), 'report workflow must checkout gh-pages');
assert(reportWorkflow.includes('name: Synchronize gh-pages'), 'report workflow must synchronize gh-pages before publishing');
assert(reportWorkflow.includes('git reset --hard origin/gh-pages'), 'report workflow must reset gh-pages before publishing');
assert(reportWorkflow.includes('for attempt in 1 2 3'), 'report workflow must retry bounded push conflicts');
assert(reportWorkflow.includes('git add reports/latest.pdf report-status.json'), 'report workflow must stage latest PDF and status');
assert(reportWorkflow.includes('node scripts/post-deploy-smoke.mjs'), 'report workflow must run report smoke');

const diagnosticsWorkflow = readFileSync('.github/workflows/integration-diagnostics.yml', 'utf8');
assert(diagnosticsWorkflow.includes('workflow_dispatch:'), 'diagnostics must be manual only');
assert(diagnosticsWorkflow.includes('doctor --project "$DEPLOY_PROJECT"'), 'diagnostics must run doctor command');
assert(diagnosticsWorkflow.includes('Build dataset (full secrets)'), 'diagnostics must build dataset with full secrets');
assert(diagnosticsWorkflow.includes('secrets.GH_PAT_MOLE'), 'diagnostics must use project-specific GitHub token secret');
assert(
  !diagnosticsWorkflow.includes('OSS_DASHBOARD_GITHUB_TOKEN'),
  'diagnostics must not use legacy OSS_DASHBOARD_GITHUB_TOKEN secret names'
);
assert(diagnosticsWorkflow.includes('secrets.GOATCOUNTER_API_KEY_MOLE'), 'diagnostics must use project-specific GoatCounter API key');

const collectRtdWorkflow = readFileSync('.github/workflows/collect-rtd-analytics.yml', 'utf8');
assert(collectRtdWorkflow.includes('workflow_dispatch:'), 'RTD collection must support manual dispatch');
assert(collectRtdWorkflow.includes('schedule:'), 'RTD collection must have a dedicated schedule');
assert(collectRtdWorkflow.includes('workflow_call:'), 'RTD collection must be reusable from deploy workflow');
assert(collectRtdWorkflow.includes('node scripts/collect-rtd-analytics.mjs'), 'RTD collection must use Playwright collector script');
assert(collectRtdWorkflow.includes('RTD_USERNAME_MOLE: ${{ secrets.RTD_USERNAME_MOLE }}'), 'RTD collection must use project-specific username secret');
assert(collectRtdWorkflow.includes('RTD_PASSWORD_MOLE: ${{ secrets.RTD_PASSWORD_MOLE }}'), 'RTD collection must use project-specific password secret');
assert(collectRtdWorkflow.includes('RTD_TOTP_SECRET_MOLE: ${{ secrets.RTD_TOTP_SECRET_MOLE }}'), 'RTD collection must use project-specific TOTP secret');
assert(collectRtdWorkflow.includes('bash scripts/publish-rtd-cache.sh'), 'RTD collection must publish sanitized cache to gh-pages');
assert(
  !collectRtdWorkflow.includes('console.log(username)'),
  'RTD collection workflow must not log credentials'
);

// Smoke secret scanner must flag credential VALUES, not env-var NAMES that
// legitimately appear in dashboard diagnostics (regression: "requires GH_PAT_MOLE").
for (const benign of [
  'Community standards check requires GH_PAT_MOLE',
  'Set GITHUB_TOKEN and GOATCOUNTER_API_KEY_MOLE to enable this source',
  'GH_PAT missing for project'
]) {
  assert(!hasSecretLikeValue(benign), `secret scanner must not flag env-var name: ${benign}`);
}
for (const leaked of [
  'token=ghp_0123456789abcdefghijklmnopqrstuvwxyz',
  'ghs_0123456789abcdefghijklmnopqrstuvwxyz',
  'github_pat_11ABCDE0123456789_abcdefghijklmnop',
  'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123'
]) {
  assert(hasSecretLikeValue(leaked), `secret scanner must flag credential value: ${leaked}`);
}

console.log('deployment tests ok');
