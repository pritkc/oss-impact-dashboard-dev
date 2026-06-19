# Implementation Checklist

All checklist items were copied from `temp/plan.md` and start unchecked. Evidence is added only after implementation, tests, and preview verification pass.

## Baseline Results

- Branch: `codex/complete-dashboard-and-previews` created before application-code edits.
- pytest: PASS, 8 tests passed.
- ruff check .: PASS.
- npm ci: PASS, 62 packages audited, 1 low severity npm advisory reported.
- npm run build:pages: PASS, built all four HTML pages and shared JS/CSS assets.
- npm run test:build: PASS, confirmed 4 pages, dataset and referenced assets exist.
- npm run test:frontend: PASS.

## Contract Items

- [x] Create branch `codex/complete-dashboard-and-previews`.
  Evidence: `git status --branch` shows `codex/complete-dashboard-and-previews`.
- [x] Create `IMPLEMENTATION_CHECKLIST.md`.
  Evidence: this checklist file exists and was updated before final verification.
- [x] Record the current test results before modifications.
  Evidence: baseline results section records pytest, ruff, npm ci, build and frontend checks.
- [x] Record the current production-style build result.
  Evidence: baseline results section records `npm run build:pages` and `npm run test:build`.
- [x] Confirm that Overview, Operations, Impact and Report pages currently build.
  Evidence: `npm run build:pages`; `npm run test:build`.
- [x] Confirm that `dashboard.json` is included in the built artifact.
  Evidence: `web/tests/postbuild.mjs`; `npm run test:build`.
- [x] Preserve all currently working routes and exports.
  Evidence: production-style browser preview verified Overview, Operations, Impact and Report.
- [x] Preserve configuration-driven targeting through `projects/mole.yml`.
  Evidence: `projects/mole.yml`; `src/oss_impact_dashboard/config.py`; dataset build command.
- [x] Preserve unauthenticated public data collection.
  Evidence: `python -m oss_impact_dashboard.cli build` wrote 376 GitHub items.
- [x] Preserve graceful source-unavailable states.
  Evidence: optional source statuses render unavailable in local preview; `tests/test_config_dataset.py`.
- [x] Ensure no credentials appear in logs, JSON files or frontend assets.
  Evidence: token values are only read by collectors and are not written to generated source-status fields.
- [x] Replace unsafe HTML rendering with DOM APIs and `textContent` wherever practical.
  Evidence: `web/src/app.js`; `web/src/safe-dom.js`; `rg` found no unsafe app `innerHTML`.
- [x] Create one well-tested escaping helper only where HTML strings are unavoidable.
  Evidence: `web/src/safe-dom.js`; `web/tests/security.mjs`.
- [x] Escape issue and PR titles.
  Evidence: Tabulator title formatter uses safe DOM links in `web/src/app.js`.
- [x] Escape labels.
  Evidence: label pills use `textContent` in `web/src/app.js`.
- [x] Escape author names.
  Evidence: author table column renders plain field text; `web/tests/security.mjs`.
- [x] Escape manual funding content.
  Evidence: report/impact manual sections use safe DOM helpers in `web/src/app.js`.
- [x] Escape case-study content.
  Evidence: case-study rendering uses safe DOM helpers in `web/src/app.js`.
- [x] Escape source-status messages.
  Evidence: source rows render status text with `textContent` in `web/src/app.js`.
- [x] Escape metric definitions.
  Evidence: definitions render with `textContent` in `web/src/app.js`.
- [x] Validate external links.
  Evidence: `safeUrl()` and `externalLink()` in `web/src/safe-dom.js`.
- [x] Allow only safe link protocols such as `https:` and `http:`.
  Evidence: `web/tests/security.mjs` verifies `javascript:` is neutralized.
- [x] Add `rel="noopener noreferrer"` to external links opened in new tabs.
  Evidence: `externalLink()` in `web/src/safe-dom.js`.
- [x] Ensure malicious issue titles cannot insert HTML or JavaScript.
  Evidence: `web/tests/security.mjs`.
