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

function appendStat(host, label, value, href, detail = '') {
  const body = [
    element('strong', { textContent: value }),
    element('span', { textContent: label }),
  ];
  if (detail) body.push(element('small', { textContent: detail }));
  const card = element('article', {}, href ? [localLink('', href)] : []);
  if (href) {
    const link = card.querySelector('a');
    link.className = 'stat-link';
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
    const apiStatus = docs.status === 'available'
      ? 'Analytics available'
      : tracker.enabled && docs.http_status === 401
        ? 'API key invalid'
        : tracker.enabled
          ? 'No analytics received yet'
          : 'Tracker not configured';
    host.append(
      element('div', { className: 'status-row' }, [
        element('b', { textContent: 'documentation tracker' }),
        element('span', {
          className: statusClass(tracker.enabled ? 'available' : 'unavailable'),
          textContent: tracker.enabled ? 'configured' : 'unavailable'
        }),
        element('small', {
          textContent: `${tracker.tracked_domain || 'no tracked hostname'}; ${apiStatus}; last successful collection: ${readableDate(docs.collected_at) || 'Unavailable'}`
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

function chart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  canvas.setAttribute('aria-label', config.options?.plugins?.title?.text || id);
  return new Chart(canvas, config);
}

function chartPlugins(data, title, periodId = activePeriodId(data)) {
  return {
    legend: { position: 'bottom' },
    title: { display: true, text: title },
    subtitle: { display: true, text: activePeriodLabel(data, periodId) }
  };
}

function renderActivityChart(data, periodId = activePeriodId(data)) {
  const trends = data.trends || {};
  const opened = (trends.issues_opened || []).reduce((sum, value) => sum + value, 0)
    + (trends.prs_opened || []).reduce((sum, value) => sum + value, 0);
  const completed = (trends.completed || []).reduce((sum, value) => sum + value, 0);
  setChartSummary('activityChart', `${number(opened)} opened and ${number(completed)} completed across the available monthly trend.`);
  chart('activityChart', {
    type: 'bar',
    data: {
      labels: trends.months || [],
      datasets: [
        { label: 'Issues opened', data: trends.issues_opened || [], backgroundColor: '#2457a6' },
        { label: 'Issues closed', data: trends.issues_closed || [], backgroundColor: '#247a52' },
        { label: 'PRs opened', data: trends.prs_opened || [], backgroundColor: '#6845a3' },
        { label: 'PRs closed', data: trends.prs_closed || [], backgroundColor: '#936514' }
      ]
    },
    options: {
      responsive: true,
      plugins: chartPlugins(data, 'Opened and completed by month', periodId),
      scales: { x: { title: { display: true, text: 'Month' } }, y: { title: { display: true, text: 'Items' } } }
    }
  });
}

function renderBacklogChart(data, periodId = activePeriodId(data)) {
  const trends = data.trends || {};
  setChartSummary('backlogChart', `Current backlog is ${number(trends.current_backlog)} open issues and pull requests.`);
  chart('backlogChart', {
    type: 'line',
    data: {
      labels: trends.months || [],
      datasets: [{ label: 'Backlog', data: trends.backlog || [], borderColor: '#2457a6', tension: 0.25 }]
    },
    options: {
      responsive: true,
      plugins: { ...chartPlugins(data, 'Backlog at month end', periodId), legend: { display: false } },
      scales: { x: { title: { display: true, text: 'Month' } }, y: { title: { display: true, text: 'Open items' } } }
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
    data: { labels, datasets: [{ label: 'Open items', data: values, backgroundColor: '#2457a6' }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { ...chartPlugins(data, 'Open-item age buckets'), legend: { display: false } },
      scales: { x: { title: { display: true, text: 'Open items' } }, y: { title: { display: true, text: 'Age bucket' } } }
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
        { label: 'Open', data: metrics.map((item) => item.open), backgroundColor: '#2457a6' },
        { label: 'Closed', data: metrics.map((item) => item.closed), backgroundColor: '#247a52' }
      ]
    },
    options: {
      responsive: true,
      plugins: chartPlugins(data, 'Work by canonical label'),
      scales: { x: { title: { display: true, text: 'Label' } }, y: { title: { display: true, text: 'Items' } } }
    }
  });
}

function renderCompositionChart(data) {
  const summary = data.summary || {};
  chart('compositionChart', {
    type: 'doughnut',
    data: {
      labels: ['Open issues', 'Open PRs'],
      datasets: [{ data: [summary.open_issues || 0, summary.open_pull_requests || 0], backgroundColor: ['#2457a6', '#6845a3'] }]
    },
    options: { responsive: true, plugins: chartPlugins(data, 'Open backlog composition') }
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
    data: { labels, datasets: [{ label: 'Days', data: values, backgroundColor: '#936514' }] },
    options: {
      responsive: true,
      plugins: { ...chartPlugins(data, 'Response and age distribution'), legend: { display: false } },
      scales: { x: { title: { display: true, text: 'Metric' } }, y: { title: { display: true, text: 'Days' } } }
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
    const list = element('ul');
    for (const item of (items || []).slice(0, 5)) {
      list.append(element('li', {}, [externalLink(`#${item.number}`, item.url), ` ${item.title}`]));
    }
    if (!items?.length) list.append(element('li', { textContent: 'No items' }));
    host.append(
      element('article', { className: 'panel queue' }, [
        element('h2', { textContent: queueLabels[name] || name.replaceAll('_', ' ') }),
        list,
        localLink('View all', `./operations.html?queue=${encodeURIComponent(name)}`, 'subtle-link')
      ])
    );
  }
}

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
  updateFilterSummary(filters, tableRows().length);
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

function renderImpact(data) {
  const periodId = activePeriodId(data);
  renderImpactSummary(data, periodId);
  const citations = data.impact?.openalex?.citations_by_year || [];
  setChartSummary('citationChart', `${number(data.impact?.openalex?.cited_by_count)} total citations from OpenAlex.`);
  chart('citationChart', {
    type: 'bar',
    data: {
      labels: citations.map((item) => item.year),
      datasets: [{ label: 'Citations', data: citations.map((item) => item.cited_by_count), backgroundColor: '#2457a6' }]
    },
    options: {
      responsive: true,
      plugins: { ...chartPlugins(data, 'Citations by year', periodId), legend: { display: false } },
      scales: { x: { title: { display: true, text: 'Year' } }, y: { title: { display: true, text: 'Citations' } } }
    }
  });
  renderReleaseAnalytics(data, periodId);
  renderContributorAnalytics(data, periodId);
  renderDocumentationAnalytics(data);
  renderSnapshotTrend(data);
  const privateSources = document.querySelector('[data-private-sources]');
  if (privateSources) {
    clear(privateSources);
    for (const [name, value] of Object.entries(data.impact?.private_sources || {})) {
      privateSources.append(
        element('div', { className: 'status-row' }, [
          element('b', { textContent: name.replaceAll('_', ' ') }),
          element('span', { className: 'muted', textContent: value })
        ])
      );
    }
  }
  renderManualSection('[data-manual-funding]', 'Manual funding evidence', data.impact?.manual?.funding || {});
  renderCaseStudies(data.impact?.manual?.case_studies || []);
}

function renderReleaseAnalytics(data, periodId = activePeriodId(data)) {
  const host = document.querySelector('[data-releases]');
  if (host) {
    clear(host);
    host.append(element('h2', { textContent: 'Release delivery' }));
    for (const release of data.releases?.by_release || []) {
      host.append(element('div', { className: 'compact-row' }, [
        release.url ? externalLink(release.tag || release.name, release.url) : element('b', { textContent: release.tag || release.name }),
        element('span', { textContent: `${readableDate(release.published_at)} · ${number(release.asset_count)} assets · ${number(release.asset_downloads)} downloads` })
      ]));
    }
    if (data.releases?.zero_download_explanation) {
      host.append(element('p', { textContent: data.releases.zero_download_explanation }));
    }
  }
  const releases = data.releases?.by_release || [];
  chart('releaseChart', {
    type: 'bar',
    data: {
      labels: releases.map((item) => item.tag || item.name).slice(0, 12).reverse(),
      datasets: [{ label: 'Asset downloads', data: releases.map((item) => item.asset_downloads).slice(0, 12).reverse(), backgroundColor: '#247a52' }]
    },
    options: {
      responsive: true,
      plugins: chartPlugins(data, 'Release asset downloads by version', periodId),
      scales: { x: { title: { display: true, text: 'Version' } }, y: { title: { display: true, text: 'Downloads' } } }
    }
  });
}

function renderContributorAnalytics(data, periodId = activePeriodId(data)) {
  const host = document.querySelector('[data-contributors]');
  if (host) {
    clear(host);
    host.append(element('h2', { textContent: 'Contributors and community' }));
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
      datasets: [{ label: 'Contributors', data: trend.map((item) => item.contributors), borderColor: '#6845a3', tension: 0.25 }]
    },
    options: {
      responsive: true,
      plugins: chartPlugins(data, 'Contributor trend by month', periodId),
      scales: { x: { title: { display: true, text: 'Month' } }, y: { title: { display: true, text: 'Contributors' } } }
    }
  });
}

function renderDocumentationAnalytics(data) {
  const host = document.querySelector('[data-docs-analytics]');
  if (!host) return;
  clear(host);
  host.append(element('h2', { textContent: 'Documentation analytics' }));
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
  const canvas = element('canvas', { id: 'documentationTrendChart', height: '160' });
  host.append(canvas);
  host.append(element('p', { className: 'chart-summary', dataset: { chartSummary: 'documentationTrendChart' } }));
  setChartSummary('documentationTrendChart', `${number((docs.trend || []).reduce((sum, item) => sum + (item.count || 0), 0))} documentation hits in the daily trend.`);
  chart('documentationTrendChart', {
    type: 'line',
    data: {
      labels: (docs.trend || []).map((item) => item.date),
      datasets: [{ label: 'Documentation hits', data: (docs.trend || []).map((item) => item.count), borderColor: '#2457a6', tension: 0.25 }]
    },
    options: {
      responsive: true,
      plugins: { ...chartPlugins(data, 'Daily documentation trend'), legend: { display: false } },
      scales: { x: { title: { display: true, text: 'Date' } }, y: { title: { display: true, text: 'Hits' } } }
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
        { label: 'Zenodo downloads', data: trends.zenodo_downloads || [], borderColor: '#2457a6' },
        { label: 'Citations', data: trends.citation_count || [], borderColor: '#247a52' },
        { label: 'Documentation visitors', data: trends.documentation_visitors || trends.readthedocs_views || [], borderColor: '#936514' }
      ]
    },
    options: {
      responsive: true,
      plugins: chartPlugins(data, 'Cumulative impact trend'),
      scales: { x: { title: { display: true, text: 'Snapshot date' } }, y: { title: { display: true, text: 'Count' } } }
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
  clear(host);
  host.append(element('h2', { textContent: title }));
  const entries = Object.entries(manual).filter(([, value]) => {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
    return value !== null && value !== undefined && value !== '';
  });
  if (!entries.length) return;
  for (const [key, value] of entries) {
    host.append(element('p', { textContent: `${key.replaceAll('_', ' ')}: ${Array.isArray(value) ? value.length : text(value)}` }));
  }
}

function renderCaseStudies(items) {
  const host = document.querySelector('[data-case-studies]');
  if (!host) return;
  clear(host);
  host.append(element('h2', { textContent: 'Case studies' }));
  for (const item of items) {
    host.append(
      element('article', { className: 'case-study' }, [
        element('b', { textContent: item.title }),
        element('p', { textContent: item.outcome || '' }),
        item.evidence_url ? externalLink('Evidence', item.evidence_url) : document.createTextNode('')
      ])
    );
  }
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
  const available = reportStatus.available === true;
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
  const manual = data.impact?.manual?.funding || {};
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
    renderActivityChart(dashboardData);
    if (page === 'operations') {
      renderBacklogChart(dashboardData);
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
