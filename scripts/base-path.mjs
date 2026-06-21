export function normalizeBasePath(value) {
  if (!value) {
    return null;
  }
  if (value === '/') {
    return '/';
  }
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function repositoryName(repository = process.env.GITHUB_REPOSITORY) {
  return repository?.split('/')[1] || 'oss-impact-dashboard';
}

export function githubPagesBase(env = process.env) {
  return normalizeBasePath(env.VITE_BASE_PATH) || `/${repositoryName(env.GITHUB_REPOSITORY)}/`;
}
