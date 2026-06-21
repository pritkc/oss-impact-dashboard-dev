# Mandatory Single-Pass Implementation Contract

Repository:

```text
pritkc/oss-impact-dashboard-dev
```

Current production site:

```text
https://pritkc.github.io/oss-impact-dashboard-dev/
```

Create and work on a new branch:

```text
codex/complete-dashboard-and-previews
```

Open one pull request against `main` after all tasks are complete.

---

# Non-negotiable execution rules

1. Complete every implementation task in this document in one continuous pass.
2. Do not stop after implementing only the first few tasks.
3. Do not respond with a partial plan instead of making the changes.
4. Do not leave placeholder functions, unimplemented UI controls, silent `TODO` comments or fake sample metrics.
5. Do not remove currently working functionality.
6. Do not fabricate funding accomplishments, case studies, institutions, users or maintainer-hour data.
7. Missing credentials may prevent live GitHub traffic or Read the Docs data, but they must not prevent implementing and testing their collectors, import paths, schemas and UI states.
8. Create `IMPLEMENTATION_CHECKLIST.md` before modifying application code.
9. Copy every checkbox from this document into that file.
10. All checkboxes must initially be unchecked.
11. Mark a checkbox `[x]` only after:

    * The implementation is complete.
    * Relevant automated tests exist.
    * Relevant tests pass.
    * The feature works in the production-style local preview.
12. Add short evidence after every checked item, for example:

```text
- [x] Fix backlog reconstruction.
  Evidence: metrics/operations.py; tests/test_operations.py::test_closed_unmerged_pr_reduces_backlog
```

13. Only live credential activation may remain unchecked. Mark those explicitly:

```text
- [ ] BLOCKED: Live GitHub traffic activation.
  Reason: requires repository push-level traffic access.
  Implementation and tests are complete.
```

14. Do not mark a task complete merely because code was written.
15. Run the complete test suite after each major phase.
16. At completion, every non-credential task must be checked.
17. Before finalizing, inspect `git diff main...HEAD` and verify that no required task was skipped.
18. Include `IMPLEMENTATION_CHECKLIST.md` in the pull request.
19. Keep all workflows, scripts and configuration generic enough to work after moving the repository into `csrc-sdsu`.
20. Do not ask the user to manually implement any coding task listed below.

---

# Phase 0 — Baseline and safeguards

* [ ] Create branch `codex/complete-dashboard-and-previews`.
* [ ] Create `IMPLEMENTATION_CHECKLIST.md`.
* [ ] Record the current test results before modifications.
* [ ] Record the current production-style build result.
* [ ] Confirm that Overview, Operations, Impact and Report pages currently build.
* [ ] Confirm that `dashboard.json` is included in the built artifact.
* [ ] Preserve all currently working routes and exports.
* [ ] Preserve configuration-driven targeting through `projects/mole.yml`.
* [ ] Preserve unauthenticated public data collection.
* [ ] Preserve graceful source-unavailable states.
* [ ] Ensure no credentials appear in logs, JSON files or frontend assets.

Acceptance criteria:

```text
pytest
ruff check .
npm ci
npm run build:pages
npm run test:build
npm run test:frontend
```

must be run and their baseline results documented in the checklist.

---

# Phase 1 — Security fixes

## 1.1 Remove unsafe HTML insertion

Audit every use of:

```text
innerHTML
insertAdjacentHTML
Tabulator HTML formatters
template strings inserted into DOM
```

API data, issue titles, labels, author names, manual YAML and metric definitions are untrusted input.

* [ ] Replace unsafe HTML rendering with DOM APIs and `textContent` wherever practical.
* [ ] Create one well-tested escaping helper only where HTML strings are unavoidable.
* [ ] Escape issue and PR titles.
* [ ] Escape labels.
* [ ] Escape author names.
* [ ] Escape manual funding content.
* [ ] Escape case-study content.
* [ ] Escape source-status messages.
* [ ] Escape metric definitions.
* [ ] Validate external links.
* [ ] Allow only safe link protocols such as `https:` and `http:`.
* [ ] Add `rel="noopener noreferrer"` to external links opened in new tabs.
* [ ] Ensure malicious issue titles cannot insert HTML or JavaScript.
* [ ] Ensure malicious manual YAML cannot insert HTML or JavaScript.

