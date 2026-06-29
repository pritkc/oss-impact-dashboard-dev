import { Chart } from 'chart.js/auto';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import 'tabulator-tables/dist/css/tabulator_simple.min.css';
import './styles.css';
import {
  clear,
  element,
  externalLink,
  localLink,
  safeUrl,
  statusClass,
  text
} from './safe-dom.js';

const CHART_COLORS = {
  blue: '#0969da',
  green: '#1a7f37',
  purple: '#8250df',
  orange: '#bc4c00',
  teal: '#1b7c83',
  magenta: '#bf3989'
};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#57606a';
}

function chartColor(name) {
  return CHART_COLORS[name] || CHART_COLORS.blue;
}

const numberFormat = new Intl.NumberFormat('en-US');
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const page = document.body.dataset.page;
let table;
let tableReady = false;
let dashboardData;
let projectManifest;
let activeProjectId;
const filterState = new URLSearchParams(window.location.search);
const PROJECT_STORAGE_KEY = 'oss-dashboard-project';
const lazyBlocksRendered = new Set();
let activeSection = 'overview';
let lazyBlockObserver;

const FILTER_LABELS = {
  search: 'Search',
  type: 'Type',
  state: 'State',
  label: 'Label',
  author: 'Author',
  queue: 'Queue',
  createdFrom: 'Created from',
  createdTo: 'Created to',
  closedFrom: 'Closed from',
  closedTo: 'Closed to',
  ageMin: 'Min age',
  ageMax: 'Max age',
};

const METRIC_DEFINITION_MATCHERS = [
  [/open over|stale \(/i, 'open_over_threshold_items'],
  [/untriaged/i, 'untriaged_items'],
  [/median issue close/i, 'median_issue_close_days'],
  [/median pr merge/i, 'median_pr_merge_days'],
  [/median first review|p90 first review|first review/i, 'median_first_review_days'],
  [/p90 first response|first response/i, 'median_first_response_days'],
  [/ci success|success rate/i, 'github_actions_success_rate'],
  [/^stars$/i, 'stars'],
  [/^forks$/i, 'forks'],
  [/^watchers$/i, 'watchers'],
  [/bus factor|bus-factor/i, 'bus_factor'],
  [/documentation visitors|^visitors$/i, 'documentation_visitors'],
  [/asset downloads|release asset/i, 'release_asset_downloads'],
  [/open security|total open alerts|security alerts/i, 'github_open_security_alerts'],
  [/openssf/i, 'openssf_score'],
  [/governance/i, 'github_governance_health_percentage'],
  [/404|documentation 404s|not found/i, 'documentation_not_found_count'],
  [/search events|no-result/i, 'documentation_search_count'],
  [/weekly commits|commits \(4w\)/i, 'github_commits_last_4w'],
  [/commits \(52w\)/i, 'github_commits_last_52w'],
  [/clones/i, 'github_traffic_clones'],
  [/repo page views|page views/i, 'github_traffic_views'],
  [/newcomer/i, 'newcomer_funnel'],
];

function definitionFor(label) {
  const definitions = dashboardData?.metric_definitions;
  if (!definitions) return null;
  for (const [matcher, key] of METRIC_DEFINITION_MATCHERS) {
    if (matcher.test(label) && definitions[key]) return definitions[key];
  }
  return null;
}

function infoTip(label) {
  const definition = definitionFor(label);
  if (!definition) return null;
  return element('button', {
    type: 'button',
    className: 'info-dot',
    'aria-label': `${label}: ${definition}`,
    'data-tip': definition
  }, ['i']);
}

function initTooltips() {
  let tip;
  const ensure = () => {
    if (!tip) {
      tip = element('div', { className: 'tooltip-pop', role: 'tooltip' });
      document.body.append(tip);
    }
    return tip;
  };
  const show = (host) => {
    const message = host.getAttribute('data-tip');
    if (!message) return;
    const node = ensure();
    node.textContent = message;
    node.style.display = 'block';
    const rect = host.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    let left = window.scrollX + rect.left + rect.width / 2 - box.width / 2;
    left = Math.max(window.scrollX + 8, Math.min(left, window.scrollX + viewport - box.width - 8));
    let top = window.scrollY + rect.top - box.height - 8;
    if (rect.top - box.height - 8 < 0) top = window.scrollY + rect.bottom + 8;
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  };
  const hide = () => { if (tip) tip.style.display = 'none'; };
  document.addEventListener('mouseover', (event) => {
    const host = event.target.closest?.('[data-tip]');
    if (host) show(host);
  });
  document.addEventListener('mouseout', (event) => {
    if (event.target.closest?.('[data-tip]')) hide();
  });
  document.addEventListener('focusin', (event) => {
    const host = event.target.closest?.('[data-tip]');
    if (host) show(host);
  });
  document.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, { passive: true });
}

function projectQueryString(projectId = activeProjectId) {
  return projectId ? `?project=${encodeURIComponent(projectId)}` : '';
}

function withProjectQuery(path, projectId = activeProjectId) {
  const query = projectQueryString(projectId);
  if (!query) return path;
  if (path.includes('?')) {
    return `${path}&${query.slice(1)}`;
  }
  return `${path}${query}`;
}

function resolveProjectId(manifest) {
  if (!manifest?.projects?.length) return null;
  const fromUrl = filterState.get('project');
  if (fromUrl && manifest.projects.some((entry) => entry.id === fromUrl)) {
    return fromUrl;
  }
  const stored = localStorage.getItem(PROJECT_STORAGE_KEY);
  if (stored && manifest.projects.some((entry) => entry.id === stored)) {
    return stored;
  }
  return manifest.default_project || manifest.projects[0].id;
}

async function loadProjectManifest() {
  const manifestUrl = `${import.meta.env.BASE_URL}data/projects.json`;
  const response = await fetch(manifestUrl, { cache: 'no-store' });
  if (!response.ok) return null;
  return response.json();
}

function initProjectPicker(manifest, selectedId) {
  const picker = document.querySelector('[data-project-picker]');
  if (!picker || !manifest?.projects?.length) return;
  if (manifest.projects.length <= 1) {
    picker.hidden = true;
    return;
  }
  picker.hidden = false;
  clear(picker);
  for (const entry of manifest.projects) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.name;
    option.title = entry.repository;
    option.selected = entry.id === selectedId;
    picker.append(option);
  }
  picker.addEventListener('change', () => {
    localStorage.setItem(PROJECT_STORAGE_KEY, picker.value);
    const url = new URL(window.location.href);
    url.searchParams.set('project', picker.value);
    window.location.href = url.toString();
  });
}

function syncProjectNavigation(projectId = activeProjectId) {
  const query = projectQueryString(projectId);
  for (const link of document.querySelectorAll('[data-project-nav]')) {
    const base = link.getAttribute('href') || './';
    const hashIndex = base.indexOf('#');
    const path = hashIndex >= 0 ? base.slice(0, hashIndex) : base;
    const hash = hashIndex >= 0 ? base.slice(hashIndex) : '';
    link.setAttribute('href', `${path}${query}${hash}`);
  }
}

function opsLink(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const projectQuery = projectQueryString();
  const combined = [projectQuery ? projectQuery.slice(1) : '', qs].filter(Boolean).join('&');
  return `./${combined ? `?${combined}` : ''}#operations`;
}

function number(value) {
  if (value === null || value === undefined) return 'N/A';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'N/A';
  return numberFormat.format(Number.isInteger(n) ? n : Math.round(n));
}

function days(value) {
  if (value === null || value === undefined) return 'N/A';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'N/A';
  return `${Math.round(n)} days`;
}

