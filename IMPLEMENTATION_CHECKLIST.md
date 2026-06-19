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
- [x] Track PRs closed during each month.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py`; `tests/test_operations.py::test_closed_unmerged_pr_reduces_backlog`.
- [x] Preserve merged PRs as a separate throughput series.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py`; `tests/test_operations.py::test_merged_pr_reduces_backlog_once`.
- [x] Add closed-unmerged PRs as a separate series where useful.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py`; `tests/test_operations.py::test_closed_unmerged_pr_reduces_backlog`.
- [x] Ensure the final reconstructed backlog equals the current number of open issues plus open PRs.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py`; `tests/test_operations.py::test_current_backlog_equals_open_issues_plus_open_prs_and_month_gaps_are_zero`.
- [x] Ensure backlog never becomes negative because of calculation errors.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py`; `tests/test_operations.py::test_closed_unmerged_pr_reduces_backlog`.
- [x] Rename ambiguous trend fields if necessary.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py` exposes `prs_closed`, `prs_merged`, and `prs_closed_unmerged`; `tests/test_operations.py`.
- [x] Correct `net_backlog_change`.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py::period_summary`; `tests/test_operations.py::test_reporting_period_options_and_previous_period_comparisons`.
- [x] Closed-unmerged PR reduces backlog.
  Evidence: `tests/test_operations.py::test_closed_unmerged_pr_reduces_backlog`.
- [x] Merged PR reduces backlog exactly once.
  Evidence: `tests/test_operations.py::test_merged_pr_reduces_backlog_once`.
- [x] Current backlog equals open issue count plus open PR count.
  Evidence: `tests/test_operations.py::test_current_backlog_equals_open_issues_plus_open_prs_and_month_gaps_are_zero`.
- [x] Mixed issue/PR lifecycle fixture produces the expected monthly series.
  Evidence: `tests/test_operations.py::test_current_backlog_equals_open_issues_plus_open_prs_and_month_gaps_are_zero`.
- [x] Reopened issues are reflected correctly.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py`; `tests/test_operations.py::test_reopened_issue_and_deterministic_age`.
- [x] Use the dataset’s `generated_at` timestamp when calculating item age.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py::normalize_item`; `tests/test_operations.py::test_reopened_issue_and_deterministic_age`.
- [x] Do not call the wall clock independently for every item.
  Evidence: `src/oss_impact_dashboard/build_dataset.py` passes one `generated_at`; `tests/test_operations.py::test_reopened_issue_and_deterministic_age`.
- [x] Ensure the same fixture and `generated_at` produce identical output.
  Evidence: `tests/test_operations.py::test_reopened_issue_and_deterministic_age`.
- [x] Add deterministic age tests.
  Evidence: `tests/test_operations.py::test_reopened_issue_and_deterministic_age`.
- [x] Generate every calendar month between the selected start and end dates.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py::month_series`; `tests/test_operations.py::test_current_backlog_equals_open_issues_plus_open_prs_and_month_gaps_are_zero`.
- [x] Insert zero values for months without activity.
  Evidence: `tests/test_operations.py::test_current_backlog_equals_open_issues_plus_open_prs_and_month_gaps_are_zero`.
- [x] Ensure chart spacing represents actual monthly time.
  Evidence: `web/src/app.js::renderActivityChart`; `tests/test_operations.py::test_current_backlog_equals_open_issues_plus_open_prs_and_month_gaps_are_zero`.
- [x] Add tests covering a multi-month gap.
  Evidence: `tests/test_operations.py::test_current_backlog_equals_open_issues_plus_open_prs_and_month_gaps_are_zero`.
- [x] Use `reporting.default_period_months` as the initial selection.
  Evidence: `src/oss_impact_dashboard/config.py`; `tests/test_operations.py::test_reporting_period_options_and_previous_period_comparisons`.
- [x] Calculate period-specific opened, closed, merged and backlog-change metrics.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py::period_summary`; `tests/test_operations.py::test_reporting_period_options_and_previous_period_comparisons`.
- [x] Calculate period-specific close and merge medians.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py::period_summary`; `tests/test_operations.py::test_reporting_period_options_and_previous_period_comparisons`.
- [ ] Calculate period-specific contributor and release metrics where appropriate.
- [x] Keep current backlog counts independent of the selected historical period.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py`; `tests/test_operations.py::test_reporting_period_options_and_previous_period_comparisons`.
- [x] Add a reusable period-selection control.
  Evidence: `web/operations.html`; `web/src/app.js::populateFilters`.
- [x] Preserve the selected period while navigating pages, using URL parameters or local storage.
  Evidence: `web/src/app.js::activePeriodId` and `applyFilters`.
- [ ] Display the active reporting period beside every time-based chart.
- [x] Ensure the funding report has an explicit start and end date.
  Evidence: `web/src/app.js::renderReport`; production-style report preview reached `data-report-ready`.
- [x] Add tests for all four period selections.
  Evidence: `tests/test_operations.py::test_reporting_period_options_and_previous_period_comparisons`.
- [x] Apply aliases case-insensitively.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py`; `tests/test_operations.py::test_label_aliases_merge_categories`.
- [x] Apply aliases to current labels.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py`; `tests/test_operations.py::test_label_aliases_merge_categories`.
- [x] Apply aliases to reconstructed closure labels.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py::labels_at_time`; `tests/test_operations.py::test_normalized_closed_item_uses_closure_labels_for_metrics`.
- [x] Combine metrics for aliases into one category.
  Evidence: `tests/test_operations.py::test_label_aliases_merge_categories`.
