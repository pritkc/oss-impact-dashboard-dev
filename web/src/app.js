import { Chart } from 'chart.js/auto';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import 'tabulator-tables/dist/css/tabulator_simple.min.css';
import './styles.css';

const format = new Intl.NumberFormat('en-US');
const page = document.body.dataset.page;

function text(value, fallback = 'Not available') {
  return value === null || value === undefined || value === '' ? fallback : value;
}

function number(value) {
  return value === null || value === undefined ? 'N/A' : format.format(value);
}

function days(value) {
  return value === null || value === undefined ? 'N/A' : `${number(value)} days`;
}

async function loadData() {
  const dataUrl = `${import.meta.env.BASE_URL}data/dashboard.json`;
  const response = await fetch(dataUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load dashboard data: ${response.status}`);
  return response.json();
}

function renderSummary(data) {
  const host = document.querySelector('[data-summary]');
  if (!host) return;
  const summary = data.summary || {};
  const cards = [
    ['Open issues', number(summary.open_issues)],
    ['Open PRs', number(summary.open_pull_requests)],
    ['Untriaged', number(summary.untriaged_items)],
    ['Stale items', number(summary.stale_items)],
    ['Median issue close', days(summary.median_issue_close_days)],
    ['Median PR merge', days(summary.median_pr_merge_days)],
    ['Releases', number(summary.total_releases)],
    ['Contributors', number(summary.unique_contributors)]
  ];
  host.innerHTML = cards.map(([label, value]) => `<article><strong>${value}</strong><span>${label}</span></article>`).join('');
}

function renderSources(data) {
  const host = document.querySelector('[data-source-status]');
  if (!host) return;
  host.innerHTML = Object.entries(data.source_status || {})
    .map(([name, status]) => {
      const cls = status.status === 'available' ? 'ok' : status.status === 'error' ? 'bad' : 'muted';
      return `<div class="status-row"><b>${name.replaceAll('_', ' ')}</b><span class="${cls}">${status.status}</span><small>${text(status.message, '')}</small></div>`;
    })
    .join('');
}

function renderDefinitions(data) {
  const host = document.querySelector('[data-definitions]');
  if (!host) return;
  host.innerHTML = Object.entries(data.metric_definitions || {})
    .map(([name, definition]) => `<article><b>${name.replaceAll('_', ' ')}</b><p>${definition}</p></article>`)
    .join('');
}

function chart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
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
        { label: 'PRs merged', data: trends.prs_merged || [], backgroundColor: '#936514' }
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
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
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}

function renderQueues(data) {
  const host = document.querySelector('[data-queues]');
  if (!host) return;
  const queues = data.operations?.queues || {};
  host.innerHTML = Object.entries(queues)
    .map(([name, items]) => {
      const rows = (items || [])
        .slice(0, 5)
        .map((item) => `<li><a href="${item.url}">#${item.number}</a> ${item.title}</li>`)
        .join('');
      return `<article class="panel queue"><h2>${name.replaceAll('_', ' ')}</h2><ul>${rows || '<li>No items</li>'}</ul></article>`;
    })
    .join('');
}

function renderTable(data) {
  const host = document.getElementById('itemsTable');
  if (!host) return;
  const table = new Tabulator(host, {
    data: data.items || [],
    layout: 'fitColumns',
    pagination: true,
    paginationSize: 15,
    responsiveLayout: 'collapse',
    columns: [
      { title: '#', field: 'number', width: 80, sorter: 'number' },
      { title: 'Type', field: 'type', width: 140 },
      { title: 'State', field: 'state', width: 100 },
      { title: 'Title', field: 'title', formatter: (cell) => `<a href="${cell.getRow().getData().url}">${cell.getValue()}</a>` },
      { title: 'Labels', field: 'metric_labels', formatter: (cell) => (cell.getValue() || []).join(', ') },
      { title: 'Created', field: 'created_at', width: 180 },
      { title: 'Closed', field: 'closed_at', width: 180 }
    ]
  });
  document.getElementById('search')?.addEventListener('input', (event) => {
    const value = event.target.value.toLowerCase();
    table.setFilter((row) => `${row.title} ${row.number} ${row.metric_labels?.join(' ')}`.toLowerCase().includes(value));
  });
  document.getElementById('typeFilter')?.addEventListener('change', (event) => {
    const value = event.target.value;
    if (value) table.addFilter('type', '=', value);
    else table.removeFilter('type');
  });
  document.getElementById('stateFilter')?.addEventListener('change', (event) => {
    const value = event.target.value;
    if (value) table.addFilter('state', '=', value);
    else table.removeFilter('state');
  });
  document.getElementById('csvExport')?.addEventListener('click', () => table.download('csv', 'dashboard-items.csv'));
  document.getElementById('jsonExport')?.addEventListener('click', () => table.download('json', 'dashboard-items.json'));
}