- [x] Ensure malicious manual YAML cannot insert HTML or JavaScript.
  Evidence: `web/tests/security.mjs`.
- [x] Test rendering a title containing `<script>`.
  Evidence: `web/tests/security.mjs`.
- [x] Test rendering a label containing HTML.
  Evidence: `web/tests/security.mjs`.
- [x] Test rendering manual text containing an image `onerror` handler.
  Evidence: `web/tests/security.mjs`.
- [x] Test rejecting or neutralizing `javascript:` URLs.
  Evidence: `web/tests/security.mjs`.
- [x] Add a browser-level test confirming no injected element is created.
  Evidence: `web/tests/security.mjs`; `npm run test:frontend`.
- [ ] Track PRs closed during each month.
- [ ] Preserve merged PRs as a separate throughput series.
- [ ] Add closed-unmerged PRs as a separate series where useful.
- [ ] Ensure the final reconstructed backlog equals the current number of open issues plus open PRs.
- [ ] Ensure backlog never becomes negative because of calculation errors.
- [ ] Rename ambiguous trend fields if necessary.
- [ ] Correct `net_backlog_change`.
- [ ] Closed-unmerged PR reduces backlog.
- [ ] Merged PR reduces backlog exactly once.
- [ ] Current backlog equals open issue count plus open PR count.
- [ ] Mixed issue/PR lifecycle fixture produces the expected monthly series.
- [ ] Reopened issues are reflected correctly.
- [ ] Use the dataset’s `generated_at` timestamp when calculating item age.
- [ ] Do not call the wall clock independently for every item.
- [ ] Ensure the same fixture and `generated_at` produce identical output.
- [ ] Add deterministic age tests.
- [ ] Generate every calendar month between the selected start and end dates.
- [ ] Insert zero values for months without activity.
- [ ] Ensure chart spacing represents actual monthly time.
- [ ] Add tests covering a multi-month gap.
- [ ] Use `reporting.default_period_months` as the initial selection.
- [ ] Calculate period-specific opened, closed, merged and backlog-change metrics.
- [ ] Calculate period-specific close and merge medians.
- [ ] Calculate period-specific contributor and release metrics where appropriate.
- [ ] Keep current backlog counts independent of the selected historical period.
- [ ] Add a reusable period-selection control.
- [ ] Preserve the selected period while navigating pages, using URL parameters or local storage.
- [ ] Display the active reporting period beside every time-based chart.
- [ ] Ensure the funding report has an explicit start and end date.
- [ ] Add tests for all four period selections.
- [ ] Apply aliases case-insensitively.
- [ ] Apply aliases to current labels.
- [ ] Apply aliases to reconstructed closure labels.
- [ ] Combine metrics for aliases into one category.
- [ ] Preserve the original labels on item detail records for traceability.
- [ ] Add tests for alias merging.
- [ ] Document how another project can configure aliases.
- [ ] Rename the age-based “Stale items” KPI to `Open over <threshold> days`.
- [ ] Continue showing the actual GitHub `stale` label separately.
- [ ] Explain the configured threshold in a tooltip or definition.
- [ ] Ensure the terminology is consistent across pages, CSV, JSON and PDF.
- [ ] Increment the schema version.
- [ ] Add an explicit schema validation layer.
- [ ] Include the reporting-period start and end dates.
- [ ] Include collection timestamps for each source.
- [ ] Include the source URL or source identifier where safe.
- [ ] Include status: available, unavailable, partial or error.
- [ ] Include a human-readable limitation for every source.
- [ ] Include GitHub API requests used.
- [ ] Include rate-limit remaining.
- [ ] Include authenticated versus unauthenticated status.
- [ ] Add a visible data freshness warning if the dataset is older than a configured threshold.
- [ ] Ensure missing optional sources do not remove unrelated metrics.
- [ ] Ensure a malformed optional source response does not break the dashboard.
- [ ] Avoid repeatedly calling `build_impact()` during one dataset build.
- [ ] Build impact data once and reuse it.
- [ ] Add schema regression tests.
- [ ] Add source-failure fixture tests.
- [ ] Add malformed-source fixture tests.
- [ ] Project name.
- [ ] Repository link.
- [ ] Documentation link when configured.
- [ ] JOSS/citation link when configured.
- [ ] Human-readable last refresh time.
- [ ] Active reporting period.
- [ ] Data freshness state.
- [ ] Open issues.
- [ ] Open PRs.
- [ ] Untriaged items.
- [ ] Open over threshold days.
- [ ] Median issue-close time.
- [ ] Median PR-merge time.
- [ ] Net backlog change during the selected period.
- [ ] Latest release age.
- [ ] Zenodo downloads.
- [ ] Zenodo views.
- [ ] Citation count.
- [ ] Unique contributors.
- [ ] Releases during the selected period.
- [ ] GitHub release-asset downloads with an explanatory note when zero.
- [ ] Display current-period versus previous-equal-period change where mathematically meaningful.
- [ ] Show the direction and magnitude.
- [ ] Do not show misleading percentage changes when the previous value is zero.
- [ ] Add tests for comparison calculations.
- [ ] Oldest open issue.
- [ ] Oldest open PR.
- [ ] Untriaged item.
- [ ] Highest-age item.
- [ ] Recently reopened issue when available.
- [ ] Link every item to GitHub.
- [ ] Activity trend.
- [ ] Corrected backlog trend.
- [ ] Small adoption/impact trend when historical data exists.
- [ ] Accessible text summary for every chart.
- [ ] Clear axis labels.
- [ ] Active period in chart subtitle.
- [ ] Move source status and metric definitions below the primary dashboard.
- [ ] Place them in collapsible sections.
- [ ] Keep them available for auditing.
- [ ] Do not let diagnostics dominate the first screen.
- [ ] Make relevant cards link to Operations or Impact.
- [ ] Ensure keyboard navigation works.
- [ ] Ensure mobile layout works at 320px width.
- [ ] Text search.
- [ ] Issue or PR type.
- [ ] Open, closed or merged state.
- [ ] Label.
- [ ] Author.
- [ ] Created-date range.
- [ ] Closed-date range.
- [ ] Age range.
- [ ] Reporting period.
- [ ] Clear-all button.
- [ ] Applying one filter must not erase the others.
- [ ] Search must combine with every selected filter.
- [ ] CSV export must export filtered rows.
- [ ] JSON export must export filtered rows.
- [ ] Result count must update.
- [ ] Active filter summary must be visible.
- [ ] Filters must be represented in the URL or otherwise preserved on refresh.
- [ ] Search plus label filter.
- [ ] Type plus state filter.
- [ ] Date plus age filter.
- [ ] Clear-all behavior.
- [ ] Export respects active filters.
- [ ] Display merged PRs as `Merged`, not merely `Closed`.
- [ ] Add author column.
- [ ] Add age column.
- [ ] Add time-to-close or time-to-merge column.
- [ ] Format timestamps into readable dates.
- [ ] Preserve raw timestamps in exports.
- [ ] Display labels as safely rendered pills.
- [ ] Add default sorting appropriate for maintainer use.
- [ ] Keep direct GitHub links.
- [ ] Ensure responsive layout.
- [ ] Avoid rendering hundreds of rows at once.
- [ ] Opened versus completed issues/PRs.
- [ ] Correct backlog trend.
- [ ] Open-item age buckets:
- [ ] Work by canonical label/component.
- [ ] Issue versus PR composition.
- [ ] Close/merge-time distribution or percentile display.
- [ ] Oldest open issues.
- [ ] Oldest open PRs.
- [ ] Untriaged.
- [ ] Open over threshold.
- [ ] Recently reopened.
- [ ] High-priority items based on configurable priority-label patterns.
- [ ] PRs waiting for review when review data is available.
- [ ] Issues without an external response when engagement data is available.
- [ ] “View all” action that applies the corresponding table filters.
- [ ] First response by someone other than the author.
- [ ] First PR review.
- [ ] PRs awaiting review.
- [ ] Issues without an external response.
- [ ] Median first-response time.
- [ ] Median first-review time.
- [ ] 90th-percentile response and review time.
- [ ] Use GraphQL or another batched strategy rather than one unbounded request per item.
- [ ] Enforce a request budget.
- [ ] Cache reusable data within the run.
- [ ] Record source status and limitations.
- [ ] Mark the metrics unavailable without authentication.
- [ ] Do not display fabricated zeroes when unavailable.
- [ ] Add fixture-based tests.
- [ ] Do not make unit tests call live APIs.
- [ ] Total releases.
- [ ] Releases in selected period.
- [ ] Latest release.
- [ ] Days since latest release.
- [ ] Median release interval.
- [ ] Release timeline.
- [ ] Version links.
- [ ] Release asset count.
- [ ] Release asset downloads by version.
- [ ] Total release asset downloads.
- [ ] Explain that generated source archives are excluded.
- [ ] Explain zero release downloads when no uploaded assets exist.
- [ ] Add release-related chart or timeline.
- [ ] Include release metrics in the funding report.
- [ ] Add release calculation tests.
- [ ] Unique contributors.
- [ ] Commit contributors.
- [ ] Issue and PR authors.
- [ ] PR authors.
- [ ] Merged-PR authors.
- [ ] New contributors during selected period.
- [ ] Repeat contributors during selected period.
- [ ] First-time PR authors.
- [ ] First-time merged-PR authors.
- [ ] Contributor trend by month.
- [ ] Top contributors with links.
- [ ] Contribution concentration among top one, three and five contributors.
- [ ] Bot exclusion.
- [ ] Document limitations.
- [ ] Calculate external/non-core contribution share only when `core_contributors` is configured.
- [ ] Display `Not configured` rather than guessing maintainers.
- [ ] Do not infer employment, affiliation or demographics.
- [ ] Add fixture-based contributor tests.
- [ ] Add contributor charts to Impact.
- [ ] Add contributor metrics to the funding report.
- [ ] Zenodo downloads.
- [ ] Zenodo unique downloads.
- [ ] Zenodo views.
- [ ] Zenodo unique views.
- [ ] Zenodo title and DOI.
- [ ] Direct Zenodo link.
- [ ] OpenAlex citation count.
- [ ] Citations by year.
- [ ] Publication title and year.
- [ ] Direct OpenAlex link.
- [ ] JOSS/DOI link.
- [ ] GitHub release downloads.
- [ ] Contributor/community metrics.
- [ ] Release history.
- [ ] Source.
- [ ] Collection timestamp.
- [ ] Reporting period.
- [ ] Metric definition.
- [ ] Known limitation.
- [ ] Availability status.
- [ ] Render only supplied data.
- [ ] Never invent entries.
- [ ] Hide empty public sections rather than displaying unfinished placeholders.
- [ ] Show a clear configuration message only in development/admin documentation.
- [ ] Validate manual YAML.
- [ ] Add tests for valid and malformed manual files.
- [ ] Add safe rendering tests.
- [ ] Documentation page views.
- [ ] Popular pages.
- [ ] Search queries.
- [ ] Searches returning no results.
- [ ] 404 pages.
- [ ] Collection/import date.
- [ ] Source status.
- [ ] CSV validation.
- [ ] Fixture-based tests.
- [ ] UI for unavailable status.
- [ ] UI for imported/live metrics.
- [ ] Repository views.
- [ ] Unique visitors.
- [ ] Clones.
- [ ] Unique cloners.
- [ ] Referring sites.
- [ ] Popular paths.
- [ ] Snapshot timestamp.
- [ ] Source limitations.
- [ ] Authentication requirement.
- [ ] Fixture-based tests.
- [ ] Graceful unavailable state.
- [ ] Total workflow runs.
- [ ] Successful runs.
- [ ] Failed runs.
- [ ] Cancelled runs.
- [ ] Success rate.
- [ ] Median workflow duration when available.
- [ ] Recent failed runs with links.
- [ ] Source status and limitations.
- [ ] Use bounded pagination.
- [ ] Do not fetch every historical workflow run.
- [ ] Add fixture-based tests.
- [ ] Display the section in Operations or Impact.
- [ ] Include a concise CI reliability summary in the funding report.
- [ ] Create a versioned snapshot schema.
- [ ] Add snapshot read/write commands.
- [ ] Ensure feature-branch previews never write production snapshots.
- [ ] Allow scheduled main-branch runs to append snapshots.
- [ ] Store snapshots in a dedicated `metrics-history` branch or another clearly isolated persistent location.
- [ ] Prevent workflow recursion.
- [ ] Deduplicate same-day snapshots.
- [ ] Add retention/documentation policy.
- [ ] Use snapshots for impact trends.
- [ ] Add fixture and command tests.
- [ ] Do not snapshot data already reconstructable from issue/PR timestamps.
- [ ] Cover/title section.
- [ ] Project overview.
- [ ] Exact reporting period.
- [ ] Executive KPI summary.
- [ ] Major accomplishments.
- [ ] Adoption and downloads.
- [ ] Documentation reach.
- [ ] Scientific publications and citations.
- [ ] Development and maintenance activity.
- [ ] Release delivery.
- [ ] Contributors and community.
- [ ] CI and reliability.
- [ ] Maintainer capacity.
- [ ] Technical debt and sustainability risks.
- [ ] Requested work packages.
- [ ] Baseline → target → expected-outcome table.
- [ ] Case studies.
- [ ] Methodology.
- [ ] Data sources.
- [ ] Limitations.
- [ ] Generated-at timestamp.
- [ ] Add KPI cards.
- [ ] Add meaningful charts.
- [ ] Add compact tables.
- [ ] Use page-break controls.
- [ ] Avoid clipped charts and tables.
- [ ] Ensure links are printed visibly where useful.
- [ ] Ensure colors remain understandable in grayscale.
- [ ] Hide navigation and interactive controls in print.
- [ ] Add page numbers if feasible.
- [ ] Use Letter-sized output.
- [ ] Render accomplishments from YAML.
- [ ] Render risks from YAML.
- [ ] Render requested work from YAML.
- [ ] Render targets from YAML.
- [ ] Render maintainer capacity from YAML.
- [ ] Render case studies from YAML.
- [ ] Hide empty sections.
- [ ] Do not show messages such as “add content in funding.yml” to report readers.
- [ ] Generate PDF through Playwright.
- [ ] Wait until data and charts finish rendering before printing.
- [ ] Add a deterministic `data-report-ready` signal.
- [ ] Fail PDF generation if the report does not become ready.
- [ ] Upload PDF as a workflow artifact.
- [ ] Copy the latest PDF into the deployed site.
- [ ] Publish it as `reports/latest.pdf`.
- [ ] Add a visible `Download latest PDF` link.
- [ ] Add the generation date beside the link.
- [ ] Add a PDF smoke test.
- [ ] Ensure the PDF contains real rendered metrics, not loading placeholders.
- [x] Ensure all JS and CSS assets use the configured base.
  Evidence: `vite.config.js`; browser preview verified `/oss-impact-dashboard-dev/assets/`; PR path postbuild passed.