- [x] Preserve the original labels on item detail records for traceability.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py::normalize_item`; `tests/test_operations.py::test_normalized_closed_item_uses_closure_labels_for_metrics`.
- [x] Add tests for alias merging.
  Evidence: `tests/test_operations.py::test_label_aliases_merge_categories`.
- [x] Document how another project can configure aliases.
  Evidence: `README.md`.
- [x] Rename the age-based “Stale items” KPI to `Open over <threshold> days`.
  Evidence: `web/src/app.js::renderSummary`; production-style overview preview.
- [x] Continue showing the actual GitHub `stale` label separately.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py` preserves `labels_current` and `metric_labels`; `tests/test_normalized_closed_item_uses_closure_labels_for_metrics`.
- [x] Explain the configured threshold in a tooltip or definition.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py` definitions include `open_over_threshold_items`.
- [ ] Ensure the terminology is consistent across pages, CSV, JSON and PDF.
- [x] Increment the schema version.
  Evidence: `src/oss_impact_dashboard/schema.py`; `tests/test_config_dataset.py::test_dataset_survives_disabled_github`.
- [x] Add an explicit schema validation layer.
  Evidence: `src/oss_impact_dashboard/schema.py::validate_dashboard_dataset`; `tests/test_config_dataset.py`.
- [x] Include the reporting-period start and end dates.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py::build_periods`; `tests/test_operations.py::test_reporting_period_options_and_previous_period_comparisons`.
- [x] Include collection timestamps for each source.
  Evidence: `src/oss_impact_dashboard/schema.py::source_status`; `tests/test_config_dataset.py`.
- [x] Include the source URL or source identifier where safe.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`; `tests/test_config_dataset.py::test_dataset_has_source_limitations_and_single_impact_shape`.
- [x] Include status: available, unavailable, partial or error.
  Evidence: `src/oss_impact_dashboard/schema.py::validate_dashboard_dataset`; `tests/test_config_dataset.py`.
- [x] Include a human-readable limitation for every source.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`; `tests/test_config_dataset.py::test_dataset_has_source_limitations_and_single_impact_shape`.
- [x] Include GitHub API requests used.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`; `src/oss_impact_dashboard/collectors/github.py`.
- [x] Include rate-limit remaining.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`; `src/oss_impact_dashboard/collectors/github.py`.
- [x] Include authenticated versus unauthenticated status.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`; `src/oss_impact_dashboard/collectors/github.py`.
- [x] Add a visible data freshness warning if the dataset is older than a configured threshold.
  Evidence: `web/src/app.js::renderDataFreshness`; `projects/mole.yml`.
- [x] Ensure missing optional sources do not remove unrelated metrics.
  Evidence: `tests/test_config_dataset.py::test_dataset_survives_disabled_github`.
- [x] Ensure a malformed optional source response does not break the dashboard.
  Evidence: `src/oss_impact_dashboard/build_dataset.py::_try_source`; `tests/test_config_dataset.py::test_dataset_has_source_limitations_and_single_impact_shape`.
- [x] Avoid repeatedly calling `build_impact()` during one dataset build.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`.
- [x] Build impact data once and reuse it.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`.
- [x] Add schema regression tests.
  Evidence: `tests/test_config_dataset.py`.
- [x] Add source-failure fixture tests.
  Evidence: `tests/test_config_dataset.py::test_dataset_survives_disabled_github`.
- [x] Add malformed-source fixture tests.
  Evidence: `src/oss_impact_dashboard/build_dataset.py::_try_source`; `tests/test_config_dataset.py`.
- [x] Project name.
  Evidence: `web/src/app.js::renderHeader`; production-style overview preview.
- [x] Repository link.
  Evidence: `web/index.html`; `web/src/app.js::renderHeader`.
- [x] Documentation link when configured.
  Evidence: `src/oss_impact_dashboard/build_dataset.py` includes `documentation_url`; `tests/test_config_dataset.py`.
- [x] JOSS/citation link when configured.
  Evidence: `src/oss_impact_dashboard/build_dataset.py` includes `citation_url`; `projects/mole.yml`.
- [x] Human-readable last refresh time.
  Evidence: `web/src/app.js::renderHeader`; production-style overview preview.
- [x] Active reporting period.
  Evidence: `web/src/app.js::activePeriod`; `web/tests/operations-ui.mjs`.
- [x] Data freshness state.
  Evidence: `web/src/app.js::renderDataFreshness`; `projects/mole.yml`.
- [x] Open issues.
  Evidence: `web/src/app.js::renderSummary`; production-style overview preview.
- [x] Open PRs.
  Evidence: `web/src/app.js::renderSummary`; production-style overview preview.
- [x] Untriaged items.
  Evidence: `web/src/app.js::renderSummary`; `tests/test_operations.py::test_build_operations_core_kpis`.
- [x] Open over threshold days.
  Evidence: `web/src/app.js::renderSummary`; `src/oss_impact_dashboard/metrics/operations.py`.
- [x] Median issue-close time.
  Evidence: `web/src/app.js::renderSummary`; `tests/test_operations.py::test_build_operations_core_kpis`.
- [x] Median PR-merge time.
  Evidence: `web/src/app.js::renderSummary`; `tests/test_operations.py::test_build_operations_core_kpis`.
- [x] Net backlog change during the selected period.
  Evidence: `web/src/app.js::renderSummary`; `tests/test_operations.py::test_reporting_period_options_and_previous_period_comparisons`.
- [x] Latest release age.
  Evidence: `web/src/app.js::renderSummary`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Zenodo downloads.
  Evidence: `web/src/app.js::renderImpactSummary`; `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] Zenodo views.
  Evidence: `web/src/app.js::renderImpactSummary`; `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] Citation count.
  Evidence: `web/src/app.js::renderImpactSummary`; `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] Unique contributors.
  Evidence: `web/src/app.js::renderImpactSummary`; `tests/test_impact_release_contributors.py::test_contributor_metrics_do_not_infer_core_contributors`.
- [x] Releases during the selected period.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] GitHub release-asset downloads with an explanatory note when zero.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py`; `README.md`.
- [ ] Display current-period versus previous-equal-period change where mathematically meaningful.
- [ ] Show the direction and magnitude.
- [ ] Do not show misleading percentage changes when the previous value is zero.
- [x] Add tests for comparison calculations.
  Evidence: `tests/test_operations.py::test_reporting_period_options_and_previous_period_comparisons`.
- [x] Oldest open issue.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py` queues; `web/src/app.js::renderQueues`.
- [x] Oldest open PR.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py` queues; `web/src/app.js::renderQueues`.
- [x] Untriaged item.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py` queues; `tests/test_operations.py::test_build_operations_core_kpis`.
- [x] Highest-age item.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py` `open_over_threshold` queue; `web/src/app.js::renderQueues`.
- [x] Recently reopened issue when available.
  Evidence: `tests/test_operations.py::test_reopened_issue_and_deterministic_age`; `web/src/app.js::renderQueues`.
- [x] Link every item to GitHub.
  Evidence: `web/src/app.js::externalLink` usage in table and queues; `web/tests/security.mjs`.
- [x] Activity trend.
  Evidence: `web/src/app.js::renderActivityChart`; production-style preview.
- [x] Corrected backlog trend.
  Evidence: `web/src/app.js::renderBacklogChart`; `tests/test_operations.py::test_current_backlog_equals_open_issues_plus_open_prs_and_month_gaps_are_zero`.
- [x] Small adoption/impact trend when historical data exists.
  Evidence: `web/src/app.js::renderImpact`; `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] Accessible text summary for every chart.
  Evidence: `web/src/app.js::chart` sets `aria-label`; `web/tests/smoke.mjs`.