function renderImpact(data) {
  const host = document.querySelector('[data-impact-summary]');
  if (host) {
    const impact = data.impact || {};
    host.innerHTML = [
      ['Zenodo downloads', number(impact.zenodo?.downloads)],
      ['Zenodo views', number(impact.zenodo?.views)],
      ['Citation count', number(impact.openalex?.cited_by_count)],
      ['Release downloads', number(data.releases?.release_asset_downloads)]
    ].map(([label, value]) => `<article><strong>${value}</strong><span>${label}</span></article>`).join('');
  }
  const citations = data.impact?.openalex?.citations_by_year || [];
  chart('citationChart', {
    type: 'bar',
    data: {
      labels: citations.map((item) => item.year),
      datasets: [{ label: 'Citations', data: citations.map((item) => item.cited_by_count), backgroundColor: '#2457a6' }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
  const privateSources = document.querySelector('[data-private-sources]');
  if (privateSources) {
    privateSources.innerHTML = Object.entries(data.impact?.private_sources || {})
      .map(([name, value]) => `<div class="status-row"><b>${name.replaceAll('_', ' ')}</b><span class="muted">${value}</span></div>`)
      .join('');
  }
  const funding = document.querySelector('[data-manual-funding]');
  if (funding) {
    const manual = data.impact?.manual?.funding || {};
    funding.innerHTML = `<h2>Manual funding evidence</h2><p>Reporting period: ${text(manual.reporting_period)}</p><p>Accomplishments: ${(manual.accomplishments || []).length}</p><p>Risks: ${(manual.risks || []).length}</p>`;
  }
  const cases = document.querySelector('[data-case-studies]');
  if (cases) {
    const items = data.impact?.manual?.case_studies || [];
    cases.innerHTML = `<h2>Case studies</h2>${items.length ? items.map((item) => `<p><b>${item.title}</b><br>${item.outcome || ''}</p>`).join('') : '<p>No case studies configured yet.</p>'}`;
  }
}

function renderReport(data) {
  const host = document.querySelector('[data-report]');
  if (!host) return;
  const sections = [
    ['Project overview', `${data.project.name} is tracked from ${data.project.repository}.`],
    ['Reporting period', `${data.reporting_period.default_period_months} months, stale threshold ${data.reporting_period.stale_days} days.`],
    ['Executive KPI summary', `Open issues: ${number(data.summary.open_issues)}. Open PRs: ${number(data.summary.open_pull_requests)}. Contributors: ${number(data.summary.unique_contributors)}.`],
    ['Major accomplishments', 'Manual accomplishments can be added in manual/funding.yml.'],
    ['Adoption and downloads', `Zenodo downloads: ${number(data.summary.zenodo_downloads)}. Release asset downloads: ${number(data.releases.release_asset_downloads)}.`],
    ['Scientific publications and citations', `Citation count: ${number(data.summary.citation_count)}.`],
    ['Development and maintenance activity', `Median issue close time: ${days(data.summary.median_issue_close_days)}. Median PR merge time: ${days(data.summary.median_pr_merge_days)}.`],
    ['Contributors and community', `${number(data.summary.unique_contributors)} public contributors are visible from configured sources.`],
    ['Technical debt and sustainability risks', 'Manual risks can be added in manual/funding.yml.'],
    ['Methodology and limitations', 'The report uses public APIs by default. Private traffic and documentation analytics show unavailable until credentials are configured.']
  ];
  host.innerHTML = `<section class="report-title"><h1>${data.project.name} Impact Report</h1><p>Generated ${data.generated_at}</p></section>${sections
    .map(([title, body]) => `<section class="report-section"><h2>${title}</h2><p>${body}</p></section>`)
    .join('')}`;
}

function renderHeader(data) {
  document.querySelector('[data-project-name]')?.replaceChildren(`${data.project.name} Impact Dashboard`);
  document.querySelector('[data-project-subtitle]')?.replaceChildren(`Static public dashboard for ${data.project.repository}, generated ${data.generated_at}.`);
  const repo = document.querySelector('[data-repo-link]');
  if (repo) repo.href = data.project.repository_url;
}

loadData()
  .then((data) => {
    renderHeader(data);
    renderSummary(data);
    renderSources(data);
    renderDefinitions(data);
    renderActivityChart(data);
    if (page === 'operations') {
      renderBacklogChart(data);
      renderQueues(data);
      renderTable(data);
    }
    if (page === 'impact') renderImpact(data);
    if (page === 'report') renderReport(data);
  })
  .catch((error) => {
    document.body.insertAdjacentHTML('afterbegin', `<div class="load-error">${error.message}</div>`);
  });
