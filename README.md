# OSS Impact Dashboard

Static dashboard for open-source project operations, adoption signals and funding-support reports.

The initial implementation was derived from the GPL-3.0 MOLE issue/PR dashboard prototype, then split into a standalone, configuration-driven project.

## What It Does

- Builds one normalized JSON dataset from public sources.
- Serves a static Vite dashboard with Overview, Operations, Impact and Report pages.
- Uses Chart.js for charts and Tabulator for issue/PR tables.
- Runs without private credentials.
- Shows unavailable states for private sources such as GitHub traffic and Read the Docs analytics.
- Deploys through the official GitHub Pages artifact flow.

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

- `actions/configure-pages`
- `actions/upload-pages-artifact`
- `actions/deploy-pages`

## Known Limitations

- GitHub issue events may not contain the complete old history for every repository, so old closed-item labels can fall back to current labels.
- First response and review-time metrics are intentionally not included yet because they require more expensive API strategies.
- GitHub traffic and Read the Docs analytics require privileged access and are placeholders for now.

## Future CSRC Migration

Create a new project config for the final CSRC-owned repository, add any organization secrets in GitHub Actions, then switch the Pages workflow to that config.

