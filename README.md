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

Select a different project config without code changes:

```bash
PROJECT_CONFIG=projects/dev.yml
python -m oss_impact_dashboard.cli build \
  --project "$PROJECT_CONFIG" \
  --safe-project \
  --output web/public/data/dashboard.json
```

## Commands

```bash
pytest
ruff check .
npm run build
npm run test:frontend
npm run test:build
```

Run integration diagnostics without printing secret values:

```bash
python -m oss_impact_dashboard.cli doctor --project projects/dev.yml
```

Preview the built app exactly like the project GitHub Pages URL:

```bash
npm run build:pages
npm run preview:pages
```

This opens the same path shape GitHub Pages uses:

```text
http://127.0.0.1:4173/<repo-name>/
```

If the port is busy, pass another port:

```bash
npm run preview:pages -- 4174
```

Preview a pull-request path locally:

```bash
VITE_BASE_PATH=/<repo-name>/pr-preview/pr-123/ \
GITHUB_REPOSITORY=<owner>/<repo-name> \
npm run build

VITE_BASE_PATH=/<repo-name>/pr-preview/pr-123/ \
GITHUB_REPOSITORY=<owner>/<repo-name> \
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

`project.environment` may be `development`, `staging` or `production`; omitted values default to
`production`. Non-production datasets show a dashboard and report banner:

```text
DEVELOPMENT SANDBOX
Data source: <configured repository>
Not official CSRC/MOLE impact data
```

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

GoatCounter documentation analytics uses one secret and two public repository variables:

- Secret: `GOATCOUNTER_API_KEY`
- Variable: `GOATCOUNTER_SITE_URL`
- Variable: `GOATCOUNTER_TRACKED_DOMAIN`

`GOATCOUNTER_SITE_URL` must be an HTTPS origin such as
`https://example.goatcounter.com`. `GOATCOUNTER_TRACKED_DOMAIN` must be a
hostname such as `docs.example.org`, not a full URL. The API key is read only by
server-side Python collection and is never serialized into the dataset, frontend
assets, tracker script or PR-preview workflow.

## Data Sources

- GitHub repository metadata, labels, issues, PRs, repository-wide issue events, releases and contributors.
- GitHub traffic when credentials with repository traffic access are configured.
- GitHub Actions workflow runs when authenticated collection is enabled.
- GoatCounter documentation analytics for visitor/page-hit totals, daily trend, popular pages, top referrers, search events, no-result searches, 404 counts and missing documentation paths.
- Read the Docs analytics through a validated CSV import path.
- Zenodo record metadata when a record ID or record URL is configured.
- OpenAlex citation metadata when a DOI is configured.
- Manual funding and case-study evidence from `manual/*.yml`.

Private source placeholders:

- GitHub traffic: access not configured.
- Read the Docs analytics: access not configured.

Documentation analytics fallback is explicit:

- GoatCounter configured and available: `documentation_analytics.provider` is `goatcounter`.
- GoatCounter unavailable and RTD CSV configured: provider is `readthedocs_csv` with `partial` status.
- Neither available: documentation analytics is unavailable, not shown as zero.

The GoatCounter collector uses only:

```text
GET /api/v0/stats/total
GET /api/v0/stats/hits
GET /api/v0/stats/toprefs
```

For the active reporting period it sends RFC3339 `start` and `end` values rounded to the hour.

## Metric Notes

- Closed issues and PRs are grouped by labels reconstructed from GitHub issue events at close time when available.
- Open items are grouped by current labels.
- Median is preferred over average for close and merge time.
- Release downloads count uploaded release assets only, not GitHub-generated source archives.
- Contributor counts use public GitHub issue, PR and contributor endpoints only.
- Documentation search queries are intentionally not collected.
- GoatCounter event paths are fixed to:
  - `event:documentation-search`
  - `event:documentation-search-no-results`
  - `event:documentation-404:<normalized-path>`

## Read the Docs GoatCounter Tracker

Generate the tracker:

```bash
GOATCOUNTER_SITE_URL=https://example.goatcounter.com \
GOATCOUNTER_TRACKED_DOMAIN=docs.example.org \
npm run generate:rtd-tracker
```

Output:

```text
web/public/rtd-goatcounter.js
```

Expected deployed URL on GitHub Pages:

```text
https://<owner>.github.io/<repo-name>/rtd-goatcounter.js
```

Add that URL to the Read the Docs custom JavaScript configuration for the
sandbox documentation project. The generated script loads
`https://gc.zgo.at/count.js`, sets `data-goatcounter="<GOATCOUNTER_SITE_URL>/count"`,
allows GoatCounter to send the automatic pageview, and sends only the three
aggregate events listed above. If public config is absent it remains a no-op.