- [x] Clear axis labels.
  Evidence: `web/src/app.js::renderActivityChart` and `renderBacklogChart`.
- [ ] Active period in chart subtitle.
- [x] Move source status and metric definitions below the primary dashboard.
  Evidence: `web/index.html`; production-style overview preview.
- [ ] Place them in collapsible sections.
- [x] Keep them available for auditing.
  Evidence: `web/index.html`; `web/src/app.js::renderSources` and `renderDefinitions`.
- [x] Do not let diagnostics dominate the first screen.
  Evidence: `web/index.html`; production-style overview preview shows KPI cards before diagnostics.
- [x] Make relevant cards link to Operations or Impact.
  Evidence: `web/src/app.js::appendStat` and `renderSummary`.
- [x] Ensure keyboard navigation works.
  Evidence: native links, buttons, inputs and selects in `web/*.html`; `web/tests/operations-ui.mjs`.
- [x] Ensure mobile layout works at 320px width.
  Evidence: responsive CSS in `web/src/styles.css`; production-style preview checked.
- [x] Text search.
  Evidence: `web/operations.html`; `web/src/app.js::filterMatches`; `web/tests/operations-ui.mjs`.
- [x] Issue or PR type.
  Evidence: `web/operations.html`; `web/src/app.js::filterMatches`; `web/tests/operations-ui.mjs`.
- [x] Open, closed or merged state.
  Evidence: `web/operations.html`; `web/src/app.js::displayState`; `web/tests/operations-ui.mjs`.
- [x] Label.
  Evidence: `web/operations.html`; `web/src/app.js::filterMatches`; `web/tests/operations-ui.mjs`.
- [x] Author.
  Evidence: `web/operations.html`; `web/src/app.js::filterMatches`; `web/tests/operations-ui.mjs`.
- [x] Created-date range.
  Evidence: `web/operations.html`; `web/src/app.js::filterMatches`; `web/tests/operations-ui.mjs`.
- [x] Closed-date range.
  Evidence: `web/operations.html`; `web/src/app.js::filterMatches`; `web/tests/operations-ui.mjs`.
- [x] Age range.
  Evidence: `web/operations.html`; `web/src/app.js::filterMatches`; `web/tests/operations-ui.mjs`.
- [x] Reporting period.
  Evidence: `web/operations.html`; `web/src/app.js::activePeriodId`; `web/tests/operations-ui.mjs`.
- [x] Clear-all button.
  Evidence: `web/operations.html`; `web/src/app.js::renderTable`; `web/tests/operations-ui.mjs`.
- [x] Applying one filter must not erase the others.
  Evidence: `web/src/app.js::currentFilters` and `applyFilters`; `web/tests/operations-ui.mjs`.
- [x] Search must combine with every selected filter.
  Evidence: `web/src/app.js::filterMatches`; `web/tests/operations-ui.mjs`.
- [x] CSV export must export filtered rows.
  Evidence: `web/src/app.js::tableRows`; `web/tests/operations-ui.mjs`.
- [x] JSON export must export filtered rows.
  Evidence: `web/src/app.js::tableRows`; `web/tests/operations-ui.mjs`.
- [x] Result count must update.
  Evidence: `web/src/app.js::updateFilterSummary`; `web/tests/operations-ui.mjs`.
- [x] Active filter summary must be visible.
  Evidence: `web/operations.html`; `web/tests/operations-ui.mjs`.
- [x] Filters must be represented in the URL or otherwise preserved on refresh.
  Evidence: `web/src/app.js::syncFilterUrl`; `web/tests/operations-ui.mjs`.
- [x] Search plus label filter.
  Evidence: `web/src/app.js::filterMatches`; `web/tests/operations-ui.mjs`.
- [x] Type plus state filter.
  Evidence: `web/src/app.js::filterMatches`; `web/tests/operations-ui.mjs`.
- [x] Date plus age filter.
  Evidence: `web/src/app.js::filterMatches`; `web/tests/operations-ui.mjs`.
- [x] Clear-all behavior.
  Evidence: `web/src/app.js::renderTable`; `web/tests/operations-ui.mjs`.
- [x] Export respects active filters.
  Evidence: `web/src/app.js::tableRows`; `web/tests/operations-ui.mjs`.
- [x] Display merged PRs as `Merged`, not merely `Closed`.
  Evidence: `web/src/app.js::displayState`; `web/tests/operations-ui.mjs`.
- [x] Add author column.
  Evidence: `web/src/app.js::renderTable`; `web/tests/operations-ui.mjs`.
- [x] Add age column.
  Evidence: `web/src/app.js::renderTable`; `web/tests/operations-ui.mjs`.
- [x] Add time-to-close or time-to-merge column.
  Evidence: `web/src/app.js::renderTable`; `web/tests/operations-ui.mjs`.
- [x] Format timestamps into readable dates.
  Evidence: `web/src/app.js::readableDate`; `web/tests/operations-ui.mjs`.
- [x] Preserve raw timestamps in exports.
  Evidence: `web/src/app.js::downloadRows`; `web/tests/operations-ui.mjs`.
- [x] Display labels as safely rendered pills.
  Evidence: `web/src/app.js::labelPills`; `web/tests/operations-ui.mjs`.
- [x] Add default sorting appropriate for maintainer use.
  Evidence: `web/src/app.js::renderTable`; `web/tests/operations-ui.mjs`.
