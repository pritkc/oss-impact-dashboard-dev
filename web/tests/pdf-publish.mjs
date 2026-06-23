import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { publishReportPdf } from '../../scripts/publish-report-pdf.mjs';
import { restoreReportPdf } from '../../scripts/restore-report-pdf.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const root = mkdtempSync(join(tmpdir(), 'oss-dashboard-pdf-'));
const sourceDir = join(root, 'source', 'reports');
const pagesDir = join(root, 'gh-pages');
const initialDist = join(root, 'initial-dist');
const refreshDist = join(root, 'refresh-dist');
const previewFile = join(pagesDir, 'pr-preview', 'pr-999', 'index.html');
const productionFile = join(pagesDir, 'index.html');

mkdirSync(sourceDir, { recursive: true });
mkdirSync(join(pagesDir, 'pr-preview', 'pr-999'), { recursive: true });
writeFileSync(join(sourceDir, 'latest.pdf'), `%PDF-1.4\n${'0'.repeat(2048)}\n%%EOF\n`, {
  encoding: 'utf8',
  flag: 'w'
});
writeFileSync(productionFile, '<h1>production</h1>', { encoding: 'utf8', flag: 'w' });
writeFileSync(previewFile, '<h1>preview</h1>', { encoding: 'utf8', flag: 'w' });

const initial = restoreReportPdf(join(root, 'missing-gh-pages'), initialDist, {
  projectId: 'mole',
  environment: 'production'
});
assert(initial.available === false, 'initial deployment should mark PDF unavailable');
assert(!existsSync(join(initialDist, 'reports', 'latest.pdf')), 'initial deployment must not create fake PDF');
const initialStatus = JSON.parse(readFileSync(join(initialDist, 'report-status.json'), 'utf8'));
assert(initialStatus.available === false, 'initial status should be unavailable');

const destination = publishReportPdf(join(sourceDir, 'latest.pdf'), pagesDir, {
  projectId: 'mole',
  environment: 'production',
  generatedAt: '2026-06-21T00:00:00.000Z'
});

assert(destination.endsWith('reports/latest.pdf'), 'PDF should publish to reports/latest.pdf');
assert(existsSync(destination), 'published PDF should exist');
assert(readFileSync(destination, 'utf8').startsWith('%PDF-1.4'), 'published PDF content mismatch');
const publishedStatus = JSON.parse(readFileSync(join(pagesDir, 'report-status.json'), 'utf8'));
assert(publishedStatus.available === true, 'published status should be available');
assert(publishedStatus.project_id === 'mole', 'published status project mismatch');
assert(publishedStatus.environment === 'production', 'published status environment mismatch');
assert(publishedStatus.size_bytes > 1024, 'published status should include nontrivial size');
assert(readFileSync(productionFile, 'utf8') === '<h1>production</h1>', 'production file changed');
assert(readFileSync(previewFile, 'utf8') === '<h1>preview</h1>', 'preview file changed');

const restoreSource = join(root, 'restore-source');
mkdirSync(restoreSource, { recursive: true });
writeFileSync(join(restoreSource, 'latest.pdf'), readFileSync(destination));
writeFileSync(join(restoreSource, 'report-status.json'), readFileSync(join(pagesDir, 'report-status.json')));
const restored = restoreReportPdf(restoreSource, refreshDist, {
  projectId: 'mole',
  environment: 'production'
});
assert(restored.available === true, 'refresh deployment should restore existing PDF');
assert(readFileSync(join(refreshDist, 'reports', 'latest.pdf'), 'utf8').startsWith('%PDF-1.4'), 'restored PDF content mismatch');
assert(
  JSON.parse(readFileSync(join(refreshDist, 'report-status.json'), 'utf8')).generated_at === '2026-06-21T00:00:00.000Z',
  'refresh deployment should preserve generated_at'
);

const mismatchSource = join(root, 'mismatch-source');
mkdirSync(mismatchSource, { recursive: true });
writeFileSync(join(mismatchSource, 'latest.pdf'), readFileSync(destination));
writeFileSync(
  join(mismatchSource, 'report-status.json'),
  JSON.stringify(
    {
      available: true,
      generated_at: '2026-06-21T00:00:00.000Z',
      project_id: 'other-project',
      environment: 'staging'
    },
    null,
    2
  ) + '\n'
);
const mismatchDist = join(root, 'mismatch-dist');
const mismatch = restoreReportPdf(mismatchSource, mismatchDist, {
  projectId: 'mole',
  environment: 'production'
});
assert(mismatch.available === false, 'mismatched report identity must not restore PDF');
assert(!existsSync(join(mismatchDist, 'reports', 'latest.pdf')), 'mismatched report must not copy PDF');
assert(
  JSON.parse(readFileSync(join(mismatchDist, 'report-status.json'), 'utf8')).message === 'report identity mismatch',
  'mismatched report should publish identity mismatch message'
);

console.log('pdf publish tests ok');