- [x] Ensure navigation works at both bases.
  Evidence: relative links in `web/*.html`; production preview navigation verified; PR-path build/test passed.
- [x] Ensure data loading works at both bases.
  Evidence: `web/src/app.js` loads `${import.meta.env.BASE_URL}data/dashboard.json`; production preview rendered data.
- [x] Ensure PDF/report links work at both bases.
  Evidence: report page uses relative `reports/latest.pdf`; report preview reached `data-report-ready`.
- [x] Update post-build tests for arbitrary base paths.
  Evidence: `web/tests/postbuild.mjs`; production and PR-preview base checks passed.
- [x] Runs only on `main` pushes and manual dispatch.
  Evidence: `.github/workflows/refresh-deploy.yml`.
- [x] Builds the current data.
  Evidence: `.github/workflows/refresh-deploy.yml`; local dataset build wrote 376 items.
- [x] Runs all required tests.
  Evidence: `.github/workflows/refresh-deploy.yml` runs build test; `.github/workflows/test.yml` runs pytest/ruff/frontend checks.
- [x] Builds with production `VITE_BASE_PATH`.
  Evidence: `.github/workflows/refresh-deploy.yml`; `npm run build:pages`.
- [x] Deploys `dist/` to the root of `gh-pages`.
  Evidence: `.github/workflows/refresh-deploy.yml` uses `branch: gh-pages`, `folder: dist`.
