# Architecture

System design reference for developers and AI tools working on this repository.

## Pipeline

```text
projects/*.yml          per-project configuration
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

1. `oss_impact_dashboard.cli build-index` reads project configs (default: all `projects/*.yml`) and writes JSON datasets.
2. `npm run build:data` fetches data; `npm run build:ui` rebuilds from cached JSON; `npm run build:site` runs the full pipeline.
3. GitHub Actions deploy workflows run `npm run build:site -- --projects …` then publish `dist/` to `gh-pages`.
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
| `scripts/` | CI, preview, deploy helpers |
| `.github/workflows/` | Test, deploy, report, preview, diagnostics |

## Frontend pages

Three HTML entry points share one JavaScript bundle, selected by `body[data-page]`:

| Page | File | Purpose |
| --- | --- | --- |
| Dashboard | `web/index.html` | Overview, Operations, Growth sections |
| Settings | `web/settings.html` | Source status, metric definitions, security scorecard |
| Report | `web/report.html` | Printable growth report |

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
```

Optional fields `name`, `documentation_url`, and `citation_url` can be omitted when GitHub repository metadata provides them at build time.

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
| `package_adoption` | `collectors/package_adoption.py` | adoption (optional; disabled for MOLE) |

`build_dataset.py` orchestrates collectors, builds metric sections, assembles `source_status`, and validates against schema v5. Manual narrative YAML and growth targets are not part of the default pipeline.

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
| `npm run build:data` | `build-index` (fetch) | Local dev, deploy data step |
| `npm run build:ui` | `build-index --from-cache` + vite build | Fast UI iteration |
| `npm run build:site` | `build:data` + vite build + test:build | Deploy, PR preview, local Pages preview |
| `npm run ci` | test + build example project | `test.yml`, pre-push hook |

```text
PR / push ──► test.yml ──► npm run ci
                              │
main / cron ──► refresh-deploy.yml ──► npm run build:site -- --projects projects/mole.yml ──► gh-pages
PR open     ──► pr-preview.yml     ──► npm run build:site -- --projects projects/example.yml ──► pr-preview/
report cron ──► generate-report.yml ──► npm run build:site -- --projects projects/mole.yml ──► PDF
```

Deploy and preview workflows do **not** re-run pytest or lint. Branch protection on `test.yml` is the quality gate.

- **Contributor / CI build:** `projects/example.yml` only via `ci-check.sh`, no secrets
- **Production deploy:** `npm run build:site -- --projects projects/mole.yml` + explicit secrets in workflow YAML
- **PR preview:** `projects/example.yml`, no project secrets
- **Local dev default:** all `projects/*.yml`; pass `--projects` to limit

Implementation: `scripts/ci-check.sh` with `CI_MODE=test|build|all`; project discovery in `config.discover_project_paths()`.

## Base path (`VITE_BASE_PATH`)

GitHub Pages serves at `https://<user>.github.io/<repo-name>/`. Vite `base` is set from:

- `VITE_BASE_PATH` env var when explicitly set
- `GITHUB_REPOSITORY` in Actions
- `/` for `npm run dev`

Advanced override for custom domains or PR preview paths: set `VITE_BASE_PATH` before build. Not needed for normal local dev.

## Build project selection

`build-index` defaults to every `projects/*.yml`. Pass `--projects` to limit:

```bash
npm run build:data -- --projects projects/mole.yml projects/mole-local.yml --default-project mole-local
npm run build:ui -- --projects projects/mole.yml projects/mole-local.yml
```

`--from-cache` (used by `npm run build:ui`) rebuilds `projects.json` and `dashboard.json` from existing per-project JSON without calling collectors.

The RTD tracker script reads `default_project` from `web/public/data/projects.json` after a build.

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
| `npm run build:data` | Fetch datasets (all projects by default) |
| `npm run build:ui` | Vite build from cached JSON |
| `npm run build:site` | Full production artifact build |
| `npm run ci` | Full check (test + build example) |
| `scripts/build.sh` | `data` / `ui` / `site` modes; forwards `--projects` to build-index |
| `scripts/ci-check.sh` | Implements `CI_MODE=test\|build\|all` |
| `scripts/dev-local.sh` | Bootstrap + `build:ui` or `--fetch` + `npm run dev` |
| `scripts/local-preview.sh` | `build:site` + `preview:pages` |
| `scripts/completion.bash` | Optional tab completion for `--projects` |
| `scripts/generate-rtd-goatcounter.mjs` | RTD tracker for GoatCounter events |

## Python CLI

```bash
python -m oss_impact_dashboard.cli build-index --safe-project
python -m oss_impact_dashboard.cli build-index --projects projects/example.yml --safe-project
python -m oss_impact_dashboard.cli build-index --from-cache --safe-project
python -m oss_impact_dashboard.cli list-projects
python -m oss_impact_dashboard.cli validate-project --project projects/example.yml
python -m oss_impact_dashboard.cli doctor --project projects/example.yml
python -m oss_impact_dashboard.cli project-info --project projects/mole.yml --field snapshot_history
```
