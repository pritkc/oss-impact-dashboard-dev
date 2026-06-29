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
const page = document.body.dataset.page;
let table;
let dashboardData;
let projectManifest;
let activeProjectId;
const filterState = new URLSearchParams(window.location.search);
const PROJECT_STORAGE_KEY = 'oss-dashboard-project';

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
    option.textContent = `${entry.name} (${entry.repository})`;
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
  return value === null || value === undefined ? 'N/A' : numberFormat.format(value);
}

function days(value) {
  return value === null || value === undefined ? 'N/A' : `${number(value)} days`;
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
  const banner = element('aside', {
    className: 'environment-banner',
    role: 'status',
    dataset: { environmentBanner: data.project?.environment || 'non-production' }
  }, [
    element('strong', { textContent: 'DEVELOPMENT SANDBOX' }),
    element('span', { textContent: `Data source: ${data.project?.repository || 'unknown'}` }),
    element('span', { textContent: `Environment: ${data.project?.environment || 'non-production'}` })
  ]);
  const target = document.querySelector('.shell, .report-shell');
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

function initThemeToggle() {
  const toggle = document.querySelector('.theme-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('oss-dashboard-theme', next);
    location.reload();
  });
}

// --- KPI rendering (preserving existing logic) ---
function appendStat(host, label, value, href, detail = '') {
  const body = [
    element('span', { className: 'kpi-label', textContent: label }),
    element('span', { className: 'kpi-value', textContent: value }),
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
  for (const [label, value, href, detail] of cards) appendStat(host, label, value, href, detail);
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

function renderSources(data) {
  const host = document.querySelector('[data-source-status]');
  if (!host) return;
  clear(host);
  for (const [name, status] of Object.entries(data.source_status || {})) {
    host.append(
      element('div', { className: 'status-row' }, [
        element('b', { textContent: name.replaceAll('_', ' ') }),
        element('span', { className: statusClass(status.status), textContent: status.status }),
        element('small', { textContent: status.message || status.limitation || '' })
      ])
    );
  }
  const docs = data.documentation_analytics || {};
  const tracker = docs.tracker || {};
  if (tracker.enabled || docs.provider === 'goatcounter') {
    const apiKeyInvalid = docs.http_status === 401 || String(docs.message || '').includes('API_KEY');
    const apiStatus = docs.status === 'available' || docs.status === 'partial'
      ? 'Analytics available'
      : tracker.enabled && apiKeyInvalid
        ? 'API key invalid'
        : tracker.enabled
          ? 'No analytics received yet'
          : 'Tracker not configured';
    const lastSuccess = docs.status === 'available' || docs.status === 'partial'
      ? readableDate(docs.collected_at)
      : '';
    host.append(
      element('div', { className: 'status-row' }, [
        element('b', { textContent: 'documentation tracker' }),
        element('span', {
          className: statusClass(tracker.enabled ? 'available' : 'unavailable'),
          textContent: tracker.enabled ? 'configured' : 'unavailable'
        }),
        element('small', {
          textContent: `${tracker.tracked_domain || 'no tracked hostname'}; ${apiStatus}; last successful collection: ${lastSuccess || 'Unavailable'}`
        })
      ])
    );
  }
}

function renderDefinitions(data) {
  const host = document.querySelector('[data-definitions]');
  if (!host) return;
  clear(host);
  for (const [name, definition] of Object.entries(data.metric_definitions || {})) {
    host.append(
      element('article', {}, [
        element('b', { textContent: name.replaceAll('_', ' ') }),
        element('p', { textContent: definition })
      ])
    );
  }
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
  for (const [label, value] of rows) {
    host.append(element('div', { className: 'compact-row' }, [
      element('b', { textContent: label }),
      element('span', { textContent: value })
    ]));
  }
  const dailyViews = traffic.daily_views || [];
  const dailyClones = traffic.daily_clones || [];
  if (dailyViews.length || dailyClones.length) {
    const labels = (dailyViews.length ? dailyViews : dailyClones).map((item) => item.date);
    const canvas = element('canvas', { id: 'githubTrafficChart' });
    host.append(element('div', { className: 'chart-container', style: 'height:180px;' }, [canvas]));
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
        plugins: chartPlugins(data, 'GitHub traffic (14-day window)'),
        scales: chartScales()
      }
    });
  }
  host.append(element('h3', { textContent: 'Popular paths', style: 'margin-top: var(--space-3);' }));
  const paths = traffic.popular_paths || [];
  if (!paths.length) host.append(element('p', { className: 'muted', textContent: 'No popular paths reported in the last 14 days.' }));
  for (const item of paths.slice(0, 5)) {
    host.append(element('p', { textContent: `${item.path}: ${number(item.count)} views` }));
  }
  host.append(element('h3', { textContent: 'Top referrers' }));
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
  for (const [label, value] of rows) {
    host.append(element('div', { className: 'compact-row' }, [
      element('b', { textContent: label }),
      element('span', { textContent: value })
    ]));
  }
  const weekly = activity.weekly_commits || [];
  if (weekly.length) {
    const canvas = element('canvas', { id: 'developmentVelocityChart' });
    host.append(element('div', { className: 'chart-container', style: 'height:180px;' }, [canvas]));
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
    ['Oldest open alert age', days(security.oldest_open_alert_age_days)],
    ['Dependabot open', number(security.dependabot?.open_alerts)],
    ['Code scanning open', number(security.code_scanning?.open_alerts)]
  ];
  for (const [label, value] of rows) {
    host.append(element('div', { className: 'compact-row' }, [
      element('b', { textContent: label }),
      element('span', { textContent: value })
    ]));
  }
  if (securityUrl) {
    host.append(externalLink('View alerts on GitHub', securityUrl));
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
    ['Open PRs waiting for review', number(review.open_prs_waiting_for_review)],
    ['Requested reviewers', number(review.requested_reviewers_count)],
    ['Draft PRs', number(review.draft_prs)],
    ['PRs with changes requested', number(review.prs_with_changes_requested)],
    ['Median time to first review', days(review.median_time_to_first_review)],
    ['P90 time to first review', days(review.p90_time_to_first_review)],
    ['Issue comment coverage', engagement.issue_comment_coverage === null || engagement.issue_comment_coverage === undefined ? 'N/A' : percent(engagement.issue_comment_coverage)],
    ['PR review coverage', engagement.pr_review_coverage === null || engagement.pr_review_coverage === undefined ? 'N/A' : percent(engagement.pr_review_coverage)]
  ];
  for (const [label, value] of rows) {
    host.append(element('div', { className: 'compact-row' }, [
      element('b', { textContent: label }),
      element('span', { textContent: value })
    ]));
  }
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
  const candidates = [
    ['Oldest open issue', queues.oldest_open_issues?.[0]],
    ['Oldest open PR', queues.oldest_open_pull_requests?.[0]],
    ['Untriaged', queues.untriaged?.[0]],
    ['Highest age', queues.open_over_threshold?.[0]],
    ['Recently reopened', queues.recently_reopened?.[0]],
    ['Awaiting review', queues.awaiting_review?.[0]]
  ].filter(([, item]) => item);
  for (const [label, item] of candidates.slice(0, 6)) {
    host.append(element('div', { className: 'compact-row' }, [
      element('b', { textContent: label }),
      externalLink(`#${item.number} ${item.title}`, item.url)
    ]));
  }
  if (!candidates.length) host.append(element('p', { textContent: 'No urgent queue items in the current dataset.' }));
}

