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
import {
  chartRegistry,
  kpiRegistry,
  sectionRegistry,
  chartColor,
  cssVar
} from './registry.js';

const numberFormat = new Intl.NumberFormat('en-US');
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
const page = document.body.dataset.page;
let table;
let dashboardData;
const filterState = new URLSearchParams(window.location.search);

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
    element('span', { textContent: 'Not official CSRC/MOLE impact data' })
  ]);
  const target = document.querySelector('.shell, .report-shell');
  target?.prepend(banner);
}

async function loadData() {
  const dataUrl = `${import.meta.env.BASE_URL}data/dashboard.json`;
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

function renderSummary(data, periodId = activePeriodId(data)) {
  const host = document.querySelector('[data-summary]');
  if (!host) return;
  clear(host);
  const summary = data.summary || {};
  const periodSummary = data.operations?.period_summaries?.[periodId] || {};
  const comparisons = data.operations?.period_comparisons?.[periodId] || {};
  const threshold = data.reporting_period?.stale_days || 90;
  const cards = [
    ['Open issues', number(summary.open_issues), './operations.html?type=issue&state=open'],
    ['Open PRs', number(summary.open_pull_requests), './operations.html?type=pull_request&state=open'],
    ['Untriaged', number(summary.untriaged_items), './operations.html?queue=untriaged'],
    [`Open over ${threshold} days`, number(summary.open_over_threshold_items ?? summary.stale_items), './operations.html?queue=open_over_threshold'],
    ['Median issue close', days(periodSummary.median_issue_close_days ?? summary.median_issue_close_days), '', comparisonText(comparisons.median_issue_close_days, 'days')],
    ['Median PR merge', days(periodSummary.median_pr_merge_days ?? summary.median_pr_merge_days), '', comparisonText(comparisons.median_pr_merge_days, 'days')],
    ['Median first response', days(summary.median_first_response_days)],
    ['Median first review', days(summary.median_first_review_days)],
    ['P90 first response', days(summary.p90_first_response_days)],
    ['PRs awaiting review', number(summary.awaiting_review_count), './operations.html?queue=awaiting_review'],
    ['Net backlog change', number(periodSummary.net_backlog_change ?? summary.net_backlog_change), '', comparisonText(comparisons.net_backlog_change)],
    ['Latest release age', days(summary.latest_release_age_days)]
  ];
  cards.push(
    ['Documentation visitors', documentationValue(data, 'visitor_count')],
    ['Search events', documentationValue(data, 'search_count')],
    ['No-result searches', documentationValue(data, 'no_result_search_count')],
    ['Documentation 404s', documentationValue(data, 'not_found_count')],
    ['Provider', providerLabel(data)],
    ['Last docs collection', readableDate(data.documentation_analytics?.collected_at) || 'Unavailable']
  );
  for (const [label, value, href, detail] of cards) appendStat(host, label, value, href, detail);
}

function renderImpactSummary(data, periodId = activePeriodId(data)) {
  const host = document.querySelector('[data-impact-summary]');
  if (!host) return;
  clear(host);
  const impact = data.impact || {};
  const releasePeriod = data.releases?.period_summaries?.[periodId] || {};
  const contributorPeriod = data.contributors?.period_summaries?.[periodId] || {};
  const releaseComparisons = data.releases?.period_comparisons?.[periodId] || {};
  const contributorComparisons = data.contributors?.period_comparisons?.[periodId] || {};
  const cards = [
    ['Zenodo downloads', number(impact.zenodo?.downloads)],
    ['Zenodo views', number(impact.zenodo?.views)],
    ['Citation count', number(impact.openalex?.cited_by_count)],
    ['Unique contributors', number(data.contributors?.unique_contributors)],
    ['Releases in period', number(releasePeriod.releases), '', comparisonText(releaseComparisons.releases)],
    ['New contributors', number(contributorPeriod.new_contributors), '', comparisonText(contributorComparisons.new_contributors)],
    ['Release downloads', number(data.releases?.release_asset_downloads), '', data.releases?.zero_download_explanation || data.releases?.note],
    ['Total releases', number(data.releases?.total_releases)]
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

function renderSecurityHealth(data) {
  const host = document.querySelector('[data-section="securityHealth"]');
  if (!host) return;
  const h2 = host.querySelector('h2');
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

function renderAdoptionMatrix(data) {
  const host = document.querySelector('[data-section="adoptionMatrix"]');
  if (!host) return;
  const h2 = host.querySelector('h2');
  clear(host);
  if (h2) host.append(h2);
  const adoption = data.adoption || {};
  if (!adoption.available) {
    host.append(element('p', { className: 'muted', textContent: 'Package adoption data not available.' }));
    return;
  }
  host.append(element('div', { className: 'status-row' }, [
    element('b', { textContent: 'Registries found' }),
    element('span', { className: 'kpi-value', textContent: number(adoption.found_count) })
  ]));
  if (adoption.total_downloads) {
    host.append(element('div', { className: 'status-row' }, [
      element('b', { textContent: 'Total downloads' }),
      element('span', { className: 'kpi-value', textContent: number(adoption.total_downloads) })
    ]));
  }
  const registries = adoption.registries || [];
  if (registries.length) {
    const list = element('div', { className: 'status-list' });
    for (const reg of registries) {
      const status = reg.found ? 'available' : 'unavailable';
      list.append(element('div', { className: 'compact-row' }, [
        element('b', { textContent: text(reg.name) }),
        element('span', { className: statusClass(status), textContent: reg.found ? 'Registered' : 'Not found' }),
        element('span', { className: 'muted', textContent: text(reg.details || '') })
      ]));
    }
    host.append(list);
  }
}

function renderCommunityStandards(data) {
  const host = document.querySelector('[data-section="communityStandards"]');
  if (!host) return;
  const h2 = host.querySelector('h2');
  clear(host);
  if (h2) host.append(h2);
  const standards = data.community_standards || {};
  if (!standards.available) {
    host.append(element('p', { className: 'muted', textContent: standards.message || 'Community standards data not available.' }));
    return;
  }
  if (standards.compliance_score !== null && standards.compliance_score !== undefined) {
    host.append(element('div', { className: 'status-row' }, [
      element('b', { textContent: 'Compliance score' }),
      element('span', { className: 'kpi-value', textContent: percent(standards.compliance_score) })
    ]));
  }
  const checks = standards.checks || [];
  if (checks.length) {
    const grid = element('div', { className: 'checklist-grid' });
    for (const check of checks) {
      const icon = check.present ? '\u2713' : '\u2717';
      const cls = check.present ? 'check-present' : 'check-absent';
      grid.append(element('div', { className: `checklist-item ${cls}` }, [
        element('span', { className: 'checklist-icon', textContent: icon }),
        element('div', {}, [
          element('b', { textContent: text(check.label) }),
          element('p', { className: 'muted', textContent: text(check.description) })
        ])
      ]));
    }
    host.append(grid);
  }
}

function renderGovernanceHealth(data) {
  const host = document.querySelector('[data-section="governanceHealth"]');
  if (!host) return;
  const h2 = host.querySelector('h2');
  clear(host);
  if (h2) host.append(h2);
  const governance = data.governance || {};
  if (!governance.available) {
    host.append(element('p', { className: 'muted', textContent: 'Governance data not available.' }));
    return;
  }
  if (governance.governance_score !== null && governance.governance_score !== undefined) {
    host.append(element('div', { className: 'status-row' }, [
      element('b', { textContent: 'Governance score' }),
      element('span', { className: 'kpi-value', textContent: percent(governance.governance_score) })
    ]));
  }
  const checks = governance.checks || [];
  if (checks.length) {
    const list = element('div', { className: 'status-list' });
    for (const check of checks) {
      list.append(element('div', { className: 'compact-row' }, [
        element('b', { textContent: text(check.category) }),
        element('span', { className: 'muted', textContent: text(check.score) }),
        element('span', { className: 'muted', textContent: (check.items || []).map((item) => `${item.name}: ${item.present ? 'Yes' : 'No'}`).join('; ') })
      ]));
    }
    host.append(list);
  }
}

function renderContributorDiversity(data) {
  const host = document.querySelector('[data-section="contributorDiversity"]');
  if (!host) return;
  const h2 = host.querySelector('h2');
  clear(host);
  if (h2) host.append(h2);
  const contributors = data.contributors || {};
  const funnel = data.operations?.newcomer_funnel || {};
  const rows = [
    ['Bus factor', number(contributors.bus_factor)],
    ['Unique contributors', number(contributors.unique_contributors)],
    ['Top 1 concentration', percent(contributors.contribution_concentration?.top_1_share)],
    ['Top 3 concentration', percent(contributors.contribution_concentration?.top_3_share)],
    ['External share', percent(contributors.external_contributor_share)],
    ['Core configured', contributors.core_contributors_configured ? 'Yes' : 'No'],
    ['Newcomer authors', number(funnel.first_pr_authors)],
    ['Newcomer merged', number(funnel.first_pr_merged)],
    ['Conversion rate', percent(funnel.conversion_rate)]
  ];
  const list = element('div', { className: 'status-list' });
  for (const [label, value] of rows) {
    list.append(element('div', { className: 'compact-row' }, [
      element('b', { textContent: label }),
      element('span', { className: 'muted', textContent: text(value) })
    ]));
  }
  host.append(list);
}

function renderTargetsProgress(data) {
  const host = document.querySelector('[data-section="targetsProgress"]');
  if (!host) return;
  const h2 = host.querySelector('h2');
  clear(host);
  if (h2) host.append(h2);
  const targets = data.targets_progress || {};
  if (!targets.available) {
    host.append(element('p', { className: 'muted', textContent: targets.message || 'Targets data not available.' }));
    return;
  }
  const items = targets.targets || [];
  if (!items.length) {
    host.append(element('p', { className: 'muted', textContent: 'No targets defined.' }));
    return;
  }
  const table = element('table', { className: 'compact-table' });
  table.append(element('thead', {}, [element('tr', {}, [
    element('th', { textContent: 'Metric' }),
    element('th', { textContent: 'Baseline' }),
    element('th', { textContent: 'Target' }),
    element('th', { textContent: 'Current' }),
    element('th', { textContent: 'Progress' }),
    element('th', { textContent: 'On track' })
  ])]));
  const tbody = element('tbody', {});
  for (const t of items) {
    const progressText = t.progress !== null && t.progress !== undefined ? percent(t.progress) : 'N/A';
    const onTrackClass = t.on_track ? 'status-available' : 'status-unavailable';
    tbody.append(element('tr', {}, [
      element('td', { textContent: text(t.metric) }),
      element('td', { textContent: text(t.baseline) }),
      element('td', { textContent: text(t.target) }),
      element('td', { textContent: text(t.current) }),
      element('td', { textContent: progressText }),
      element('td', { className: onTrackClass, textContent: t.on_track ? 'Yes' : 'No' })
    ]));
  }
  table.append(tbody);
  host.append(table);
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
    if (!items?.length) list.append(element('li', { textContent: 'No items' }));
    const panel = element('article', { className: 'panel col-4' }, [
      element('h2', { textContent: queueLabels[name] || name.replaceAll('_', ' ') }),
      list,
      localLink('View all', `./operations.html?queue=${encodeURIComponent(name)}`, 'subtle-link')
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
  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
  window.history.replaceState({}, '', nextUrl);
  if (filters.period) localStorage.setItem('oss-dashboard-period', filters.period);
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
  renderImpactSummary(data, filters.period || activePeriodId(data));
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

// --- Impact page rendering ---
function renderImpact(data) {
  const periodId = activePeriodId(data);
  renderImpactSummary(data, periodId);
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
  renderSnapshotTrend(data);
  renderManualSection('[data-section="manualProjectData"]', 'Project evidence', data.impact?.manual?.project_data || {});
  renderCaseStudies(data.impact?.manual?.case_studies || []);
}

function renderReleaseAnalytics(data, periodId = activePeriodId(data)) {
  const host = document.querySelector('[data-section="releases"]');
  if (host) {
    const h2 = host.querySelector('h2');
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
    const h2 = host.querySelector('h2');
    clear(host);
    if (h2) host.append(h2);
    const period = data.contributors?.period_summaries?.[periodId] || {};
    const concentration = data.contributors?.contribution_concentration || {};
    const rows = [
      ['Commit contributors', number(data.contributors?.commit_contributors)],
      ['Issue and PR authors', number(data.contributors?.issue_or_pr_authors)],
      ['PR authors', number(data.contributors?.pr_authors)],
      ['Merged PR authors', number(data.contributors?.merged_pr_authors)],
      ['New in period', number(period.new_contributors)],
      ['Repeat in period', number(period.repeat_contributors)],
      ['First-time PR authors', number(period.first_time_pr_authors)],
      ['Top contributor concentration', concentration.top_1_share === null || concentration.top_1_share === undefined ? 'N/A' : percent(concentration.top_1_share)],
      ['Top 3 concentration', concentration.top_3_share === null || concentration.top_3_share === undefined ? 'N/A' : percent(concentration.top_3_share)]
    ];
    for (const [label, value] of rows) {
      host.append(element('div', { className: 'compact-row' }, [
        element('b', { textContent: label }),
        element('span', { textContent: value })
      ]));
    }
    if (data.contributors?.core_contributors_configured) {
      host.append(element('p', { textContent: `External contributor share: ${percent(data.contributors.external_contributor_share)}` }));
    } else {
      host.append(element('p', { textContent: 'External/non-core share: Not configured.' }));
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
  const h2 = host.querySelector('h2');
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
  if (!(trends.dates || []).length) return;
  chart('snapshotTrendChart', {
    type: 'line',
    data: {
      labels: trends.dates,
      datasets: [
        { label: 'Zenodo downloads', data: trends.zenodo_downloads || [], borderColor: chartColor('blue') },
        { label: 'Citations', data: trends.citation_count || [], borderColor: chartColor('green') },
        { label: 'Documentation visitors', data: trends.documentation_visitors || trends.readthedocs_views || [], borderColor: chartColor('orange') }
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
  for (const [label, value] of rows) {
    host.append(element('div', { className: 'compact-row' }, [
      element('b', { textContent: label }),
      element('span', { textContent: value })
    ]));
  }
  for (const run of ci.recent_failed_runs || []) {
    host.append(element('p', {}, [
      run.url ? externalLink(run.name, run.url) : element('span', { textContent: run.name }),
      ` · ${run.conclusion || run.status || 'failed'} · ${readableDate(run.created_at)}`
    ]));
  }
}

function renderManualSection(selector, title, manual) {
  const host = document.querySelector(selector);
  if (!host) return;
  const h2 = host.querySelector('h2');
  clear(host);
  if (h2) host.append(h2);
  const entries = Object.entries(manual).filter(([, value]) => {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
    return value !== null && value !== undefined && value !== '';
  });
  if (!entries.length) { host.style.display = 'none'; return; }
  for (const [key, value] of entries) {
    host.append(element('p', { textContent: `${key.replaceAll('_', ' ')}: ${Array.isArray(value) ? value.length : text(value)}` }));
  }
}

function renderCaseStudies(items) {
  const host = document.querySelector('[data-section="caseStudies"]');
  if (!host) return;
  const h2 = host.querySelector('h2');
  clear(host);
  if (h2) host.append(h2);
  for (const item of items) {
    host.append(
      element('article', { className: 'case-study' }, [
        element('b', { textContent: item.title }),
        element('p', { textContent: item.outcome || '' }),
        item.evidence_url ? externalLink('Evidence', item.evidence_url) : document.createTextNode('')
      ])
    );
  }
  if (!items.length) host.style.display = 'none';
}

// --- Report rendering (preserving all existing logic) ---
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

function manualItemText(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return text(item);
  return Object.entries(item)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${text(value)}`)
    .join('; ');
}

function reportList(title, items, formatter = manualItemText) {
  if (!Array.isArray(items) || !items.length) return null;
  return element('section', { className: 'report-section' }, [
    element('h2', { textContent: title }),
    element('ul', {}, items.map((item) => element('li', { textContent: formatter(item) })))
  ]);
}

function renderReportDownload(data, reportStatus = {}) {
  const identityMatches = reportStatus.available === true
    && reportStatus.project_id === data.project?.id
    && reportStatus.environment === data.project?.environment;
  const available = identityMatches;
  const generated = reportStatus.generated_at || '';
  const identity = [
    reportStatus.project_id || data.project?.id,
    reportStatus.environment || data.project?.environment
  ].filter(Boolean).join(' / ');
  const stale = available
    && generated
    && data.generated_at
    && new Date(generated).valueOf() < new Date(data.generated_at).valueOf();
  const children = [
    element('p', {
      className: available ? 'report-status available' : 'report-status unavailable',
      textContent: available
        ? `PDF available${generated ? `, generated ${generated}` : ''}${identity ? ` for ${identity}` : ''}.`
        : reportStatus.available === true && !identityMatches
          ? 'PDF report identity does not match the current dashboard project or environment.'
          : 'PDF report has not been generated yet. It is created by the scheduled report workflow after dashboard data is available.'
    })
  ];
  if (stale) {
    children.push(element('p', {
      className: 'report-status stale',
      textContent: 'PDF report is older than the current dashboard dataset.'
    }));
  }
  if (available) {
    children.unshift(localLink('Download latest PDF', `./${reportStatus.path || 'reports/latest.pdf'}`, 'button primary'));
  }
  return element('div', { className: 'report-download' }, children);
}

function renderReport(data, reportStatus = {}) {
  const host = document.querySelector('[data-report]');
  if (!host) return;
  clear(host);
  const period = activePeriod(data);
  const manual = data.impact?.manual?.project_data || {};
  const contributorPeriod = data.contributors?.period_summaries?.[period.id] || {};
  const releasePeriod = data.releases?.period_summaries?.[period.id] || {};
  const capacity = manual.maintainer_capacity || {};
  const targetRows = (manual.targets || []).map((item) => [
    text(item.metric || item.name),
    text(item.baseline),
    text(item.target),
    text(item.expected_outcome || item.outcome)
  ]);
  host.append(
    element('section', { className: 'report-title' }, [
      element('h1', { textContent: `${data.project.name} Impact Report` }),
      element('p', { textContent: `${period.label}: ${period.start || 'project start'} through ${period.end}. Generated ${data.generated_at}.` }),
      renderReportDownload(data, reportStatus)
    ])
  );
  if (data.project?.environment !== 'production') {
    host.append(element('section', { className: 'report-section development-disclaimer' }, [
      element('h2', { textContent: 'DEVELOPMENT SANDBOX' }),
      element('p', { textContent: `Data source: ${data.project.repository}. Not official CSRC/MOLE impact data.` })
    ]));
  }
  host.append(element('section', { className: 'report-kpis' }, [
    element('article', {}, [element('strong', { textContent: number(data.summary.open_issues) }), element('span', { textContent: 'Open issues' })]),
    element('article', {}, [element('strong', { textContent: number(data.summary.open_pull_requests) }), element('span', { textContent: 'Open PRs' })]),
    element('article', {}, [element('strong', { textContent: number(data.summary.unique_contributors) }), element('span', { textContent: 'Contributors' })]),
    element('article', {}, [element('strong', { textContent: number(data.summary.citation_count) }), element('span', { textContent: 'Citations' })])
  ]));
  host.append(element('section', { className: 'report-section' }, [
    element('h2', { textContent: 'Project Overview' }),
    element('p', { textContent: `${data.project.name} is tracked from ${data.project.repository}. The dashboard combines public repository activity, release delivery, contributor activity, citations, downloads, documentation analytics and manual impact evidence where configured.` })
  ]));
  host.append(element('section', { className: 'report-section' }, [
    element('h2', { textContent: 'Executive KPI Summary' }),
    compactTable(['Metric', 'Value'], [
      ['Net backlog change', number(data.summary.net_backlog_change)],
      ['Median issue close', days(data.summary.median_issue_close_days)],
      ['Median PR merge', days(data.summary.median_pr_merge_days)],
      ['Median first response', days(data.summary.median_first_response_days)],
      ['Median first review', days(data.summary.median_first_review_days)]
    ])
  ]));
  const accomplishments = reportList('Major Accomplishments', manual.accomplishments);
  if (accomplishments) host.append(accomplishments);
  host.append(element('section', { className: 'report-section' }, [
    element('h2', { textContent: 'Adoption and Downloads' }),
    compactTable(['Metric', 'Value'], [
      ['Zenodo downloads', number(data.summary.zenodo_downloads)],
      ['Zenodo views', number(data.summary.zenodo_views)],
      ['Release asset downloads', number(data.releases.release_asset_downloads)],
      ['Documentation visitors', documentationValue(data, 'visitor_count')],
      ...(hasDistinctPageHitCount(data)
        ? [['Documentation page hits', documentationValue(data, 'page_hit_count')]]
        : [])
    ])
  ]));
  host.append(element('section', { className: 'report-section' }, [
    element('h2', { textContent: 'Documentation Reach' }),
    compactTable(['Metric', 'Value'], [
      ['Provider', providerLabel(data)],
      ['Reporting period', reportingPeriodText(data.documentation_analytics?.reporting_period)],
      ['Visitors', documentationValue(data, 'visitor_count')],
      ...(hasDistinctPageHitCount(data)
        ? [['Page hits', documentationValue(data, 'page_hit_count')]]
        : []),
      ['Search events', documentationValue(data, 'search_count')],
      ['No-result searches', documentationValue(data, 'no_result_search_count')],
      ['Documentation 404s', documentationValue(data, 'not_found_count')]
    ])
  ]));
  const docs = data.documentation_analytics || {};
  const docsRows = [
    ...((docs.popular_pages || []).slice(0, 5).map((item) => ['Popular page', `${item.path}: ${number(item.count)}`])),
    ...((docs.not_found_pages || []).slice(0, 5).map((item) => ['Missing path', `${item.path}: ${number(item.count)}`])),
    ...((docs.limitations || []).map((item) => ['Limitation', item]))
  ];
  if (docsRows.length) {
    host.append(element('section', { className: 'report-section' }, [
      element('h2', { textContent: 'Documentation Details' }),
      compactTable(['Type', 'Value'], docsRows)
    ]));
  }
  host.append(element('section', { className: 'report-section' }, [
    element('h2', { textContent: 'Development and Maintenance Activity' }),
    compactTable(['Metric', 'Value'], [
      ['Issues opened in period', number(data.operations?.period_summaries?.[period.id]?.issues_opened)],
      ['Issues closed in period', number(data.operations?.period_summaries?.[period.id]?.issues_closed)],
      ['PRs opened in period', number(data.operations?.period_summaries?.[period.id]?.prs_opened)],
      ['PRs merged in period', number(data.operations?.period_summaries?.[period.id]?.prs_merged)],
      ['PRs awaiting review', number(data.summary.awaiting_review_count)]
    ])
  ]));
  host.append(element('section', { className: 'report-section' }, [
    element('h2', { textContent: 'Release Delivery' }),
    compactTable(['Metric', 'Value'], [
      ['Total releases', number(data.releases.total_releases)],
      ['Releases in period', number(releasePeriod.releases)],
      ['Latest release age', days(data.releases.latest_release_age_days)],
      ['Median release interval', days(data.releases.median_release_interval_days)]
    ])
  ]));
  host.append(element('section', { className: 'report-section' }, [
    element('h2', { textContent: 'Contributors and Community' }),
    compactTable(['Metric', 'Value'], [
      ['Unique contributors', number(data.contributors?.unique_contributors)],
      ['Commit contributors', number(data.contributors?.commit_contributors)],
      ['New contributors in period', number(contributorPeriod.new_contributors)],
      ['Repeat contributors in period', number(contributorPeriod.repeat_contributors)],
      ['Top 3 contribution concentration', percent(data.contributors?.contribution_concentration?.top_3_share)]
    ])
  ]));
  host.append(element('section', { className: 'report-section' }, [
    element('h2', { textContent: 'CI and Reliability' }),
    compactTable(['Metric', 'Value'], [
      ['Workflow runs', number(data.github_actions?.total_runs)],
      ['Success rate', percent(data.github_actions?.success_rate)],
      ['Median duration', duration(data.github_actions?.median_duration_seconds)],
      ['Recent failed runs', number((data.github_actions?.recent_failed_runs || []).length)]
    ])
  ]));
  if (Object.keys(capacity).length) {
    host.append(element('section', { className: 'report-section' }, [
      element('h2', { textContent: 'Maintainer Capacity' }),
      compactTable(['Capacity field', 'Value'], Object.entries(capacity).map(([key, value]) => [key.replaceAll('_', ' '), text(value)]))
    ]));
  }
  const risks = reportList('Technical Debt and Sustainability Risks', manual.risks);
  if (risks) host.append(risks);
  const work = reportList('Requested Work Packages', manual.requested_work);
  if (work) host.append(work);
  if (targetRows.length) {
    host.append(element('section', { className: 'report-section' }, [
      element('h2', { textContent: 'Baseline to Target Outcomes' }),
      compactTable(['Metric', 'Baseline', 'Target', 'Expected outcome'], targetRows)
    ]));
  }
  const studies = reportList('Case Studies', data.impact?.manual?.case_studies || [], (item) => `${item.title}: ${item.outcome || ''}`);
  if (studies) host.append(studies);
  if (data.security?.available) {
    host.append(element('section', { className: 'report-section' }, [
      element('h2', { textContent: 'Security Health' }),
      compactTable(['Check', 'Score', 'Reason'], (data.security.checks || []).map((check) => [
        text(check.name), number(check.score), text(check.reason || '')
      ]))
    ]));
  }
  if (data.governance?.available) {
    host.append(element('section', { className: 'report-section' }, [
      element('h2', { textContent: 'Governance Health' }),
      compactTable(['Category', 'Score', 'Details'], (data.governance.checks || []).map((check) => [
        text(check.category), text(check.score),
        (check.items || []).map((item) => `${item.name}: ${item.present ? 'Yes' : 'No'}`).join('; ')
      ]))
    ]));
  }
  if (data.adoption?.available) {
    host.append(element('section', { className: 'report-section' }, [
      element('h2', { textContent: 'Package Adoption' }),
      compactTable(['Registry', 'Status', 'Details'], (data.adoption.registries || []).map((reg) => [
        text(reg.name), reg.found ? 'Registered' : 'Not found', text(reg.details || '')
      ]))
    ]));
  }
  if (data.targets_progress?.available && data.targets_progress.targets?.length) {
    host.append(element('section', { className: 'report-section' }, [
      element('h2', { textContent: 'Annual Targets Progress' }),
      compactTable(['Metric', 'Baseline', 'Target', 'Current', 'Progress', 'On track'], data.targets_progress.targets.map((t) => [
        text(t.metric), text(t.baseline), text(t.target), text(t.current),
        t.progress !== null ? percent(t.progress) : 'N/A',
        t.on_track ? 'Yes' : 'No'
      ]))
    ]));
  }
  if (data.contributors?.bus_factor !== undefined) {
    host.append(element('section', { className: 'report-section' }, [
      element('h2', { textContent: 'Contributor Diversity and Key-Person Risk' }),
      compactTable(['Metric', 'Value'], [
        ['Bus factor', number(data.contributors?.bus_factor)],
        ['Top 1 concentration', percent(data.contributors?.contribution_concentration?.top_1_share)],
        ['Top 3 concentration', percent(data.contributors?.contribution_concentration?.top_3_share)],
        ['External contributor share', percent(data.contributors?.external_contributor_share)],
        ['Core contributors configured', data.contributors?.core_contributors_configured ? 'Yes' : 'No'],
        ['Newcomer first PR authors', number(data.operations?.newcomer_funnel?.first_pr_authors)],
        ['Newcomer first PR merged', number(data.operations?.newcomer_funnel?.first_pr_merged)],
        ['Newcomer conversion rate', percent(data.operations?.newcomer_funnel?.conversion_rate)]
      ])
    ]));
  }
  host.append(element('section', { className: 'report-section' }, [
    element('h2', { textContent: 'Methodology, Data Sources and Limitations' }),
    compactTable(['Source', 'Status', 'Limitation'], Object.entries(data.source_status || {}).map(([name, status]) => [
      name.replaceAll('_', ' '),
      status.status,
      status.limitation || status.message || ''
    ]))
  ]));
  document.body.dataset.reportReady = 'true';
}

function renderHeader(data) {
  document.querySelector('[data-project-name]')?.replaceChildren(`${data.project.name} Impact Dashboard`);
  document.querySelector('[data-project-subtitle]')?.replaceChildren(`Static public dashboard for ${data.project.repository}, generated ${data.generated_at}.`);
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
loadData()
  .then(async (data) => {
    dashboardData = data;
    const reportStatus = page === 'report' ? await loadReportStatus() : {};
    renderHeader(dashboardData);
    renderDataFreshness(dashboardData);
    renderSummary(dashboardData);
    renderActionSummary(dashboardData);
    renderSources(dashboardData);
    renderDefinitions(dashboardData);
    renderSecurityHealth(dashboardData);
    renderAdoptionMatrix(dashboardData);
    renderCommunityStandards(dashboardData);
    renderGovernanceHealth(dashboardData);
    renderContributorDiversity(dashboardData);
    renderTargetsProgress(dashboardData);
    populateChartPeriods(dashboardData);
    initChartPeriodSelectors(dashboardData);
    const activityPeriod = document.querySelector('.chart-period-select[data-chart-period="activityChart"]')?.value || activePeriodId(dashboardData);
    renderActivityChart(dashboardData, activityPeriod, activityPeriod === 'custom' ? getCustomRange('activityChart') : null);
    if (page === 'operations') {
      const backlogPeriod = document.querySelector('.chart-period-select[data-chart-period="backlogChart"]')?.value || activePeriodId(dashboardData);
      renderBacklogChart(dashboardData, backlogPeriod, backlogPeriod === 'custom' ? getCustomRange('backlogChart') : null);
      renderAgeBucketChart(dashboardData);
      renderLabelChart(dashboardData);
      renderCompositionChart(dashboardData);
      renderCompletionDistribution(dashboardData);
      renderQueues(dashboardData);
      renderTable(dashboardData);
      renderCiReliability(dashboardData);
    }
    if (page === 'impact') renderImpact(dashboardData);
    if (page === 'report') renderReport(dashboardData, reportStatus);
    renderEnvironmentBanner(dashboardData);
  })
  .catch((error) => {
    document.body.prepend(
      element('div', { className: 'load-error', textContent: `Dashboard failed to load: ${error.message}` })
    );
  });