- [x] Keep direct GitHub links.
  Evidence: `web/src/app.js::titleLink`; `web/tests/security.mjs`.
- [x] Ensure responsive layout.
  Evidence: `web/src/app.js::renderTable` uses responsive layout; `web/src/styles.css`.
- [x] Avoid rendering hundreds of rows at once.
  Evidence: `web/src/app.js::renderTable` uses Tabulator pagination.
- [x] Opened versus completed issues/PRs.
  Evidence: `web/src/app.js::renderActivityChart`; `tests/test_operations.py`.
- [x] Correct backlog trend.
  Evidence: `web/src/app.js::renderBacklogChart`; `tests/test_operations.py::test_current_backlog_equals_open_issues_plus_open_prs_and_month_gaps_are_zero`.
- [ ] Open-item age buckets:
- [ ] Work by canonical label/component.
- [ ] Issue versus PR composition.
- [ ] Close/merge-time distribution or percentile display.
- [x] Oldest open issues.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py` queues; `web/src/app.js::renderQueues`.
- [x] Oldest open PRs.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py` queues; `web/src/app.js::renderQueues`.
- [x] Untriaged.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py` queues; `tests/test_operations.py::test_build_operations_core_kpis`.
- [x] Open over threshold.
  Evidence: `src/oss_impact_dashboard/metrics/operations.py` queues; `web/src/app.js::renderQueues`.
- [x] Recently reopened.
  Evidence: `tests/test_operations.py::test_reopened_issue_and_deterministic_age`; `web/src/app.js::renderQueues`.
- [x] High-priority items based on configurable priority-label patterns.
  Evidence: `projects/mole.yml`; `src/oss_impact_dashboard/metrics/operations.py`.
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
- [x] Use GraphQL or another batched strategy rather than one unbounded request per item.
  Evidence: authenticated engagement metrics are unavailable; existing collectors use repository-level REST pagination in `src/oss_impact_dashboard/collectors/github.py`.
- [x] Enforce a request budget.
  Evidence: `src/oss_impact_dashboard/collectors/github.py::GitHubClient`; `tests/test_github_client.py`.
- [ ] Cache reusable data within the run.
- [x] Record source status and limitations.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`; `tests/test_config_dataset.py`.
- [x] Mark the metrics unavailable without authentication.
  Evidence: `src/oss_impact_dashboard/collectors/github_traffic.py`; `src/oss_impact_dashboard/collectors/github_actions.py`; `tests/test_optional_collectors.py`.
- [x] Do not display fabricated zeroes when unavailable.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`; production-style preview source status.
- [x] Add fixture-based tests.
  Evidence: `tests/test_optional_collectors.py`.
- [x] Do not make unit tests call live APIs.
  Evidence: fixture tests in `tests/test_optional_collectors.py` and `tests/test_impact_release_contributors.py`.
- [x] Total releases.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Releases in selected period.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Latest release.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Days since latest release.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Median release interval.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Release timeline.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py` `by_release`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Version links.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py` `url`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Release asset count.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Release asset downloads by version.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py` `by_release`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Total release asset downloads.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Explain that generated source archives are excluded.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py` note; `README.md`.
- [ ] Explain zero release downloads when no uploaded assets exist.
- [ ] Add release-related chart or timeline.
- [x] Include release metrics in the funding report.
  Evidence: `web/src/app.js::renderReport`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Add release calculation tests.
  Evidence: `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Unique contributors.
  Evidence: `src/oss_impact_dashboard/metrics/contributors.py`; `tests/test_impact_release_contributors.py::test_contributor_metrics_do_not_infer_core_contributors`.
- [x] Commit contributors.
  Evidence: `src/oss_impact_dashboard/metrics/contributors.py`; `tests/test_impact_release_contributors.py::test_contributor_metrics_do_not_infer_core_contributors`.
- [x] Issue and PR authors.
  Evidence: `src/oss_impact_dashboard/metrics/contributors.py`; `tests/test_impact_release_contributors.py::test_contributor_metrics_do_not_infer_core_contributors`.
- [x] PR authors.
  Evidence: `src/oss_impact_dashboard/metrics/contributors.py`; `tests/test_impact_release_contributors.py::test_contributor_metrics_do_not_infer_core_contributors`.
- [x] Merged-PR authors.
  Evidence: `src/oss_impact_dashboard/metrics/contributors.py`; `tests/test_impact_release_contributors.py::test_contributor_metrics_do_not_infer_core_contributors`.
- [ ] New contributors during selected period.
- [ ] Repeat contributors during selected period.
- [ ] First-time PR authors.
- [ ] First-time merged-PR authors.
- [x] Contributor trend by month.
  Evidence: `src/oss_impact_dashboard/metrics/contributors.py`; `tests/test_impact_release_contributors.py::test_contributor_metrics_do_not_infer_core_contributors`.
- [x] Top contributors with links.
  Evidence: `src/oss_impact_dashboard/metrics/contributors.py`; `tests/test_impact_release_contributors.py::test_contributor_metrics_do_not_infer_core_contributors`.
- [ ] Contribution concentration among top one, three and five contributors.
- [x] Bot exclusion.
  Evidence: `src/oss_impact_dashboard/metrics/contributors.py`; `tests/test_impact_release_contributors.py::test_contributor_metrics_do_not_infer_core_contributors`.
- [x] Document limitations.
  Evidence: `src/oss_impact_dashboard/metrics/contributors.py`; `README.md`.
- [x] Calculate external/non-core contribution share only when `core_contributors` is configured.
  Evidence: `src/oss_impact_dashboard/metrics/contributors.py`; `tests/test_impact_release_contributors.py::test_contributor_metrics_do_not_infer_core_contributors`.
- [x] Display `Not configured` rather than guessing maintainers.
  Evidence: `src/oss_impact_dashboard/metrics/contributors.py` returns `None` unless configured; `tests/test_impact_release_contributors.py`.
- [x] Do not infer employment, affiliation or demographics.
  Evidence: `src/oss_impact_dashboard/metrics/contributors.py`; `README.md`.
- [x] Add fixture-based contributor tests.
  Evidence: `tests/test_impact_release_contributors.py::test_contributor_metrics_do_not_infer_core_contributors`.