Required tests:

* [ ] Test rendering a title containing `<script>`.
* [ ] Test rendering a label containing HTML.
* [ ] Test rendering manual text containing an image `onerror` handler.
* [ ] Test rejecting or neutralizing `javascript:` URLs.
* [ ] Add a browser-level test confirming no injected element is created.

Do not continue until these tests pass.

---

# Phase 2 — Correctness fixes

## 2.1 Fix backlog reconstruction

The current calculation removes merged PRs but fails to remove PRs that close without merging.

Implement a mathematically correct monthly backlog:

```text
backlog at month end
= previous backlog
+ issues opened
+ PRs opened
- issues closed
- all PRs closed
```

Merged PRs are a subset of closed PRs and must not be subtracted twice.

* [ ] Track PRs closed during each month.
* [ ] Preserve merged PRs as a separate throughput series.
* [ ] Add closed-unmerged PRs as a separate series where useful.
* [ ] Ensure the final reconstructed backlog equals the current number of open issues plus open PRs.
* [ ] Ensure backlog never becomes negative because of calculation errors.
* [ ] Rename ambiguous trend fields if necessary.
* [ ] Correct `net_backlog_change`.

Required tests:

* [ ] Closed-unmerged PR reduces backlog.
* [ ] Merged PR reduces backlog exactly once.
* [ ] Current backlog equals open issue count plus open PR count.
* [ ] Mixed issue/PR lifecycle fixture produces the expected monthly series.
* [ ] Reopened issues are reflected correctly.

## 2.2 Make calculations reproducible

* [ ] Use the dataset’s `generated_at` timestamp when calculating item age.
* [ ] Do not call the wall clock independently for every item.
* [ ] Ensure the same fixture and `generated_at` produce identical output.
* [ ] Add deterministic age tests.

## 2.3 Continuous calendar months

The trend series must include months with no activity.

* [ ] Generate every calendar month between the selected start and end dates.
* [ ] Insert zero values for months without activity.
* [ ] Ensure chart spacing represents actual monthly time.
* [ ] Add tests covering a multi-month gap.

## 2.4 Reporting periods

The configured 12-month reporting period currently does not restrict metrics.

Implement:

```text
3 months
6 months
12 months
All time
```

* [ ] Use `reporting.default_period_months` as the initial selection.
* [ ] Calculate period-specific opened, closed, merged and backlog-change metrics.
* [ ] Calculate period-specific close and merge medians.
* [ ] Calculate period-specific contributor and release metrics where appropriate.
* [ ] Keep current backlog counts independent of the selected historical period.
* [ ] Add a reusable period-selection control.
* [ ] Preserve the selected period while navigating pages, using URL parameters or local storage.
* [ ] Display the active reporting period beside every time-based chart.
* [ ] Ensure the funding report has an explicit start and end date.
* [ ] Add tests for all four period selections.

## 2.5 Canonicalize labels

Add configurable label aliases in `projects/mole.yml`.

Support mappings similar to:

```yaml
label_aliases:
  documentation: Documentation
  enhancement: Enhancement
  bug: Bug
  good first issue: Good first issue
  discussion: Discussion
  matlab/octave: Octave/MATLAB
```

* [ ] Apply aliases case-insensitively.
* [ ] Apply aliases to current labels.
* [ ] Apply aliases to reconstructed closure labels.
* [ ] Combine metrics for aliases into one category.
* [ ] Preserve the original labels on item detail records for traceability.
* [ ] Add tests for alias merging.
* [ ] Document how another project can configure aliases.

## 2.6 Correct naming

