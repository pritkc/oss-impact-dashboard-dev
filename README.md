# OSS Impact Dashboard

Static dashboard for open-source project operations, adoption signals, and impact reports.

No backend server, database, or paid service is required. Python collects public data into one JSON file. Vite serves a static site with Overview, Operations, Impact, and Report pages.

## Architecture

```text
projects/*.yml          project config
        |
        v
Python collectors  -->  web/public/data/dashboard.json
        |
        v
Vite build         -->  dist/
        |
        v
GitHub Pages       -->  site + reports/latest.pdf
```

Data flow:

1. `oss_impact_dashboard.cli build` reads a project config and writes `dashboard.json`.
2. `npm run build` bundles the frontend and copies the dataset into `dist/`.
3. GitHub Actions deploy `dist/` to the `gh-pages` branch.
4. The report workflow renders `report.html` to PDF and publishes `reports/latest.pdf`.

Main parts:

| Path | Role |
| --- | --- |
| `src/oss_impact_dashboard/` | Collectors, metrics, CLI, PDF generation |
| `web/` | Static HTML, CSS, and JavaScript |
| `scripts/` | Deploy helpers, RTD tracker generator, smoke checks, local preview |
| `projects/` | Per-project YAML configuration |
| `.github/workflows/` | Test, deploy, report, preview, and diagnostics jobs |

## Requirements

- Python 3.11+
- Node.js 22.12+
- Optional: GitHub token for higher API limits and private sources
- Optional: GoatCounter API key for documentation analytics

## Local setup

```bash
python -m pip install -e ".[dev]"
npm ci
```

Build the dataset:

```bash
python -m oss_impact_dashboard.cli build \
  --project projects/mole.yml \
  --safe-project \
  --output web/public/data/dashboard.json
```

Run the dev server:

```bash
npm run dev
```

Preview like GitHub Pages:

```bash
npm run build:pages
npm run preview:pages
```

Open `http://127.0.0.1:4173/<repo-name>/`.

### Full local preview with live data

To replicate the exact CI pipeline locally — including live data collection with
your GitHub token and GoatCounter credentials — use the local preview script:

1. Copy the env template and fill in your credentials:

```bash
cp .env.example .env
# Edit .env with your GitHub token and GoatCounter values
```

2. Run the full pipeline (validate → build dataset → build assets → test → preview):

```bash
bash scripts/local-preview.sh
```

Or specify a project and port:

```bash
bash scripts/local-preview.sh projects/mole.yml 4173
```

This script mirrors the CI workflow: it loads `.env`, builds `dashboard.json`
with your token (so traffic, Actions, and community standards data are
collected), builds Vite assets with the correct `VITE_BASE_PATH`, runs
post-build tests, and starts a preview server that serves from `dist/` with
the same base path as GitHub Pages.

The `.env` file is gitignored and will never be committed.

## Configuration

Project settings live in `projects/*.yml`.

Each file defines:

- `project.id`, `project.name`, `project.repository`
- `project.environment` (`development`, `staging`, or `production`)
- optional documentation, Zenodo, and OpenAlex identifiers
- enabled data sources
- reporting periods, label aliases, and stale thresholds

Example:

```yaml
project:
  id: mole
  name: MOLE
  repository: csrc-sdsu/mole
  environment: production
  documentation_url: https://mole-docs.readthedocs.io

sources:
  github:
    enabled: true
  documentation_analytics:
    provider: goatcounter
    enabled: true

reporting:
  default_period_months: 12
  stale_days: 90
```

To track another repository, copy a project file and change the project fields. No code changes are required.

Non-production environments show a sandbox banner on the site and in PDF reports.

Source failures and configuration details remain in dataset diagnostics and workflow logs. Public
dashboard pages render only available, automatically refreshed evidence.

## Secrets and variables

Set these in GitHub for live collection on `main`:

| Name | Type | Purpose |
| --- | --- | --- |
| `OSS_DASHBOARD_GITHUB_TOKEN` | secret | GitHub traffic and Actions |
| `GOATCOUNTER_API_KEY` | secret | Documentation analytics API |
| `GOATCOUNTER_SITE_URL` | variable | HTTPS origin, e.g. `https://example.goatcounter.com` |
| `GOATCOUNTER_TRACKED_DOMAIN` | variable | Hostname only, e.g. `docs.example.org` |
| `PROJECT_CONFIG` | variable | Project file, e.g. `projects/mole.yml` |

