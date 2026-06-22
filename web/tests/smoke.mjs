import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html);

if (!dom.window.document.querySelector('[data-page="overview"]')) {
  throw new Error('Overview page is missing its page marker');
}

if (!dom.window.document.querySelector('[data-summary]')) {
  throw new Error('Overview page is missing the summary host');
}

const reportHtml = readFileSync(new URL('../report.html', import.meta.url), 'utf8');
if (reportHtml.includes('reports/latest.pdf')) {
  throw new Error('Report page must not ship a hard-coded PDF link');
}

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
for (const expected of [
  'report-status.json',
  'Download latest PDF',
  'PDF report has not been generated yet',
  'reportStatus.project_id === data.project?.id',
  'API key invalid',
  'last successful collection: ${lastSuccess'
]) {
  if (!appSource.includes(expected)) {
    throw new Error(`Report UI state is missing ${expected}`);
  }
}

console.log('frontend smoke ok');