* [ ] Rename the age-based “Stale items” KPI to `Open over <threshold> days`.
* [ ] Continue showing the actual GitHub `stale` label separately.
* [ ] Explain the configured threshold in a tooltip or definition.
* [ ] Ensure the terminology is consistent across pages, CSV, JSON and PDF.

---

# Phase 3 — Data contract and provenance

* [ ] Increment the schema version.
* [ ] Add an explicit schema validation layer.
* [ ] Include the reporting-period start and end dates.
* [ ] Include collection timestamps for each source.
* [ ] Include the source URL or source identifier where safe.
* [ ] Include status: available, unavailable, partial or error.
* [ ] Include a human-readable limitation for every source.
* [ ] Include GitHub API requests used.
* [ ] Include rate-limit remaining.
* [ ] Include authenticated versus unauthenticated status.
* [ ] Add a visible data freshness warning if the dataset is older than a configured threshold.
* [ ] Ensure missing optional sources do not remove unrelated metrics.
* [ ] Ensure a malformed optional source response does not break the dashboard.
* [ ] Avoid repeatedly calling `build_impact()` during one dataset build.
* [ ] Build impact data once and reuse it.
* [ ] Add schema regression tests.
* [ ] Add source-failure fixture tests.
* [ ] Add malformed-source fixture tests.

---

# Phase 4 — Overview page

Redesign the Overview page so that it communicates project health and impact rather than functioning mainly as a diagnostics page.

## Required sections

### 4.1 Header

* [ ] Project name.
* [ ] Repository link.
* [ ] Documentation link when configured.
* [ ] JOSS/citation link when configured.
* [ ] Human-readable last refresh time.
* [ ] Active reporting period.
* [ ] Data freshness state.

### 4.2 Maintainer health cards

Include:

* [ ] Open issues.
* [ ] Open PRs.
* [ ] Untriaged items.
* [ ] Open over threshold days.
* [ ] Median issue-close time.
* [ ] Median PR-merge time.
* [ ] Net backlog change during the selected period.
* [ ] Latest release age.

### 4.3 Impact cards

Include:

* [ ] Zenodo downloads.
* [ ] Zenodo views.
* [ ] Citation count.
* [ ] Unique contributors.
* [ ] Releases during the selected period.
* [ ] GitHub release-asset downloads with an explanatory note when zero.

### 4.4 Period comparisons

* [ ] Display current-period versus previous-equal-period change where mathematically meaningful.
* [ ] Show the direction and magnitude.
* [ ] Do not show misleading percentage changes when the previous value is zero.
* [ ] Add tests for comparison calculations.

### 4.5 Action summary

Show three to six actionable maintainer items:

* [ ] Oldest open issue.
* [ ] Oldest open PR.
* [ ] Untriaged item.
* [ ] Highest-age item.
* [ ] Recently reopened issue when available.
* [ ] Link every item to GitHub.

### 4.6 Charts

* [ ] Activity trend.
* [ ] Corrected backlog trend.
* [ ] Small adoption/impact trend when historical data exists.
* [ ] Accessible text summary for every chart.
* [ ] Clear axis labels.
* [ ] Active period in chart subtitle.

### 4.7 Methodology

* [ ] Move source status and metric definitions below the primary dashboard.
* [ ] Place them in collapsible sections.
* [ ] Keep them available for auditing.
* [ ] Do not let diagnostics dominate the first screen.

### 4.8 Navigation

* [ ] Make relevant cards link to Operations or Impact.
* [ ] Ensure keyboard navigation works.
* [ ] Ensure mobile layout works at 320px width.

---

# Phase 5 — Maintainer Operations page

## 5.1 Filters

Implement a single combined filtering system.

Required filters:

* [ ] Text search.
* [ ] Issue or PR type.
* [ ] Open, closed or merged state.
* [ ] Label.
* [ ] Author.
* [ ] Created-date range.
* [ ] Closed-date range.
* [ ] Age range.
* [ ] Reporting period.
* [ ] Clear-all button.