// --- Chart helpers ---
const chartInstances = new Map();

function chart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const existing = chartInstances.get(id);
  if (existing) existing.destroy();
  canvas.setAttribute('aria-label', config.options?.plugins?.title?.text || id);
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

function populateChartPeriods(data) {
  const options = data.reporting_period?.periods?.options || [];
  const selectors = document.querySelectorAll('.chart-period-select');
  for (const sel of selectors) {
    if (sel.options.length) continue;
    for (const period of options) {
      sel.append(element('option', { value: period.id, textContent: period.label }));
    }
    sel.append(element('option', { value: 'custom', textContent: 'Custom range' }));
    const chartId = sel.dataset.chartPeriod;
    const stored = localStorage.getItem(`oss-dashboard-chart-period-${chartId}`);
    sel.value = stored || data.reporting_period?.periods?.default || '12m';
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

function initChartPeriodSelectors(data) {
  const selectors = document.querySelectorAll('.chart-period-select');
  for (const sel of selectors) {
    sel.addEventListener('change', () => {
      const chartId = sel.dataset.chartPeriod;
      const periodId = sel.value;
      localStorage.setItem(`oss-dashboard-chart-period-${chartId}`, periodId);
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
        if (chartId === 'activityChart') renderActivityChart(data, 'custom', customRange);
        if (chartId === 'backlogChart') renderBacklogChart(data, 'custom', customRange);
      });
    }
  }
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

function chartScales() {
  return {
    x: { grid: { display: false }, ticks: { color: cssVar('--fg-muted') }, border: { color: cssVar('--border-default') } },
    y: { grid: { color: cssVar('--border-subtle') }, ticks: { color: cssVar('--fg-muted') }, border: { display: false }, beginAtZero: true }
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
  const metrics = (data.operations?.label_metrics || []).slice(0, 10);
  setChartSummary('labelChart', `${number(metrics.length)} canonical labels are shown by total work items.`);
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
      responsive: true,
      maintainAspectRatio: false,
      plugins: chartPlugins(data, 'Work by canonical label'),
      scales: chartScales()
    }
  });
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
  ].map((value) => value || 0);
  chart('completionDistributionChart', {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Days', data: values, backgroundColor: chartColor('orange') }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { ...chartPlugins(data, 'Response and age distribution'), legend: { display: false } },
      scales: chartScales()
    }
  });
}

