#!/usr/bin/env node
/**
 * Authenticate to Read the Docs and download native analytics CSV exports.
 *
 * Credentials are read from RTD_USERNAME_<SUFFIX>, RTD_PASSWORD_<SUFFIX>, and
 * RTD_TOTP_SECRET_<SUFFIX>. Secrets, cookies, TOTP codes, and response bodies
 * are never logged.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const RTD_APP = 'https://app.readthedocs.org';

function projectEnvSuffix(projectId) {
  return projectId.toUpperCase().replace(/-/g, '_');
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function generateTotp(envName) {
  const result = spawnSync(
    'python',
    ['-m', 'oss_impact_dashboard.rtd_totp', envName],
    { encoding: 'utf8', env: process.env }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `Failed to generate TOTP from ${envName}`);
  }
  return result.stdout.trim();
}

function looksLikeHtml(body) {
  const sample = body.slice(0, 4096).toString('utf8').trimStart().toLowerCase();
  return sample.startsWith('<!doctype html') || sample.startsWith('<html') || sample.includes('<form');
}

async function downloadExport(request, url, destination) {
  const response = await request.get(url, { maxRedirects: 5 });
  const status = response.status();
  const body = await response.body();
  if (status >= 400) {
    throw new Error(`Read the Docs export request failed with HTTP ${status}`);
  }
  if (!body.length) {
    throw new Error('Read the Docs export download was empty');
  }
  if (looksLikeHtml(body)) {
    throw new Error('Read the Docs export download returned HTML instead of CSV');
  }
  await writeFile(destination, body);
}

function sanitizeErrorMessage(message, secrets = []) {
  let cleaned = String(message);
  for (const secret of secrets) {
    if (secret) {
      cleaned = cleaned.split(secret).join('[redacted]');
    }
  }
  return cleaned.replace(/fill\("[^"]+"\)/g, 'fill("[redacted]")');
}

async function activateEmailLogin(page) {
  const emailTab = page.locator('a:has-text("Email")').first();
  if (await emailTab.count()) {
    await emailTab.click();
  }
  await page.locator('#id_login').waitFor({ state: 'visible', timeout: 15_000 });
}

async function fillFirstVisible(page, selectors, value) {
  for (const selector of selectors) {
    const field = page.locator(selector).first();
    if (!(await field.count())) continue;
    if (!(await field.isVisible())) continue;
    await field.fill(value);
    return selector;
  }
  throw new Error(`Unable to locate a visible input field (${selectors.join(', ')})`);
}

async function submitLogin(page) {
  const submit = page
    .locator(
      'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in")'
    )
    .filter({ visible: true })
    .first();
  if (await submit.count()) {
    await submit.click();
    return;
  }
  await page.keyboard.press('Enter');
}

async function maybeCompleteTotp(page, totpEnvName) {
  const tokenSelectors = [
    '#id_token',
    'input[name="token"]',
    'input[name="otp_token"]',
    'input[name="code"]',
    'input[autocomplete="one-time-code"]',
  ];
  for (const selector of tokenSelectors) {
    const field = page.locator(selector).first();
    if (!(await field.count())) continue;
    if (!(await field.isVisible())) continue;
    const code = generateTotp(totpEnvName);
    await field.fill(code);
    await submitLogin(page);
    return true;
  }
  return false;
}

async function waitForAuthenticated(page) {
  await page.waitForURL(/readthedocs\.org\/(dashboard|accounts\/(?!login))/, {
    timeout: 60_000,
  });
}

async function login(page, { username, password, totpEnvName }) {
  await page.goto(`${RTD_APP}/accounts/login/`, { waitUntil: 'domcontentloaded' });
  await activateEmailLogin(page);
  await fillFirstVisible(page, ['#id_login', 'input[name="login"]', 'input[type="email"]'], username);
  await fillFirstVisible(page, ['#id_password', 'input[name="password"]', 'input[type="password"]'], password);
  await submitLogin(page);
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
  await maybeCompleteTotp(page, totpEnvName);
  await waitForAuthenticated(page);
}

function exportUrls(projectSlug) {
  const base = `${RTD_APP}/dashboard/${projectSlug}`;
  return {
    traffic200: `${base}/traffic-analytics/?download=true`,
    traffic404: `${base}/traffic-analytics/?download=true&status=404`,
    search: `${base}/search-analytics/?download=true`,
  };
}

async function collectRtdAnalytics({
  projectId,
  projectSlug,
  cacheDir,
}) {
  const suffix = projectEnvSuffix(projectId);
  const username = requiredEnv(`RTD_USERNAME_${suffix}`);
  const password = requiredEnv(`RTD_PASSWORD_${suffix}`);
  const totpEnvName = `RTD_TOTP_SECRET_${suffix}`;
  requiredEnv(totpEnvName);

  const rawDir = path.join(cacheDir, 'raw');
  await mkdir(rawDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await login(page, { username, password, totpEnvName });
    const urls = exportUrls(projectSlug);
    const request = context.request;
    await downloadExport(request, urls.traffic200, path.join(rawDir, 'traffic-200.csv'));
    await downloadExport(request, urls.traffic404, path.join(rawDir, 'traffic-404.csv'));
    await downloadExport(request, urls.search, path.join(rawDir, 'search.csv'));
  } finally {
    await context.close();
    await browser.close();
  }
}

function parseArgs(argv) {
  const args = { project: '', cacheDir: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--project-id') args.projectId = argv[++index];
    else if (token === '--project-slug') args.projectSlug = argv[++index];
    else if (token === '--cache-dir') args.cacheDir = argv[++index];
    else if (token === '--project') args.project = argv[++index];
  }
  return args;
}

async function resolveProjectConfig(projectPath) {
  const result = spawnSync(
    'python',
    [
      '-m',
      'oss_impact_dashboard.cli',
      'project-info',
      '--project',
      projectPath,
      '--field',
      'project_id',
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'Failed to resolve project id');
  }
  const projectId = result.stdout.trim();
  const slugResult = spawnSync(
    'python',
    [
      '-c',
      `from oss_impact_dashboard.config import load_project_config; from oss_impact_dashboard.collectors.readthedocs import readthedocs_project_slug; config = load_project_config(${JSON.stringify(projectPath)}); print(readthedocs_project_slug(config.sources.get('readthedocs') or {}, config.documentation_url) or '')`,
    ],
    { encoding: 'utf8' }
  );
  if (slugResult.status !== 0 || !slugResult.stdout.trim()) {
    throw new Error('Read the Docs project slug is not configured');
  }
  return {
    projectId,
    projectSlug: slugResult.stdout.trim(),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let projectId = args.projectId;
  let projectSlug = args.projectSlug;
  let cacheDir = args.cacheDir;

  if (args.project) {
    const resolved = await resolveProjectConfig(args.project);
    projectId = projectId || resolved.projectId;
    projectSlug = projectSlug || resolved.projectSlug;
    cacheDir = cacheDir || path.join('data/rtd-cache', projectId);
  }

  if (!projectId || !projectSlug || !cacheDir) {
    console.error(
      'usage: collect-rtd-analytics.mjs --project projects/mole.yml\n' +
        '   or: collect-rtd-analytics.mjs --project-id mole --project-slug mole-docs --cache-dir data/rtd-cache/mole'
    );
    process.exit(1);
  }

  const suffix = projectEnvSuffix(projectId);
  const secrets = [
    process.env[`RTD_USERNAME_${suffix}`],
    process.env[`RTD_PASSWORD_${suffix}`],
    process.env[`RTD_TOTP_SECRET_${suffix}`],
  ];

  try {
    await collectRtdAnalytics({ projectId, projectSlug, cacheDir });
    const importResult = spawnSync(
      'python',
      [
        '-m',
        'oss_impact_dashboard.cli',
        'rtd-import',
        '--project-id',
        projectId,
        '--project-slug',
        projectSlug,
        '--cache-dir',
        cacheDir,
      ],
      { encoding: 'utf8', stdio: 'inherit', env: process.env }
    );
    if (importResult.status !== 0) {
      process.exit(importResult.status ?? 1);
    }
    console.log('Read the Docs analytics collection completed.');
  } catch (error) {
    const message = sanitizeErrorMessage(
      error instanceof Error ? error.message : String(error),
      secrets,
    );
    console.error(`Read the Docs analytics collection failed: ${message}`);
    const recordFailure = spawnSync(
      'python',
      [
        '-m',
        'oss_impact_dashboard.cli',
        'rtd-record-failure',
        '--cache-dir',
        cacheDir,
        '--message',
        message,
      ],
      { encoding: 'utf8', stdio: 'inherit', env: process.env }
    );
    process.exit(recordFailure.status ?? 1);
  }
}

main();