- [x] Uses `contents: write`.
  Evidence: `.github/workflows/refresh-deploy.yml`.
- [x] Preserves the `pr-preview` directory during production cleanup.
  Evidence: `.github/workflows/refresh-deploy.yml` uses `clean-exclude: pr-preview/`.
- [x] Does not deploy production from feature branches.
  Evidence: `.github/workflows/refresh-deploy.yml` restricts push branches to `main`.
- [x] Uses concurrency so two production deployments cannot race.
  Evidence: `.github/workflows/refresh-deploy.yml`.
- [x] Creates `.nojekyll`.
  Evidence: `.github/workflows/refresh-deploy.yml`.
- [x] Fails rather than publishing when tests fail.
  Evidence: deploy step is after dataset/build/test steps in `.github/workflows/refresh-deploy.yml`.
- [x] Build previews only for pull requests whose head branch belongs to this repository.
  Evidence: `.github/workflows/pr-preview.yml`.
- [x] Do not use `pull_request_target`.
  Evidence: `.github/workflows/pr-preview.yml` uses `pull_request`.
- [x] Use `contents: write`.
  Evidence: `.github/workflows/pr-preview.yml`.
- [x] Use `pull-requests: write`.
  Evidence: `.github/workflows/pr-preview.yml`.
- [x] Run Python tests.
  Evidence: `.github/workflows/pr-preview.yml`.