function renderQueues(data) {
  const host = document.querySelector('[data-queues]');
  if (!host) return;
  clear(host);
  const queueLabels = {
    oldest_open_issues: 'Oldest open issues',
    oldest_open_pull_requests: 'Oldest open PRs',
    untriaged: 'Untriaged',
    open_over_threshold: `Open over ${data.reporting_period?.stale_days || 90} days`,
    recently_reopened: 'Recently reopened',
    high_priority: 'High priority',
    awaiting_review: 'PRs awaiting review',
    issues_without_external_response: 'Issues without external response'
  };
  for (const [name, items] of Object.entries(data.operations?.queues || {})) {
    const list = element('ul', { className: 'queue-list' });
    for (const item of (items || []).slice(0, 5)) {
      list.append(element('li', {}, [externalLink(`#${item.number}`, item.url), ` ${item.title}`]));
    }
    if (!items?.length) continue;
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
    period: document.getElementById('periodFilter')?.value || '',
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
    if (value) params.set(key, value);
  }
  const hash = window.location.hash || '#operations';
  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${hash}`;
  window.history.replaceState({}, '', nextUrl);
  if (filters.period) localStorage.setItem('oss-dashboard-period', filters.period);
}

function initSectionNav() {
  const nav = document.querySelector('.section-nav');
  if (!nav) return;
  const links = nav.querySelectorAll('a[href^="#"]');
  const sections = [...links].map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  if (!sections.length) return;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const link of links) {
        link.removeAttribute('aria-current');
        if (link.getAttribute('href') === `#${entry.target.id}`) {
          link.setAttribute('aria-current', 'true');
        }
      }
    }
  }, { rootMargin: '-20% 0px -60% 0px', threshold: 0 });

  for (const section of sections) observer.observe(section);

  if (window.location.hash) {
    const target = document.querySelector(window.location.hash);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (filterState.toString()) {
    document.querySelector('#operations')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function updateFilterSummary(filters, count) {
  const host = document.querySelector('[data-filter-summary]');
  if (!host) return;
  const active = Object.entries(filters).filter(([, value]) => value);
  const summary = active.map(([key, value]) => `${key}: ${value}`).join(', ');
  host.textContent = `${number(count)} results${summary ? ` • ${summary}` : ''}`;
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
}

function applyFilters(data) {
  if (!table) return;
  const filters = currentFilters();
  table.setFilter((record) => filterMatches(record, filters));
  syncFilterUrl(filters);
  renderSummary(data, filters.period || activePeriodId(data));
  renderGrowthSummary(data, filters.period || activePeriodId(data));
}

function renderTable(data) {
  const host = document.getElementById('itemsTable');
  if (!host) return;
  populateFilters(data);
  table = new Tabulator(host, {
    data: data.items || [],
    layout: 'fitColumns',
    pagination: true,
    paginationSize: 15,
    initialSort: [{ column: 'created_at', dir: 'desc' }],
    responsiveLayout: 'collapse',
    columns: [
      { title: '#', field: 'number', width: 78, sorter: 'number' },
      { title: 'Type', field: 'type', width: 130 },
      { title: 'State', field: 'state', width: 100, formatter: (cell) => displayState(cell.getRow().getData()) },
      { title: 'Title', field: 'title', formatter: (cell) => titleLink(cell.getRow().getData()) },
      { title: 'Author', field: 'author', width: 130 },
      { title: 'Labels', field: 'metric_labels', formatter: (cell) => labelPills(cell.getValue()) },
      { title: 'Age', field: 'age_days', width: 95, sorter: 'number', formatter: (cell) => days(cell.getValue()) },
      { title: 'Time to done', field: 'days_to_close', width: 130, formatter: (cell) => days(timeToComplete(cell.getRow().getData())) },
      { title: 'Created', field: 'created_at', width: 130, formatter: (cell) => readableDate(cell.getValue()) },
      { title: 'Closed', field: 'closed_at', width: 130, formatter: (cell) => readableDate(cell.getValue()) }
    ]
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
      if (input) input.value = id === 'periodFilter' ? data.reporting_period?.periods?.default || '' : '';
    }
    filterState.delete('queue');
    applyFilters(data);
  });
  document.getElementById('csvExport')?.addEventListener('click', () => downloadRows(tableRows(), 'csv'));
  document.getElementById('jsonExport')?.addEventListener('click', () => downloadRows(tableRows(), 'json'));
  applyFilters(data);
}

// --- Growth page rendering ---
function renderGrowth(data) {
  const periodId = activePeriodId(data);
  renderGrowthSummary(data, periodId);
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
  renderReleaseAnalytics(data, periodId);
  renderContributorAnalytics(data, periodId);
  renderDocumentationAnalytics(data);
  renderGithubTraffic(data);
  renderDevelopmentVelocity(data);
  renderSnapshotTrend(data);
}

function renderReleaseAnalytics(data, periodId = activePeriodId(data)) {
  const host = document.querySelector('[data-section="releases"]');
  if (host) {
    const h2 = host.querySelector('h2, h3');
    clear(host);
    if (h2) host.append(h2);
    for (const release of data.releases?.by_release || []) {
      host.append(element('div', { className: 'compact-row' }, [
        release.url ? externalLink(release.tag || release.name, release.url) : element('b', { textContent: release.tag || release.name }),
        element('span', { textContent: `${readableDate(release.published_at)} · ${number(release.asset_count)} assets · ${number(release.asset_downloads)} downloads` })
      ]));
    }
    if (data.releases?.zero_download_explanation) {
      host.append(element('p', { textContent: data.releases.zero_download_explanation }));
    }
    if (!data.releases?.by_release?.length) host.style.display = 'none';
  }
  const releases = data.releases?.by_release || [];
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

function renderContributorAnalytics(data, periodId = activePeriodId(data)) {
  const host = document.querySelector('[data-section="contributors"]');
  if (host) {
    const h2 = host.querySelector('h2, h3');
    clear(host);
    if (h2) host.append(h2);
    const period = data.contributors?.period_summaries?.[periodId] || {};
    const concentration = data.contributors?.contribution_concentration || {};
    const funnel = data.operations?.newcomer_funnel || {};
    const rows = [
      ['Unique contributors', number(data.contributors?.unique_contributors)],
      ['Bus factor', number(data.contributors?.bus_factor)],
      ['New in period', number(period.new_contributors)],
      ['Repeat in period', number(period.repeat_contributors)],
      ['Newcomer first PR authors', number(funnel.first_pr_authors)],
      ['Newcomer conversion rate', percent(funnel.conversion_rate)],
      ['Top 3 concentration', concentration.top_3_share === null || concentration.top_3_share === undefined ? 'N/A' : percent(concentration.top_3_share)]
    ];
    for (const [label, value] of rows) {
      host.append(element('div', { className: 'compact-row' }, [
        element('b', { textContent: label }),
        element('span', { textContent: value })
      ]));
    }
  }
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
  for (const [label, value] of rows) {
    host.append(element('div', { className: 'compact-row' }, [
      element('b', { textContent: label }),
      element('span', { textContent: value })
    ]));
  }
  const canvas = element('canvas', { id: 'documentationTrendChart' });
  const canvasWrap = element('div', { className: 'chart-container', style: 'height:160px;' }, [canvas]);
  host.append(canvasWrap);
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
  host.append(element('h2', { textContent: 'Popular pages' }));
  for (const item of (docs.popular_pages || []).slice(0, 5)) {
    host.append(element('p', { textContent: `${item.path}: ${number(item.count)} hits` }));
  }
  host.append(element('h2', { textContent: 'Top referrers' }));
  for (const item of (docs.top_referrers || []).slice(0, 5)) {
    host.append(element('p', { textContent: `${item.referrer}: ${number(item.count)}` }));
  }
  host.append(element('h2', { textContent: 'Missing documentation paths' }));
  const missing = (docs.not_found_pages || []).slice(0, 8);
  if (!missing.length) host.append(element('p', { textContent: 'No missing documentation paths reported.' }));
  for (const item of missing) {
    host.append(element('p', { textContent: `${item.path}: ${number(item.count)}` }));
  }
  for (const limitation of docs.limitations || []) {
    host.append(element('p', { className: 'muted-text', textContent: limitation }));
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
    ['Successful runs', number(ci.successful_runs)],
    ['Failed runs', number(ci.failed_runs)],
    ['Cancelled runs', number(ci.cancelled_runs)],
    ['Success rate', percent(ci.success_rate)],
    ['Median duration', duration(ci.median_duration_seconds)]
  ];
  const summaryList = element('div', { className: 'status-list' });
  for (const [label, value] of rows) {
    summaryList.append(element('div', { className: 'compact-row' }, [
      element('b', { textContent: label }),
      element('span', { textContent: value })
    ]));
  }
  host.append(summaryList);

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

  const failedRuns = ci.recent_failed_runs || [];
  if (failedRuns.length) {
    host.append(element('h3', { textContent: 'Recent failed runs', style: 'margin-top: var(--space-3);' }));
    const table = element('table', { className: 'compact-table' });
    table.append(element('thead', {}, [element('tr', {}, [
      element('th', { textContent: 'Workflow' }),
      element('th', { textContent: 'Run #' }),
      element('th', { textContent: 'Branch' }),
      element('th', { textContent: 'Event' }),
      element('th', { textContent: 'Conclusion' }),
      element('th', { textContent: 'Date' })
    ])]));
    const tbody = element('tbody', {});
    for (const run of failedRuns) {
      const nameCell = run.url
        ? element('td', {}, [externalLink(text(run.name), run.url)])
        : element('td', { textContent: text(run.name) });
      tbody.append(element('tr', {}, [
        nameCell,
        element('td', { textContent: text(run.run_number) }),
        element('td', { textContent: text(run.head_branch) }),
        element('td', { textContent: text(run.event) }),
        element('td', { className: statusClass('unavailable'), textContent: text(run.conclusion || run.status || 'failed') }),
        element('td', { textContent: readableDate(run.created_at) })
      ]));
    }
    table.append(tbody);
    host.append(table);
  }
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
    ['Dataset generated', data.generated_at],
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
    element('p', { textContent: `Generated ${data.generated_at}. Active sources: ${activeSources.join(', ') || 'none'}.` }),
    limitations.length
      ? element('p', { textContent: `Limitations: ${limitations.join(' ')}` })
      : document.createTextNode('')
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

  host.append(
    element('header', { className: 'report-title' }, [
      element('h1', { textContent: `${data.project.name} — Open Source Growth Report` }),
      element('p', { className: 'report-meta', textContent: `${data.project.repository}` }),
      element('p', {
        className: 'report-meta',
        textContent: `${period.label}: ${period.start || 'project start'} through ${period.end ? readableDate(period.end) : 'present'}. Generated ${readableDate(data.generated_at) || data.generated_at}.`
      })
    ])
  );

  if (data.project?.environment !== 'production') {
    host.append(element('section', { className: 'report-section development-disclaimer' }, [
      element('p', { textContent: `Development sandbox data from ${data.project.repository}. Not official production growth reporting.` })
    ]));
  }

  host.append(element('section', { className: 'report-kpis' }, [
    element('article', {}, [element('strong', { textContent: number(data.impact?.openalex?.cited_by_count ?? data.summary?.citation_count) }), element('span', { textContent: 'Citations' })]),
    element('article', {}, [element('strong', { textContent: number(data.releases?.release_asset_downloads) }), element('span', { textContent: 'Release downloads' })]),
    element('article', {}, [element('strong', { textContent: documentationAvailable(data) ? number(data.documentation_analytics?.visitor_count) : '—' }), element('span', { textContent: 'Documentation visitors' })]),
    element('article', {}, [element('strong', { textContent: githubTrafficAvailable(data) ? number(data.github_traffic?.views_total) : '—' }), element('span', { textContent: 'Repo views (14d)' })]),
    element('article', {}, [element('strong', { textContent: githubTrafficAvailable(data) ? number(data.github_traffic?.clones_total) : '—' }), element('span', { textContent: 'Clones (14d)' })]),
    element('article', {}, [element('strong', { textContent: number(data.contributors?.unique_contributors) }), element('span', { textContent: 'Contributors' })]),
    element('article', {}, [element('strong', { textContent: number(releasePeriod.releases) }), element('span', { textContent: 'Releases in period' })])
  ]));

  host.append(element('section', { className: 'report-section' }, [
    element('h2', { textContent: 'Executive summary' }),
    compactTable(['Metric', 'Value'], [
      ['Net backlog change', number(periodSummary.net_backlog_change ?? data.summary?.net_backlog_change)],
      ['Median issue close', days(periodSummary.median_issue_close_days ?? data.summary?.median_issue_close_days)],
      ['Median PR merge', days(periodSummary.median_pr_merge_days ?? data.summary?.median_pr_merge_days)],
      ['Median first response', days(data.summary?.median_first_response_days)],
      ['PRs awaiting review', number(data.summary?.awaiting_review_count)],
      ['CI success rate', ciRate === null || ciRate === undefined ? '—' : percent(ciRate)]
    ].filter(([, value]) => value !== 'N/A' && value !== '—'))
  ]));

  host.append(element('section', { className: 'report-section' }, [
    element('h2', { textContent: 'Reach and adoption' }),
    compactTable(['Metric', 'Value'], [
      ['Zenodo downloads', number(data.impact?.zenodo?.downloads ?? data.summary?.zenodo_downloads)],
      ['Zenodo views', number(data.impact?.zenodo?.views ?? data.summary?.zenodo_views)],
      ['Release asset downloads', number(data.releases?.release_asset_downloads)],
      ['Documentation visitors', documentationAvailable(data) ? number(data.documentation_analytics?.visitor_count) : '—'],
      ['Repo page views (14d)', githubTrafficAvailable(data) ? number(data.github_traffic?.views_total) : '—'],
      ['Unique repo visitors (14d)', githubTrafficAvailable(data) ? number(data.github_traffic?.views_unique) : '—'],
      ['Repo clones (14d)', githubTrafficAvailable(data) ? number(data.github_traffic?.clones_total) : '—'],
      ['Unique cloners (14d)', githubTrafficAvailable(data) ? number(data.github_traffic?.clones_unique) : '—'],
      ['Stars', number(data.repository_metadata?.stars ?? data.summary?.stars)],
      ['Forks', number(data.repository_metadata?.forks ?? data.summary?.forks)],
      ...(hasDistinctPageHitCount(data)
        ? [['Documentation page hits', number(data.documentation_analytics?.page_hit_count)]]
        : []),
      ['Search events', documentationAvailable(data) ? number(data.documentation_analytics?.search_count) : '—'],
      ['No-result searches', documentationAvailable(data) ? number(data.documentation_analytics?.no_result_search_count) : '—'],
      ['Documentation 404s', documentationAvailable(data) ? number(data.documentation_analytics?.not_found_count) : '—']
    ].filter(([, value]) => value !== 'N/A' && value !== '—'))
  ]));

  const traffic = data.github_traffic || {};
  const trafficRows = [
    ...((traffic.popular_paths || []).slice(0, 5).map((item) => ['Popular repo path', `${item.path}: ${number(item.count)}`])),
    ...((traffic.popular_referrers || []).slice(0, 5).map((item) => ['Repo referrer', `${item.referrer}: ${number(item.count)}`]))
  ];
  if (trafficRows.length) {
    host.append(element('section', { className: 'report-section' }, [
      element('h2', { textContent: 'GitHub repository reach highlights' }),
      compactTable(['Type', 'Value'], trafficRows)
    ]));
  }

  const docs = data.documentation_analytics || {};
  const docsRows = [
    ...((docs.popular_pages || []).slice(0, 5).map((item) => ['Popular page', `${item.path}: ${number(item.count)}`])),
    ...((docs.not_found_pages || []).slice(0, 5).map((item) => ['Missing path', `${item.path}: ${number(item.count)}`]))
  ];
  if (docsRows.length) {
    host.append(element('section', { className: 'report-section' }, [
      element('h2', { textContent: 'Documentation highlights' }),
      compactTable(['Type', 'Value'], docsRows)
    ]));
  }

  host.append(element('section', { className: 'report-section' }, [
    element('h2', { textContent: 'Development and maintenance activity' }),
    compactTable(['Metric', 'Value'], [
      ['Issues opened in period', number(periodSummary.issues_opened)],
      ['Issues closed in period', number(periodSummary.issues_closed)],
      ['PRs opened in period', number(periodSummary.prs_opened)],
      ['PRs merged in period', number(periodSummary.prs_merged)],
      ['Open issues', number(data.summary?.open_issues)],
      ['Open pull requests', number(data.summary?.open_pull_requests)],
      ['Commits (52w)', githubActivityAvailable(data) ? number(data.github_activity?.total_commits_52w) : '—'],
      ['Commits (4w)', githubActivityAvailable(data) ? number(data.github_activity?.commits_last_4w) : '—'],
      ['Open PRs waiting for review', number(data.operations?.review_load?.open_prs_waiting_for_review)],
      ['Draft PRs', number(data.operations?.review_load?.draft_prs)]
    ].filter(([, value]) => value !== 'N/A' && value !== '—'))
  ]));

  host.append(element('section', { className: 'report-section' }, [
    element('h2', { textContent: 'Release delivery' }),
    compactTable(['Metric', 'Value'], [
      ['Total releases', number(data.releases?.total_releases)],
      ['Releases in period', number(releasePeriod.releases)],
      ['Latest release age', days(data.releases?.latest_release_age_days)],
      ['Median release interval', days(data.releases?.median_release_interval_days)]
    ].filter(([, value]) => value !== 'N/A'))
  ]));

  host.append(element('section', { className: 'report-section' }, [
    element('h2', { textContent: 'Contributors and community' }),
    compactTable(['Metric', 'Value'], [
      ['Unique contributors', number(data.contributors?.unique_contributors)],
      ['New contributors in period', number(contributorPeriod.new_contributors)],
      ['Repeat contributors in period', number(contributorPeriod.repeat_contributors)],
      ['Top 3 contribution concentration', percent(data.contributors?.contribution_concentration?.top_3_share)],
      ['Newcomer first PR authors', number(data.operations?.newcomer_funnel?.first_pr_authors)],
      ['Newcomer conversion rate', percent(data.operations?.newcomer_funnel?.conversion_rate)]
    ].filter(([, value]) => value !== 'N/A' && value !== '—'))
  ]));

  if (data.github_actions?.total_runs) {
    host.append(element('section', { className: 'report-section' }, [
      element('h2', { textContent: 'CI and reliability' }),
      compactTable(['Metric', 'Value'], [
        ['Workflow runs', number(data.github_actions.total_runs)],
        ['Success rate', percent(data.github_actions.success_rate)],
        ['Median duration', duration(data.github_actions.median_duration_seconds)],
        ['P90 duration', duration(data.github_actions.p90_duration_seconds)],
        ['Latest default-branch status', text(data.github_actions.latest_default_branch_status || '—')],
        ['Recent failed runs', number((data.github_actions.recent_failed_runs || []).length)]
      ].filter(([, value]) => value !== 'N/A' && value !== '—'))
    ]));
    const workflowRows = (data.github_actions.by_workflow || []).slice(0, 6).map((workflow) => [
      workflow.name,
      `${number(workflow.runs)} runs · ${workflow.success_rate === null || workflow.success_rate === undefined ? 'N/A' : percent(workflow.success_rate)} success`
    ]);
    if (workflowRows.length) {
      host.append(element('section', { className: 'report-section' }, [
        element('h2', { textContent: 'Workflow reliability' }),
        compactTable(['Workflow', 'Summary'], workflowRows)
      ]));
    }
  }

  if (githubSecurityAvailable(data) && data.github_security?.available) {
    const ghSec = data.github_security;
    host.append(element('section', { className: 'report-section' }, [
      element('h2', { textContent: 'GitHub security posture' }),
      compactTable(['Metric', 'Value'], [
        ['Total open alerts', number(ghSec.total_open_alerts)],
        ['Highest open severity', text(ghSec.highest_open_severity || '—')],
        ['Code scanning open', number(ghSec.code_scanning?.open_alerts)],
        ['Dependabot open', number(ghSec.dependabot?.open_alerts)],
        ['Secret scanning open', number(ghSec.secret_scanning?.open_alerts)],
        ['Published advisories', number(ghSec.repository_advisories?.published_count)]
      ].filter(([, value]) => value !== 'N/A' && value !== '—'))
    ]));
  }

  if (data.security?.available) {
    const failedChecks = (data.security.checks || []).filter((check) => check.score === 0 || check.score === '0');
    host.append(element('section', { className: 'report-section' }, [
      element('h2', { textContent: 'Security health' }),
      compactTable(['Metric', 'Value'], [
        ['OpenSSF score', number(data.security.score)],
        ...(failedChecks.length
          ? [['Failed or high-risk checks', failedChecks.map((c) => c.name).join(', ')]]
          : [])
      ])
    ]));
  }

  host.append(reportFooter(data));
  document.body.dataset.reportReady = 'true';
}

function renderHeader(data) {
  document.querySelector('[data-project-name]')?.replaceChildren(`${data.project.name} Growth Dashboard`);
  document.querySelector('[data-project-subtitle]')?.replaceChildren(`Dynamic growth dashboard for ${data.project.repository}, generated ${data.generated_at}.`);
  const repo = document.querySelector('[data-repo-link]');
  if (repo) {
    repo.href = safeUrl(data.project.repository_url);
    repo.target = '_blank';
    repo.rel = 'noopener noreferrer';
  }
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
      renderSummary(dashboardData);
      renderActionSummary(dashboardData);
      populateChartPeriods(dashboardData);
      initChartPeriodSelectors(dashboardData);
      const activityPeriod = document.querySelector('.chart-period-select[data-chart-period="activityChart"]')?.value || activePeriodId(dashboardData);
      renderActivityChart(dashboardData, activityPeriod, activityPeriod === 'custom' ? getCustomRange('activityChart') : null);
      const backlogPeriod = document.querySelector('.chart-period-select[data-chart-period="backlogChart"]')?.value || activePeriodId(dashboardData);
      renderBacklogChart(dashboardData, backlogPeriod, backlogPeriod === 'custom' ? getCustomRange('backlogChart') : null);
      renderAgeBucketChart(dashboardData);
      renderLabelChart(dashboardData);
      renderCompletionDistribution(dashboardData);
      renderQueues(dashboardData);
      renderTable(dashboardData);
      renderCiReliability(dashboardData);
      renderSecurityAlerts(dashboardData);
      renderReviewLoad(dashboardData);
      renderGrowth(dashboardData);
      initSectionNav();
    }

    if (page === 'settings') {
      renderProjectConfig(dashboardData);
      renderSources(dashboardData);
      renderDefinitions(dashboardData);
      renderSecurityHealth(dashboardData);
      hideEmptyPanel('[data-section="securityHealth"]', dashboardData.security?.available);
    }

    if (page === 'report') renderReport(dashboardData, reportStatus);
    renderEnvironmentBanner(dashboardData);
  })
  .catch((error) => {
    document.body.prepend(
      element('div', { className: 'load-error', textContent: `Dashboard failed to load: ${error.message}` })
    );
  });
