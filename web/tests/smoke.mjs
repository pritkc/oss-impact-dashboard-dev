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

if (!dom.window.document.querySelector('[data-period-progress]')) {
  throw new Error('Dashboard page is missing the period progress host');
}

if (!dom.window.document.querySelector('[data-label-backlog-kpis]')) {
  throw new Error('Operations section is missing the label backlog KPI host');
}

if (!dom.window.document.querySelector('[data-section="labelSlaTable"]')) {
  throw new Error('Operations section is missing the label SLA table');
}

if (!dom.window.document.getElementById('labelGroupFilter')) {
  throw new Error('Operations section is missing the label group filter');
}

if (!dom.window.document.querySelector('.kpi-strip-dense')) {
  throw new Error('Dashboard page is missing dense KPI strip layout');
}

if (!dom.window.document.querySelector('#operations')) {
  throw new Error('Dashboard page is missing the operations section');
}

for (const sectionId of ['reliability', 'community', 'impact', 'documentation']) {
  if (!dom.window.document.querySelector(`#${sectionId}`)) {
    throw new Error(`Dashboard page is missing the ${sectionId} section`);
  }
}

if (!dom.window.document.querySelector('#impact [data-section="releases"]')) {
  throw new Error('Impact section is missing the releases panel');
}

if (dom.window.document.querySelector('#releases')) {
  throw new Error('Standalone releases section should be folded into Impact');
}

if (dom.window.document.querySelector('[data-queues]')) {
  throw new Error('Operations queue panels should be removed');
}

if (!dom.window.document.querySelector('[data-section="docsUnified"]')) {
  throw new Error('Documentation section is missing the unified docs panel');
}

if (!dom.window.document.querySelector('[data-section="governancePanel"]')) {
  throw new Error('Reliability section is missing the governance panel');
}

if (!dom.window.document.querySelector('[data-failed-runs]')) {
  throw new Error('Dashboard page is missing the recent failed runs host');
}

if (!dom.window.document.querySelector('[data-section="securityAlerts"]')) {
  throw new Error('Dashboard page is missing the security alerts panel');
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
  'sourceDisplayName',
  'Last collection',
  'formatDateTime',
  'renderProjectConfig',
  "page === 'dashboard'",
  'data/projects.json',
  'data-project-picker',
  'resolveProjectId',
  'renderDashboard',
  'renderSecurityAlerts',
  'renderGovernancePanel',
  'renderOpenssfReliability',
  'renderAdoptionPanel',
  'primaryDocMetric',
  'primaryDocHealthMetric',
  'renderPeriodProgress',
  'renderLabelIntelligence',
  'label_metrics_by_period',
  'label_group_metrics',
  'labelGroupFilter',
  'formatSeverityBreakdown',
  'kpi-label-text',
  'kpi-meta',
  'high_priority',
  'PRs awaiting review',
  'Doc 404s',
  'Repo clones (14d)',
  'Releases in period',
  'Top contributors',
  'sectionLink',
  'comparisonDetail',
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
  'Enabled sources',
  'renderCompositionChart',
  'renderQueues',
  'periodFilter'
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