Rules:

* [ ] Applying one filter must not erase the others.
* [ ] Search must combine with every selected filter.
* [ ] CSV export must export filtered rows.
* [ ] JSON export must export filtered rows.
* [ ] Result count must update.
* [ ] Active filter summary must be visible.
* [ ] Filters must be represented in the URL or otherwise preserved on refresh.

Required tests:

* [ ] Search plus label filter.
* [ ] Type plus state filter.
* [ ] Date plus age filter.
* [ ] Clear-all behavior.
* [ ] Export respects active filters.

## 5.2 Table improvements

* [ ] Display merged PRs as `Merged`, not merely `Closed`.
* [ ] Add author column.
* [ ] Add age column.
* [ ] Add time-to-close or time-to-merge column.
* [ ] Format timestamps into readable dates.
* [ ] Preserve raw timestamps in exports.
* [ ] Display labels as safely rendered pills.
* [ ] Add default sorting appropriate for maintainer use.
* [ ] Keep direct GitHub links.
* [ ] Ensure responsive layout.
* [ ] Avoid rendering hundreds of rows at once.

## 5.3 Charts

Add:

* [ ] Opened versus completed issues/PRs.
* [ ] Correct backlog trend.
* [ ] Open-item age buckets:

  * Under 30 days
  * 30–90 days
  * 91–180 days
  * Over 180 days
* [ ] Work by canonical label/component.
* [ ] Issue versus PR composition.
* [ ] Close/merge-time distribution or percentile display.

All charts must respond to the active reporting period where appropriate.

## 5.4 Queues

Implement:

* [ ] Oldest open issues.
* [ ] Oldest open PRs.
* [ ] Untriaged.
* [ ] Open over threshold.
* [ ] Recently reopened.
* [ ] High-priority items based on configurable priority-label patterns.
* [ ] PRs waiting for review when review data is available.
* [ ] Issues without an external response when engagement data is available.
* [ ] “View all” action that applies the corresponding table filters.

## 5.5 Engagement metrics

Implement an optional, authenticated and bounded collection strategy for:

* [ ] First response by someone other than the author.
* [ ] First PR review.
* [ ] PRs awaiting review.
* [ ] Issues without an external response.
* [ ] Median first-response time.
* [ ] Median first-review time.
* [ ] 90th-percentile response and review time.

Requirements:

* [ ] Use GraphQL or another batched strategy rather than one unbounded request per item.
* [ ] Enforce a request budget.
* [ ] Cache reusable data within the run.
* [ ] Record source status and limitations.
* [ ] Mark the metrics unavailable without authentication.
* [ ] Do not display fabricated zeroes when unavailable.
* [ ] Add fixture-based tests.
* [ ] Do not make unit tests call live APIs.

---

# Phase 6 — Releases and delivery

Add a complete release section to the appropriate pages.

* [ ] Total releases.
* [ ] Releases in selected period.
* [ ] Latest release.
* [ ] Days since latest release.
* [ ] Median release interval.
* [ ] Release timeline.
* [ ] Version links.
* [ ] Release asset count.
* [ ] Release asset downloads by version.
* [ ] Total release asset downloads.
* [ ] Explain that generated source archives are excluded.
* [ ] Explain zero release downloads when no uploaded assets exist.
* [ ] Add release-related chart or timeline.
* [ ] Include release metrics in the funding report.
* [ ] Add release calculation tests.

---

# Phase 7 — Contributors and community

Implement and display:

* [ ] Unique contributors.
* [ ] Commit contributors.
* [ ] Issue and PR authors.
* [ ] PR authors.
* [ ] Merged-PR authors.
* [ ] New contributors during selected period.
* [ ] Repeat contributors during selected period.
* [ ] First-time PR authors.
* [ ] First-time merged-PR authors.
* [ ] Contributor trend by month.
* [ ] Top contributors with links.
* [ ] Contribution concentration among top one, three and five contributors.
* [ ] Bot exclusion.
* [ ] Document limitations.

