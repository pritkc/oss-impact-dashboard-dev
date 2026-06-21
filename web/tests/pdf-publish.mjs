import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { publishReportPdf } from '../../scripts/publish-report-pdf.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const root = mkdtempSync(join(tmpdir(), 'oss-dashboard-pdf-'));
const sourceDir = join(root, 'source', 'reports');
const pagesDir = join(root, 'gh-pages');
const previewFile = join(pagesDir, 'pr-preview', 'pr-999', 'index.html');
const productionFile = join(pagesDir, 'index.html');

mkdirSync(sourceDir, { recursive: true });
mkdirSync(join(pagesDir, 'pr-preview', 'pr-999'), { recursive: true });
writeFileSync(join(sourceDir, 'latest.pdf'), '%PDF-1.4\n% fake test pdf\n', {
  encoding: 'utf8',
  flag: 'w'
});
writeFileSync(productionFile, '<h1>production</h1>', { encoding: 'utf8', flag: 'w' });
writeFileSync(previewFile, '<h1>preview</h1>', { encoding: 'utf8', flag: 'w' });

const destination = publishReportPdf(join(sourceDir, 'latest.pdf'), pagesDir);

assert(destination.endsWith('reports/latest.pdf'), 'PDF should publish to reports/latest.pdf');
assert(existsSync(destination), 'published PDF should exist');
assert(readFileSync(destination, 'utf8').startsWith('%PDF-1.4'), 'published PDF content mismatch');
assert(readFileSync(productionFile, 'utf8') === '<h1>production</h1>', 'production file changed');
assert(readFileSync(previewFile, 'utf8') === '<h1>preview</h1>', 'preview file changed');

console.log('pdf publish tests ok');
