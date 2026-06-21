# GoatCounter Activation Checklist

Checklist copied from `temp/plan2.md`. Items are checked only for code-controlled work implemented and covered by tests in this pass. Post-merge account actions remain unchecked.

## Phase 1 - Preserve Current Work

- [x] Inspect the current branch and PR changes.
- [x] Run the existing test suite before modifications.
- [x] Preserve GitHub engagement, traffic and Actions collectors.
- [x] Preserve snapshot persistence.
- [x] Preserve GitHub Pages production and PR-preview deployment.
- [x] Preserve PDF generation and publication.
- [x] Preserve the Read the Docs CSV collector as an optional fallback.
- [x] Confirm no existing secret is present in tracked files or generated assets.
- [x] Remove any incomplete Umami-specific code, configuration or documentation.

Evidence: baseline `python -m pytest` passed 27 tests before edits; baseline `npm run test:e2e` passed. `rg` found no Umami implementation outside the plan. `.gitignore` now excludes `.env` and `.env.*` while preserving `.env.example`.

## Phase 2 - Development Project Configuration

- [x] Create `projects/dev.yml`.
- [x] Add `project.environment` to the configuration model.
- [x] Support `development`, `staging` and `production`.
- [x] Default to `production` when omitted.
- [x] Include environment in generated dataset metadata.
- [x] Validate invalid environment values.
- [x] Keep `projects/mole.yml` production-oriented.
- [x] Add configuration tests.
- [x] No Python or JavaScript changes may be required when switching project files.

Evidence: `projects/dev.yml`; `src/oss_impact_dashboard/config.py`; `tests/test_config_dataset.py`; `python -m pytest`.

## Phase 3 - Development Banner

- [x] Show on Overview.
- [x] Show on Operations.
- [x] Show on Impact.
- [x] Show on Report.
- [x] Include in the PDF/print report.
- [x] Hide in production.
- [x] Add accessibility and frontend tests.

Evidence: `web/src/app.js::renderEnvironmentBanner`; `web/src/styles.css`; `web/tests/smoke.mjs`; `npm run test:frontend`.

## Phase 4 - Project Config Selection

- [x] Scheduled runs use the repository variable.
- [x] Main pushes use the repository variable.
- [x] Manual runs may override it.
- [x] Reject path traversal.
- [x] Restrict values to files inside `projects/`.
- [x] Validate the selected file exists.
- [x] Apply the same config to data, snapshot and report generation.
- [x] Document local selection using `PROJECT_CONFIG`.

Evidence: `.github/workflows/refresh-deploy.yml`; `.github/workflows/generate-report.yml`; `src/oss_impact_dashboard/config.py::validate_project_path`; `src/oss_impact_dashboard/cli.py`; `web/tests/deployment.mjs`; `README.md`.

## Phase 5 - GoatCounter Configuration

- [x] API key comes only from the environment.
- [x] Validate site URL as HTTPS.
- [x] Normalize the URL without a trailing slash.
- [x] Validate the tracked value as a hostname, not a full URL.
- [x] Never serialize the API key.
- [x] Never print the API key.
- [x] Never include it in frontend assets.
- [x] Missing configuration returns an explicit unavailable source state.
- [x] Add malformed/missing configuration tests.

Evidence: `src/oss_impact_dashboard/collectors/goatcounter.py`; `tests/test_goatcounter.py`; `web/tests/security.mjs`.

## Phase 6 - GoatCounter Collector

- [x] Create `src/oss_impact_dashboard/collectors/goatcounter.py`.
- [x] Use `Authorization: Bearer <GOATCOUNTER_API_KEY>`.
- [x] Use `Content-Type: application/json`.
- [x] Use `GET /api/v0/stats/total`.
- [x] Use `GET /api/v0/stats/hits`.
- [x] Use `GET /api/v0/stats/toprefs`.
- [x] Timeout between 15 and 30 seconds.
- [x] Maximum three normal API requests.
- [x] Bounded retry for 429 and temporary 5xx failures.
- [x] Handle 400, 401, 403, 429 and 5xx.
- [x] Read rate-limit response headers when available.
- [x] Validate JSON response shapes.
- [x] Do not fail other dashboard sources when GoatCounter fails.
- [x] Return requests used.
- [x] Return collection timestamp.
- [x] Never include request headers or tokens in exceptions.
- [x] Add fixture tests for every response type.

