import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPORT_STATUS_FILE = 'report-status.json';
export const MIN_PDF_BYTES = 1024;

export function validateReportPdf(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing generated PDF: ${path}`);
  }
  if (!statSync(path).isFile()) {
    throw new Error(`Generated PDF path is not a file: ${path}`);
  }
  const body = readFileSync(path);
  if (!body.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error(`Generated PDF is missing %PDF- header: ${path}`);
  }
  if (body.length < MIN_PDF_BYTES) {
    throw new Error(`Generated PDF is too small to publish: ${path}`);
  }
  return body.length;
}

export function writeReportStatus(
  pagesDir,
  {
    available,
    generatedAt = new Date().toISOString(),
    projectId = '',
    environment = '',
    sizeBytes = 0
  } = {}
) {
  const statusPath = resolve(pagesDir, REPORT_STATUS_FILE);
  mkdirSync(dirname(statusPath), { recursive: true });
  const payload = available
    ? {
        available: true,
        path: 'reports/latest.pdf',
        generated_at: generatedAt,
        project_id: projectId,
        environment,
        size_bytes: sizeBytes
      }
    : {
        available: false,
        path: 'reports/latest.pdf',
        generated_at: null,
        project_id: projectId,
        environment,
        size_bytes: 0
      };
  writeFileSync(statusPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'w'
  });
  return statusPath;
}

export function publishReportPdf(source = 'reports/latest.pdf', pagesDir = 'gh-pages', metadata = {}) {
  const sourcePath = resolve(source);
  const destination = resolve(pagesDir, 'reports', 'latest.pdf');
  const sizeBytes = validateReportPdf(sourcePath);

  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(sourcePath, destination);
  writeReportStatus(pagesDir, { ...metadata, available: true, sizeBytes });
  return destination;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath === modulePath) {
  const destination = publishReportPdf(process.argv[2], process.argv[3], {
    projectId: process.env.REPORT_PROJECT_ID || '',
    environment: process.env.REPORT_ENVIRONMENT || ''
  });
  console.log(`Published report PDF to ${destination}`);
}