Add optional project configuration:

```yaml
core_contributors: []
```

* [ ] Calculate external/non-core contribution share only when `core_contributors` is configured.
* [ ] Display `Not configured` rather than guessing maintainers.
* [ ] Do not infer employment, affiliation or demographics.
* [ ] Add fixture-based contributor tests.
* [ ] Add contributor charts to Impact.
* [ ] Add contributor metrics to the funding report.

Reviewer concentration may be added only when reliable review data is available.

---

# Phase 8 — Impact and adoption page

## 8.1 Automated impact sources

Display:

* [ ] Zenodo downloads.
* [ ] Zenodo unique downloads.
* [ ] Zenodo views.
* [ ] Zenodo unique views.
* [ ] Zenodo title and DOI.
* [ ] Direct Zenodo link.
* [ ] OpenAlex citation count.
* [ ] Citations by year.
* [ ] Publication title and year.
* [ ] Direct OpenAlex link.
* [ ] JOSS/DOI link.
* [ ] GitHub release downloads.
* [ ] Contributor/community metrics.
* [ ] Release history.

## 8.2 Provenance

For every metric group display:

* [ ] Source.
* [ ] Collection timestamp.
* [ ] Reporting period.
* [ ] Metric definition.
* [ ] Known limitation.
* [ ] Availability status.

## 8.3 Manual impact data

Expand `manual/case-studies.yml` and `manual/funding.yml` schemas to support:

```text
case studies
known institutions
publications
courses
workshops
students or trainees
conference talks
downstream integrations
awards or recognition
maintainer effort
funding sources
risks
requested work
targets
```

Requirements:

* [ ] Render only supplied data.
* [ ] Never invent entries.
* [ ] Hide empty public sections rather than displaying unfinished placeholders.
* [ ] Show a clear configuration message only in development/admin documentation.
* [ ] Validate manual YAML.
* [ ] Add tests for valid and malformed manual files.
* [ ] Add safe rendering tests.

## 8.4 Documentation analytics

Implement both:

1. Read the Docs API integration when credentials become available.
2. CSV import fallback.

Support:

* [ ] Documentation page views.
* [ ] Popular pages.
* [ ] Search queries.
* [ ] Searches returning no results.
* [ ] 404 pages.
* [ ] Collection/import date.
* [ ] Source status.
* [ ] CSV validation.
* [ ] Fixture-based tests.
* [ ] UI for unavailable status.
* [ ] UI for imported/live metrics.

Do not require live credentials for tests.

## 8.5 GitHub traffic

Implement the collector, schema and UI for:

* [ ] Repository views.
* [ ] Unique visitors.
* [ ] Clones.
* [ ] Unique cloners.
* [ ] Referring sites.
* [ ] Popular paths.
* [ ] Snapshot timestamp.
* [ ] Source limitations.
* [ ] Authentication requirement.
* [ ] Fixture-based tests.
* [ ] Graceful unavailable state.

Live activation may remain blocked until permission is available.

---

# Phase 9 — Quality and CI signals

Add a lightweight GitHub Actions quality section without introducing a backend service.

Collect for a configurable recent period:

* [ ] Total workflow runs.
* [ ] Successful runs.
* [ ] Failed runs.
* [ ] Cancelled runs.
* [ ] Success rate.
* [ ] Median workflow duration when available.
* [ ] Recent failed runs with links.
* [ ] Source status and limitations.

Requirements:

* [ ] Use bounded pagination.
* [ ] Do not fetch every historical workflow run.
* [ ] Add fixture-based tests.
* [ ] Display the section in Operations or Impact.
* [ ] Include a concise CI reliability summary in the funding report.

Do not add Grafana, Elasticsearch or a database.

---

# Phase 10 — Historical snapshots

Only snapshot metrics that cannot be reconstructed accurately from repository history.

Examples:

```text
GitHub traffic
Read the Docs analytics
Zenodo cumulative totals
external cumulative statistics
```