Evidence: `src/oss_impact_dashboard/collectors/goatcounter.py`; `src/oss_impact_dashboard/build_dataset.py`; `tests/test_goatcounter.py`; `tests/test_config_dataset.py`.

## Phase 7 - Simple Event Model

- [x] Separate normal paths and events.
- [x] Sum search counts.
- [x] Sum no-result counts.
- [x] Sum all 404 events.
- [x] Produce a sorted missing-path list.
- [x] Exclude event paths from popular documentation pages.
- [x] Add fixture tests.

Evidence: `src/oss_impact_dashboard/collectors/goatcounter.py::parse_hits`; `tests/test_goatcounter.py::test_goatcounter_response_parsing`.

## Phase 8 - Dataset Contract

- [x] Add `documentation_analytics`.
- [x] Increment the dataset schema version.
- [x] Validate all new fields.
- [x] Distinguish unavailable from valid zero values.
- [x] Include source provenance.
- [x] Include reporting period.
- [x] Preserve the RTD CSV collector as an optional fallback.
- [x] Do not merge CSV and GoatCounter counts silently.
- [x] Explicitly identify the provider used.
- [x] Add schema tests.
- [x] GoatCounter configured and available -> use GoatCounter.
- [x] GoatCounter unavailable and RTD CSV configured -> use RTD CSV with explicit fallback status.
- [x] Neither available -> unavailable.

Evidence: `src/oss_impact_dashboard/schema.py`; `src/oss_impact_dashboard/build_dataset.py`; `tests/test_config_dataset.py`; `tests/test_goatcounter.py`.

## Phase 9 - Generate RTD Tracking Script

- [x] Create `scripts/generate-rtd-goatcounter.mjs`.
- [x] Generate `web/public/rtd-goatcounter.js`.
- [x] Read only `GOATCOUNTER_SITE_URL`.
- [x] Read only `GOATCOUNTER_TRACKED_DOMAIN`.
- [x] Do not read `GOATCOUNTER_API_KEY`.
- [x] Confirm `location.hostname` equals the tracked domain.
- [x] Load `https://gc.zgo.at/count.js`.
- [x] Set `data-goatcounter="<GOATCOUNTER_SITE_URL>/count"`.
- [x] Allow GoatCounter to send its automatic pageview.
- [x] Never send a duplicate manual pageview.
- [x] Remain disabled/no-op when public configuration is absent.
- [x] Never throw an error when disabled.
- [x] Be included in the final `dist/`.
- [x] Contain no secret.
- [x] Add build and security tests.

Evidence: `scripts/generate-rtd-goatcounter.mjs`; `web/public/rtd-goatcounter.js`; `web/tests/rtd-goatcounter.mjs`; `web/tests/postbuild.mjs`; `web/tests/security.mjs`.

## Phase 10 - Track Only Three Documentation Events

- [x] On a documentation search-form submission, send `event:documentation-search`.
- [x] Do not send the query value.
- [x] When a search-results page clearly reports no results, send `event:documentation-search-no-results`.
- [x] For a page-not-found page, normalize the pathname and send `event:documentation-404:<normalized-path>`.
- [x] 404 pathname only.
- [x] 404 remove query strings.
- [x] 404 remove fragments.
- [x] 404 collapse repeated slashes.
- [x] 404 limit to 160 characters.
- [x] 404 reject control characters.
- [x] Work with common Sphinx/RTD search forms.
- [x] Support common MkDocs search forms where practical.
- [x] Detect common no-results markup and text.
- [x] Detect common 404/page-not-found markup and titles.
- [x] Wait safely for asynchronously loaded GoatCounter.
- [x] Prevent duplicate listeners.
- [x] Prevent duplicate events.
- [x] Work when loaded asynchronously by RTD Custom Script.
- [x] Add browser/DOM fixture tests.
- [x] Never collect search text, email addresses or form contents.

Evidence: `scripts/generate-rtd-goatcounter.mjs`; `web/tests/rtd-goatcounter.mjs`.

