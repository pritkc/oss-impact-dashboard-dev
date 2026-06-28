# Getting Started

## Prerequisites

- Python 3.11+
- Node.js 22.12+

## First run

```bash
python -m pip install -e ".[dev]"
npm ci
bash scripts/dev-local.sh
```

By default this uses `projects/example.yml`, copies `.env.example` to `.env` if missing, builds the dataset, and starts the Vite dev server at `http://127.0.0.1:5173/`.

Equivalent manual steps:

```bash
export PROJECT_CONFIG=projects/example.yml
export VITE_BASE_PATH=/
npm run build:site
npm run dev
```

For a GitHub Pages–style preview (builds `dist/` with the correct base path):

```bash
bash scripts/local-preview.sh
# or: npm run build:site && npm run preview:pages
```

Live MOLE data:

```bash
bash scripts/local-preview.sh projects/mole.yml
```

## npm commands

| Command | Purpose |
| --- | --- |
| `npm run test` | Lint, pytest, frontend contract tests (no build) |
| `npm run build:site` | Build dataset + Vite + post-build checks |
| `npm run ci` | `test` then `build:site` — same as GitHub `test.yml` and pre-push |
| `npm run dev` | Vite dev server (expects data already built) |
| `npm run preview:pages` | Serve `dist/` with GitHub Pages base path |

Set `PROJECT_CONFIG=projects/my-project.yml` before `npm run build:site` to choose which project to build.

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

Build datasets (populates the project picker when using multiple files):

```bash
PROJECT_CONFIG=projects/my-project.yml npm run build:site
```

Or call the CLI directly for multiple projects:

```bash
python -m oss_impact_dashboard.cli build-index \
  --projects projects/a.yml projects/b.yml \
  --safe-project \
  --output-dir web/public/data
npm run build
npm run test:build
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
4. For Read the Docs: `PROJECT_CONFIG=projects/mole.yml npm run generate:rtd-tracker` and add the script URL to RTD custom JavaScript

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

4. Open a pull request — `test.yml` runs `npm run ci`; PR previews run `npm run build:site` only and deploy sanitized data without repository secrets

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

### Repository variable

Set **Settings → Secrets and variables → Actions → Variables**:

| Name | Value |
| --- | --- |
| `PROJECT_CONFIG` | `projects/mole.yml` |

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
| `test.yml` | push, pull request | `npm run ci` (test + build) |
| `refresh-deploy.yml` | main, schedule, manual | `npm run build:site` + publish to `gh-pages` |
| `generate-report.yml` | schedule, manual | `npm run build:site` + PDF publish |
| `pr-preview.yml` | pull request | `npm run build:site` (example only) + preview upload |
| `integration-diagnostics.yml` | manual | `doctor` + build with secrets |

Verify live collection locally:

```bash
bash scripts/local-preview.sh projects/mole.yml
```

### PDF reports

```bash
python -m pip install -e ".[report]"
python -m playwright install chromium
npm run build:site
npm run preview:pages
python -m oss_impact_dashboard.report_pdf \
  --url http://127.0.0.1:4173/<repo-name>/report.html \
  --output reports/latest.pdf
```