function ageDays(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n)}d`;
}

function fillCompactRows(host, rows) {
  for (const [label, value] of rows) {
    host.append(element('div', { className: 'compact-row' }, [
      element('b', { textContent: label }),
      element('span', { textContent: value })
    ]));
  }
}

function fillStatGrid(host, rows) {
  const grid = element('div', { className: 'stat-grid' });
  for (const [label, value] of rows) {
    const labelEl = element('span', { className: 'stat-label', textContent: label });
    const tip = infoTip(label);
    if (tip) labelEl.append(tip);
    grid.append(element('div', { className: 'stat-cell' }, [
      labelEl,
      element('span', { className: 'stat-value', textContent: value })
    ]));
  }
  host.append(grid);
}

function percent(value) {
  return value === null || value === undefined ? 'N/A' : `${Math.round(value * 100)}%`;
}

function duration(value) {
  if (value === null || value === undefined) return 'N/A';
  if (value < 60) return `${Math.round(value)} sec`;
  if (value < 3600) return `${Math.round(value / 60)} min`;
  return `${Math.round((value / 3600) * 10) / 10} hr`;
}

function readableDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? dateFormat.format(date) : '';
}

function formatGeneratedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : dateFormat.format(date);
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : dateTimeFormat.format(date);
}

const SOURCE_DISPLAY_ORDER = [
  'github',
  'github_traffic',
  'github_activity',
  'github_actions',
  'github_security',
  'github_governance',
  'engagement',
  'readthedocs',
  'documentation_analytics',
  'zenodo',
  'openalex',
  'openssf_scorecard',
  'community_standards',
  'package_adoption',
  'snapshots'
];

const SOURCE_LABELS = {
  github: 'GitHub',
  github_traffic: 'GitHub traffic',
  github_activity: 'GitHub activity',
  github_actions: 'GitHub Actions',
  github_security: 'GitHub security',
  github_governance: 'GitHub governance',
  engagement: 'Engagement',
  readthedocs: 'Read the Docs',
  documentation_analytics: 'Documentation analytics',
  zenodo: 'Zenodo',
  openalex: 'OpenAlex',
  openssf_scorecard: 'OpenSSF Scorecard',
  community_standards: 'Community standards',
  package_adoption: 'Package adoption',
  snapshots: 'Snapshots'
};

function sourceDisplayName(name, status) {
  if (name === 'documentation_analytics' && status.provider === 'goatcounter') {
    return 'GoatCounter';
  }
  return SOURCE_LABELS[name] || name.replaceAll('_', ' ');
}

function sourceCollectedAt(name, status, data) {
  if (status.collected_at) return status.collected_at;
  if (name === 'documentation_analytics') return data.documentation_analytics?.collected_at || null;
  if (name === 'readthedocs') return data.readthedocs?.collection?.collected_at || null;
  if (['available', 'partial', 'error'].includes(status.status) && status.last_updated) {
    return status.last_updated;
  }
  return null;
}

function enrichSourceStatus(name, status, data) {
  if (name !== 'documentation_analytics' || status.provider !== 'goatcounter') return status;
  const docs = data.documentation_analytics || {};
  const tracker = docs.tracker || {};
  const enriched = { ...status };
  const details = [];
  if (tracker.tracked_domain) details.push(`Tracking ${tracker.tracked_domain}`);
  if (tracker.enabled === false) details.push('RTD tracker not configured');
  if (details.length && !enriched.message) enriched.message = details.join('; ');
  return enriched;
}

function sortSourceEntries(entries) {
  const order = new Map(SOURCE_DISPLAY_ORDER.map((name, index) => [name, index]));
  return [...entries].sort((left, right) => {
    const leftIndex = order.has(left[0]) ? order.get(left[0]) : Number.MAX_SAFE_INTEGER;
    const rightIndex = order.has(right[0]) ? order.get(right[0]) : Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left[0].localeCompare(right[0]);
  });
}

function periodLabel(data, periodId = activePeriodId(data)) {
  return data.reporting_period?.periods?.options?.find((item) => item.id === periodId)?.label || periodId;
}

function formatFilterValue(key, value) {
  if (key === 'type') {
    if (value === 'pull_request') return 'Pull requests';
    if (value === 'issue') return 'Issues';
  }
  if (key === 'state') {
    return String(value).charAt(0).toUpperCase() + String(value).slice(1);
  }
  return value;
}

function displayType(record) {
  return record.type === 'pull_request' ? 'PR' : record.type === 'issue' ? 'Issue' : text(record.type);
}

function stateBadge(state) {
  const normalized = String(state || '').toLowerCase();
  const tone = normalized === 'open' ? 'open' : normalized === 'merged' ? 'merged' : normalized === 'closed' ? 'closed' : 'neutral';
  return element('span', { className: `state-badge state-${tone}`, textContent: state });
}

function typeBadge(record) {
  const tone = record.type === 'pull_request' ? 'pr' : 'issue';
  return element('span', { className: `type-badge type-${tone}`, textContent: displayType(record) });
}

function formatMetricValue(label, value) {
  if (value === null || value === undefined || value === 'N/A') {
    if (label.includes('Unanswered')) return 'No data';
    if (label.includes('release age')) return 'No releases';
    return '—';
  }
  return value;
}

function activePeriodId(data) {
  return filterState.get('period')
    || localStorage.getItem('oss-dashboard-period')
    || data.reporting_period?.periods?.default
    || '12m';
}

function activePeriod(data) {
  const id = activePeriodId(data);
  return data.reporting_period?.periods?.options?.find((period) => period.id === id)
    || data.reporting_period?.periods?.options?.[0]
    || { id: 'all', label: 'All time' };
}

function activePeriodLabel(data, periodId = activePeriodId(data)) {
  const period = data.reporting_period?.periods?.options?.find((item) => item.id === periodId);
  if (!period) return 'Active period';
  const start = period.start ? readableDate(period.start) : 'project start';
  return `${period.label}: ${start} to ${readableDate(period.end)}`;
}

function comparisonText(comparison, unit = '') {
  if (!comparison || comparison.delta === null || comparison.delta === undefined) return '';
  const delta = comparison.delta;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const amount = unit === 'days' ? days(Math.abs(delta)) : number(Math.abs(delta));
  const pct = comparison.percent === null || comparison.percent === undefined
    ? ''
    : ` (${Math.abs(comparison.percent)}%)`;
  return `${direction} ${amount}${unit && unit !== 'days' ? ` ${unit}` : ''}${pct} vs previous period`;
}

function setChartSummary(id, textValue) {
  const host = document.querySelector(`[data-chart-summary="${id}"]`);
  if (host) host.textContent = textValue;
}

function documentationAvailable(data) {
  return data.documentation_analytics?.status === 'available'
    || data.documentation_analytics?.status === 'partial';
}

function readthedocsAvailable(data) {
  const status = data.source_status?.readthedocs?.status;
  return status === 'available' || status === 'partial';
}

function githubTrafficAvailable(data) {
  const status = data.source_status?.github_traffic?.status;
  return status === 'available' || status === 'partial';
}

function githubActivityAvailable(data) {
  const status = data.source_status?.github_activity?.status;
  return status === 'available' || status === 'partial';
}

function githubSecurityAvailable(data) {
  const status = data.source_status?.github_security?.status;
  return status === 'available' || status === 'partial';
}

function documentationValue(data, key) {
  return documentationAvailable(data) ? number(data.documentation_analytics?.[key]) : 'Unavailable';
}

function providerLabel(data) {
  return data.documentation_analytics?.provider || 'not configured';
}

function hasDistinctPageHitCount(data) {
  const docs = data.documentation_analytics || {};
  return docs.page_hit_count !== null
    && docs.page_hit_count !== undefined
    && docs.page_hit_count !== docs.visitor_count;
}

function reportingPeriodText(period = {}) {
  if (!period.start && !period.end) return 'Reporting period unavailable';
  return `${period.start || 'unknown'} to ${period.end || 'unknown'}`;
}

function renderEnvironmentBanner(data) {
  if (data.project?.environment === 'production') return;
  if (document.querySelector('[data-environment-banner]')) return;
  const target = document.querySelector('.shell, .report-shell, .report-paper');
  const banner = element('aside', {
    className: 'environment-banner',
    role: 'status',
    dataset: { environmentBanner: data.project?.environment || 'non-production' }
  }, [
    element('strong', { textContent: 'DEVELOPMENT SANDBOX' }),
    element('span', { textContent: `Data source: ${data.project?.repository || 'unknown'}` }),
    element('span', { textContent: `Environment: ${data.project?.environment || 'non-production'}` })
  ]);
  target?.prepend(banner);
}

async function loadData() {
  projectManifest = await loadProjectManifest();
  let dataUrl = `${import.meta.env.BASE_URL}data/dashboard.json`;
  if (projectManifest?.projects?.length) {
    activeProjectId = resolveProjectId(projectManifest);
    localStorage.setItem(PROJECT_STORAGE_KEY, activeProjectId);
    dataUrl = `${import.meta.env.BASE_URL}data/projects/${activeProjectId}.json`;
  }
  const response = await fetch(dataUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load dashboard data: ${response.status}`);
  return response.json();
}

async function loadReportStatus() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}report-status.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Report status unavailable: ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('Report status is not JSON');
    return response.json();
  } catch {
    return { available: false, path: 'reports/latest.pdf' };
  }
}

// --- Theme ---
function initTheme() {
  const stored = localStorage.getItem('oss-dashboard-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = stored || (prefersDark ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
}

function syncThemeToggleUi() {
  const toggle = document.querySelector('.theme-toggle');
  if (!toggle) return;
  const theme = document.documentElement.dataset.theme || 'light';
  toggle.textContent = theme === 'dark' ? '☀' : '☽';
  toggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}

function refreshChartsForTheme() {
  if (!dashboardData || page !== 'dashboard') return;
  remountLazyCharts(dashboardData);
}

function initThemeToggle() {
  syncThemeToggleUi();
  const toggle = document.querySelector('.theme-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('oss-dashboard-theme', next);
    syncThemeToggleUi();
    refreshChartsForTheme();
  });
}

// --- KPI rendering (preserving existing logic) ---
function appendStat(host, label, value, href, detail = '') {
  const displayValue = formatMetricValue(label, value);
  const labelEl = element('span', { className: 'kpi-label', textContent: label });
  const tip = infoTip(label);
  if (tip) labelEl.append(tip);
  const body = [
    labelEl,
    element('span', { className: 'kpi-value', textContent: displayValue }),
  ];
  if (detail) body.push(element('span', { className: 'kpi-detail', textContent: detail }));
  const card = element('article', { className: 'kpi-card' }, href ? [localLink('', href)] : []);
  if (href) {
    const link = card.querySelector('a');
    link.style.color = 'inherit';
    link.style.textDecoration = 'none';
    link.replaceChildren(...body);
  } else {
    card.append(...body);
  }
  host.append(card);
}

function renderKpiStrip(hostSelector, cards) {
  const host = document.querySelector(hostSelector);
  if (!host) return;
  clear(host);
  host.removeAttribute('data-skeleton');
  for (const [label, value, href, detail] of cards) appendStat(host, label, value, href, detail);
}

function showKpiSkeleton(hostSelector) {
  const host = document.querySelector(hostSelector);
  if (!host) return;
  clear(host);
  host.dataset.skeleton = 'true';
  for (let i = 0; i < 4; i += 1) {
    host.append(element('article', { className: 'kpi-card kpi-skeleton' }));
  }
}

function renderOverviewSummary(data, periodId = activePeriodId(data)) {
  const summary = data.summary || {};
  const periodSummary = data.operations?.period_summaries?.[periodId] || {};
  const comparisons = data.operations?.period_comparisons?.[periodId] || {};
  const threshold = data.reporting_period?.stale_days || 90;
  renderKpiStrip('[data-overview-summary]', [
    ['Open issues', number(summary.open_issues), opsLink({ type: 'issue', state: 'open' })],
    ['Open PRs', number(summary.open_pull_requests), opsLink({ type: 'pull_request', state: 'open' })],
    ['Net backlog change', number(periodSummary.net_backlog_change ?? summary.net_backlog_change), '', comparisonText(comparisons.net_backlog_change)],
    ['Latest release age', days(summary.latest_release_age_days)],
    [`Open over ${threshold} days`, number(summary.open_over_threshold_items ?? summary.stale_items), opsLink({ queue: 'open_over_threshold' })]
  ]);
}

function renderOperationsSummary(data, periodId = activePeriodId(data)) {
  const summary = data.summary || {};
  const periodSummary = data.operations?.period_summaries?.[periodId] || {};
  const comparisons = data.operations?.period_comparisons?.[periodId] || {};
  const threshold = data.reporting_period?.stale_days || 90;
  const ciRate = data.github_actions?.success_rate;
  renderKpiStrip('[data-operations-summary]', [
    ['Untriaged', number(summary.untriaged_items), opsLink({ queue: 'untriaged' })],
    [`Stale (>${threshold}d)`, number(summary.open_over_threshold_items ?? summary.stale_items), opsLink({ queue: 'open_over_threshold' })],
    ['Awaiting review', number(summary.awaiting_review_count), opsLink({ queue: 'awaiting_review' })],
    ['Unanswered issues', number(summary.unanswered_issues_count ?? summary.issues_without_response_count), opsLink({ queue: 'issues_without_external_response' })],
    ['Median issue close', days(periodSummary.median_issue_close_days ?? summary.median_issue_close_days), '', comparisonText(comparisons.median_issue_close_days, 'days')],
    ['Median PR merge', days(periodSummary.median_pr_merge_days ?? summary.median_pr_merge_days), '', comparisonText(comparisons.median_pr_merge_days, 'days')],
    ['P90 first response', days(summary.p90_first_response_days)],
    ['CI success rate', ciRate === null || ciRate === undefined ? 'N/A' : percent(ciRate)]
  ]);
}

function renderSummary(data, periodId = activePeriodId(data)) {
  renderOverviewSummary(data, periodId);
  renderOperationsSummary(data, periodId);
  renderGrowthSummary(data, periodId);
}

function renderGrowthSummary(data, periodId = activePeriodId(data)) {
  const host = document.querySelector('[data-growth-summary]');
  if (!host) return;
  clear(host);
  const impact = data.impact || {};
  const releasePeriod = data.releases?.period_summaries?.[periodId] || {};
  const contributorPeriod = data.contributors?.period_summaries?.[periodId] || {};
  const contributorComparisons = data.contributors?.period_comparisons?.[periodId] || {};
  const cards = [
    ['Citation count', number(impact.openalex?.cited_by_count)],
    ['Stars', number(data.repository_metadata?.stars ?? data.summary?.stars)],
    ['Forks', number(data.repository_metadata?.forks ?? data.summary?.forks)],
    ['Unique contributors', number(data.contributors?.unique_contributors)],
    ['New contributors', number(contributorPeriod.new_contributors), '', comparisonText(contributorComparisons.new_contributors)],
    ['Total releases', number(data.releases?.total_releases)],
    ['Zenodo downloads', number(impact.zenodo?.downloads)],
    ['Documentation visitors', documentationAvailable(data) ? number(data.documentation_analytics?.visitor_count) : '—']
  ];
  for (const [label, value, href, detail] of cards) appendStat(host, label, value, href, detail);
}

function sourceStatusBadge(status) {
  const normalized = String(status || 'unknown').toLowerCase();
  const tone = normalized === 'available'
    ? 'ok'
    : normalized === 'partial'
      ? 'warn'
      : normalized === 'error'
        ? 'bad'
        : 'muted';
  return element('span', { className: `source-badge source-badge-${tone}`, textContent: normalized });
}

