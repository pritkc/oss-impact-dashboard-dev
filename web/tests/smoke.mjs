import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html);

if (!dom.window.document.querySelector('[data-page="dashboard"]')) {
  throw new Error('Dashboard page is missing its page marker');
}

if (!dom.window.document.querySelector('[data-overview-summary]')) {
  throw new Error('Dashboard page is missing the overview summary host');
}

if (!dom.window.document.querySelector('#operations')) {
  throw new Error('Dashboard page is missing the operations section');
}

for (const sectionId of ['reliability', 'releases', 'community', 'impact', 'documentation']) {
  if (!dom.window.document.querySelector(`#${sectionId}`)) {
    throw new Error(`Dashboard page is missing the ${sectionId} section`);
  }
}

if (!dom.window.document.querySelector('[data-failed-runs]')) {
  throw new Error('Dashboard page is missing the recent failed runs host');
}

if (!dom.window.document.querySelector('[data-section="securityAlerts"]')) {
  throw new Error('Operations page is missing the security alerts panel');
}

if (!dom.window.document.querySelector('[data-project-picker]')) {
  throw new Error('Dashboard page is missing the project picker');
}

const settingsHtml = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
if (!settingsHtml.includes('data-page="settings"')) {
  throw new Error('Settings page is missing its page marker');
}

const reportHtml = readFileSync(new URL('../report.html', import.meta.url), 'utf8');
if (reportHtml.includes('reports/latest.pdf')) {
  throw new Error('Report page must not ship a hard-coded PDF link');
}

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
for (const expected of [
  'report-status.json',
  'data-pdf-download',
  'reportStatus.project_id === data.project?.id',
  'API key invalid',
  'last successful collection: ${lastSuccess',
  'renderProjectConfig',
  "page === 'dashboard'",
  'data/projects.json',
  'data-project-picker',
  'resolveProjectId',
  'renderDashboard',
  'renderSecurityAlerts',
  'Impact Report'
]) {
  if (!appSource.includes(expected)) {
    throw new Error(`App source is missing ${expected}`);
  }
}

for (const removed of [
  'renderAdoptionMatrix',
  'renderCommunityStandards',
  'renderGovernanceHealth',
  'renderContributorDiversity',
  'renderTargetsProgress',
  'renderImpact(',
  'data-impact-summary',
  'githubGovernance',
  'Enabled sources'
]) {
  if (appSource.includes(removed)) {
    throw new Error(`App source still contains removed UI surface: ${removed}`);
  }
}

for (const removed of [
  'adoptionMatrix',
  'communityStandards',
  'governanceHealth',
  'contributorDiversity',
  'targetsProgress'
]) {
  if (settingsHtml.includes(removed)) {
    throw new Error(`Settings page still contains removed section: ${removed}`);
  }
}

if (!settingsHtml.includes('securityHealth')) {
  throw new Error('Settings page is missing securityHealth section');
}

console.log('frontend smoke ok');
