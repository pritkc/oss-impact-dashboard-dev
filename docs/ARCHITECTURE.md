# Architecture

System design reference for developers and AI tools working on this repository.

## Pipeline

```text
projects/*.yml          per-project configuration
manual/*.yml            optional impact evidence (YAML)
        |
        v
Python collectors  -->  web/public/data/*.json
        |
        v
Vite build         -->  dist/
        |
        v
GitHub Pages       -->  site + reports/latest.pdf
```

1. `oss_impact_dashboard.cli build-index` reads project configs and writes JSON datasets.
2. `npm run build:site` runs build-index, Vite build, and post-build verification.
3. GitHub Actions deploy workflows run `npm run build:site` then publish `dist/` to `gh-pages`.
4. The report workflow renders `report.html` to PDF after building the site.

## Directory map

| Path | Role |
| --- | --- |
| `src/oss_impact_dashboard/` | Collectors, metrics builders, CLI, PDF generation |
| `src/oss_impact_dashboard/collectors/` | Data fetchers (GitHub, GoatCounter, Zenodo, etc.) |
| `src/oss_impact_dashboard/metrics/` | Transforms raw collector output into dashboard sections |
| `web/` | Static HTML, CSS, JavaScript (Vite) |
| `web/src/app.js` | Single entry for index, settings, and report pages |
| `web/public/data/` | Generated JSON (gitignored; rebuilt in CI) |
| `projects/` | Project YAML configs |
| `manual/` | Hand-edited impact data |
| `scripts/` | CI, preview, deploy helpers |
| `.github/workflows/` | Test, deploy, report, preview, diagnostics |

## Frontend pages

Three HTML entry points share one JavaScript bundle, selected by `body[data-page]`:

| Page | File | Purpose |
| --- | --- | --- |
| Dashboard | `web/index.html` | Overview, Operations, Impact sections |
| Settings | `web/settings.html` | Source status and integration diagnostics |
| Report | `web/report.html` | Printable impact report |

Multi-project support: `projects.json` manifest lists available projects; UI picker uses `?project=` and localStorage.

## Project YAML schema

```yaml
project:
  id: example                    # stable id; env suffix = UPPER(id), hyphens → underscores
  name: Example Project
  repository: your-org/your-repo
  environment: development       # development | staging | production
  documentation_url: https://...   # optional
  citation_url: https://...      # optional

sources:
  github:                        { enabled: true }
  github_traffic:                { enabled: false }   # requires GITHUB_TOKEN_<SUFFIX>
  github_actions:                { enabled: false }   # requires GITHUB_TOKEN_<SUFFIX>
  readthedocs:                   { enabled: false }
  documentation_analytics:
    provider: goatcounter
    enabled: false
    site_url: https://....goatcounter.com
  snapshots:
    enabled: false
    history_path: metrics-history.json
  zenodo:
    enabled: false
    record_or_doi: https://zenodo.org/records/...
  openalex:
    enabled: false
    doi: 10.21105/joss.00000
  openssf_scorecard:             { enabled: true }
  community_standards:           { enabled: false }   # requires GITHUB_TOKEN_<SUFFIX>
  package_adoption:              { enabled: false }

reporting:
  default_period_months: 12
  stale_days: 90
  freshness_warning_hours: 48    # optional

label_aliases:                   # optional GitHub label display names
  bug: Bug

priority_label_patterns:         # optional
  - priority

core_contributors:               # optional GitHub usernames
  - maintainer1
```

Non-production `environment` values show a sandbox banner in the UI and PDF.

## Collectors and metrics

| Source key | Collector | Metrics output |
| --- | --- | --- |
| `github` | `collectors/github.py` | operations, releases, contributors |
| `github_traffic` | `collectors/github_traffic.py` | operations (views/clones) |
| `github_actions` | `collectors/github_actions.py` | operations (CI runs) |
| `documentation_analytics` | `collectors/goatcounter.py` | operations (docs traffic) |
| `readthedocs` | `collectors/readthedocs.py` | documentation fallback |
| `zenodo` | `collectors/zenodo.py` | impact |
| `openalex` | `collectors/openalex.py` | impact |
| `openssf_scorecard` | `collectors/openssf_scorecard.py` | security |
| `community_standards` | `collectors/github.py` | community |
| `package_adoption` | `collectors/package_adoption.py` | adoption |
| `manual` | `collectors/manual.py` | impact, governance, targets |

`build_dataset.py` orchestrates collectors, builds metric sections, assembles `source_status`, and validates against schema v5.

## Credential resolution