function sourceDetailCell(status) {
  const cell = element('td', { className: 'source-detail' });
  const isHealthy = status.status === 'available' || status.status === 'partial';
  if (!isHealthy && (status.message || status.limitation)) {
    cell.append(element('span', { className: 'source-error', textContent: status.message || status.limitation }));
  } else if (status.message) {
    cell.append(element('span', { textContent: status.message }));
  }
  if (status.limitation && (isHealthy || status.message)) {
    cell.append(element('small', { className: 'source-limitation', textContent: status.limitation }));
  }
  if (status.source_url) {
    cell.append(externalLink('Source', status.source_url, 'source-link'));
  }
  if (!cell.childNodes.length) cell.textContent = '—';
  return cell;
}

function renderSources(data) {
  const host = document.querySelector('[data-source-status]');
  if (!host) return;
  clear(host);

  const entries = sortSourceEntries(Object.entries(data.source_status || {}));
  if (!entries.length) {
    host.append(element('p', { className: 'muted', textContent: 'No source status reported.' }));
    return;
  }

  const table = element('table', { className: 'compact-table source-table' });
  table.append(element('thead', {}, [element('tr', {}, [
    element('th', { textContent: 'Source' }),
    element('th', { textContent: 'Status' }),
    element('th', { textContent: 'Last collection' }),
    element('th', { textContent: 'Details' })
  ])]));
  const tbody = element('tbody', {});
  for (const [name, rawStatus] of entries) {
    const status = enrichSourceStatus(name, rawStatus, data);
    const collectedAt = sourceCollectedAt(name, status, data);
    tbody.append(element('tr', {}, [
      element('td', {}, [element('b', { textContent: sourceDisplayName(name, status) })]),
      element('td', {}, [sourceStatusBadge(status.status)]),
      element('td', { className: 'source-collected', textContent: formatDateTime(collectedAt) || '—' }),
      sourceDetailCell(status)
    ]));
  }
  table.append(tbody);
  host.append(table);
}

function renderGithubTraffic(data) {
  const host = document.querySelector('[data-section="githubReach"]');
  if (!host) return;
  const h2 = host.querySelector('h2, h3');
  clear(host);
  if (h2) host.append(h2);
  const traffic = data.github_traffic || {};
  if (!githubTrafficAvailable(data)) {
    host.append(element('p', {
      className: 'muted',
      textContent: data.source_status?.github_traffic?.message
        || 'GitHub repository traffic requires repository admin access.'
    }));
    host.style.display = '';
    return;
  }
  const rows = [
    ['Repo page views (14d)', number(traffic.views_total)],
    ['Unique visitors (14d)', number(traffic.views_unique)],
    ['Clones (14d)', number(traffic.clones_total)],
    ['Unique cloners (14d)', number(traffic.clones_unique)],
    ['Unique view rate', traffic.unique_view_rate === null || traffic.unique_view_rate === undefined ? 'N/A' : percent(traffic.unique_view_rate)],
    ['Clone-to-view rate', traffic.clone_to_view_rate === null || traffic.clone_to_view_rate === undefined ? 'N/A' : percent(traffic.clone_to_view_rate)]
  ];
  fillStatGrid(host, rows);
  const dailyViews = traffic.daily_views || [];
  const dailyClones = traffic.daily_clones || [];
  if (dailyViews.length || dailyClones.length) {
    const labels = (dailyViews.length ? dailyViews : dailyClones).map((item) => item.date);
    const windowLabel = labels.length
      ? `Data window: ${labels[0]} to ${labels[labels.length - 1]} (GitHub max 14 days)`
      : 'GitHub traffic (14-day window)';
    const canvas = element('canvas', { id: 'githubTrafficChart' });
    host.append(element('div', { className: 'chart-container chart-container-sm' }, [canvas]));
    chart('githubTrafficChart', {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Views', data: dailyViews.map((item) => item.count), borderColor: chartColor('blue'), tension: 0.3 },
          { label: 'Clones', data: dailyClones.map((item) => item.count), borderColor: chartColor('green'), tension: 0.3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: chartPluginsFixedWindow('GitHub traffic (14-day window)', windowLabel),
        scales: chartScales()
      }
    });
  }
  host.append(element('h3', { textContent: 'GitHub popular paths', style: 'margin-top: var(--space-3);' }));
  const paths = traffic.popular_paths || [];
  if (!paths.length) host.append(element('p', { className: 'muted', textContent: 'No popular paths reported in the last 14 days.' }));
  for (const item of paths.slice(0, 5)) {
    host.append(element('p', { textContent: `${item.path}: ${number(item.count)} views` }));
  }
  host.append(element('h3', { textContent: 'GitHub top referrers' }));
  const referrers = traffic.popular_referrers || [];
  if (!referrers.length) host.append(element('p', { className: 'muted', textContent: 'No referrers reported in the last 14 days.' }));
  for (const item of referrers.slice(0, 5)) {
    host.append(element('p', { textContent: `${item.referrer}: ${number(item.count)}` }));
  }
  host.append(element('p', { className: 'muted-text', textContent: 'GitHub only exposes repository traffic for the last 14 days.' }));
  if ((traffic.clones_total || 0) > 0 && !(traffic.views_total || 0)) {
    host.append(element('p', {
      className: 'muted-text',
      textContent: 'This repository has clone activity but no recorded page views in the current 14-day window.'
    }));
  }
}

function renderDevelopmentVelocity(data) {
  const host = document.querySelector('[data-section="developmentVelocity"]');
  if (!host) return;
  const h2 = host.querySelector('h2, h3');
  clear(host);
  if (h2) host.append(h2);
  const activity = data.github_activity || {};
  if (!githubActivityAvailable(data)) {
    host.append(element('p', { className: 'muted', textContent: 'Development velocity data is unavailable.' }));
    return;
  }
  const rows = [
    ['Commits (52w)', number(activity.total_commits_52w)],
    ['Commits (4w)', number(activity.commits_last_4w)],
    ['Commits (13w)', number(activity.commits_last_13w)],
    ['Active weeks (52w)', number(activity.active_weeks_52w)],
    ['Median weekly commits', number(activity.median_weekly_commits_52w)],
    ['Net code change (52w)', number(activity.net_code_change_52w)],
    ['Top commit share', activity.top_commit_contributor_share === null || activity.top_commit_contributor_share === undefined ? 'N/A' : percent(activity.top_commit_contributor_share)],
    ['Commit bus-factor proxy', number(activity.commit_bus_factor_proxy)]
  ];
  fillStatGrid(host, rows);
  const weekly = activity.weekly_commits || [];
  if (weekly.length) {
    const canvas = element('canvas', { id: 'developmentVelocityChart' });
    host.append(element('div', { className: 'chart-container chart-container-sm' }, [canvas]));
    chart('developmentVelocityChart', {
      type: 'bar',
      data: {
        labels: weekly.map((_, index) => `W${index + 1}`),
        datasets: [{ label: 'Weekly commits', data: weekly, backgroundColor: chartColor('purple') }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { ...chartPlugins(data, 'Weekly commits (52 weeks)'), legend: { display: false } },
        scales: chartScales()
      }
    });
  }
}

function renderSecurityAlerts(data) {
  const host = document.querySelector('[data-section="securityAlerts"]');
  if (!host) return;
  const h2 = host.querySelector('h2, h3');
  clear(host);
  if (h2) host.append(h2);
  const security = data.github_security || {};
  if (!githubSecurityAvailable(data) || !security.available) {
    host.style.display = 'none';
    return;
  }
  const alertCount = security.total_open_alerts || 0;
  if (!alertCount) {
    host.style.display = 'none';
    return;
  }
  host.style.display = '';
  const repoUrl = safeUrl(data.project?.repository_url);
  const securityUrl = repoUrl ? `${repoUrl}/security` : repoUrl;
  const rows = [
    ['Total open alerts', number(alertCount)],
    ['Highest severity', text(security.highest_open_severity || 'N/A')],
    ['Oldest alert age', days(security.oldest_open_alert_age_days)],
    ['Dependabot', number(security.dependabot?.open_alerts)],
    ['Code scanning', number(security.code_scanning?.open_alerts)]
  ];
  fillStatGrid(host, rows);
  if (securityUrl) {
    host.append(externalLink('View on GitHub', securityUrl));
  }
}

function renderReviewLoad(data) {
  const host = document.querySelector('[data-section="reviewLoad"]');
  if (!host) return;
  const h2 = host.querySelector('h2, h3');
  clear(host);
  if (h2) host.append(h2);
  const review = data.operations?.review_load || {};
  const engagement = data.operations?.engagement || {};
  if (!Object.keys(review).length) {
    host.style.display = 'none';
    return;
  }
  const rows = [
    ['PRs awaiting review', number(review.open_prs_waiting_for_review)],
    ['Requested reviewers', number(review.requested_reviewers_count)],
    ['Draft PRs', number(review.draft_prs)],
    ['Changes requested', number(review.prs_with_changes_requested)],
    ['Median first review', days(review.median_time_to_first_review)],
    ['P90 first review', days(review.p90_time_to_first_review)],
    ['Issue comments', engagement.issue_comment_coverage === null || engagement.issue_comment_coverage === undefined ? 'N/A' : percent(engagement.issue_comment_coverage)],
    ['PR review coverage', engagement.pr_review_coverage === null || engagement.pr_review_coverage === undefined ? 'N/A' : percent(engagement.pr_review_coverage)]
  ];
  fillStatGrid(host, rows);
}

function renderSecurityHealth(data) {
  const host = document.querySelector('[data-section="securityHealth"]');
  if (!host) return;
  const h2 = host.querySelector('h2, h3');
  clear(host);
  if (h2) host.append(h2);
  const security = data.security || {};
  if (!security.available) {
    host.append(element('p', { className: 'muted', textContent: security.message || 'Security data not available.' }));
    return;
  }
  host.append(element('div', { className: 'status-row' }, [
    element('b', { textContent: 'OpenSSF Score' }),
    element('span', { className: 'kpi-value', textContent: number(security.score) })
  ]));
  if (security.cii_badge_level) {
    host.append(element('div', { className: 'status-row' }, [
      element('b', { textContent: 'CII Badge' }),
      element('span', { className: 'muted', textContent: text(security.cii_badge_level) })
    ]));
  }
  const checks = security.checks || [];
  if (checks.length) {
    const list = element('div', { className: 'status-list' });
    for (const check of checks) {
      const score = check.score !== null && check.score !== undefined ? number(check.score) : 'N/A';
      list.append(element('div', { className: 'compact-row' }, [
        element('b', { textContent: text(check.name) }),
        element('span', { className: statusClass(score === 'N/A' ? 'unavailable' : 'available'), textContent: score }),
        element('span', { className: 'muted', textContent: text(check.reason || '') })
      ]));
    }
    host.append(list);
  }
}

function renderActionSummary(data) {
  const host = document.querySelector('[data-action-summary]');
  if (!host) return;
  clear(host);
  const queues = data.operations?.queues || {};
  const seen = new Set();
  const candidates = [
    ['Oldest open issue', queues.oldest_open_issues?.[0]],
    ['Oldest open PR', queues.oldest_open_pull_requests?.[0]],
    ['Untriaged', queues.untriaged?.[0]],
    [`Open over ${data.reporting_period?.stale_days || 90} days`, queues.open_over_threshold?.[0]],
    ['Recently reopened', queues.recently_reopened?.[0]],
    ['Awaiting review', queues.awaiting_review?.[0]]
  ].filter(([, item]) => item);
  for (const [label, item] of candidates) {
    if (seen.has(item.number)) continue;
    seen.add(item.number);
    const age = item.age_days != null ? `${Math.round(item.age_days)}d` : '';
    host.append(element('div', { className: 'priority-row' }, [
      element('span', { className: 'priority-label', textContent: label }),
      element('span', { className: 'priority-value' }, [
        externalLink(`#${item.number}`, item.url),
        element('span', { className: 'priority-title', textContent: ` ${item.title}` }),
        age ? element('span', { className: 'priority-age', textContent: age }) : document.createTextNode('')
      ])
    ]));
    if (seen.size >= 5) break;
  }
  if (!seen.size) host.append(element('p', { className: 'muted', textContent: 'No urgent queue items in the current dataset.' }));
}

// --- Chart helpers ---
const chartInstances = new Map();

function chart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const existing = chartInstances.get(id);
  if (existing) existing.destroy();
  canvas.setAttribute('aria-label', config.options?.plugins?.title?.text || id);
  config.options = {
    animation: false,
    ...config.options
  };
  const instance = new Chart(canvas, config);
  chartInstances.set(id, instance);
  return instance;
}