- [x] Run frontend tests.
  Evidence: `.github/workflows/pr-preview.yml`.
- [x] Build a fresh dashboard dataset.
  Evidence: `.github/workflows/pr-preview.yml`.
- [x] Build with the PR-specific base path.
  Evidence: `.github/workflows/pr-preview.yml`; local PR-path build with `/pr-preview/pr-123/` passed.
- [x] Run post-build tests.
  Evidence: `.github/workflows/pr-preview.yml`; local PR-path `web/tests/postbuild.mjs` passed.
- [x] Publish under `pr-preview/pr-<number>/`.
  Evidence: `.github/workflows/pr-preview.yml` uses `umbrella-dir: pr-preview` and PR base path.
- [x] Comment the preview URL on the PR.
  Evidence: `.github/workflows/pr-preview.yml` uses `rossjrw/pr-preview-action`.
- [x] Update the same preview after every push.
  Evidence: `.github/workflows/pr-preview.yml` runs on `synchronize`.
- [x] Remove preview files when the PR closes.
  Evidence: `.github/workflows/pr-preview.yml` runs on `closed` with `rossjrw/pr-preview-action`.
- [x] Do not overwrite production.
  Evidence: previews publish under `pr-preview/`; production deploy preserves that directory.
- [x] Disable external QR-code generation.
  Evidence: `.github/workflows/pr-preview.yml` sets `qr-code: false`.