## Phase 11 - Minimal UI Integration

- [x] Overview documentation visitors.
- [x] Overview search events.
- [x] Overview no-result searches.
- [x] Overview documentation 404s.
- [x] Overview provider.
- [x] Overview last collection time.
- [x] Impact visitor trend chart.
- [x] Impact popular documentation pages.
- [x] Impact top referrers.
- [x] Impact search-event count.
- [x] Impact no-result-search count.
- [x] Impact missing-page list.
- [x] Impact reporting period.
- [x] Impact provider and limitations.
- [x] Report documentation reach summary.
- [x] Report popular pages.
- [x] Report search/no-result counts.
- [x] Report missing documentation pages.
- [x] Report provider, reporting period and limitations.
- [x] Report development disclaimer.
- [x] Explicit unavailable state.
- [x] No misleading zero when unavailable.
- [x] Escape all strings.
- [x] Validate links.
- [x] Mobile-safe layout.
- [x] Print/PDF-safe layout.
- [x] Accessible chart alternative.
- [x] Frontend tests.

Evidence: `web/src/app.js`; `web/src/styles.css`; `web/tests/security.mjs`; `web/tests/smoke.mjs`; `npm run test:frontend`.

## Phase 12 - Workflow Integration

- [x] Protected main workflows receive `OSS_DASHBOARD_GITHUB_TOKEN`.
- [x] Protected main workflows receive `GOATCOUNTER_API_KEY`.
- [x] Protected main workflows receive `GOATCOUNTER_SITE_URL`.
- [x] Protected main workflows receive `GOATCOUNTER_TRACKED_DOMAIN`.
- [x] Use `vars.PROJECT_CONFIG`.
- [x] Pass GitHub token only to server-side data collection.
- [x] Pass GoatCounter API key only to server-side data collection.
- [x] Pass only public GoatCounter values to the tracker generator.
- [x] Generate `rtd-goatcounter.js` before building.
- [x] Do not expose either secret to PR-preview workflows.
- [x] PR previews use fixtures or the checked-in sanitized dataset.
- [x] Main/scheduled deployment collects live data.
- [x] Preserve preview directories.
- [x] Preserve snapshot history.
- [x] Preserve published PDF.
- [x] Include new collector/script paths in workflow triggers.

Evidence: `.github/workflows/refresh-deploy.yml`; `.github/workflows/generate-report.yml`; `.github/workflows/pr-preview.yml`; `web/tests/deployment.mjs`.

## Phase 13 - Diagnostics

- [x] Add `python -m oss_impact_dashboard.cli doctor --project projects/dev.yml`.
- [x] Report only Project config valid/invalid.
- [x] Report only GitHub token configured/missing.
- [x] Report only GitHub collection available/error.
- [x] Report only GitHub traffic available/error.
- [x] Report only GitHub Actions available/error.
- [x] Report only GoatCounter site URL valid/invalid.
- [x] Report only GoatCounter tracked domain valid/invalid.
- [x] Report only GoatCounter API key configured/missing.
- [x] Report only GoatCounter API available/error.
- [x] Report only RTD tracker active/disabled.
- [x] Never print secret values.
- [x] Never print Authorization headers.
- [x] Exit non-zero when an enabled required source fails.
- [x] Add fixture tests.
- [x] Add manual workflow `integration diagnostics`.
- [x] Workflow runs only through `workflow_dispatch`.
- [x] Workflow runs from `main`.
- [x] Workflow receives required secret and variables.
- [x] Workflow runs the doctor command.
- [x] Workflow never deploys.
- [x] Workflow never exposes credentials.

Evidence: `src/oss_impact_dashboard/cli.py`; `.github/workflows/integration-diagnostics.yml`; `tests/test_goatcounter.py`; `web/tests/deployment.mjs`.

## Phase 14 - Snapshots

- [x] Use `metrics-history-dev.json`.
- [x] Keep development and production histories separate.
- [x] Include environment and project ID in snapshot identity.
- [x] Snapshot documentation visitor count and event counts.
- [x] Preserve same-day deduplication.
- [x] Add trend tests.
- [x] Do not mix sandbox metrics with CSRC metrics.