Documented env var pattern (recommended for all setups):

- `GITHUB_TOKEN_<SUFFIX>` where suffix = `project.id.upper().replace("-", "_")`
- `GOATCOUNTER_API_KEY_<SUFFIX>` with the same suffix rule

Collectors read credentials via `credentials.py`. Deploy workflows declare secrets explicitly in workflow YAML (GitHub Actions requirement).

## CI and release

Three npm commands cover all automation:

| Command | Steps | Used by |
| --- | --- | --- |
| `npm run test` | Shell lint, workflow validation, YAML validation, ruff, pytest, frontend tests | Fast feedback (`CI_MODE=test`) |
| `npm run build:site` | build-index → vite build → test:build | Deploy, PR preview, report, local Pages preview |
| `npm run ci` | test + build:site | `test.yml`, pre-push hook |

```text
PR / push ──► test.yml ──► npm run ci
                              │
main / cron ──► refresh-deploy.yml ──► npm run build:site ──► gh-pages
PR open     ──► pr-preview.yml     ──► npm run build:site ──► pr-preview/
report cron ──► generate-report.yml ──► npm run build:site ──► PDF
```

Deploy and preview workflows do **not** re-run pytest or lint. Branch protection on `test.yml` is the quality gate.

- **Contributor / CI build:** `PROJECT_CONFIG=projects/example.yml`, no secrets
- **Production deploy:** `vars.PROJECT_CONFIG` (typically `projects/mole.yml`) + explicit secrets in workflow YAML
- **PR preview:** hardcoded `projects/example.yml`, no project secrets

Implementation: `scripts/ci-check.sh` with `CI_MODE=test|build|all`.

## Base path (`VITE_BASE_PATH`)

GitHub Pages serves at `https://<user>.github.io/<repo-name>/`. Vite `base` is set from:

- `VITE_BASE_PATH` env var when explicitly set
- `GITHUB_REPOSITORY` in Actions
- `/` for `npm run dev`

Advanced override for custom domains or PR preview paths: set `VITE_BASE_PATH` before build. Not needed for normal local dev.

## `PROJECT_CONFIG`

Selects which project YAML `npm run build:site` builds. Defaults to `projects/example.yml` in `ci-check.sh`.

| Context | Value |
| --- | --- |
| CI / contributors | `projects/example.yml` (default) |
| Production deploy | GitHub repo variable `PROJECT_CONFIG` |
| PR preview | `projects/example.yml` (fixed in workflow) |
| RTD tracker | `PROJECT_CONFIG` env or `projects/mole.yml` in `generate-rtd-goatcounter.mjs` |

Local convenience scripts accept a project path as a CLI argument and export `PROJECT_CONFIG`.

## Dataset semantics

- **`--safe-project`**: restricts project paths to `projects/` directory
- **Unavailable sources**: shown as unavailable on Settings; dashboard does not fabricate zero values
- **`source_status`**: per-source availability, errors, and limitations in every dataset
- **Snapshots**: optional `metrics-history.json` on gh-pages for trend data

## Schema and validation

- Dashboard JSON schema version in `schema.py` (currently v5)
- `validate-project` CLI checks YAML config
- `validate_dashboard_dataset` runs after every build

## Extension points

To add a new data source:

1. Add collector under `src/oss_impact_dashboard/collectors/`
2. Register source in project config schema (`config.py`)
3. Wire into `build_dataset.py` with `_try_source`
4. Add metric builder if needed under `metrics/`
5. Register UI section in `web/src/registry.js` if new visualization required

## Key scripts

| Entry point | Purpose |
| --- | --- |
| `npm run test` | Quality gate (lint + tests) |
| `npm run build:site` | Production artifact build |
| `npm run ci` | Full check (test + build) |
| `scripts/ci-check.sh` | Implements `CI_MODE=test\|build\|all` |
| `scripts/dev-local.sh` | Bootstrap + `build:site` + `npm run dev` |
| `scripts/local-preview.sh` | `build:site` + `preview:pages` |
| `scripts/generate-rtd-goatcounter.mjs` | RTD tracker for GoatCounter events |

## Python CLI

```bash
python -m oss_impact_dashboard.cli build --project projects/example.yml --output ...
python -m oss_impact_dashboard.cli build-index --projects projects/example.yml --output-dir ...
python -m oss_impact_dashboard.cli validate-project --project projects/example.yml
python -m oss_impact_dashboard.cli doctor --project projects/example.yml
python -m oss_impact_dashboard.cli project-info --project projects/mole.yml --field snapshot_history
```
