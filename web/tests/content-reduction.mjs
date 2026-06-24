import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(name) {
  return readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
}

const overview = read('index.html');
const operations = read('operations.html');
const impact = read('impact.html');
const report = read('report.html');
const source = read('src/app.js');

assert(!overview.includes('window.print()'), 'Overview print button remains');
assert(!impact.includes('window.print()'), 'Impact print button remains');
assert(!overview.includes('Source availability'), 'Source diagnostics remain on Overview');
assert(!overview.includes('Metric definitions'), 'Metric definitions remain on Overview');

const operationsDocument = new JSDOM(operations).window.document;
assert(!operationsDocument.getElementById('jsonExport'), 'JSON export remains');
assert(!operationsDocument.getElementById('compositionChart'), 'Backlog composition remains');
assert(operationsDocument.getElementById('responsePercentileChart'), 'Coherent percentile chart missing');

const impactDocument = new JSDOM(impact).window.document;
assert(!impactDocument.querySelector('[data-private-sources]'), 'Private source diagnostics remain');
assert(!impactDocument.querySelector('[data-manual-funding]'), 'Manual project evidence remains');
assert(!impactDocument.querySelector('[data-case-studies]'), 'Manual case studies remain');
assert(impactDocument.querySelector('[data-release-panel] [data-section="releases"]'), 'Release panels were not merged');
assert(impactDocument.querySelector('[data-contributor-panel] [data-section="contributors"]'), 'Contributor panels were not merged');

const activeReportSource = source.slice(source.indexOf('function renderReport(data'));
for (const removed of [
  'Project Overview',
  'Major Accomplishments',
  'Maintainer Capacity',
  'Technical Debt and Sustainability Risks',
  'Requested Work Packages',
  'Baseline to Target Outcomes',
  'Case Studies',
  'Governance Health',
  'Annual Targets Progress'
]) {
  assert(!activeReportSource.includes(`textContent: '${removed}'`), `Removed report section remains: ${removed}`);
}
assert(!activeReportSource.includes('core_contributors_configured'), 'Core contributor configuration remains public');
assert(!activeReportSource.includes('External/non-core share'), 'Core contributor status text remains public');
assert(report.includes('data-report'), 'Report host missing');

console.log('content reduction tests ok');
