import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReportPdf, writeReportStatus } from './publish-report-pdf.mjs';

function readPreviousStatus(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function identityMatches(status, metadata) {
  return (
    status.available === true
    && status.project_id === metadata.projectId
    && status.environment === metadata.environment
  );
}

export function restoreReportPdf(sourceDir = '.gh-pages-report', distDir = 'dist', metadata = {}) {
  const sourcePdf = resolve(sourceDir, 'latest.pdf');
  const sourceStatus = resolve(sourceDir, 'report-status.json');
  const status = readPreviousStatus(sourceStatus);
  const destination = resolve(distDir, 'reports', 'latest.pdf');

  if (!existsSync(sourcePdf) || !identityMatches(status, metadata)) {
    const message = !existsSync(sourcePdf)
      ? undefined
      : 'report identity mismatch';
    writeReportStatus(distDir, {
      ...metadata,
      available: false,
      message
    });
    return {
      available: false,
      statusPath: resolve(distDir, 'report-status.json'),
      message
    };
  }

  const sizeBytes = validateReportPdf(sourcePdf);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(sourcePdf, destination);
  writeReportStatus(distDir, {
    ...metadata,
    available: true,
    generatedAt: status.generated_at || metadata.generatedAt,
    projectId: status.project_id,
    environment: status.environment,
    buildId: status.build_id || metadata.buildId,
    sizeBytes
  });
  return { available: true, pdfPath: destination, statusPath: resolve(distDir, 'report-status.json') };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath === modulePath) {
  const result = restoreReportPdf(process.argv[2], process.argv[3], {
    projectId: process.argv[4] || process.env.REPORT_PROJECT_ID || '',
    environment: process.argv[5] || process.env.REPORT_ENVIRONMENT || ''
  });
  console.log(JSON.stringify(result));
}
