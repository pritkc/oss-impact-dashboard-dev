# Getting Started

## Prerequisites

- Python 3.11+
- Node.js 22.12+

## First run

```bash
python -m pip install -e ".[dev]"
npm ci
bash scripts/dev-local.sh --fetch
```

This copies `.env.example` to `.env` if missing, fetches datasets for every `projects/*.yml`, and starts the Vite dev server at `http://127.0.0.1:5173/`.

For fast UI work after the first fetch:

```bash
bash scripts/dev-local.sh
```

## Build commands

| Command | Purpose |
| --- | --- |
| `npm run build:data` | Fetch data for all `projects/*.yml` (or pass `-- --projects …`) |
| `npm run build:ui` | Rebuild Vite from cached JSON only (no API calls) |
| `npm run build:site` | `build:data` + Vite + post-build checks |
| `npm run dev` | Vite dev server (expects data already built) |
| `npm run preview:pages` | Serve `dist/` with GitHub Pages base path |

Examples:

```bash
# Fetch all projects (default)
npm run build:data

# Compare two MOLE configs with different tokens
npm run build:data -- --projects projects/mole.yml projects/mole-local.yml --default-project mole-local

# UI-only iteration (seconds, no GitHub API)
npm run build:ui -- --projects projects/mole.yml projects/mole-local.yml
npm run dev
```

GitHub Pages–style preview:

```bash
bash scripts/local-preview.sh
bash scripts/local-preview.sh -- --projects projects/mole.yml projects/mole-local.yml
```

Optional shell tab completion for project YAML paths:

```bash
source scripts/completion.bash
```

## npm commands

| Command | Purpose |
| --- | --- |
| `npm run test` | Lint, pytest, frontend contract tests (no build) |
| `npm run ci` | `test` then build example project — same as GitHub `test.yml` and pre-push |
| `npm run build:site` | Fetch data + Vite + post-build checks |

CI always builds `projects/example.yml` only (fast, no secrets). Local commands default to all `projects/*.yml`.

## Configure a project

Each tracked repository has one YAML file under `projects/`. Copy `projects/example.yml` and edit:

| Field | Purpose |
| --- | --- |
| `project.id` | Stable identifier; also used for credential env suffix |
| `project.name` | Display name in the UI |
| `project.repository` | `owner/repo` on GitHub |
| `project.environment` | `development`, `staging`, or `production` |
| `project.documentation_url` | Docs site URL (for analytics hostname checks) |
| `sources.*.enabled` | Toggle each data source on or off |

Project id maps to env suffixes: `mole-local` → `MOLE_LOCAL`, `example` → `EXAMPLE`.

List available project configs:

```bash
python -m oss_impact_dashboard.cli list-projects
```

Check integration setup:

```bash
python -m oss_impact_dashboard.cli doctor --project projects/my-project.yml
```

## Secrets

Add credentials to `.env` (local) or GitHub repository secrets (deploy). Use suffixed names derived from `project.id`:

| Credential | Env var pattern |
| --- | --- |
| GitHub PAT | `GITHUB_TOKEN_<SUFFIX>` |
| GoatCounter API key | `GOATCOUNTER_API_KEY_<SUFFIX>` |
| Read the Docs automation account | `RTD_USERNAME_<SUFFIX>`, `RTD_PASSWORD_<SUFFIX>`, `RTD_TOTP_SECRET_<SUFFIX>` |

Example for `project.id: example`:

```bash
GITHUB_TOKEN_EXAMPLE=github_pat_...
GOATCOUNTER_API_KEY_EXAMPLE=...
```

### GitHub token

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens**
2. Create a fine-grained token for your target repository
3. Permissions: **Contents** (read), **Metadata** (read), **Actions** (read) — needed for traffic and Actions collectors
4. Set `GITHUB_TOKEN_<SUFFIX>` in `.env` and as a repository secret for deploy workflows

Note: GitHub Actions also provides a built-in `GITHUB_TOKEN` for the runner. That is automatic and separate from the PAT you create for dashboard data collection.

### GoatCounter