- [ ] Add contributor charts to Impact.
- [x] Add contributor metrics to the funding report.
  Evidence: `web/src/app.js::renderReport`; `tests/test_impact_release_contributors.py::test_contributor_metrics_do_not_infer_core_contributors`.
- [x] Zenodo downloads.
  Evidence: `src/oss_impact_dashboard/metrics/impact.py`; `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] Zenodo unique downloads.
  Evidence: `src/oss_impact_dashboard/metrics/impact.py`; `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] Zenodo views.
  Evidence: `src/oss_impact_dashboard/metrics/impact.py`; `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] Zenodo unique views.
  Evidence: `src/oss_impact_dashboard/metrics/impact.py`; `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] Zenodo title and DOI.
  Evidence: `src/oss_impact_dashboard/metrics/impact.py`; `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] Direct Zenodo link.
  Evidence: `src/oss_impact_dashboard/metrics/impact.py`; `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] OpenAlex citation count.
  Evidence: `src/oss_impact_dashboard/metrics/impact.py`; `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] Citations by year.
  Evidence: `web/src/app.js::renderImpact`; `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] Publication title and year.
  Evidence: `src/oss_impact_dashboard/metrics/impact.py`; `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] Direct OpenAlex link.
  Evidence: `src/oss_impact_dashboard/metrics/impact.py`; `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] JOSS/DOI link.
  Evidence: `projects/mole.yml`; `src/oss_impact_dashboard/build_dataset.py`.
- [x] GitHub release downloads.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Contributor/community metrics.
  Evidence: `src/oss_impact_dashboard/metrics/contributors.py`; `tests/test_impact_release_contributors.py::test_contributor_metrics_do_not_infer_core_contributors`.
- [x] Release history.
  Evidence: `src/oss_impact_dashboard/metrics/releases.py`; `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Source.
  Evidence: `src/oss_impact_dashboard/build_dataset.py` source_status; `web/src/app.js::renderSources`.
- [x] Collection timestamp.
  Evidence: `src/oss_impact_dashboard/schema.py::source_status`; `tests/test_config_dataset.py`.
- [x] Reporting period.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`; `tests/test_operations.py::test_reporting_period_options_and_previous_period_comparisons`.
- [x] Metric definition.
  Evidence: `src/oss_impact_dashboard/build_dataset.py` metric_definitions; `web/src/app.js::renderDefinitions`.
- [x] Known limitation.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`; `tests/test_config_dataset.py`.
- [x] Availability status.
  Evidence: `src/oss_impact_dashboard/schema.py::validate_dashboard_dataset`; `web/src/app.js::renderSources`.
- [x] Render only supplied data.
  Evidence: `web/src/app.js::renderManualFunding`; `web/tests/security.mjs`.
- [x] Never invent entries.
  Evidence: `src/oss_impact_dashboard/collectors/manual.py`; `web/src/app.js::renderManualFunding`.
- [x] Hide empty public sections rather than displaying unfinished placeholders.
  Evidence: `web/src/app.js::renderManualFunding`; production-style impact preview.
- [ ] Show a clear configuration message only in development/admin documentation.
- [ ] Validate manual YAML.
- [ ] Add tests for valid and malformed manual files.
- [ ] Add safe rendering tests.
- [x] Documentation page views.
  Evidence: `src/oss_impact_dashboard/collectors/readthedocs.py`; `tests/test_optional_collectors.py::test_readthedocs_csv_parser`.
- [x] Popular pages.
  Evidence: `src/oss_impact_dashboard/collectors/readthedocs.py`; `tests/test_optional_collectors.py::test_readthedocs_csv_parser`.
- [ ] Search queries.
- [ ] Searches returning no results.
- [ ] 404 pages.
- [x] Collection/import date.
  Evidence: `src/oss_impact_dashboard/schema.py::source_status`; `src/oss_impact_dashboard/build_dataset.py`.
- [x] Source status.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`; `web/src/app.js::renderSources`.
- [x] CSV validation.
  Evidence: `src/oss_impact_dashboard/collectors/readthedocs.py`; `tests/test_optional_collectors.py::test_readthedocs_csv_parser`.
- [x] Fixture-based tests.
  Evidence: `tests/test_optional_collectors.py::test_readthedocs_csv_parser`.
- [x] UI for unavailable status.
  Evidence: `web/src/app.js::renderSources`; production-style preview.
- [x] UI for imported/live metrics.
  Evidence: `web/src/app.js::renderImpactSummary`; `tests/test_impact_release_contributors.py`.
- [x] Repository views.
  Evidence: `src/oss_impact_dashboard/collectors/github_traffic.py`; `tests/test_optional_collectors.py::test_github_traffic_summary`.
- [x] Unique visitors.
  Evidence: `src/oss_impact_dashboard/collectors/github_traffic.py`; `tests/test_optional_collectors.py::test_github_traffic_summary`.
- [x] Clones.
  Evidence: `src/oss_impact_dashboard/collectors/github_traffic.py`; `tests/test_optional_collectors.py::test_github_traffic_summary`.
- [x] Unique cloners.
  Evidence: `src/oss_impact_dashboard/collectors/github_traffic.py`; `tests/test_optional_collectors.py::test_github_traffic_summary`.
- [x] Referring sites.
  Evidence: `src/oss_impact_dashboard/collectors/github_traffic.py`; `tests/test_optional_collectors.py::test_github_traffic_summary`.
- [x] Popular paths.
  Evidence: `src/oss_impact_dashboard/collectors/github_traffic.py`; `tests/test_optional_collectors.py::test_github_traffic_summary`.
- [x] Snapshot timestamp.
  Evidence: source statuses include `last_updated` in `src/oss_impact_dashboard/schema.py`; `tests/test_config_dataset.py`.
- [x] Source limitations.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`; `tests/test_config_dataset.py`.
- [x] Authentication requirement.
  Evidence: `src/oss_impact_dashboard/collectors/github_traffic.py`; `tests/test_optional_collectors.py`.
- [x] Fixture-based tests.
  Evidence: `tests/test_optional_collectors.py::test_github_traffic_summary`.
- [x] Graceful unavailable state.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`; production-style preview source status.
- [x] Total workflow runs.
  Evidence: `src/oss_impact_dashboard/collectors/github_actions.py`; `tests/test_optional_collectors.py::test_github_actions_summary`.
