import { Chart } from 'chart.js/auto';
import { element, clear } from './safe-dom.js';

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const chartColors = {
  blue:    () => cssVar('--chart-blue')    || '#1192e8',
  green:   () => cssVar('--chart-green')   || '#198038',
  purple:  () => cssVar('--chart-purple')  || '#6929c4',
  orange:  () => cssVar('--chart-orange')  || '#b28600',
  teal:    () => cssVar('--chart-teal')    || '#005d5d',
  magenta: () => cssVar('--chart-magenta') || '#9f1853',
  red:     () => cssVar('--chart-red')     || '#da1e28',
  gray:    () => cssVar('--chart-gray')    || '#697077',
};

export function chartColor(name) {
  return (chartColors[name] || chartColors.blue)();
}

function chartTheme() {
  return {
    font: { family: cssVar('--font-sans') || "'Inter', sans-serif", size: 12 },
    color: cssVar('--fg-muted') || '#59636e',
    borderColor: cssVar('--border-subtle') || '#eaeef2',
  };
}

function chartScales() {
  return {
    x: { grid: { display: false }, ticks: { color: cssVar('--fg-muted') || '#59636e' }, border: { color: cssVar('--border-default') || '#d0d7de' } },
    y: { grid: { color: cssVar('--border-subtle') || '#eaeef2' }, ticks: { color: cssVar('--fg-muted') || '#59636e' }, border: { display: false }, beginAtZero: true }
  };
}

function chartPlugins(title, subtitle) {
  return {
    legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, color: cssVar('--fg-default') || '#1f2328', font: { size: 12 } } },
    title: { display: !!title, text: title || '', color: cssVar('--fg-default') || '#1f2328', font: { size: 14, weight: 600 } },
    subtitle: { display: !!subtitle, text: subtitle || '', color: cssVar('--fg-subtle') || '#6e7781', font: { size: 12 } },
    tooltip: {
      backgroundColor: cssVar('--fg-default') || '#1f2328',
      titleColor: cssVar('--fg-on-emphasis') || '#ffffff',
      bodyColor: cssVar('--fg-on-emphasis') || '#ffffff',
      cornerRadius: 6,
      padding: 8,
      boxPadding: 4,
    }
  };
}

// Set Chart.js global defaults
Chart.defaults.font.family = "'Inter', ui-sans-serif, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = cssVar('--fg-muted') || '#59636e';
Chart.defaults.borderColor = cssVar('--border-subtle') || '#eaeef2';
if (Chart.defaults.datasets) {
  if (Chart.defaults.datasets.bar) {
    Chart.defaults.datasets.bar.borderRadius = 4;
    Chart.defaults.datasets.bar.borderSkipped = false;
  }
  if (Chart.defaults.datasets.line) {
    Chart.defaults.datasets.line.borderWidth = 2;
    Chart.defaults.datasets.line.pointRadius = 0;
    Chart.defaults.datasets.line.pointHoverRadius = 4;
  }
}

// --- Chart Registry ---
const charts = [];
const chartInstances = new Map();

export const chartRegistry = {
  register(config) {
    charts.push(config);
  },
  render(page, data, container) {
    if (!container) return;
    clear(container);
    for (const config of charts) {
      if (config.page !== page) continue;
      if (config.showWhen && !config.showWhen(data)) continue;
      const canvas = container.querySelector(`[data-chart="${config.id}"]`);
      if (!canvas) continue;
      const theme = chartTheme();
      const plugins = chartPlugins(config.title, config.subtitle ? config.subtitle(data) : undefined);
      const opts = {
        responsive: true,
        maintainAspectRatio: false,
        ...theme,
        plugins: { ...plugins, ...config.pluginOverrides },
        scales: config.scales || chartScales(),
        ...config.extraOptions,
      };
      const instance = new Chart(canvas, {
        type: config.type,
        data: config.data(data),
        options: opts,
      });
      canvas.setAttribute('aria-label', config.title || config.id);
      chartInstances.set(config.id, instance);
      if (config.summary) {
        const summaryEl = container.querySelector(`[data-chart-summary="${config.id}"]`);
        if (summaryEl) summaryEl.textContent = config.summary(data);
      }
    }
  },
  get(id) { return chartInstances.get(id); },
  destroyAll() {
    for (const instance of chartInstances.values()) instance.destroy();
    chartInstances.clear();
  },
};

// --- KPI Registry ---
const kpis = [];

export const kpiRegistry = {
  register(config) {
    kpis.push(config);
  },
  render(page, data, container) {
    if (!container) return;
    clear(container);
    for (const config of kpis) {
      if (config.page !== page) continue;
      if (config.showWhen && !config.showWhen(data)) continue;
      const val = config.value(data);
      if (val === null || val === undefined) continue;
      const card = element('article', { className: 'kpi-card' });
      if (config.link) {
        const link = element('a', { href: config.link(data) });
        link.style.color = 'inherit';
        link.style.textDecoration = 'none';
        link.append(
          element('span', { className: 'kpi-label', textContent: config.label }),
          element('span', { className: 'kpi-value', textContent: val }),
        );
        if (config.delta) {
          const deltaVal = config.delta(data);
          if (deltaVal !== null && deltaVal !== undefined && deltaVal !== '') {
            const dir = config.deltaDirection || 'higher-is-better';
            const isUp = typeof deltaVal === 'string' ? deltaVal.includes('up') : deltaVal > 0;
            const cls = isUp ? (dir === 'higher-is-better' ? 'up' : 'down') : (dir === 'lower-is-better' ? 'up' : 'down');
            link.append(element('span', { className: `kpi-delta ${cls}`, textContent: deltaVal }));
          }
        }
        if (config.detail) {
          link.append(element('span', { className: 'kpi-detail', textContent: config.detail(data) }));
        }
        card.append(link);
      } else {
        card.append(
          element('span', { className: 'kpi-label', textContent: config.label }),
          element('span', { className: 'kpi-value', textContent: val }),
        );
        if (config.delta) {
          const deltaVal = config.delta(data);
          if (deltaVal !== null && deltaVal !== undefined && deltaVal !== '') {
            const dir = config.deltaDirection || 'higher-is-better';
            const isUp = typeof deltaVal === 'string' ? deltaVal.includes('up') : deltaVal > 0;
            const cls = isUp ? (dir === 'higher-is-better' ? 'up' : 'down') : (dir === 'lower-is-better' ? 'up' : 'down');
            card.append(element('span', { className: `kpi-delta ${cls}`, textContent: deltaVal }));
          }
        }
        if (config.detail) {
          card.append(element('span', { className: 'kpi-detail', textContent: config.detail(data) }));
        }
      }
      container.append(card);
    }
  },
};

// --- Section Registry ---
const sections = [];

export const sectionRegistry = {
  register(config) {
    sections.push(config);
  },
  render(page, data, container) {
    if (!container) return;
    clear(container);
    for (const config of sections) {
      if (config.page !== page) continue;
      if (config.showWhen && !config.showWhen(data)) continue;
      const host = container.querySelector(`[data-section="${config.id}"]`);
      if (!host) continue;
      clear(host);
      if (config.title) host.append(element('h2', { textContent: config.title }));
      config.render(data, host);
      if (host.children.length === 0 || (host.children.length === 1 && host.children[0].tagName === 'H2')) {
        host.style.display = 'none';
      }
    }
  },
};

export { cssVar };