* [ ] Create a versioned snapshot schema.
* [ ] Add snapshot read/write commands.
* [ ] Ensure feature-branch previews never write production snapshots.
* [ ] Allow scheduled main-branch runs to append snapshots.
* [ ] Store snapshots in a dedicated `metrics-history` branch or another clearly isolated persistent location.
* [ ] Prevent workflow recursion.
* [ ] Deduplicate same-day snapshots.
* [ ] Add retention/documentation policy.
* [ ] Use snapshots for impact trends.
* [ ] Add fixture and command tests.
* [ ] Do not snapshot data already reconstructable from issue/PR timestamps.

---

# Phase 11 — Funding report

The current report is only a text scaffold. Replace it with a real printable report.

## Required report structure

* [ ] Cover/title section.
* [ ] Project overview.
* [ ] Exact reporting period.
* [ ] Executive KPI summary.
* [ ] Major accomplishments.
* [ ] Adoption and downloads.
* [ ] Documentation reach.
* [ ] Scientific publications and citations.
* [ ] Development and maintenance activity.
* [ ] Release delivery.
* [ ] Contributors and community.
* [ ] CI and reliability.
* [ ] Maintainer capacity.
* [ ] Technical debt and sustainability risks.
* [ ] Requested work packages.
* [ ] Baseline → target → expected-outcome table.
* [ ] Case studies.
* [ ] Methodology.
* [ ] Data sources.
* [ ] Limitations.
* [ ] Generated-at timestamp.

## Report presentation

* [ ] Add KPI cards.
* [ ] Add meaningful charts.
* [ ] Add compact tables.
* [ ] Use page-break controls.
* [ ] Avoid clipped charts and tables.
* [ ] Ensure links are printed visibly where useful.
* [ ] Ensure colors remain understandable in grayscale.
* [ ] Hide navigation and interactive controls in print.
* [ ] Add page numbers if feasible.
* [ ] Use Letter-sized output.

## Manual sections

* [ ] Render accomplishments from YAML.
* [ ] Render risks from YAML.
* [ ] Render requested work from YAML.
* [ ] Render targets from YAML.
* [ ] Render maintainer capacity from YAML.
* [ ] Render case studies from YAML.
* [ ] Hide empty sections.
* [ ] Do not show messages such as “add content in funding.yml” to report readers.

## PDF

* [ ] Generate PDF through Playwright.
* [ ] Wait until data and charts finish rendering before printing.
* [ ] Add a deterministic `data-report-ready` signal.
* [ ] Fail PDF generation if the report does not become ready.
* [ ] Upload PDF as a workflow artifact.
* [ ] Copy the latest PDF into the deployed site.
* [ ] Publish it as `reports/latest.pdf`.
* [ ] Add a visible `Download latest PDF` link.
* [ ] Add the generation date beside the link.
* [ ] Add a PDF smoke test.
* [ ] Ensure the PDF contains real rendered metrics, not loading placeholders.

---

# Phase 12 — GitHub Pages production and pull-request previews

GitHub Pages production and previews must coexist without overwriting each other.

## 12.1 Vite base path

Update Vite configuration to support an explicit environment variable:

```text
VITE_BASE_PATH
```

Priority:

```text
VITE_BASE_PATH
then inferred GitHub repository base
then /
```

Production base:

```text
/oss-impact-dashboard-dev/
```

PR preview base:

```text
/oss-impact-dashboard-dev/pr-preview/pr-<PR_NUMBER>/
```

* [ ] Ensure all JS and CSS assets use the configured base.
* [ ] Ensure navigation works at both bases.
* [ ] Ensure data loading works at both bases.
* [ ] Ensure PDF/report links work at both bases.
* [ ] Update post-build tests for arbitrary base paths.

## 12.2 Production deployment

Replace the current `actions/deploy-pages` production deployment with a branch-based deployment.

Create or update a workflow that:

