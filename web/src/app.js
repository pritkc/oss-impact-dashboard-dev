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

async function loadData() {
  const dataUrl = `${import.meta.env.BASE_URL}data/dashboard.json`;
  const response = await fetch(dataUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load dashboard data: ${response.status}`);
  return response.json();
}

function appendStat(host, label, value, href) {
  const body = [element('strong', { textContent: value }), element('span', { textContent: label })];
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
  const threshold = data.reporting_period?.stale_days || 90;
  const cards = [
    ['Open issues', number(summary.open_issues), './operations.html?type=issue&state=open'],
    ['Open PRs', number(summary.open_pull_requests), './operations.html?type=pull_request&state=open'],
    ['Untriaged', number(summary.untriaged_items), './operations.html?queue=untriaged'],
    [`Open over ${threshold} days`, number(summary.open_over_threshold_items ?? summary.stale_items), './operations.html?queue=open_over_threshold'],
    ['Median issue close', days(periodSummary.median_issue_close_days ?? summary.median_issue_close_days)],
    ['Median PR merge', days(periodSummary.median_pr_merge_days ?? summary.median_pr_merge_days)],
    ['Net backlog change', number(periodSummary.net_backlog_change ?? summary.net_backlog_change)],
    ['Latest release age', days(summary.latest_release_age_days)]
  ];
  for (const [label, value, href] of cards) appendStat(host, label, value, href);
}

function renderImpactSummary(data) {
  const host = document.querySelector('[data-impact-summary]');
  if (!host) return;
  clear(host);
  const impact = data.impact || {};
  const cards = [
    ['Zenodo downloads', number(impact.zenodo?.downloads)],
    ['Zenodo views', number(impact.zenodo?.views)],
    ['Citation count', number(impact.openalex?.cited_by_count)],
    ['Unique contributors', number(data.contributors?.unique_contributors)],
    ['Release downloads', number(data.releases?.release_asset_downloads)],
    ['Total releases', number(data.releases?.total_releases)]
  ];
  for (const [label, value] of cards) appendStat(host, label, value);
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

function chart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  canvas.setAttribute('aria-label', config.options?.plugins?.title?.text || id);
  return new Chart(canvas, config);
}

function renderActivityChart(data) {
  const trends = data.trends || {};
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
      plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Opened and completed by month' } },
      scales: { x: { title: { display: true, text: 'Month' } }, y: { title: { display: true, text: 'Items' } } }
    }
  });
}

function renderBacklogChart(data) {
  const trends = data.trends || {};
  chart('backlogChart', {
    type: 'line',
    data: {
      labels: trends.months || [],
      datasets: [{ label: 'Backlog', data: trends.backlog || [], borderColor: '#2457a6', tension: 0.25 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, title: { display: true, text: 'Backlog at month end' } },
      scales: { x: { title: { display: true, text: 'Month' } }, y: { title: { display: true, text: 'Open items' } } }
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
    high_priority: 'High priority'
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
    applyFilters(data);
  });
  document.getElementById('csvExport')?.addEventListener('click', () => downloadRows(tableRows(), 'csv'));
  document.getElementById('jsonExport')?.addEventListener('click', () => downloadRows(tableRows(), 'json'));
  applyFilters(data);
}

function renderImpact(data) {
  renderImpactSummary(data);
  const citations = data.impact?.openalex?.citations_by_year || [];
  chart('citationChart', {
    type: 'bar',
    data: {
      labels: citations.map((item) => item.year),
      datasets: [{ label: 'Citations', data: citations.map((item) => item.cited_by_count), backgroundColor: '#2457a6' }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, title: { display: true, text: 'Citations by year' } },
      scales: { x: { title: { display: true, text: 'Year' } }, y: { title: { display: true, text: 'Citations' } } }
    }
  });
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

function renderReport(data) {
  const host = document.querySelector('[data-report]');
  if (!host) return;
  clear(host);
  const period = activePeriod(data);
  const sections = [
    ['Project overview', `${data.project.name} is tracked from ${data.project.repository}.`],
    ['Reporting period', `${period.label}: ${period.start || 'project start'} through ${period.end}.`],
    ['Executive KPI summary', `Open issues: ${number(data.summary.open_issues)}. Open PRs: ${number(data.summary.open_pull_requests)}. Contributors: ${number(data.summary.unique_contributors)}.`],
    ['Adoption and downloads', `Zenodo downloads: ${number(data.summary.zenodo_downloads)}. Release asset downloads: ${number(data.releases.release_asset_downloads)}.`],
    ['Scientific publications and citations', `Citation count: ${number(data.summary.citation_count)}.`],
    ['Development and maintenance activity', `Median issue close time: ${days(data.summary.median_issue_close_days)}. Median PR merge time: ${days(data.summary.median_pr_merge_days)}.`],
    ['Release delivery', `Total releases: ${number(data.releases.total_releases)}. Latest release age: ${days(data.releases.latest_release_age_days)}.`],
    ['Contributors and community', `${number(data.summary.unique_contributors)} public contributors are visible from configured sources.`],
    ['Methodology and limitations', 'The report uses public APIs by default. Private traffic and documentation analytics show unavailable until credentials are configured.']
  ];
  host.append(
    element('section', { className: 'report-title' }, [
      element('h1', { textContent: `${data.project.name} Impact Report` }),
      element('p', { textContent: `Generated ${data.generated_at}` }),
      localLink('Download latest PDF', './reports/latest.pdf', 'button primary')
    ])
  );
  for (const [title, body] of sections) {
    host.append(element('section', { className: 'report-section' }, [
      element('h2', { textContent: title }),
      element('p', { textContent: body })
    ]));
  }
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
  .then((data) => {
    dashboardData = data;
    renderHeader(dashboardData);
    renderDataFreshness(dashboardData);
    renderSummary(dashboardData);
    renderSources(dashboardData);
    renderDefinitions(dashboardData);
    renderActivityChart(dashboardData);
    if (page === 'operations') {
      renderBacklogChart(dashboardData);
      renderQueues(dashboardData);
      renderTable(dashboardData);
    }
    if (page === 'impact') renderImpact(dashboardData);
    if (page === 'report') renderReport(dashboardData);
  })
  .catch((error) => {
    document.body.prepend(
      element('div', { className: 'load-error', textContent: `Dashboard failed to load: ${error.message}` })
    );
  });

