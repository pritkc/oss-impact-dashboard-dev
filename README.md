# OSS Impact Dashboard

Static dashboard for open-source project operations, adoption signals and funding-support reports.

The initial implementation was derived from the GPL-3.0 MOLE issue/PR dashboard prototype, then split into a standalone, configuration-driven project.

## What It Does

- Builds one normalized JSON dataset from public sources.
- Serves a static Vite dashboard with Overview, Operations, Impact and Report pages.
- Uses Chart.js for charts and Tabulator for issue/PR tables.
- Runs without private credentials.
- Shows unavailable states for private sources such as GitHub traffic and Read the Docs analytics.
- Deploys to the `gh-pages` branch and preserves pull-request previews.

## Architecture

```text
Public APIs or manual YAML
        -> Python collectors
        -> web/public/data/dashboard.json
        -> static Vite dashboard
        -> GitHub Pages / printable report
```

No backend server, runtime database, user accounts or paid service is required.

## Local Setup

```bash
python -m pip install -e ".[dev]"
npm install
python -m oss_impact_dashboard.cli build \
  --project projects/mole.yml \
  --output web/public/data/dashboard.json
npm run dev
```

Open the local URL printed by Vite.

## Commands

```bash
pytest
ruff check .
npm run build
npm run test:frontend
npm run test:build
```

Preview the built app exactly like the project GitHub Pages URL:

```bash
npm run build:pages
npm run preview:pages
```

This opens the same path shape GitHub Pages uses:

```text
http://127.0.0.1:4173/oss-impact-dashboard-dev/
```

If the port is busy, pass another port:

```bash
npm run preview:pages -- 4174
```

Preview a pull-request path locally:

```bash
VITE_BASE_PATH=/oss-impact-dashboard-dev/pr-preview/pr-123/ \
GITHUB_REPOSITORY=pritkc/oss-impact-dashboard-dev \
npm run build

VITE_BASE_PATH=/oss-impact-dashboard-dev/pr-preview/pr-123/ \
GITHUB_REPOSITORY=pritkc/oss-impact-dashboard-dev \
node scripts/preview-pages.mjs 4175
```

Generate the dataset:

```bash
python -m oss_impact_dashboard.cli build \
  --project projects/mole.yml \
  --output web/public/data/dashboard.json
```

Generate a PDF after starting a local preview server:

```bash
python -m pip install -e ".[report]"
python -m playwright install chromium
python -m oss_impact_dashboard.report_pdf \
  --url http://127.0.0.1:5173/report.html \
  --output reports/latest.pdf
```

## Configuration

Project settings live in `projects/*.yml`.

To track another public repository, copy `projects/mole.yml`, change:

- `project.id`
- `project.name`
- `project.repository`
- optional documentation, Zenodo and OpenAlex identifiers

No Python or JavaScript changes should be needed.

Useful project options:

```yaml
reporting:
  default_period_months: 12
  stale_days: 90
  freshness_warning_hours: 48

label_aliases:
  documentation: Documentation
  matlab/octave: Octave/MATLAB

priority_label_patterns:
  - priority
  - urgent
  - critical

core_contributors: []
```

`label_aliases` are matched case-insensitively and keep the original labels on each item for traceability.

## Authentication

Public GitHub data works without credentials, but authenticated requests get a larger rate limit.

Supported token variables:

- `OSS_DASHBOARD_GITHUB_TOKEN`
- `MOLE_READ_TOKEN`
- `GH_TOKEN`
- `GITHUB_TOKEN`

Tokens are used only by Python collectors. They must never be written into generated JSON, frontend files, logs or deployed artifacts.

## Data Sources

- GitHub repository metadata, labels, issues, PRs, repository-wide issue events, releases and contributors.
- GitHub traffic when credentials with repository traffic access are configured.
- GitHub Actions workflow runs when authenticated collection is enabled.
- Read the Docs analytics through a validated CSV import path.
- Zenodo record metadata when a record ID or record URL is configured.
- OpenAlex citation metadata when a DOI is configured.
- Manual funding and case-study evidence from `manual/*.yml`.

Private source placeholders:

- GitHub traffic: access not configured.
- Read the Docs analytics: access not configured.

## Metric Notes

- Closed issues and PRs are grouped by labels reconstructed from GitHub issue events at close time when available.
- Open items are grouped by current labels.
- Median is preferred over average for close and merge time.
- Release downloads count uploaded release assets only, not GitHub-generated source archives.
- Contributor counts use public GitHub issue, PR and contributor endpoints only.

## Deployment

`.github/workflows/refresh-deploy.yml` builds data, builds the Vite app and deploys `dist/` with:

- `VITE_BASE_PATH=/${{ github.event.repository.name }}/`
- `JamesIves/github-pages-deploy-action`
- `branch: gh-pages`
- `clean-exclude: pr-preview/`

Pull-request previews are handled by `.github/workflows/pr-preview.yml` and publish under:

```text
/oss-impact-dashboard-dev/pr-preview/pr-<PR_NUMBER>/
```

GitHub Pages must be set to:

```text
Settings -> Pages -> Deploy from a branch -> gh-pages -> /(root)
```

## Known Limitations

- GitHub issue events may not contain the complete old history for every repository, so old closed-item labels can fall back to current labels.
- First response and review-time metrics require authenticated engagement collection before they can be shown.
- Live GitHub traffic requires repository traffic permissions.
- Read the Docs analytics requires an exported analytics CSV until API credentials are available.

## Future CSRC Migration

Create a new project config for the final CSRC-owned repository, add any organization secrets in GitHub Actions, then switch the Pages workflow to that config.