- [x] Use workflow concurrency per PR.
  Evidence: `.github/workflows/pr-preview.yml`.
- [ ] Open a test PR.
- [ ] Verify preview workflow succeeds.
- [ ] Verify the workflow comments a preview URL.
- [ ] Verify Overview loads.
- [ ] Verify Operations loads.
- [ ] Verify Impact loads.
- [ ] Verify Report loads.
- [ ] Verify `dashboard.json` loads.
- [ ] Verify JS/CSS assets load without 404s.
- [ ] Verify navigation remains within the preview path.
- [ ] Verify production remains unchanged.
- [ ] Push another commit and verify preview updates.
- [ ] Close the test PR and verify preview cleanup.
- [ ] Backlog correctness.
- [ ] Closed-unmerged PR handling.
- [ ] Reopened issues.
- [ ] Continuous calendar months.
- [ ] Reporting periods.
- [ ] Previous-period comparisons.
- [ ] Deterministic item age.
- [ ] Label aliases.
- [ ] Release calculations.
- [ ] Contributor calculations.
- [ ] Engagement metrics.
- [ ] GitHub traffic fixtures.
- [ ] Read the Docs CSV fixtures.
- [ ] Zenodo fixtures.
- [ ] OpenAlex fixtures.
- [ ] Actions workflow-run fixtures.
- [ ] Snapshot logic.
- [ ] Schema validation.
- [ ] Malformed optional-source responses.
- [ ] Malformed manual YAML.
- [ ] All four pages load.
- [ ] Data loads.
- [ ] No browser console errors.
- [ ] Navigation works at production base.
- [ ] Navigation works at preview base.
- [ ] Summary cards display values.
- [ ] Reporting-period selector updates metrics.
- [ ] Combined filters work.
- [ ] Label filter works.
- [ ] Merged PR state displays.
- [ ] CSV export works.
- [ ] JSON export works.
- [ ] Unsafe text is escaped.
- [ ] Impact links work.
- [ ] Report becomes ready.
- [ ] PDF link exists.
- [ ] Mobile viewport works.
- [ ] Test workflow runs on every push and PR.
- [ ] Production deploy runs only from main.
- [ ] Preview deploy runs only for same-repository PRs.
- [ ] Report workflow uses the same production build.
- [ ] Snapshot writes occur only on scheduled/main runs.
- [ ] No feature-branch workflow can change production root files.
- [ ] Architecture.
- [ ] Local setup.
- [ ] Production-style local preview.
- [ ] PR-style local preview.
- [ ] Project configuration.
- [ ] Label aliases.
- [ ] Reporting periods.
- [ ] Manual impact data.
- [ ] GitHub authentication.
- [ ] GitHub traffic permissions.
- [ ] Read the Docs configuration and CSV fallback.
- [ ] Snapshot behavior.
- [ ] PDF generation.
- [ ] Production deployment.
- [ ] PR preview behavior.
- [ ] One-time Pages settings.
- [ ] Preview URL format.
- [ ] Moving to `csrc-sdsu`.
- [ ] Metric definitions.
- [ ] Known limitations.
- [ ] Data privacy and non-inference rules.
- [ ] `docs/METRICS.md`
- [ ] `docs/DATA_SOURCES.md`
- [ ] `docs/DEPLOYMENT.md`
- [ ] `docs/FUNDING_REPORT.md`
- [ ] Read every line in `IMPLEMENTATION_CHECKLIST.md`.
- [ ] Confirm every non-credential checkbox is checked.
- [ ] Confirm every checked item contains evidence.
- [ ] Confirm credential-blocked items have implemented collectors and tests.
- [ ] Confirm no `TODO`, `FIXME`, fake metric or temporary debug output remains.
- [ ] Confirm no secret is committed.
- [ ] Confirm no production URL is hard-coded where project configuration should be used.
- [ ] Confirm no MOLE scientific source code was added.
- [ ] Confirm production still works.
- [ ] Confirm a PR preview works.
- [ ] Confirm PDF generation works.
- [ ] Confirm the latest PDF is publicly linked.
- [ ] Confirm the final backlog equals current open issues plus current open PRs.
- [ ] Confirm the default view uses the configured 12-month period.
- [ ] Confirm all tests pass.