* [ ] Runs only on `main` pushes and manual dispatch.
* [ ] Builds the current data.
* [ ] Runs all required tests.
* [ ] Builds with production `VITE_BASE_PATH`.
* [ ] Deploys `dist/` to the root of `gh-pages`.
* [ ] Uses `contents: write`.
* [ ] Preserves the `pr-preview` directory during production cleanup.
* [ ] Does not deploy production from feature branches.
* [ ] Uses concurrency so two production deployments cannot race.
* [ ] Creates `.nojekyll`.
* [ ] Fails rather than publishing when tests fail.

Use a maintained branch-deployment action such as:

```text
JamesIves/github-pages-deploy-action
```

Configure:

```yaml
branch: gh-pages
folder: dist
clean: true
clean-exclude: pr-preview
```

## 12.3 Pull-request previews

Create `.github/workflows/pr-preview.yml`.

Trigger:

```yaml
pull_request:
  types:
    - opened
    - reopened
    - synchronize
    - closed
```

Requirements:

* [ ] Build previews only for pull requests whose head branch belongs to this repository.
* [ ] Do not use `pull_request_target`.
* [ ] Use `contents: write`.
* [ ] Use `pull-requests: write`.
* [ ] Run Python tests.
* [ ] Run frontend tests.
* [ ] Build a fresh dashboard dataset.
* [ ] Build with the PR-specific base path.
* [ ] Run post-build tests.
* [ ] Publish under `pr-preview/pr-<number>/`.
* [ ] Comment the preview URL on the PR.
* [ ] Update the same preview after every push.
* [ ] Remove preview files when the PR closes.
* [ ] Do not overwrite production.
* [ ] Disable external QR-code generation.
* [ ] Use workflow concurrency per PR.

Use:

```text
rossjrw/pr-preview-action
```

with:

```yaml
source-dir: dist
preview-branch: gh-pages
umbrella-dir: pr-preview
wait-for-pages-deployment: true
qr-code: false
```

## 12.4 Preview acceptance tests

* [ ] Open a test PR.
* [ ] Verify preview workflow succeeds.
* [ ] Verify the workflow comments a preview URL.
* [ ] Verify Overview loads.
* [ ] Verify Operations loads.
* [ ] Verify Impact loads.
* [ ] Verify Report loads.
* [ ] Verify `dashboard.json` loads.
* [ ] Verify JS/CSS assets load without 404s.
* [ ] Verify navigation remains within the preview path.
* [ ] Verify production remains unchanged.
* [ ] Push another commit and verify preview updates.
* [ ] Close the test PR and verify preview cleanup.

Document the manual Pages setting change in README:

```text
Settings → Pages → Deploy from a branch → gh-pages → /(root)
```

---

# Phase 13 — Testing

## Python tests

Add or expand tests for:

* [ ] Backlog correctness.
* [ ] Closed-unmerged PR handling.
* [ ] Reopened issues.
* [ ] Continuous calendar months.
* [ ] Reporting periods.
* [ ] Previous-period comparisons.
* [ ] Deterministic item age.
* [ ] Label aliases.
* [ ] Release calculations.
* [ ] Contributor calculations.
* [ ] Engagement metrics.
* [ ] GitHub traffic fixtures.
* [ ] Read the Docs CSV fixtures.
* [ ] Zenodo fixtures.
* [ ] OpenAlex fixtures.
* [ ] Actions workflow-run fixtures.
* [ ] Snapshot logic.
* [ ] Schema validation.
* [ ] Malformed optional-source responses.
* [ ] Malformed manual YAML.

## Frontend tests

Add browser-level tests using Playwright or another appropriate tool.

Test:

* [ ] All four pages load.
* [ ] Data loads.
* [ ] No browser console errors.
* [ ] Navigation works at production base.
* [ ] Navigation works at preview base.
* [ ] Summary cards display values.
* [ ] Reporting-period selector updates metrics.
* [ ] Combined filters work.
* [ ] Label filter works.
* [ ] Merged PR state displays.
* [ ] CSV export works.
* [ ] JSON export works.
* [ ] Unsafe text is escaped.
* [ ] Impact links work.
* [ ] Report becomes ready.
* [ ] PDF link exists.
* [ ] Mobile viewport works.