Evidence: `projects/dev.yml`; `src/oss_impact_dashboard/snapshots.py`; `tests/test_optional_collectors.py`; `.github/workflows/refresh-deploy.yml`.

## Phase 15 - Portability

- [x] Do not hard-code `pritkc` in source code.
- [x] Do not hard-code `csrc-sdsu` in source code.
- [x] Do not hard-code `pritkc/mole` in source code.
- [x] Do not hard-code `csrc-sdsu/mole` in source code.
- [x] Do not hard-code `oss-impact-dashboard-dev` in source code.
- [x] Do not hard-code `pritkc-mole-sandbox.readthedocs.io` in source code.
- [x] Do not hard-code `YOUR-CODE.goatcounter.com` in source code.
- [x] Allow project-specific values only in project YAML, tests/fixtures, docs examples and GitHub repository variables.
- [x] Prove moving to `csrc-sdsu/mole` requires no collector or UI changes.

Evidence: project-specific values are in `projects/*.yml`, tests, README examples, or workflow variable references. Collectors and UI read `project.repository` and provider config from the dataset.

## Phase 16 - Tests

- [x] `python -m pip install -e ".[dev,report]"`.
- [x] `python -m pytest`.
- [x] `python -m ruff check .`.
- [x] `npm ci`.
- [x] `npm run build:pages`.
- [x] `npm run test:build`.
- [x] `npm run test:frontend`.
- [x] `npm run test:e2e`.
- [x] `git diff --check`.
- [x] Development/production environment handling.
- [x] GoatCounter API authorization.
- [x] API URL construction.
- [x] Date-range formatting.
- [x] Total response parsing.
- [x] Hits response parsing.
- [x] Daily trend parsing.
- [x] Top referrer parsing.
- [x] Event separation.
- [x] Search count.
- [x] No-result count.
- [x] 404 grouping.
- [x] 400/401/403/429/5xx handling.
- [x] Missing configuration.
- [x] Malformed response.
- [x] Request limit.
- [x] No secret leakage.
- [x] Disabled tracker.
- [x] Active tracker.
- [x] Domain restriction.
- [x] No duplicate pageview.
- [x] Search event.
- [x] No-result event.
- [x] 404 event.
- [x] Duplicate-event prevention.
- [x] Production base path.
- [x] PR-preview base path.
- [x] PDF/print rendering.
- [x] Snapshot environment isolation.
- [x] Doctor command.

Evidence: final verification commands in this file and terminal run history; `tests/test_goatcounter.py`; `tests/test_config_dataset.py`; `tests/test_optional_collectors.py`; `web/tests/rtd-goatcounter.mjs`; `web/tests/deployment.mjs`; `web/tests/pdf-publish.mjs`.

## Phase 17 - Documentation and Activation Checklist

- [x] Document development sandbox structure.
- [x] Document required GitHub secret.
- [x] Document required GitHub variables.
- [x] Document GoatCounter account setup.
- [x] Document API test command.
- [x] Document RTD Custom Script setup.
- [x] Document generated script URL.
- [x] Document tracked event names.
- [x] Document privacy decision not to collect search queries.
- [x] Document doctor command.
- [x] Document snapshot behavior.
- [x] Document PR-preview secret policy.
- [x] Document RTD CSV fallback.
- [x] Document exact CSRC migration steps.
- [x] Document secret rotation and disabling analytics.
- [ ] Post-merge: create/select hosted GoatCounter site.
- [ ] Post-merge: add `GOATCOUNTER_API_KEY` secret.
- [ ] Post-merge: add `GOATCOUNTER_SITE_URL` variable.
- [ ] Post-merge: add `GOATCOUNTER_TRACKED_DOMAIN` variable.
- [ ] Post-merge: set or confirm `PROJECT_CONFIG`.
- [ ] Post-merge: run `integration diagnostics` from `main`.
- [ ] Post-merge: add deployed `rtd-goatcounter.js` URL to Read the Docs Custom Script settings.
- [ ] Post-merge: confirm live GoatCounter pageviews and fixed events.

Evidence: `README.md`; this checklist.
