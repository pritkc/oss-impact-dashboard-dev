import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function publishReportPdf(source = 'reports/latest.pdf', pagesDir = 'gh-pages') {
  const sourcePath = resolve(source);
  const destination = resolve(pagesDir, 'reports', 'latest.pdf');

  if (!existsSync(sourcePath)) {
    throw new Error(`Missing generated PDF: ${sourcePath}`);
  }
  if (!statSync(sourcePath).isFile()) {
    throw new Error(`Generated PDF path is not a file: ${sourcePath}`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(sourcePath, destination);
  return destination;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath === modulePath) {
  const destination = publishReportPdf(process.argv[2], process.argv[3]);
  console.log(`Published report PDF to ${destination}`);
}