- [x] Successful runs.
  Evidence: `src/oss_impact_dashboard/collectors/github_actions.py`; `tests/test_optional_collectors.py::test_github_actions_summary`.
- [x] Failed runs.
  Evidence: `src/oss_impact_dashboard/collectors/github_actions.py`; `tests/test_optional_collectors.py::test_github_actions_summary`.
- [x] Cancelled runs.
  Evidence: `src/oss_impact_dashboard/collectors/github_actions.py`; `tests/test_optional_collectors.py::test_github_actions_summary`.
- [ ] Success rate.
- [ ] Median workflow duration when available.
- [ ] Recent failed runs with links.
- [x] Source status and limitations.
  Evidence: `src/oss_impact_dashboard/build_dataset.py`; `tests/test_config_dataset.py`.
- [x] Use bounded pagination.
  Evidence: `src/oss_impact_dashboard/collectors/github_actions.py`; `tests/test_optional_collectors.py::test_github_actions_summary`.
- [x] Do not fetch every historical workflow run.
  Evidence: `src/oss_impact_dashboard/collectors/github_actions.py` uses bounded recent runs.
- [x] Add fixture-based tests.
  Evidence: `tests/test_optional_collectors.py::test_github_actions_summary`.
- [ ] Display the section in Operations or Impact.
- [ ] Include a concise CI reliability summary in the funding report.
- [ ] Create a versioned snapshot schema.
- [x] Add snapshot read/write commands.
  Evidence: `src/oss_impact_dashboard/snapshots.py`; `tests/test_optional_collectors.py::test_snapshot_helpers`.
- [x] Ensure feature-branch previews never write production snapshots.
  Evidence: `.github/workflows/pr-preview.yml`; `web/tests/deployment.mjs`.
- [ ] Allow scheduled main-branch runs to append snapshots.
- [ ] Store snapshots in a dedicated `metrics-history` branch or another clearly isolated persistent location.
- [x] Prevent workflow recursion.
  Evidence: snapshot writes are not in production/preview workflows; `web/tests/deployment.mjs`.
- [x] Deduplicate same-day snapshots.
  Evidence: `src/oss_impact_dashboard/snapshots.py::dedupe_items`; `tests/test_optional_collectors.py::test_snapshot_helpers`.
- [ ] Add retention/documentation policy.
- [ ] Use snapshots for impact trends.
- [x] Add fixture and command tests.
  Evidence: `tests/test_optional_collectors.py::test_snapshot_helpers`.
- [x] Do not snapshot data already reconstructable from issue/PR timestamps.
  Evidence: `README.md`; snapshot helper is not wired to issue/PR history.
- [x] Cover/title section.
  Evidence: `web/src/app.js::renderReport`; production-style report preview.
- [x] Project overview.
  Evidence: `web/src/app.js::renderReport`; production-style report preview.
- [x] Exact reporting period.
  Evidence: `web/src/app.js::renderReport`; production-style report preview.
- [x] Executive KPI summary.
  Evidence: `web/src/app.js::renderReport`; production-style report preview.
- [ ] Major accomplishments.
- [x] Adoption and downloads.
  Evidence: `web/src/app.js::renderReport`; `tests/test_impact_release_contributors.py`.
- [x] Documentation reach.
  Evidence: report source status and private-source limitations in `web/src/app.js`; production-style report preview.
- [x] Scientific publications and citations.
  Evidence: `web/src/app.js::renderReport`; `tests/test_impact_release_contributors.py`.
- [x] Development and maintenance activity.
  Evidence: `web/src/app.js::renderReport`; `tests/test_operations.py`.
- [x] Release delivery.
  Evidence: `web/src/app.js::renderReport`; `tests/test_impact_release_contributors.py`.
- [x] Contributors and community.
  Evidence: `web/src/app.js::renderReport`; `tests/test_impact_release_contributors.py`.
- [ ] CI and reliability.
- [ ] Maintainer capacity.
- [ ] Technical debt and sustainability risks.
- [ ] Requested work packages.
- [ ] Baseline → target → expected-outcome table.
- [ ] Case studies.
- [x] Methodology.
  Evidence: `web/src/app.js::renderReport` methodology section.
- [x] Data sources.
  Evidence: `src/oss_impact_dashboard/build_dataset.py` source_status; report methodology section.
- [x] Limitations.
  Evidence: `web/src/app.js::renderReport`; `src/oss_impact_dashboard/build_dataset.py`.
- [x] Generated-at timestamp.
  Evidence: `web/src/app.js::renderReport`; production-style report preview.
- [x] Add KPI cards.
  Evidence: `web/src/app.js::renderSummary`; report executive summary.
- [ ] Add meaningful charts.
- [ ] Add compact tables.
- [x] Use page-break controls.
  Evidence: print styles in `web/src/styles.css`.
- [x] Avoid clipped charts and tables.
  Evidence: print/report styles in `web/src/styles.css`; PDF smoke test in `tests/test_report_pdf.py`.
- [x] Ensure links are printed visibly where useful.
  Evidence: `web/src/styles.css`; `web/src/app.js::renderReport`.
- [x] Ensure colors remain understandable in grayscale.
  Evidence: restrained print styles in `web/src/styles.css`.
- [x] Hide navigation and interactive controls in print.
  Evidence: `.no-print` usage in `web/report.html`; `web/src/styles.css`.
- [ ] Add page numbers if feasible.
- [x] Use Letter-sized output.
  Evidence: `src/oss_impact_dashboard/report_pdf.py`; `tests/test_report_pdf.py::test_generate_pdf_waits_for_report_ready_and_writes_file`.
- [ ] Render accomplishments from YAML.
- [ ] Render risks from YAML.
- [ ] Render requested work from YAML.
- [ ] Render targets from YAML.
- [ ] Render maintainer capacity from YAML.
- [ ] Render case studies from YAML.
- [x] Hide empty sections.
  Evidence: `web/src/app.js::renderManualFunding` and `renderCaseStudies`; production-style impact preview.
- [x] Do not show messages such as “add content in funding.yml” to report readers.
  Evidence: `web/src/app.js::renderReport`; production-style report preview.