Local token variables, first match wins:

- `OSS_DASHBOARD_GITHUB_TOKEN`
- `GH_TOKEN`
- `GITHUB_TOKEN`

Tokens and API keys are used only by Python collectors. They must never appear in generated JSON, frontend files, logs, or deployed artifacts.

Check integration setup:

```bash
python -m oss_impact_dashboard.cli doctor --project projects/mole.yml
```

## Documentation analytics

When GoatCounter is enabled, the collector uses:

```text
GET /api/v0/stats/total
GET /api/v0/stats/hits
GET /api/v0/stats/toprefs
```

The RTD tracker script is generated at build time:

```bash
GOATCOUNTER_SITE_URL=https://example.goatcounter.com \
GOATCOUNTER_TRACKED_DOMAIN=docs.example.org \
npm run generate:rtd-tracker
```

Deploy `rtd-goatcounter.js` from GitHub Pages and add that URL to Read the Docs custom JavaScript. The tracker sends pageviews plus three fixed event names:

- `event:documentation-search`
- `event:documentation-search-no-results`
- `event:documentation-404:<path>`

Search query text is not collected.

If GoatCounter is unavailable and a Read the Docs CSV is configured, the dashboard uses that CSV as an explicit fallback.

## Workflows

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `test.yml` | push, pull request | Python, lint, frontend, and build checks |
| `refresh-deploy.yml` | main, schedule, manual | Build dataset, deploy site to `gh-pages` |
| `generate-report.yml` | schedule, manual | Build PDF and publish `reports/latest.pdf` |
| `pr-preview.yml` | pull request | Publish preview under `pr-preview/pr-<number>/` |
| `integration-diagnostics.yml` | manual | Run `doctor` and build dataset without deploying |

GitHub Pages settings:

```text
Settings -> Pages -> Deploy from a branch -> gh-pages -> /(root)
```

Production deploy preserves `pr-preview/` and restores snapshot history plus the latest PDF when project identity matches.

PR previews use the checked-in sanitized dataset and do not receive repository secrets.

## PDF reports

After a local pages preview is running:

```bash
python -m pip install -e ".[report]"
python -m playwright install chromium
python -m oss_impact_dashboard.report_pdf \
  --url http://127.0.0.1:4173/<repo-name>/report.html \
  --output reports/latest.pdf
```

The report page reads `report-status.json` and only shows the download link when project ID and environment match the current dataset.

## Testing

```bash
pytest
ruff check .
npm run test:frontend
npm run build:pages
npm run test:build
```

### Pre-push hooks

The repo includes managed pre-commit and pre-push hooks. They install automatically
on `npm ci` or `npm install` via the `postinstall` script, including from linked
Git worktrees.

- Pre-commit runs fast shell and Python lint checks.
- Pre-push runs the canonical deterministic CI suite used by GitHub Actions.
- Existing custom hooks are preserved as `<hook>.local` and invoked first.

To install manually:

```bash
npm run install:hooks
```

To run all CI checks on demand without pushing:

```bash
npm run precheck
```

This validates shell scripts, GitHub Actions workflow schemas, and every project
configuration, then runs Ruff, Pytest, frontend/workflow contract tests, the
GitHub Pages build, and post-build verification. The `test`, deploy, PR preview,
and report workflows call this same script to prevent local/CI drift.

The command derives the GitHub Pages base path from `GITHUB_REPOSITORY` or the
`origin` remote, so forks and renamed repositories test the correct URL path.

For PR-style base paths:

```bash
VITE_BASE_PATH=/<repo-name>/pr-preview/pr-123/ \
GITHUB_REPOSITORY=owner/<repo-name> \
npm run build:pages
```

## Data sources

- GitHub repository metadata, issues, pull requests, releases, and contributors
- GitHub traffic and Actions when authenticated
- GoatCounter documentation analytics
- Read the Docs CSV import
- Zenodo and OpenAlex when configured
- Manual project data and case-study YAML

Missing optional sources appear as unavailable. The dashboard does not show fake zeroes for data it could not collect.

## License

GPL-3.0. See `LICENSE`.