## Deployment

`.github/workflows/refresh-deploy.yml` builds data, builds the Vite app and deploys `dist/` with:

- `VITE_BASE_PATH=/${{ github.event.repository.name }}/`
- `PROJECT_CONFIG=${{ vars.PROJECT_CONFIG || 'projects/mole.yml' }}`
- `JamesIves/github-pages-deploy-action`
- `branch: gh-pages`
- `clean-exclude: pr-preview/`

Manual `workflow_dispatch` runs may override `project_config`, but the CLI
rejects path traversal and files outside `projects/`. The selected config is
used for data collection, snapshot history and report generation.

Protected main/scheduled jobs receive:

- `OSS_DASHBOARD_GITHUB_TOKEN` from repository secrets
- `GOATCOUNTER_API_KEY` from repository secrets
- `GOATCOUNTER_SITE_URL` from repository variables
- `GOATCOUNTER_TRACKED_DOMAIN` from repository variables

Pull-request previews intentionally do not receive dashboard or GoatCounter
secrets; they use the checked-in sanitized dataset and build static assets only.

Pull-request previews are handled by `.github/workflows/pr-preview.yml` and publish under:

```text
/<repo-name>/pr-preview/pr-<PR_NUMBER>/
```

GitHub Pages must be set to:

```text
Settings -> Pages -> Deploy from a branch -> gh-pages -> /(root)
```

Snapshot histories are separated by project config:

- Production default: `metrics-history.json`
- Development sandbox: `metrics-history-dev.json`

Each snapshot identity includes date, project ID and environment. Documentation
visitor, page-hit, search, no-result and 404 counts are included in snapshots.

## Diagnostics Workflow

`.github/workflows/integration-diagnostics.yml` is named `integration diagnostics`.
It runs only through `workflow_dispatch`, only on `main`, never deploys, and runs:

```bash
python -m oss_impact_dashboard.cli doctor --project "$PROJECT_CONFIG"
```

The command reports valid/invalid or configured/missing states for project
config, GitHub token, GitHub collection, GitHub traffic, GitHub Actions,
GoatCounter site URL, tracked domain, API key, API access and RTD tracker status.

## Known Limitations

- GitHub issue events may not contain the complete old history for every repository, so old closed-item labels can fall back to current labels.
- First response and review-time metrics require authenticated engagement collection before they can be shown.
- Live GitHub traffic requires repository traffic permissions.
- Read the Docs analytics requires an exported analytics CSV until API credentials are available.

## Development Sandbox Activation

After merging, complete these manual account actions:

1. Create or select the hosted GoatCounter site for the sandbox documentation.
2. Add `GOATCOUNTER_API_KEY` as a GitHub Actions secret.
3. Add `GOATCOUNTER_SITE_URL` as a GitHub repository variable.
4. Add `GOATCOUNTER_TRACKED_DOMAIN` as a GitHub repository variable.
5. Set `PROJECT_CONFIG` to `projects/dev.yml` for sandbox deployment runs.
6. Run `integration diagnostics` from `main`.
7. Run the production refresh/deploy workflow.
8. Add the deployed `rtd-goatcounter.js` URL to the Read the Docs custom script setting.
9. Confirm GoatCounter receives pageviews and the three fixed event names.

To test the GoatCounter API manually without exposing the token in logs, run from
a local shell that already has the environment variables configured:

```bash
python -m oss_impact_dashboard.cli doctor --project projects/dev.yml
```

To rotate or disable analytics, rotate `GOATCOUNTER_API_KEY` in GitHub Secrets or
remove the GoatCounter variables and regenerate the tracker. With public config
absent, `web/public/rtd-goatcounter.js` is a no-op.

## Future CSRC Migration

To migrate from the sandbox to CSRC ownership, change configuration and
credentials only:

1. Change the tracked repository from `pritkc/mole` to `csrc-sdsu/mole` in the selected project YAML.
2. Change the dashboard repository from `pritkc/oss-impact-dashboard-dev` to `csrc-sdsu/oss-impact-dashboard` in GitHub repository settings and Pages URLs.
3. Set `PROJECT_CONFIG` to the CSRC project YAML, or keep `projects/mole.yml` for the production CSRC config.
4. Replace GoatCounter secret and variables with the CSRC-owned site values.
5. Replace `OSS_DASHBOARD_GITHUB_TOKEN` with an organization-approved token.
6. Keep source code unchanged.
