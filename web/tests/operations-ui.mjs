import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const html = readFileSync(new URL('../operations.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

for (const id of [
  'search',
  'typeFilter',
  'stateFilter',
  'labelFilter',
  'authorFilter',
  'periodFilter',
  'createdFromFilter',
  'createdToFilter',
  'closedFromFilter',
  'closedToFilter',
  'ageMinFilter',
  'ageMaxFilter',
  'clearFilters',
  'csvExport',
  'jsonExport'
]) {
  assert(document.getElementById(id), `Missing operations control: ${id}`);
}

assert(document.querySelector('[data-filter-summary]'), 'Missing active filter summary');
assert(source.includes('function filterMatches'), 'Missing combined filter function');
assert(source.includes('filters.search'), 'Search filter not wired');
assert(source.includes('filters.label'), 'Label filter not wired');
assert(source.includes('filters.type'), 'Type filter not wired');
assert(source.includes('filters.state'), 'State filter not wired');
assert(source.includes('filters.createdFrom'), 'Created date filter not wired');
assert(source.includes('filters.closedFrom'), 'Closed date filter not wired');
assert(source.includes('filters.ageMin'), 'Age filter not wired');
assert(source.includes("table.getRows('active')"), 'Exports must read active filtered rows');
assert(source.includes("table.on('dataFiltered'"), 'Filter summary must wait for filtered rows');
assert(source.includes("downloadRows(tableRows(), 'csv')"), 'CSV export must use filtered rows');
assert(source.includes("downloadRows(tableRows(), 'json')"), 'JSON export must use filtered rows');
assert(source.includes('displayState(record)'), 'Merged display state must be derived');
assert(source.includes('labelPills'), 'Safe label pills must be rendered');

console.log('operations UI tests ok');