- [x] Generate PDF through Playwright.
  Evidence: `src/oss_impact_dashboard/report_pdf.py`; `tests/test_report_pdf.py::test_generate_pdf_waits_for_report_ready_and_writes_file`.
- [x] Wait until data and charts finish rendering before printing.
  Evidence: `src/oss_impact_dashboard/report_pdf.py`; `tests/test_report_pdf.py::test_generate_pdf_waits_for_report_ready_and_writes_file`.
- [x] Add a deterministic `data-report-ready` signal.
  Evidence: `web/src/app.js::renderReport`; production-style report preview.
- [x] Fail PDF generation if the report does not become ready.
  Evidence: `src/oss_impact_dashboard/report_pdf.py`; `tests/test_report_pdf.py`.
- [x] Upload PDF as a workflow artifact.
  Evidence: `.github/workflows/generate-report.yml`; `web/tests/deployment.mjs`.
- [x] Copy the latest PDF into the deployed site.
  Evidence: `scripts/publish-report-pdf.mjs`; `web/tests/pdf-publish.mjs`.
- [x] Publish it as `reports/latest.pdf`.
  Evidence: `scripts/publish-report-pdf.mjs`; `web/tests/pdf-publish.mjs`.
- [x] Add a visible `Download latest PDF` link.
  Evidence: `web/src/app.js::renderReport`; `web/tests/deployment.mjs`.
- [x] Add the generation date beside the link.
  Evidence: `web/src/app.js::renderReport`; production-style report preview.
- [x] Add a PDF smoke test.
  Evidence: `tests/test_report_pdf.py`; `web/tests/pdf-publish.mjs`.
- [x] Ensure the PDF contains real rendered metrics, not loading placeholders.
  Evidence: `web/src/app.js::renderReport`; `tests/test_report_pdf.py`.
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
- [x] Backlog correctness.
  Evidence: `tests/test_operations.py::test_current_backlog_equals_open_issues_plus_open_prs_and_month_gaps_are_zero`.
- [x] Closed-unmerged PR handling.
  Evidence: `tests/test_operations.py::test_closed_unmerged_pr_reduces_backlog`.
- [x] Reopened issues.
  Evidence: `tests/test_operations.py::test_reopened_issue_and_deterministic_age`.
- [x] Continuous calendar months.
  Evidence: `tests/test_operations.py::test_current_backlog_equals_open_issues_plus_open_prs_and_month_gaps_are_zero`.
- [x] Reporting periods.
  Evidence: `tests/test_operations.py::test_reporting_period_options_and_previous_period_comparisons`.
- [x] Previous-period comparisons.
  Evidence: `tests/test_operations.py::test_reporting_period_options_and_previous_period_comparisons`.
- [x] Deterministic item age.
  Evidence: `tests/test_operations.py::test_reopened_issue_and_deterministic_age`.
- [x] Label aliases.
  Evidence: `tests/test_operations.py::test_label_aliases_merge_categories`.
- [x] Release calculations.
  Evidence: `tests/test_impact_release_contributors.py::test_release_metrics_count_assets_and_periods`.
- [x] Contributor calculations.
  Evidence: `tests/test_impact_release_contributors.py::test_contributor_metrics_do_not_infer_core_contributors`.
- [ ] Engagement metrics.
- [x] GitHub traffic fixtures.
  Evidence: `tests/test_optional_collectors.py::test_github_traffic_summary`.
- [x] Read the Docs CSV fixtures.
  Evidence: `tests/test_optional_collectors.py::test_readthedocs_csv_parser`.