## Workflow checks

* [ ] Test workflow runs on every push and PR.
* [ ] Production deploy runs only from main.
* [ ] Preview deploy runs only for same-repository PRs.
* [ ] Report workflow uses the same production build.
* [ ] Snapshot writes occur only on scheduled/main runs.
* [ ] No feature-branch workflow can change production root files.

## Final commands

Run all of these before completion:

```bash
python -m pip install -e ".[dev,report]"
pytest
ruff check .
npm ci
npm run build:pages
npm run test:build
npm run test:frontend
npm run test:e2e
```

Also run a production-path preview and a PR-path preview locally.

Do not mark the testing phase complete until every command succeeds.

---

# Phase 14 — Documentation

Update README with:

* [ ] Architecture.
* [ ] Local setup.
* [ ] Production-style local preview.
* [ ] PR-style local preview.
* [ ] Project configuration.
* [ ] Label aliases.
* [ ] Reporting periods.
* [ ] Manual impact data.
* [ ] GitHub authentication.
* [ ] GitHub traffic permissions.
* [ ] Read the Docs configuration and CSV fallback.
* [ ] Snapshot behavior.
* [ ] PDF generation.
* [ ] Production deployment.
* [ ] PR preview behavior.
* [ ] One-time Pages settings.
* [ ] Preview URL format.
* [ ] Moving to `csrc-sdsu`.
* [ ] Metric definitions.
* [ ] Known limitations.
* [ ] Data privacy and non-inference rules.

Add:

* [ ] `docs/METRICS.md`
* [ ] `docs/DATA_SOURCES.md`
* [ ] `docs/DEPLOYMENT.md`
* [ ] `docs/FUNDING_REPORT.md`

---

# Phase 15 — Final verification

Before opening the pull request:

* [ ] Read every line in `IMPLEMENTATION_CHECKLIST.md`.
* [ ] Confirm every non-credential checkbox is checked.
* [ ] Confirm every checked item contains evidence.
* [ ] Confirm credential-blocked items have implemented collectors and tests.
* [ ] Confirm no `TODO`, `FIXME`, fake metric or temporary debug output remains.
* [ ] Confirm no secret is committed.
* [ ] Confirm no production URL is hard-coded where project configuration should be used.
* [ ] Confirm no MOLE scientific source code was added.
* [ ] Confirm production still works.
* [ ] Confirm a PR preview works.
* [ ] Confirm PDF generation works.
* [ ] Confirm the latest PDF is publicly linked.
* [ ] Confirm the final backlog equals current open issues plus current open PRs.
* [ ] Confirm the default view uses the configured 12-month period.
* [ ] Confirm all tests pass.

Use coherent commits, for example:

```text
fix: secure rendering and correct operations metrics
feat: add reporting periods and canonical labels
feat: complete maintainer operations views
feat: add release contributor and quality analytics
feat: complete impact and funding report
feat: add private-source adapters and snapshots
ci: add production and pull-request Pages deployments
test: add end-to-end and metric regression coverage
docs: document metrics deployment and funding reports
```

---

# Required final Codex response

Do not provide only a general summary.

Provide:

1. Pull request URL
2. Branch name
3. Production URL
4. PR preview URL
5. Number of completed checklist tasks
6. Number of blocked live-credential tasks
7. Full test command results
8. Production build result
9. Preview build result
10. PDF generation result
11. Public PDF URL
12. Corrected current backlog value
13. API requests used
14. List of implemented data sources
15. List of unavailable live sources
16. Remaining manual one-time GitHub settings
17. Confirmation that `IMPLEMENTATION_CHECKLIST.md` is committed
18. Confirmation that every non-credential checkbox is checked

Do not finish until the entire checklist has been executed.