function filterTrendsByPeriod(trends, periodId, data, customRange) {
  if (!trends || !trends.months) return trends;
  let startMonth = null;
  let endMonth = null;
  if (periodId === 'custom' && customRange) {
    if (customRange.start) startMonth = customRange.start.slice(0, 7);
    if (customRange.end) endMonth = customRange.end.slice(0, 7);
  } else {
    const period = data.reporting_period?.periods?.options?.find((p) => p.id === periodId);
    if (!period || !period.start || periodId === 'all') return trends;
    startMonth = period.start.slice(0, 7);
  }
  const startIdx = startMonth ? trends.months.findIndex((m) => m >= startMonth) : 0;
  if (startIdx < 0) return trends;
  let endIdx = trends.months.length;
  if (endMonth) {
    endIdx = trends.months.findIndex((m) => m > endMonth);
    if (endIdx < 0) endIdx = trends.months.length;
  }
  const slice = (arr) => (arr || []).slice(startIdx, endIdx);
  return {
    ...trends,
    months: slice(trends.months),
    issues_opened: slice(trends.issues_opened),
    issues_closed: slice(trends.issues_closed),
    issues_reopened: slice(trends.issues_reopened),
    prs_opened: slice(trends.prs_opened),
    prs_closed: slice(trends.prs_closed),
    prs_merged: slice(trends.prs_merged),
    prs_closed_unmerged: slice(trends.prs_closed_unmerged),
    completed: slice(trends.completed),
    backlog: slice(trends.backlog),
    current_backlog: trends.current_backlog,
  };
}

function getCustomRange(chartId) {
  const control = document.querySelector(`.chart-period-select[data-chart-period="${chartId}"]`)?.closest('.chart-period-control');
  if (!control) return null;
  const from = control.querySelector('.chart-custom-from')?.value;
  const to = control.querySelector('.chart-custom-to')?.value;
  if (!from && !to) return null;
  return { start: from || null, end: to || null };
}

function getChartPeriod(chartId, data) {
  const override = localStorage.getItem(`oss-dashboard-chart-period-${chartId}`);
  if (override && override !== activePeriodId(data)) return override;
  return activePeriodId(data);
}

function updateChartOverrideBadge(chartId, data) {
  const badge = document.querySelector(`[data-chart-override="${chartId}"]`);
  if (!badge) return;
  const override = localStorage.getItem(`oss-dashboard-chart-period-${chartId}`);
  const global = activePeriodId(data);
  const isCustom = override && override !== global;
  badge.hidden = !isCustom;
  badge.textContent = override === 'custom' ? 'Custom range' : `Override: ${periodLabel(data, override)}`;
}

function populateChartPeriods(data) {
  const options = data.reporting_period?.periods?.options || [];
  const globalPeriod = activePeriodId(data);
  const selectors = document.querySelectorAll('.chart-period-select');
  for (const sel of selectors) {
    if (sel.options.length) continue;
    for (const period of options) {
      sel.append(element('option', { value: period.id, textContent: period.label }));
    }
    sel.append(element('option', { value: 'custom', textContent: 'Custom range' }));
    const chartId = sel.dataset.chartPeriod;
    const stored = localStorage.getItem(`oss-dashboard-chart-period-${chartId}`);
    sel.value = stored || globalPeriod;
    updateChartOverrideBadge(chartId, data);
    if (sel.value === 'custom') {
      const control = sel.closest('.chart-period-control');
      const customRow = control?.querySelector('.chart-custom-range');
      if (customRow) {
        customRow.hidden = false;
        const storedRange = localStorage.getItem(`oss-dashboard-chart-custom-${chartId}`);
        if (storedRange) {
          try {
            const parsed = JSON.parse(storedRange);
            if (parsed.start) control.querySelector('.chart-custom-from').value = parsed.start;
            if (parsed.end) control.querySelector('.chart-custom-to').value = parsed.end;
          } catch {}
        }
      }
    }
  }
}

function initGlobalPeriod(data) {
  const picker = document.querySelector('[data-global-period]');
  const hiddenPeriod = document.getElementById('periodFilter');
  if (!picker) return;
  clear(picker);
  for (const period of data.reporting_period?.periods?.options || []) {
    picker.append(element('option', { value: period.id, textContent: period.label }));
  }
  const current = activePeriodId(data);
  picker.value = current;
  if (hiddenPeriod) hiddenPeriod.value = current;
  picker.addEventListener('change', () => {
    filterState.set('period', picker.value);
    localStorage.setItem('oss-dashboard-period', picker.value);
    if (hiddenPeriod) hiddenPeriod.value = picker.value;
    const url = new URL(window.location.href);
    url.searchParams.set('period', picker.value);
    window.history.replaceState({}, '', url.toString());
    for (const chartId of ['activityChart', 'backlogChart']) {
      localStorage.removeItem(`oss-dashboard-chart-period-${chartId}`);
      const sel = document.querySelector(`.chart-period-select[data-chart-period="${chartId}"]`);
      if (sel) sel.value = picker.value;
      updateChartOverrideBadge(chartId, data);
    }
    renderHeader(data);
    renderSummary(data, picker.value);
    remountLazyCharts(data);
    if (table) applyFilters(data);
  });
}

function initChartPeriodSelectors(data) {
  for (const btn of document.querySelectorAll('[data-chart-range-toggle]')) {
    btn.addEventListener('click', () => {
      const chartId = btn.dataset.chartRangeToggle;
      const panel = document.querySelector(`[data-chart-period-advanced="${chartId}"]`);
      if (panel) panel.hidden = !panel.hidden;
    });
  }
  const selectors = document.querySelectorAll('.chart-period-select');
  for (const sel of selectors) {
    sel.addEventListener('change', () => {
      const chartId = sel.dataset.chartPeriod;
      const periodId = sel.value;
      localStorage.setItem(`oss-dashboard-chart-period-${chartId}`, periodId);
      updateChartOverrideBadge(chartId, data);
      const control = sel.closest('.chart-period-control');
      const customRow = control?.querySelector('.chart-custom-range');
      if (customRow) customRow.hidden = periodId !== 'custom';
      const customRange = periodId === 'custom' ? getCustomRange(chartId) : null;
      if (chartId === 'activityChart') renderActivityChart(data, periodId, customRange);
      if (chartId === 'backlogChart') renderBacklogChart(data, periodId, customRange);
    });
    const control = sel.closest('.chart-period-control');
    const applyBtn = control?.querySelector('.chart-custom-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const chartId = sel.dataset.chartPeriod;
        const customRange = getCustomRange(chartId);
        localStorage.setItem(`oss-dashboard-chart-custom-${chartId}`, JSON.stringify(customRange || {}));
        localStorage.setItem(`oss-dashboard-chart-period-${chartId}`, 'custom');
        updateChartOverrideBadge(chartId, data);
        if (chartId === 'activityChart') renderActivityChart(data, 'custom', customRange);
        if (chartId === 'backlogChart') renderBacklogChart(data, 'custom', customRange);
      });
    }
  }
}

function chartPluginsFixedWindow(title, subtitle) {
  return {
    legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, color: cssVar('--fg-default'), font: { size: 12 } } },
    title: { display: true, text: title, color: cssVar('--fg-default'), font: { size: 14, weight: 600 } },
    subtitle: { display: Boolean(subtitle), text: subtitle || '', color: cssVar('--fg-subtle'), font: { size: 12 } },
    tooltip: {
      backgroundColor: cssVar('--fg-default'),
      titleColor: cssVar('--fg-on-emphasis'),
      bodyColor: cssVar('--fg-on-emphasis'),
      cornerRadius: 6,
      padding: 8,
      boxPadding: 4,
    }
  };
}

function chartPlugins(data, title, periodId = activePeriodId(data), customRange = null) {
  let subtitleText;
  if (periodId === 'custom' && customRange) {
    const start = customRange.start ? readableDate(customRange.start) : 'project start';
    const end = customRange.end ? readableDate(customRange.end) : 'now';
    subtitleText = `Custom: ${start} to ${end}`;
  } else {
    subtitleText = activePeriodLabel(data, periodId);
  }
  return {
    legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, color: cssVar('--fg-default'), font: { size: 12 } } },
    title: { display: true, text: title, color: cssVar('--fg-default'), font: { size: 14, weight: 600 } },
    subtitle: { display: true, text: subtitleText, color: cssVar('--fg-subtle'), font: { size: 12 } },
    tooltip: {
      backgroundColor: cssVar('--fg-default'),
      titleColor: cssVar('--fg-on-emphasis'),
      bodyColor: cssVar('--fg-on-emphasis'),
      cornerRadius: 6,
      padding: 8,
      boxPadding: 4,
    }
  };
}

function chartScales(options = {}) {
  const integerTicks = options.integers
    ? { callback: (value) => (Number.isInteger(value) ? value : Math.round(value)) }
    : {};
  return {
    x: { grid: { display: false }, ticks: { color: cssVar('--fg-muted'), ...integerTicks }, border: { color: cssVar('--border-default') } },
    y: { grid: { color: cssVar('--border-subtle') }, ticks: { color: cssVar('--fg-muted'), ...integerTicks }, border: { display: false }, beginAtZero: true }
  };
}