1. Create a site at [goatcounter.com](https://www.goatcounter.com/)
2. Open **Settings → Sites → your site → API** and copy the key
3. Set `documentation_analytics.site_url` in project YAML and `GOATCOUNTER_API_KEY_<SUFFIX>` in env
4. Run `npm run build:data`, then `npm run generate:rtd-tracker`, and add the script URL to RTD custom JavaScript

### Read the Docs analytics

Read the Docs traffic, 404, and search analytics are collected separately from GoatCounter. Production uses a dedicated RTD automation account with password plus TOTP:

1. Create or designate a Read the Docs automation account with access to the target project
2. Enable two-factor authentication and store the TOTP secret in `RTD_TOTP_SECRET_<SUFFIX>`
3. Set `RTD_USERNAME_<SUFFIX>` and `RTD_PASSWORD_<SUFFIX>` in GitHub repository secrets
4. Enable `sources.readthedocs` in the production project YAML with `project_slug` and `cache_dir`
5. The `collect Read the Docs analytics` workflow runs weekly and on manual dispatch; weekly production refresh restores the sanitized cache from `gh-pages` before building

Raw search-query CSV exports stay in the CI workspace only. Published dashboard JSON contains sanitized aggregates without query text.

Tokens are used only by Python collectors. They must never appear in generated JSON, frontend files, or deployed artifacts.

## Contributing

You do not need MOLE credentials to contribute.

1. Fork and clone the repository
2. Work against `projects/example.yml` (or your own copy)
3. Run the quality gate locally:

```bash
npm run ci
```

This validates all `projects/*.yml` schemas, runs tests, and builds from `projects/example.yml` with `--safe-project` (no secrets required).

4. Open a pull request — `test.yml` runs `npm run ci`; PR previews run `npm run build:site -- --projects projects/example.yml` without repository secrets

Pre-push hooks install automatically on `npm ci`. To install manually: `npm run install:hooks`.

## Testing

```bash
npm run test          # lint + pytest + frontend tests
npm run build:site    # dataset + Vite + post-build checks
npm run ci            # both
```

Individual tools:

```bash
pytest
ruff check .
npm run test:frontend
```

## Deploying (MOLE operator)

This repository deploys the MOLE dashboard to GitHub Pages. Merged code is tested by `test.yml`; deploy only builds and publishes.

### GitHub Pages

```text
Settings → Pages → Deploy from a branch → gh-pages → /(root)
```

### Repository secrets

| Name | Purpose |
| --- | --- |
| `GITHUB_TOKEN_MOLE` | MOLE GitHub traffic and Actions |
| `GOATCOUNTER_API_KEY_MOLE` | MOLE documentation analytics |

### One-time secret rename

If upgrading from older env names, rename secrets:

- `OSS_DASHBOARD_GITHUB_TOKEN_MOLE` → `GITHUB_TOKEN_MOLE`
- `OSS_DASHBOARD_GITHUB_TOKEN_MOLE_LOCAL` → `GITHUB_TOKEN_MOLE_LOCAL` (local `.env` only)

### Workflows

| Workflow | Trigger | What it runs |
| --- | --- | --- |
| `test.yml` | push, pull request | `npm run ci` (test + build example) |
| `refresh-deploy.yml` | main, schedule, manual | `npm run build:site -- --projects projects/mole.yml` + publish |
| `generate-report.yml` | schedule, manual | `npm run build:site -- --projects projects/mole.yml` + PDF |
| `pr-preview.yml` | pull request | `npm run build:site -- --projects projects/example.yml` |
| `integration-diagnostics.yml` | manual | `doctor` + build with secrets |

Verify live collection locally:

```bash
npm run build:data -- --projects projects/mole.yml
bash scripts/local-preview.sh -- --projects projects/mole.yml
```

### PDF reports

```bash
python -m pip install -e ".[report]"
python -m playwright install chromium
npm run build:site -- --projects projects/mole.yml
npm run preview:pages
python -m oss_impact_dashboard.report_pdf \
  --url http://127.0.0.1:4173/<repo-name>/report.html \
  --output reports/latest.pdf
```
