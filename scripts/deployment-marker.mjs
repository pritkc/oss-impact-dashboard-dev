import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEPLOYMENT_MARKER_FILE = 'deployment-marker.json';

export function writeDeploymentMarker(
  distDir,
  { buildId = '', commitSha = '', generatedAt = new Date().toISOString() } = {}
) {
  const markerPath = resolve(distDir, DEPLOYMENT_MARKER_FILE);
  mkdirSync(distDir, { recursive: true });
  const payload = {
    build_id: buildId,
    commit_sha: commitSha,
    generated_at: generatedAt
  };
  writeFileSync(markerPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'w'
  });
  return markerPath;
}

export function readDeploymentMarker(distDir) {
  const markerPath = resolve(distDir, DEPLOYMENT_MARKER_FILE);
  return JSON.parse(readFileSync(markerPath, 'utf8'));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath === modulePath) {
  const markerPath = writeDeploymentMarker(process.argv[2] || 'dist', {
    buildId: process.argv[3] || '',
    commitSha: process.argv[4] || '',
    generatedAt: process.argv[5] || new Date().toISOString()
  });
  console.log(`Wrote ${markerPath}`);