// --- Chart render functions ---
function renderActivityChart(data, periodId = activePeriodId(data), customRange = null) {
  const trends = filterTrendsByPeriod(data.trends || {}, periodId, data, customRange);
  const opened = (trends.issues_opened || []).reduce((sum, value) => sum + value, 0)
    + (trends.prs_opened || []).reduce((sum, value) => sum + value, 0);
  const completed = (trends.completed || []).reduce((sum, value) => sum + value, 0);
  setChartSummary('activityChart', `${number(opened)} opened and ${number(completed)} completed across the selected period.`);
  chart('activityChart', {
    type: 'bar',
    data: {
      labels: trends.months || [],
      datasets: [
        { label: 'Issues opened', data: trends.issues_opened || [], backgroundColor: chartColor('blue') },
        { label: 'Issues closed', data: trends.issues_closed || [], backgroundColor: chartColor('green') },
        { label: 'PRs opened', data: trends.prs_opened || [], backgroundColor: chartColor('purple') },
        { label: 'PRs closed', data: trends.prs_closed || [], backgroundColor: chartColor('orange') }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: chartPlugins(data, 'Opened and completed by month', periodId, customRange),
      scales: chartScales()
    }
  });
}

function renderBacklogChart(data, periodId = activePeriodId(data), customRange = null) {
  const trends = filterTrendsByPeriod(data.trends || {}, periodId, data, customRange);
  setChartSummary('backlogChart', `Current backlog is ${number(trends.current_backlog)} open issues and pull requests.`);
  chart('backlogChart', {
    type: 'line',
    data: {
      labels: trends.months || [],
      datasets: [{ label: 'Backlog', data: trends.backlog || [], borderColor: chartColor('blue'), tension: 0.3 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { ...chartPlugins(data, 'Backlog at month end', periodId, customRange), legend: { display: false } },
      scales: chartScales()
    }
  });
}

function renderAgeBucketChart(data) {
  const buckets = data.operations?.age_buckets || {};
  const labels = ['Under 30 days', '30-90 days', '91-180 days', 'Over 180 days'];
  const values = [buckets.under_30, buckets.days_30_90, buckets.days_91_180, buckets.over_180].map((value) => value || 0);
  setChartSummary('ageBucketChart', `${number(values.reduce((sum, value) => sum + value, 0))} open items are represented by age bucket.`);
  chart('ageBucketChart', {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Open items', data: values, backgroundColor: chartColor('blue') }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { ...chartPlugins(data, 'Open-item age buckets'), legend: { display: false } },
      scales: chartScales()
    }
  });
}

function renderLabelChart(data) {
  const metrics = (data.operations?.label_metrics || [])
    .filter((item) => (item.open || 0) + (item.closed || 0) > 0)
    .slice(0, 8);
  setChartSummary('labelChart', `${number(metrics.length)} labels with activity in the selected period.`);
  if (!metrics.length) {
    setChartEmpty('labelChart', 'No labeled work items in the selected period.');
    return;
  }
  hideChartEmpty('labelChart');
  chart('labelChart', {
    type: 'bar',
    data: {
      labels: metrics.map((item) => item.label),
      datasets: [
        { label: 'Open', data: metrics.map((item) => item.open), backgroundColor: chartColor('blue') },
        { label: 'Closed', data: metrics.map((item) => item.closed), backgroundColor: chartColor('green') }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: chartPlugins(data, 'Work by canonical label'),
      scales: chartScales()
    }
  });
}

function setChartEmpty(chartId, message) {
  const host = document.querySelector(`[data-chart-empty="${chartId}"]`);
  const canvas = document.getElementById(chartId);
  if (host) {
    host.hidden = false;
    host.textContent = message;
  }
  if (canvas) canvas.closest('.chart-container')?.setAttribute('hidden', '');
}

function hideChartEmpty(chartId) {
  const host = document.querySelector(`[data-chart-empty="${chartId}"]`);
  const canvas = document.getElementById(chartId);
  if (host) host.hidden = true;
  if (canvas) canvas.closest('.chart-container')?.removeAttribute('hidden');
}

function renderCompositionChart(data) {
  const summary = data.summary || {};
  chart('compositionChart', {
    type: 'doughnut',
    data: {
      labels: ['Open issues', 'Open PRs'],
      datasets: [{ data: [summary.open_issues || 0, summary.open_pull_requests || 0], backgroundColor: [chartColor('blue'), chartColor('purple')] }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { ...chartPlugins(data, 'Open backlog composition'), legend: { display: false } } }
  });
}

function renderCompletionDistribution(data) {
  const ops = data.operations || {};
  const age = ops.age_distribution || {};
  const summary = ops.summary || data.summary || {};
  const labels = ['Issue close median', 'PR merge median', 'Open age median', 'Open age p90'];
  const values = [
    summary.median_issue_close_days,
    summary.median_pr_merge_days,
    age.median,
    age.p90
  ].map((value) => Math.round(Number(value) || 0));
  chart('completionDistributionChart', {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Days', data: values, backgroundColor: chartColor('orange') }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { ...chartPlugins(data, 'Response and age distribution'), legend: { display: false } },
      scales: chartScales({ integers: true })
    }
  });
}

function renderQueues(data) {
  const host = document.querySelector('[data-queues]');
  if (!host) return;
  clear(host);
  const queueLabels = {
    oldest_open_issues: 'Oldest open issues',
    untriaged: 'Untriaged',
    open_over_threshold: `Open over ${data.reporting_period?.stale_days || 90} days`,
    recently_reopened: 'Recently reopened',
    high_priority: 'High priority',
    awaiting_review: 'PRs awaiting review',
    issues_without_external_response: 'Issues without external response'
  };
  const awaiting = new Set((data.operations?.queues?.awaiting_review || []).map((item) => item.number));
  const skipIfSubset = {
    oldest_open_pull_requests: awaiting
  };
  for (const [name, items] of Object.entries(data.operations?.queues || {})) {
    if (!items?.length) continue;
    const skipSet = skipIfSubset[name];
    const filtered = skipSet
      ? items.filter((item) => !skipSet.has(item.number))
      : items;
    if (!filtered.length) continue;
    const list = element('ul', { className: 'queue-list' });
    for (const item of filtered.slice(0, 5)) {
      const age = item.age_days != null ? `${Math.round(item.age_days)}d` : '';
      list.append(element('li', {}, [
        externalLink(`#${item.number}`, item.url),
        ` ${item.title}`,
        age ? element('span', { className: 'queue-item-meta', textContent: ` · ${age}` }) : document.createTextNode('')
      ]));
    }
    const panel = element('article', { className: 'panel col-4' }, [
      element('h3', { textContent: queueLabels[name] || name.replaceAll('_', ' ') }),
      list,
      localLink('View all', opsLink({ queue: name }), 'subtle-link')
    ]);
    host.append(panel);
  }
}

// --- Table logic (preserving all existing filter/export logic) ---
function displayState(record) {
  if (record.type === 'pull_request' && record.merged_at) return 'Merged';
  return record.closed_at ? 'Closed' : 'Open';
}

function timeToComplete(record) {
  if (record.type === 'pull_request') return record.days_to_merge ?? record.days_to_close;
  return record.days_to_close;
}

function labelPills(labels) {
  const wrap = element('div', { className: 'label-pills' });
  for (const label of labels || []) wrap.append(element('span', { className: 'label-pill', textContent: label }));
  return wrap;
}

function titleLink(record) {
  return externalLink(record.title, record.url);
}

function filterMatches(record, filters) {
  const textNeedle = (filters.search || '').toLowerCase();
  const haystack = `${record.title} ${record.number} ${record.author || ''} ${(record.metric_labels || []).join(' ')}`.toLowerCase();
  if (textNeedle && !haystack.includes(textNeedle)) return false;
  if (filters.type && record.type !== filters.type) return false;
  if (filters.state) {
    const state = displayState(record).toLowerCase();
    if (state !== filters.state) return false;
  }
  if (filters.label && !(record.metric_labels || []).includes(filters.label)) return false;
  if (filters.author && record.author !== filters.author) return false;
  if (filters.createdFrom && (!record.created_at || record.created_at.slice(0, 10) < filters.createdFrom)) return false;
  if (filters.createdTo && (!record.created_at || record.created_at.slice(0, 10) > filters.createdTo)) return false;
  if (filters.closedFrom && (!record.closed_at || record.closed_at.slice(0, 10) < filters.closedFrom)) return false;
  if (filters.closedTo && (!record.closed_at || record.closed_at.slice(0, 10) > filters.closedTo)) return false;
  if (filters.ageMin && (record.age_days ?? -1) < Number(filters.ageMin)) return false;
  if (filters.ageMax && (record.age_days ?? Number.MAX_SAFE_INTEGER) > Number(filters.ageMax)) return false;
  if (filters.queue && !queueContains(record, filters.queue)) return false;
  return true;
}

function queueContains(record, queueName) {
  const threshold = dashboardData?.reporting_period?.stale_days || 90;
  if (queueName === 'untriaged') return (record.metric_labels || []).length === 1 && record.metric_labels[0] === '(unlabeled)';
  if (queueName === 'open_over_threshold') return !record.closed_at && (record.age_days || 0) >= threshold;
  if (queueName === 'oldest_open_issues') return record.type === 'issue' && !record.closed_at;
  if (queueName === 'oldest_open_pull_requests') return record.type === 'pull_request' && !record.closed_at;
  if (queueName === 'recently_reopened') return !record.closed_at && (record.reopened_months || []).length;
  if (queueName === 'awaiting_review') {
    return Boolean(dashboardData?.operations?.engagement?.reviews_available)
      && record.type === 'pull_request' && !record.closed_at && !record.first_review_at;
  }
  if (queueName === 'issues_without_external_response') {
    return Boolean(dashboardData?.operations?.engagement?.comments_available)
      && record.type === 'issue' && !record.closed_at && !record.first_response_at;
  }
  if (queueName === 'high_priority') {
    return (dashboardData?.operations?.queues?.high_priority || []).some((item) => item.number === record.number);
  }
  return true;
}

function currentFilters() {
  return {
    search: document.getElementById('search')?.value || '',
    type: document.getElementById('typeFilter')?.value || '',
    state: document.getElementById('stateFilter')?.value || '',
    label: document.getElementById('labelFilter')?.value || '',
    author: document.getElementById('authorFilter')?.value || '',
    period: activePeriodId(dashboardData),
    queue: filterState.get('queue') || '',
    createdFrom: document.getElementById('createdFromFilter')?.value || '',
    createdTo: document.getElementById('createdToFilter')?.value || '',
    closedFrom: document.getElementById('closedFromFilter')?.value || '',
    closedTo: document.getElementById('closedToFilter')?.value || '',
    ageMin: document.getElementById('ageMinFilter')?.value || '',
    ageMax: document.getElementById('ageMaxFilter')?.value || ''
  };
}

function syncFilterUrl(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && key !== 'period') params.set(key, value);
  }
  const period = activePeriodId(dashboardData);
  if (period) params.set('period', period);
  const hash = `#${activeSection}`;
  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${hash}`;
  window.history.replaceState({}, '', nextUrl);
}

function mountOverviewCharts(data) {
  const activityPeriod = getChartPeriod('activityChart', data);
  renderActivityChart(data, activityPeriod, activityPeriod === 'custom' ? getCustomRange('activityChart') : null);
}

function mountOperationsCharts(data) {
  const backlogPeriod = getChartPeriod('backlogChart', data);
  renderBacklogChart(data, backlogPeriod, backlogPeriod === 'custom' ? getCustomRange('backlogChart') : null);
  renderAgeBucketChart(data);
  renderLabelChart(data);
  renderCompletionDistribution(data);
}

function mountGrowthCitationCharts(data) {
  const periodId = activePeriodId(data);
  const citations = data.impact?.openalex?.citations_by_year || [];
  setChartSummary('citationChart', `${number(data.impact?.openalex?.cited_by_count)} total citations from OpenAlex.`);
  chart('citationChart', {
    type: 'bar',
    data: {
      labels: citations.map((item) => item.year),
      datasets: [{ label: 'Citations', data: citations.map((item) => item.cited_by_count), backgroundColor: chartColor('blue') }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { ...chartPlugins(data, 'Citations by year', periodId), legend: { display: false } },
      scales: chartScales()
    }
  });
  renderSnapshotTrend(data);
}

function mountGrowthReleaseChart(data) {
  renderReleaseChart(data, activePeriodId(data));
}

function mountGrowthContributorChart(data) {
  renderContributorChart(data, activePeriodId(data));
}

const LAZY_BLOCK_RENDERERS = {
  'overview-charts': mountOverviewCharts,
  'operations-charts': mountOperationsCharts,
  'impact-citations': mountGrowthCitationCharts,
  'releases': mountGrowthReleaseChart,
  'impact-github': renderGithubTraffic,
  'community-contributors': mountGrowthContributorChart,
  'community-velocity': renderDevelopmentVelocity,
  'documentation': renderDocumentationSection
};

function renderDocumentationSection(data) {
  renderDocumentationAnalytics(data);
  renderReadthedocsAnalytics(data);
}

function mountLazyBlock(name, data) {
  if (lazyBlocksRendered.has(name)) return;
  lazyBlocksRendered.add(name);
  LAZY_BLOCK_RENDERERS[name]?.(data);
}

function remountLazyCharts(data) {
  for (const id of [...chartInstances.keys()]) chartInstances.get(id)?.destroy();
  chartInstances.clear();
  const rendered = [...lazyBlocksRendered];
  lazyBlocksRendered.clear();
  for (const name of rendered) {
    lazyBlocksRendered.add(name);
    LAZY_BLOCK_RENDERERS[name]?.(data);
  }
}

function initLazyBlocks(data) {
  if (lazyBlockObserver) lazyBlockObserver.disconnect();
  lazyBlockObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      mountLazyBlock(entry.target.dataset.lazyBlock, data);
      lazyBlockObserver.unobserve(entry.target);
    }
  }, { rootMargin: '160px 0px' });
  for (const block of document.querySelectorAll('[data-lazy-block]')) {
    lazyBlockObserver.observe(block);
  }
}

function renderDashboard(data) {
  const periodId = activePeriodId(data);
  renderOverviewSummary(data, periodId);
  renderActionSummary(data);
  renderOperationsSummary(data, periodId);
  populateFilters(data);
  if (!table) renderTable(data);
  else applyFilters(data);
  renderQueues(data);
  renderCiReliability(data);
  renderFailedRuns(data);
  renderSecurityAlerts(data);
  renderReviewLoad(data);
  renderGrowthSummary(data, periodId);
  renderReleasePanel(data);
  renderContributorPanel(data, periodId);
  initLazyBlocks(data);
}

function stickyOffset() {
  const topbar = document.querySelector('.topbar');
  const nav = document.querySelector('.section-nav');
  const topbarH = topbar ? topbar.getBoundingClientRect().height : 0;
  const navH = nav ? nav.getBoundingClientRect().height : 0;
  return topbarH + navH;
}

function initSectionNav(data) {
  const links = document.querySelectorAll('[data-section-link]');
  const sections = [...links]
    .map((link) => document.getElementById(link.dataset.sectionLink))
    .filter(Boolean);

  const setActive = (id) => {
    activeSection = id;
    for (const link of links) {
      if (link.dataset.sectionLink === id) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };

  for (const link of links) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const id = link.dataset.sectionLink;
      const target = document.getElementById(id);
      if (!target) return;
      setActive(id);
      window.scrollTo({ top: target.offsetTop - stickyOffset() + 4, behavior: 'smooth' });
      const url = new URL(window.location.href);
      url.hash = `#${id}`;
      window.history.replaceState({}, '', url.toString());
    });
  }

  const computeActive = () => {
    const marker = stickyOffset() + 24;
    let current = sections[0]?.id;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= marker) current = section.id;
    }
    // If scrolled to the very bottom, activate the last section.
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
      current = sections[sections.length - 1]?.id;
    }
    if (current) setActive(current);
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      computeActive();
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  const hash = window.location.hash.replace('#', '');
  const initial = filterState.get('queue') ? 'operations' : (hash || '');
  if (initial && document.getElementById(initial)) {
    requestAnimationFrame(() => {
      const target = document.getElementById(initial);
      window.scrollTo({ top: target.offsetTop - stickyOffset() + 4 });
      computeActive();
    });
  } else {
    computeActive();
  }
}