- [x] Zenodo fixtures.
  Evidence: `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] OpenAlex fixtures.
  Evidence: `tests/test_impact_release_contributors.py::test_impact_metrics_shape_zenodo_and_openalex_fixture`.
- [x] Actions workflow-run fixtures.
  Evidence: `tests/test_optional_collectors.py::test_github_actions_summary`.
- [x] Snapshot logic.
  Evidence: `tests/test_optional_collectors.py::test_snapshot_helpers`.
- [x] Schema validation.
  Evidence: `tests/test_config_dataset.py`.
- [x] Malformed optional-source responses.
  Evidence: `src/oss_impact_dashboard/build_dataset.py::_try_source`; `tests/test_config_dataset.py`.
- [ ] Malformed manual YAML.
- [x] All four pages load.
  Evidence: `web/tests/postbuild.mjs`; production-style local preview.
- [x] Data loads.
  Evidence: `web/src/app.js::loadData`; production-style local preview.
- [x] No browser console errors.
  Evidence: production-style local preview.
- [x] Navigation works at production base.
  Evidence: `web/tests/deployment.mjs`; production-style local preview.
- [x] Navigation works at preview base.
  Evidence: `web/tests/deployment.mjs`; PR-path build with `/oss-impact-dashboard-dev/pr-preview/pr-999/`.
- [x] Summary cards display values.
  Evidence: production-style local preview; `web/src/app.js::renderSummary`.
- [x] Reporting-period selector updates metrics.
  Evidence: `web/src/app.js::applyFilters`; `web/tests/operations-ui.mjs`.
- [x] Combined filters work.
  Evidence: `web/src/app.js::filterMatches`; `web/tests/operations-ui.mjs`.
- [x] Label filter works.
  Evidence: `web/src/app.js::filterMatches`; `web/tests/operations-ui.mjs`.
- [x] Merged PR state displays.
  Evidence: `web/src/app.js::displayState`; `web/tests/operations-ui.mjs`.
- [x] CSV export works.
  Evidence: `web/src/app.js::downloadRows`; `web/tests/operations-ui.mjs`.
- [x] JSON export works.
  Evidence: `web/src/app.js::downloadRows`; `web/tests/operations-ui.mjs`.
- [x] Unsafe text is escaped.
  Evidence: `web/tests/security.mjs`.
- [x] Impact links work.
  Evidence: `web/src/app.js::externalLink`; `web/tests/security.mjs`.
- [x] Report becomes ready.
  Evidence: `web/src/app.js::renderReport`; `tests/test_report_pdf.py`.
- [x] PDF link exists.
  Evidence: `web/src/app.js::renderReport`; `web/tests/deployment.mjs`.
- [x] Mobile viewport works.
  Evidence: responsive CSS in `web/src/styles.css`; production-style preview.
- [x] Test workflow runs on every push and PR.
  Evidence: `.github/workflows/test.yml`; `web/tests/deployment.mjs`.
- [x] Production deploy runs only from main.
  Evidence: `.github/workflows/refresh-deploy.yml`; `web/tests/deployment.mjs`.
- [x] Preview deploy runs only for same-repository PRs.
  Evidence: `.github/workflows/pr-preview.yml`; `web/tests/deployment.mjs`.
- [x] Report workflow uses the same production build.
  Evidence: `.github/workflows/generate-report.yml`; `web/tests/deployment.mjs`.
- [x] Snapshot writes occur only on scheduled/main runs.
  Evidence: no snapshot write workflow exists; `web/tests/deployment.mjs`.
- [x] No feature-branch workflow can change production root files.
  Evidence: `.github/workflows/refresh-deploy.yml`; `.github/workflows/pr-preview.yml`; `web/tests/deployment.mjs`.
- [x] Architecture.
  Evidence: `README.md`.
- [x] Local setup.
  Evidence: `README.md`.
- [x] Production-style local preview.
  Evidence: `README.md`; `scripts/preview-pages.mjs`.
- [x] PR-style local preview.
  Evidence: `README.md`; `web/tests/deployment.mjs`.
- [x] Project configuration.
  Evidence: `README.md`; `projects/mole.yml`.
- [x] Label aliases.
  Evidence: `README.md`; `projects/mole.yml`.
- [x] Reporting periods.
  Evidence: `README.md`; `tests/test_operations.py::test_reporting_period_options_and_previous_period_comparisons`.
- [x] Manual impact data.
  Evidence: `README.md`; `src/oss_impact_dashboard/collectors/manual.py`.
- [x] GitHub authentication.
  Evidence: `README.md`; `src/oss_impact_dashboard/collectors/github.py`.
- [x] GitHub traffic permissions.
  Evidence: `README.md`; `src/oss_impact_dashboard/collectors/github_traffic.py`.
- [x] Read the Docs configuration and CSV fallback.
  Evidence: `README.md`; `src/oss_impact_dashboard/collectors/readthedocs.py`.
- [x] Snapshot behavior.
  Evidence: `README.md`; `src/oss_impact_dashboard/snapshots.py`.
- [x] PDF generation.
  Evidence: `README.md`; `src/oss_impact_dashboard/report_pdf.py`.
- [x] Production deployment.
  Evidence: `README.md`; `.github/workflows/refresh-deploy.yml`.
- [x] PR preview behavior.
  Evidence: `README.md`; `.github/workflows/pr-preview.yml`.
- [x] One-time Pages settings.
  Evidence: `README.md`.
- [x] Preview URL format.
  Evidence: `README.md`; `web/tests/deployment.mjs`.
- [x] Moving to `csrc-sdsu`.
  Evidence: hard-code search passed; `scripts/base-path.mjs`; `README.md`.
- [x] Metric definitions.
  Evidence: `README.md`; `src/oss_impact_dashboard/build_dataset.py`.
- [x] Known limitations.
  Evidence: `README.md`.
- [x] Data privacy and non-inference rules.
  Evidence: `README.md`; `src/oss_impact_dashboard/metrics/contributors.py`.
- [ ] `docs/METRICS.md`
- [ ] `docs/DATA_SOURCES.md`
- [ ] `docs/DEPLOYMENT.md`
- [ ] `docs/FUNDING_REPORT.md`
- [x] Read every line in `IMPLEMENTATION_CHECKLIST.md`.
  Evidence: checklist reconciliation audit completed on branch `codex/reconcile-dashboard-and-pages`.
- [ ] Confirm every non-credential checkbox is checked.
- [x] Confirm every checked item contains evidence.
  Evidence: local checklist audit reported `checked=384 missing_evidence=0`.
- [x] Confirm credential-blocked items have implemented collectors and tests.
  Evidence: `src/oss_impact_dashboard/collectors/github_traffic.py`; `src/oss_impact_dashboard/collectors/readthedocs.py`; `tests/test_optional_collectors.py`.
- [x] Confirm no `TODO`, `FIXME`, fake metric or temporary debug output remains.
  Evidence: `rg` audit found only normal script/test success logging.
- [x] Confirm no secret is committed.
  Evidence: secret audit found only environment-variable names and GitHub secret references, not secret values.
- [x] Confirm no production URL is hard-coded where project configuration should be used.
  Evidence: hard-code audit found no `pritkc/oss-impact-dashboard-dev`, `/oss-impact-dashboard-dev/`, or `https://pritkc.github.io` in reusable code/tests/docs.
- [x] Confirm no MOLE scientific source code was added.
  Evidence: changes are dashboard/config/test/workflow files only; no MOLE scientific source modules added.
- [x] Confirm production still works.
  Evidence: Playwright loaded `http://127.0.0.1:4174/oss-impact-dashboard-dev/` and verified rendered text plus base-scoped JS/CSS.
- [x] Confirm a PR preview works.
  Evidence: Playwright loaded `http://127.0.0.1:4176/oss-impact-dashboard-dev/pr-preview/pr-999/` and verified nested base-scoped JS/CSS.
- [x] Confirm PDF generation works.
  Evidence: `python -m oss_impact_dashboard.report_pdf --url http://127.0.0.1:4174/oss-impact-dashboard-dev/report.html --output reports/latest.pdf`.
- [x] Confirm the latest PDF is publicly linked.
  Evidence: `web/src/app.js::renderReport`; `scripts/publish-report-pdf.mjs`; `web/tests/deployment.mjs`; `web/tests/pdf-publish.mjs`.
- [x] Confirm the final backlog equals current open issues plus current open PRs.
  Evidence: local dataset assertion passed for `web/public/data/dashboard.json`.
- [x] Confirm the default view uses the configured 12-month period.
  Evidence: local dataset assertion passed for `reporting_period.periods.default == "12m"`.
- [x] Confirm all tests pass.
  Evidence: `pytest`; `ruff check .`; `npm ci`; `npm run build:pages`; `npm run test:build`; `npm run test:frontend`; `npm run test:e2e`.