function sectionTitle(data) {
  return `${data.project.name} Dashboard`;
}

function updateFilterSummary(filters, count) {
  const summaryHost = document.querySelector('[data-filter-summary]');
  const chipsHost = document.querySelector('[data-filter-chips]');
  if (summaryHost) {
    summaryHost.textContent = `${number(count)} results · ${periodLabel(dashboardData, activePeriodId(dashboardData))}`;
  }
  if (!chipsHost) return;
  for (const chip of chipsHost.querySelectorAll('.filter-chip')) chip.remove();
  for (const [key, value] of Object.entries(filters)) {
    if (!value || key === 'period') continue;
    const label = FILTER_LABELS[key] || key;
    const chip = element('button', {
      type: 'button',
      className: 'filter-chip',
      textContent: `${label}: ${formatFilterValue(key, value)}`,
      onclick: () => {
        const input = document.getElementById(`${key}Filter`) || document.getElementById(key);
        if (input) input.value = '';
        if (key === 'queue') filterState.delete('queue');
        applyFilters(dashboardData);
      }
    });
    chipsHost.insertBefore(chip, summaryHost);
  }
}

function tableRows() {
  if (!table) return [];
  return table.getRows('active').map((row) => row.getData());
}

function downloadRows(rows, type) {
  const payload = type === 'json'
    ? JSON.stringify(rows, null, 2)
    : [
      ['number', 'type', 'state', 'title', 'author', 'labels', 'created_at', 'closed_at', 'merged_at'].join(','),
      ...rows.map((row) => [
        row.number,
        row.type,
        displayState(row),
        `"${String(row.title).replaceAll('"', '""')}"`,
        row.author || '',
        `"${(row.metric_labels || []).join('; ')}"`,
        row.created_at || '',
        row.closed_at || '',
        row.merged_at || ''
      ].join(','))
    ].join('\n');
  const blob = new Blob([payload], { type: type === 'json' ? 'application/json' : 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `dashboard-items.${type}`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function populateFilters(data) {
  const labels = [...new Set((data.items || []).flatMap((item) => item.metric_labels || []))].sort();
  const authors = [...new Set((data.items || []).map((item) => item.author).filter(Boolean))].sort();
  const labelFilter = document.getElementById('labelFilter');
  const authorFilter = document.getElementById('authorFilter');
  const periodFilter = document.getElementById('periodFilter');
  for (const label of labels) labelFilter?.append(element('option', { value: label, textContent: label }));
  for (const author of authors) authorFilter?.append(element('option', { value: author, textContent: author }));
  for (const period of data.reporting_period?.periods?.options || []) {
    periodFilter?.append(element('option', { value: period.id, textContent: period.label }));
  }
  for (const [key, value] of filterState.entries()) {
    const input = document.getElementById(`${key}Filter`) || document.getElementById(key);
    if (input) input.value = value;
  }
  if (periodFilter && !periodFilter.value) periodFilter.value = activePeriodId(data);
  document.getElementById('toggleFilters')?.addEventListener('click', () => {
    const panel = document.getElementById('advancedFilters');
    const btn = document.getElementById('toggleFilters');
    if (!panel || !btn) return;
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? 'Hide filters' : 'More filters';
  });
}

function applyFilters(data) {
  if (!table || !tableReady) return;
  const filters = currentFilters();
  table.setFilter((record) => filterMatches(record, filters));
  table.setColumns(tableColumns(data));
  syncFilterUrl(filters);
  renderOperationsSummary(data, filters.period || activePeriodId(data));
}

function tableColumns(data) {
  const filters = currentFilters();
  const hideClosed = filters.state === 'open';
  const cols = [
    { title: '#', field: 'number', width: 78, sorter: 'number' },
    { title: 'Title', field: 'title', formatter: (cell) => titleLink(cell.getRow().getData()) },
    { title: 'Type', field: 'type', width: 88, formatter: (cell) => typeBadge(cell.getRow().getData()) },
    { title: 'State', field: 'state', width: 100, formatter: (cell) => stateBadge(displayState(cell.getRow().getData())) },
    { title: 'Labels', field: 'metric_labels', width: 140, formatter: (cell) => labelPills(cell.getValue()) },
    { title: 'Age', field: 'age_days', width: 72, sorter: 'number', formatter: (cell) => ageDays(cell.getValue()) },
    { title: 'Created', field: 'created_at', width: 130, formatter: (cell) => readableDate(cell.getValue()) }
  ];
  if (!hideClosed) {
    cols.push(
      { title: 'Time to done', field: 'days_to_close', width: 120, formatter: (cell) => {
        const record = cell.getRow().getData();
        if (!record.closed_at && !record.merged_at) return '—';
        return days(timeToComplete(record));
      } },
      { title: 'Closed', field: 'closed_at', width: 130, formatter: (cell) => readableDate(cell.getValue()) }
    );
  }
  return cols;
}

function renderTable(data) {
  const host = document.getElementById('itemsTable');
  if (!host) return;
  populateFilters(data);
  tableReady = false;
  table = new Tabulator(host, {
    data: data.items || [],
    layout: 'fitColumns',
    pagination: true,
    paginationSize: 15,
    initialSort: [{ column: 'created_at', dir: 'desc' }],
    responsiveLayout: 'collapse',
    columns: tableColumns(data)
  });
  table.on('tableBuilt', () => {
    tableReady = true;
    applyFilters(data);
  });
  table.on('dataFiltered', (filters, rows) => {
    updateFilterSummary(currentFilters(), rows.length);
  });
  const filterIds = [
    'search', 'typeFilter', 'stateFilter', 'labelFilter', 'authorFilter', 'periodFilter',
    'createdFromFilter', 'createdToFilter', 'closedFromFilter', 'closedToFilter',
    'ageMinFilter', 'ageMaxFilter'
  ];
  for (const id of filterIds) document.getElementById(id)?.addEventListener('input', () => applyFilters(data));
  document.getElementById('clearFilters')?.addEventListener('click', () => {
    for (const id of filterIds) {
      const input = document.getElementById(id);
      if (!input || id === 'periodFilter') continue;
      input.value = '';
    }
    if (document.getElementById('periodFilter')) {
      document.getElementById('periodFilter').value = activePeriodId(data);
    }
    filterState.delete('queue');
    applyFilters(data);
  });
  document.getElementById('csvExport')?.addEventListener('click', () => downloadRows(tableRows(), 'csv'));
  document.getElementById('jsonExport')?.addEventListener('click', () => downloadRows(tableRows(), 'json'));
}

// --- Growth page rendering ---
function renderReleasePanel(data) {
  const host = document.querySelector('[data-section="releases"]');
  if (!host) return;
  const heading = host.querySelector('h3');
  clear(host);
  if (heading) host.append(heading);
  const releases = data.releases?.by_release || [];
  if (!releases.length) {
    host.closest('.domain-section')?.setAttribute('hidden', '');
    return;
  }
  host.closest('.domain-section')?.removeAttribute('hidden');
  for (const release of releases.slice(0, 6)) {
    host.append(element('div', { className: 'compact-row' }, [
      release.url ? externalLink(release.tag || release.name, release.url) : element('b', { textContent: release.tag || release.name }),
      element('span', { textContent: `${readableDate(release.published_at)} · ${number(release.asset_downloads)} dl` })
    ]));
  }
  if (data.releases?.zero_download_explanation) {
    host.append(element('p', { className: 'muted-text', textContent: data.releases.zero_download_explanation }));
  }
}

function renderReleaseChart(data, periodId = activePeriodId(data)) {
  const releases = data.releases?.by_release || [];
  const releasePanel = document.getElementById('releaseChart')?.closest('.panel');
  if (!releases.length) {
    setChartEmpty('releaseChart', data.releases?.zero_download_explanation || 'No release asset downloads in the selected period.');
    releasePanel?.querySelector('.chart-container')?.setAttribute('hidden', '');
    return;
  }
  hideChartEmpty('releaseChart');
  releasePanel?.querySelector('.chart-container')?.removeAttribute('hidden');
  chart('releaseChart', {
    type: 'bar',
    data: {
      labels: releases.map((item) => item.tag || item.name).slice(0, 12).reverse(),
      datasets: [{ label: 'Asset downloads', data: releases.map((item) => item.asset_downloads).slice(0, 12).reverse(), backgroundColor: chartColor('green') }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: chartPlugins(data, 'Release asset downloads by version', periodId),
      scales: chartScales()
    }
  });
}

function renderContributorPanel(data, periodId = activePeriodId(data)) {
  const host = document.querySelector('[data-section="contributors"]');
  if (!host) return;
  const heading = host.querySelector('h3');
  clear(host);
  if (heading) host.append(heading);
  const period = data.contributors?.period_summaries?.[periodId] || {};
  const concentration = data.contributors?.contribution_concentration || {};
  const funnel = data.operations?.newcomer_funnel || {};
  fillStatGrid(host, [
    ['Unique contributors', number(data.contributors?.unique_contributors)],
    ['Bus factor', number(data.contributors?.bus_factor)],
    ['New in period', number(period.new_contributors)],
    ['Repeat in period', number(period.repeat_contributors)],
    ['Newcomer PR authors', number(funnel.first_pr_authors)],
    ['Newcomer conversion', percent(funnel.conversion_rate)],
    ['Top 3 share', concentration.top_3_share === null || concentration.top_3_share === undefined ? 'N/A' : percent(concentration.top_3_share)]
  ]);
}

function renderContributorChart(data, periodId = activePeriodId(data)) {
  const trend = data.contributors?.contributor_trend || [];
  chart('contributorChart', {
    type: 'line',
    data: {
      labels: trend.map((item) => item.month),
      datasets: [{ label: 'Contributors', data: trend.map((item) => item.contributors), borderColor: chartColor('purple'), tension: 0.3 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: chartPlugins(data, 'Contributor trend by month', periodId),
      scales: chartScales()
    }
  });
}

function renderReleaseAnalytics(data, periodId = activePeriodId(data)) {
  renderReleasePanel(data);
  renderReleaseChart(data, periodId);
}

function renderContributorAnalytics(data, periodId = activePeriodId(data)) {
  renderContributorPanel(data, periodId);
  renderContributorChart(data, periodId);
}

function renderDocumentationAnalytics(data) {
  const host = document.querySelector('[data-section="docsAnalytics"]');
  if (!host) return;
  const h2 = host.querySelector('h2, h3');
  clear(host);
  if (h2) host.append(h2);
  const docs = data.documentation_analytics || {};
  if (!documentationAvailable(data)) {
    host.append(element('p', { textContent: docs.message || 'Documentation analytics are unavailable.' }));
    return;
  }
  const rows = [
    ['Visitors', number(docs.visitor_count)],
    ['Provider', providerLabel(data)],
    ['Reporting period', reportingPeriodText(docs.reporting_period)],
    ['Search events', number(docs.search_count)],
    ['No-result searches', number(docs.no_result_search_count)],
    ['Documentation 404s', number(docs.not_found_count)]
  ];
  if (hasDistinctPageHitCount(data)) rows.splice(1, 0, ['Page hits', number(docs.page_hit_count)]);
  fillStatGrid(host, rows);
  const canvas = element('canvas', { id: 'documentationTrendChart' });
  host.append(element('div', { className: 'chart-container chart-container-sm' }, [canvas]));
  host.append(element('p', { className: 'chart-summary', dataset: { chartSummary: 'documentationTrendChart' } }));
  setChartSummary('documentationTrendChart', `${number((docs.trend || []).reduce((sum, item) => sum + (item.count || 0), 0))} documentation hits in the daily trend.`);
  chart('documentationTrendChart', {
    type: 'line',
    data: {
      labels: (docs.trend || []).map((item) => item.date),
      datasets: [{ label: 'Documentation hits', data: (docs.trend || []).map((item) => item.count), borderColor: chartColor('blue'), tension: 0.3 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { ...chartPlugins(data, 'Daily documentation trend'), legend: { display: false } },
      scales: chartScales()
    }
  });
  host.append(element('h3', { textContent: 'Documentation popular pages' }));
  for (const item of (docs.popular_pages || []).slice(0, 5)) {
    host.append(element('p', { textContent: `${item.path}: ${number(item.count)} hits` }));
  }
  host.append(element('h3', { textContent: 'Documentation top referrers' }));
  for (const item of (docs.top_referrers || []).slice(0, 5)) {
    host.append(element('p', { textContent: `${item.referrer}: ${number(item.count)}` }));
  }
  host.append(element('h3', { textContent: 'Missing documentation paths' }));
  const missing = (docs.not_found_pages || []).slice(0, 8);
  if (!missing.length) host.append(element('p', { textContent: 'No missing documentation paths reported.' }));
  for (const item of missing) {
    host.append(element('p', { textContent: `${item.path}: ${number(item.count)}` }));
  }
  for (const limitation of docs.limitations || []) {
    host.append(element('p', { className: 'muted-text', textContent: limitation }));
  }
}

function renderReadthedocsAnalytics(data) {
  const host = document.querySelector('[data-section="readthedocsAnalytics"]');
  if (!host) return;
  const h2 = host.querySelector('h2, h3');
  clear(host);
  if (h2) host.append(h2);
  const rtd = data.readthedocs || {};
  const status = data.source_status?.readthedocs || {};
  if (!readthedocsAvailable(data)) {
    host.append(element('p', {
      textContent: status.message || rtd.message || 'Read the Docs analytics are unavailable.'
    }));
    return;
  }
  if (status.status === 'partial' || rtd.status === 'stale') {
    host.append(element('p', {
      className: 'muted-text',
      textContent: status.message || rtd.message || 'Read the Docs data is stale.'
    }));
  }
  const rows = [
    ['Page views', number(rtd.views_total)],
    ['Unique pages', number(rtd.unique_pages)],
    ['Search events', number(rtd.search_total)],
    ['No-result searches', number(rtd.no_result_search_count)],
    ['404 views', number(rtd.not_found_count)]
  ];
  fillStatGrid(host, rows);
  host.append(element('h3', { textContent: 'Top documentation pages' }));
  for (const item of (rtd.top_pages || []).slice(0, 5)) {
    const label = item.version ? `${item.path} (${item.version})` : item.path;
    host.append(element('p', { textContent: `${label}: ${number(item.views ?? item.count)} views` }));
  }
  host.append(element('h3', { textContent: 'Top missing documentation paths' }));
  const missing = (rtd.not_found_pages || []).slice(0, 8);
  if (!missing.length) {
    host.append(element('p', { textContent: 'No 404 paths reported by Read the Docs.' }));
  }
  for (const item of missing) {
    const label = item.version ? `${item.path} (${item.version})` : item.path;
    host.append(element('p', { textContent: `${label}: ${number(item.views ?? item.count)} views` }));
  }
  const historyEntries = rtd.history?.entries || [];
  if (historyEntries.length) {
    host.append(element('h3', { textContent: 'Collected history' }));
    host.append(element('p', {
      className: 'muted-text',
      textContent: `${historyEntries.length} weekly collection points retained beyond RTD rolling retention.`
    }));
  }
}

function renderSnapshotTrend(data) {
  const trends = data.snapshots?.trends || {};
  const panel = document.getElementById('snapshotTrendChart')?.closest('.panel');
  if (!(trends.dates || []).length || trends.dates.length < 2) {
    if (panel) panel.style.display = 'none';
    return;
  }
  chart('snapshotTrendChart', {
    type: 'line',
    data: {
      labels: trends.dates,
      datasets: [
        { label: 'Zenodo downloads', data: trends.zenodo_downloads || [], borderColor: chartColor('blue') },
        { label: 'Citations', data: trends.citation_count || [], borderColor: chartColor('green') },
        { label: 'Documentation visitors', data: trends.documentation_visitors || trends.readthedocs_views || [], borderColor: chartColor('orange') },
        { label: 'GitHub views (14d)', data: trends.github_traffic_views || [], borderColor: chartColor('teal') },
        { label: 'GitHub clones (14d)', data: trends.github_traffic_clones || [], borderColor: chartColor('magenta') }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: chartPlugins(data, 'Cumulative impact trend'),
      scales: chartScales()
    }
  });
}

function renderCiReliability(data) {
  const host = document.querySelector('[data-ci-reliability]');
  if (!host) return;
  clear(host);
  const ci = data.github_actions || {};
  const rows = [
    ['Workflow runs', number(ci.total_runs)],
    ['Successful', number(ci.successful_runs)],
    ['Failed', number(ci.failed_runs)],
    ['Success rate', percent(ci.success_rate)],
    ['Median duration', duration(ci.median_duration_seconds)]
  ];
  fillStatGrid(host, rows);

  const byWorkflow = ci.by_workflow || [];
  if (byWorkflow.length) {
    host.append(element('h3', { textContent: 'Workflow reliability', style: 'margin-top: var(--space-3);' }));
    const table = element('table', { className: 'compact-table' });
    table.append(element('thead', {}, [element('tr', {}, [
      element('th', { textContent: 'Workflow' }),
      element('th', { textContent: 'Runs' }),
      element('th', { textContent: 'Success rate' }),
      element('th', { textContent: 'Failed' }),
      element('th', { textContent: 'Median duration' })
    ])]));
    const tbody = element('tbody', {});
    for (const workflow of byWorkflow.slice(0, 8)) {
      tbody.append(element('tr', {}, [
        element('td', { textContent: text(workflow.name) }),
        element('td', { textContent: number(workflow.runs) }),
        element('td', { textContent: workflow.success_rate === null || workflow.success_rate === undefined ? 'N/A' : percent(workflow.success_rate) }),
        element('td', { textContent: number(workflow.failed_runs) }),
        element('td', { textContent: duration(workflow.median_duration_seconds) })
      ]));
    }
    table.append(tbody);
    host.append(table);
  }
  if (ci.latest_default_branch_status) {
    host.append(element('p', { textContent: `Latest default-branch run: ${text(ci.latest_default_branch_status)}` }));
  }
  if (ci.artifact_count || ci.cache_count) {
    host.append(element('p', { className: 'muted', textContent: `Artifacts: ${number(ci.artifact_count)} (${number(ci.artifact_storage_bytes)} bytes); caches: ${number(ci.cache_count)} (${number(ci.cache_storage_bytes)} bytes)` }));
  }
}

function renderFailedRuns(data) {
  const host = document.querySelector('[data-failed-runs]');
  if (!host) return;
  clear(host);
  const panel = host.closest('[data-failed-runs-panel]');
  const failedRuns = data.github_actions?.recent_failed_runs || [];
  if (!failedRuns.length) {
    if (panel) panel.style.display = 'none';
    return;
  }
  if (panel) panel.style.display = '';

  const groups = new Map();
  for (const run of failedRuns) {
    const key = `${run.name}|${run.head_branch}|${run.event}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }

  const table = element('table', { className: 'compact-table' });
  table.append(element('thead', {}, [element('tr', {}, [
    element('th', { textContent: 'Workflow' }),
    element('th', { textContent: 'Branch' }),
    element('th', { textContent: 'Trigger' }),
    element('th', { textContent: 'Failures' }),
    element('th', { textContent: 'Latest failure' }),
    element('th', { textContent: 'Run' })
  ])]));
  const tbody = element('tbody', {});
  for (const [key, runs] of groups) {
    const [name, branch, event] = key.split('|');
    const latest = runs[0];
    const runCell = element('td', {});
    if (latest.url) {
      runCell.append(externalLink(`#${text(latest.run_number, '—')}`, latest.url));
    } else {
      runCell.textContent = '—';
    }
    tbody.append(element('tr', {}, [
      element('td', { textContent: text(name) }),
      element('td', {}, [element('code', { className: 'inline-code', textContent: text(branch) })]),
      element('td', { textContent: text(event) }),
      element('td', { textContent: number(runs.length) }),
      element('td', { textContent: readableDate(latest.created_at) || '—' }),
      runCell
    ]));
  }
  table.append(tbody);
  host.append(table);
}

function renderProjectConfig(data) {
  const host = document.querySelector('[data-project-config]');
  if (!host) return;
  clear(host);
  const project = data.project || {};
  const reporting = data.reporting_period || {};
  const rows = [
    ['Project ID', project.id],
    ['Project name', project.name],
    ['Repository', project.repository],
    ['Environment', project.environment || 'production'],
    ['Documentation URL', project.documentation_url],
    ['Citation URL', project.citation_url],
    ['Dataset generated', formatGeneratedAt(data.generated_at)],
    ['Default period', reporting.periods?.default],
    ['Stale threshold (days)', number(reporting.stale_days)],
    ['Freshness warning (hours)', number(reporting.freshness_warning_hours)]
  ];
  for (const [label, value] of rows) {
    if (value === null || value === undefined || value === '') continue;
    host.append(element('div', { className: 'status-row' }, [
      element('b', { textContent: label }),
      element('span', { textContent: String(value) })
    ]));
  }
}

function hideEmptyPanel(selector, hasContent) {
  const host = document.querySelector(selector);
  if (host && !hasContent) host.style.display = 'none';
}

function initPrintReport() {
  const button = document.querySelector('[data-print-report]');
  if (button) button.addEventListener('click', () => window.print());
}

function compactTable(headers, rows) {
  const tableNode = element('table', { className: 'compact-table' });
  tableNode.append(element('thead', {}, [
    element('tr', {}, headers.map((header) => element('th', { textContent: header })))
  ]));
  tableNode.append(element('tbody', {}, rows.map((row) => (
    element('tr', {}, row.map((cell) => element('td', { textContent: cell })))
  ))));
  return tableNode;
}

function renderReportDownload(data, reportStatus = {}) {
  const identityMatches = reportStatus.available === true
    && reportStatus.project_id === data.project?.id
    && reportStatus.environment === data.project?.environment;
  const available = identityMatches;
  const link = document.querySelector('[data-pdf-download]');
  if (link) {
    if (available) {
      link.href = `./${reportStatus.path || 'reports/latest.pdf'}`;
      link.hidden = false;
    } else {
      link.hidden = true;
    }
  }
  return null;
}

function reportFooter(data) {
  const activeSources = Object.entries(data.source_status || {})
    .filter(([, status]) => status.status === 'available' || status.status === 'partial')
    .map(([name]) => name.replaceAll('_', ' '));
  const limitations = Object.entries(data.source_status || {})
    .flatMap(([, status]) => [status.limitation, status.message].filter(Boolean))
    .slice(0, 4);
  return element('footer', { className: 'report-footer' }, [
    element('p', { textContent: `Generated ${formatGeneratedAt(data.generated_at)}. Active sources: ${activeSources.join(', ') || 'none'}.` }),
    limitations.length
      ? element('p', { textContent: `Limitations: ${limitations.join(' ')}` })
      : document.createTextNode('')
  ]);
}

function reportSection(title, rows) {
  const filtered = rows.filter(([, value]) => value !== 'N/A' && value !== '—' && value !== '');
  if (!filtered.length) return null;
  return element('section', { className: 'report-section' }, [
    element('h2', { textContent: title }),
    compactTable(['Metric', 'Value'], filtered)
  ]);
}

function renderReport(data, reportStatus = {}) {
  const host = document.querySelector('[data-report]');
  if (!host) return;
  clear(host);
  renderReportDownload(data, reportStatus);
  const period = activePeriod(data);
  const contributorPeriod = data.contributors?.period_summaries?.[period.id] || {};
  const releasePeriod = data.releases?.period_summaries?.[period.id] || {};
  const periodSummary = data.operations?.period_summaries?.[period.id] || {};
  const ciRate = data.github_actions?.success_rate;
  const traffic = data.github_traffic || {};
  const docs = data.documentation_analytics || {};

  host.append(
    element('header', { className: 'report-title' }, [
      element('h1', { textContent: `${data.project.name} — Impact Report` }),
      element('p', { className: 'report-meta', textContent: `${data.project.repository} · ${period.label} · ${formatGeneratedAt(data.generated_at)}` })
    ])
  );

  if (data.project?.environment !== 'production') {
    host.append(element('p', { className: 'report-note', textContent: `Development sandbox (${data.project.repository}).` }));
  }

  const sections = [
    reportSection('Overview', [
      ['Open issues', number(data.summary?.open_issues)],
      ['Open PRs', number(data.summary?.open_pull_requests)],
      ['Net backlog change', number(periodSummary.net_backlog_change ?? data.summary?.net_backlog_change)],
      ['Median issue close', days(periodSummary.median_issue_close_days ?? data.summary?.median_issue_close_days)],
      ['Median PR merge', days(periodSummary.median_pr_merge_days ?? data.summary?.median_pr_merge_days)],
      ['Median first response', days(data.summary?.median_first_response_days)],
      ['PRs awaiting review', number(data.summary?.awaiting_review_count)],
      ['CI success rate', ciRate === null || ciRate === undefined ? '—' : percent(ciRate)]
    ]),
    reportSection('Operations', [
      ['Issues opened', number(periodSummary.issues_opened)],
      ['Issues closed', number(periodSummary.issues_closed)],
      ['PRs opened', number(periodSummary.prs_opened)],
      ['PRs merged', number(periodSummary.prs_merged)],
      ['Untriaged', number(data.summary?.untriaged_items)],
      ['PRs awaiting review', number(data.operations?.review_load?.open_prs_waiting_for_review)],
      ['Draft PRs', number(data.operations?.review_load?.draft_prs)],
      ['Commits (52w)', githubActivityAvailable(data) ? number(data.github_activity?.total_commits_52w) : '—'],
      ['Commits (4w)', githubActivityAvailable(data) ? number(data.github_activity?.commits_last_4w) : '—']
    ]),
    reportSection('GitHub reach (14-day window)', [
      ['Repo page views', githubTrafficAvailable(data) ? number(traffic.views_total) : '—'],
      ['Unique visitors', githubTrafficAvailable(data) ? number(traffic.views_unique) : '—'],
      ['Clones', githubTrafficAvailable(data) ? number(traffic.clones_total) : '—'],
      ['Unique cloners', githubTrafficAvailable(data) ? number(traffic.clones_unique) : '—'],
      ['Stars', number(data.repository_metadata?.stars ?? data.summary?.stars)],
      ['Forks', number(data.repository_metadata?.forks ?? data.summary?.forks)],
      ...((traffic.popular_paths || []).slice(0, 3).map((item) => [`Path: ${item.path}`, number(item.count)])),
      ...((traffic.popular_referrers || []).slice(0, 3).map((item) => [`Referrer: ${item.referrer}`, number(item.count)]))
    ]),
    reportSection('Documentation', [
      ['Visitors', documentationAvailable(data) ? number(docs.visitor_count) : '—'],
      ...(hasDistinctPageHitCount(data) ? [['Page hits', number(docs.page_hit_count)]] : []),
      ['Search events', documentationAvailable(data) ? number(docs.search_count) : '—'],
      ['No-result searches', documentationAvailable(data) ? number(docs.no_result_search_count) : '—'],
      ['404s', documentationAvailable(data) ? number(docs.not_found_count) : '—'],
      ...((docs.popular_pages || []).slice(0, 3).map((item) => [`Page: ${item.path}`, number(item.count)])),
      ...((docs.not_found_pages || []).slice(0, 3).map((item) => [`Missing: ${item.path}`, number(item.count)]))
    ]),
    reportSection('Impact & citations', [
      ['Citations', number(data.impact?.openalex?.cited_by_count ?? data.summary?.citation_count)],
      ['Zenodo downloads', number(data.impact?.zenodo?.downloads ?? data.summary?.zenodo_downloads)],
      ['Zenodo views', number(data.impact?.zenodo?.views ?? data.summary?.zenodo_views)],
      ['Release downloads', number(data.releases?.release_asset_downloads)],
      ['Total releases', number(data.releases?.total_releases)],
      ['Releases in period', number(releasePeriod.releases)],
      ['Latest release age', days(data.releases?.latest_release_age_days)]
    ]),
    reportSection('Contributors', [
      ['Unique contributors', number(data.contributors?.unique_contributors)],
      ['New in period', number(contributorPeriod.new_contributors)],
      ['Repeat in period', number(contributorPeriod.repeat_contributors)],
      ['Top 3 concentration', percent(data.contributors?.contribution_concentration?.top_3_share)],
      ['Newcomer PR authors', number(data.operations?.newcomer_funnel?.first_pr_authors)],
      ['Newcomer conversion', percent(data.operations?.newcomer_funnel?.conversion_rate)]
    ])
  ].filter(Boolean);

  for (const section of sections) host.append(section);

  if (data.github_actions?.total_runs) {
    host.append(reportSection('CI reliability', [
      ['Workflow runs', number(data.github_actions.total_runs)],
      ['Success rate', percent(data.github_actions.success_rate)],
      ['Median duration', duration(data.github_actions.median_duration_seconds)],
      ['Failed runs', number(data.github_actions.failed_runs)],
      ['Latest default-branch', text(data.github_actions.latest_default_branch_status || '—')]
    ]));
    const workflowRows = (data.github_actions.by_workflow || []).slice(0, 6).map((workflow) => [
      text(workflow.name),
      `${number(workflow.runs)} · ${workflow.success_rate === null || workflow.success_rate === undefined ? 'N/A' : percent(workflow.success_rate)}`
    ]);
    if (workflowRows.length) {
      host.append(element('section', { className: 'report-section' }, [
        element('h2', { textContent: 'Workflows' }),
        compactTable(['Workflow', 'Runs / success'], workflowRows)
      ]));
    }
  }

  if (githubSecurityAvailable(data) && data.github_security?.available) {
    const ghSec = data.github_security;
    host.append(reportSection('Security alerts', [
      ['Open alerts', number(ghSec.total_open_alerts)],
      ['Highest severity', text(ghSec.highest_open_severity || '—')],
      ['Dependabot', number(ghSec.dependabot?.open_alerts)],
      ['Code scanning', number(ghSec.code_scanning?.open_alerts)]
    ]));
  }

  if (data.security?.available) {
    const failedChecks = (data.security.checks || []).filter((check) => check.score === 0 || check.score === '0');
    host.append(reportSection('OpenSSF scorecard', [
      ['Score', number(data.security.score)],
      ...(failedChecks.length ? [['Failed checks', failedChecks.map((c) => c.name).join(', ')]] : [])
    ]));
  }

  host.append(reportFooter(data));
  document.body.dataset.reportReady = 'true';
}

function renderHeader(data) {
  const period = activePeriod(data);
  document.querySelector('[data-project-name]')?.replaceChildren(sectionTitle(data));
  document.querySelector('[data-project-subtitle]')?.replaceChildren(
    `${data.project.repository} · ${period.label} · generated ${formatGeneratedAt(data.generated_at)}`
  );
}

function renderDataFreshness(data) {
  const generated = new Date(data.generated_at);
  const warningHours = data.reporting_period?.freshness_warning_hours || 48;
  const ageHours = (Date.now() - generated.valueOf()) / 3600000;
  const stale = ageHours > warningHours;
  const target = document.querySelector('[data-project-subtitle]');
  if (target && stale) {
    target.append(` Data freshness warning: this dataset is ${Math.round(ageHours)} hours old.`);
  }
}

// --- Init ---
initTheme();
initThemeToggle();
initPrintReport();
initTooltips();
if (page === 'dashboard') {
  showKpiSkeleton('[data-overview-summary]');
  showKpiSkeleton('[data-operations-summary]');
  showKpiSkeleton('[data-growth-summary]');
}
loadData()
  .then(async (data) => {
    dashboardData = data;
    if (projectManifest) {
      initProjectPicker(projectManifest, activeProjectId);
      syncProjectNavigation(activeProjectId);
    }
    const reportStatus = page === 'report' ? await loadReportStatus() : {};
    renderHeader(dashboardData);
    renderDataFreshness(dashboardData);

    if (page === 'dashboard') {
      populateChartPeriods(dashboardData);
      initGlobalPeriod(dashboardData);
      initChartPeriodSelectors(dashboardData);
      renderDashboard(dashboardData);
      initSectionNav(dashboardData);
    }

    if (page === 'settings') {
      renderProjectConfig(dashboardData);
      renderSources(dashboardData);
      renderSecurityHealth(dashboardData);
      hideEmptyPanel('[data-section="securityHealth"]', dashboardData.security?.available);
    }

    if (page === 'report') renderReport(dashboardData, reportStatus);
    renderEnvironmentBanner(dashboardData);
  })
  .catch((error) => {
    console.error('Dashboard load error', error);
    document.body.prepend(
      element('div', { className: 'load-error', textContent: `Dashboard failed to load: ${error.message}` })
    );
  });
