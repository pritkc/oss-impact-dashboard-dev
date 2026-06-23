# OSS Impact Dashboard — Technical Implementation Plan

**Based on:** `docs/research-report.md`
**Date:** 2026-06-22
**Author:** Prit Chakalasiya

---

## Table of Contents

1. [Architecture Overview & Conventions](#1-architecture-overview--conventions)
2. [Project Plan 1 — Populate Manual Data Layer](#project-plan-1--populate-manual-data-layer)
3. [Project Plan 2 — Display GitHub Repository Metadata](#project-plan-2--display-github-repository-metadata)
4. [Project Plan 3 — Remove `private_sources` Placeholder](#project-plan-3--remove-private_sources-placeholder)
5. [Project Plan 4 — Populate `core_contributors`](#project-plan-4--populate-core_contributors)
6. [Project Plan 5 — Bus Factor](#project-plan-5--bus-factor)
7. [Project Plan 6 — OpenSSF Scorecard Collector](#project-plan-6--openssf-scorecard-collector)
8. [Project Plan 7 — Community Standards Compliance](#project-plan-7--community-standards-compliance)
9. [Project Plan 8 — Downstream Package Adoption](#project-plan-8--downstream-package-adoption)
10. [Project Plan 9 — Security Health Section (UI)](#project-plan-9--security-health-section-ui)
11. [Project Plan 10 — Adoption Matrix Section (UI)](#project-plan-10--adoption-matrix-section-ui)
12. [Project Plan 11 — Community Standards Checklist (UI)](#project-plan-11--community-standards-checklist-ui)
13. [Project Plan 12 — Newcomer Funnel Metrics](#project-plan-12--newcomer-funnel-metrics)
14. [Project Plan 13 — Change Request Closure Ratio](#project-plan-13--change-request-closure-ratio)
15. [Project Plan 14 — Defect Resolution Duration](#project-plan-14--defect-resolution-duration)
16. [Project Plan 15 — Release Cadence Consistency](#project-plan-15--release-cadence-consistency)
17. [Project Plan 16 — Label-Specific Aging](#project-plan-16--label-specific-aging)
18. [Project Plan 17 — Extend Snapshot History](#project-plan-17--extend-snapshot-history)
19. [Project Plan 18 — Governance Health Tracker](#project-plan-18--governance-health-tracker)
20. [Project Plan 19 — Annual Targets Progress Tracker](#project-plan-19--annual-targets-progress-tracker)
21. [Project Plan 20 — Restructure PDF Report for NSF](#project-plan-20--restructure-pdf-report-for-nsf)
22. [Project Plan 21 — Governance Health Panel (UI)](#project-plan-21--governance-health-panel-ui)
23. [Project Plan 22 — Contributor Diversity Panel (UI)](#project-plan-22--contributor-diversity-panel-ui)
24. [Project Plan 23 — CI Workflow-Specific Breakdown](#project-plan-23--ci-workflow-specific-breakdown)
25. [Project Plan 24 — Docs Visitor Trend on Impact Page](#project-plan-24--docs-visitor-trend-on-impact-page)
26. [Project Plan 25 — Libyears / Dependency Freshness](#project-plan-25--libyears--dependency-freshness)
27. [Project Plan 26 — Organizational Diversity](#project-plan-26--organizational-diversity)
28. [Project Plan 27 — MATLAB File Exchange Metrics](#project-plan-27--matlab-file-exchange-metrics)
29. [Project Plan 28 — Period Comparison Extensions](#project-plan-28--period-comparison-extensions)
30. [Project Plan 29 — Schema Version Bump & Validation](#project-plan-29--schema-version-bump--validation)
31. [Project Plan 30 — CI/CD Workflow Updates](#project-plan-30--cicd-workflow-updates)
32. [Dependency Graph & Execution Order](#dependency-graph--execution-order)

---

## 1. Architecture Overview & Conventions

### Data Pipeline

```
projects/*.yml → Python collectors → raw data → metric builders → dashboard.json → Vite build → GitHub Pages
manual/*.yml ↗                                                              ↓
                                                                        web/src/app.js → Chart.js → PDF report
```

### Key Files

| Layer | File | Responsibility |
|-------|------|----------------|
| Config | `projects/mole.yml` | Project metadata, enabled sources, reporting params |
| Config | `src/oss_impact_dashboard/config.py` | `ProjectConfig` dataclass, YAML loading, `source_enabled()` |
| Collectors | `src/oss_impact_dashboard/collectors/*.py` | Fetch raw data from external APIs |
| Metrics | `src/oss_impact_dashboard/metrics/*.py` | Transform raw data into structured metrics |
| Orchestration | `src/oss_impact_dashboard/build_dataset.py` | `build_dataset()` — calls all collectors, builds `data` dict |
| Schema | `src/oss_impact_dashboard/schema.py` | `SCHEMA_VERSION=4`, `validate_dashboard_dataset()`, utility fns |
| Snapshots | `src/oss_impact_dashboard/snapshots.py` | `snapshot_record()`, `append_snapshot()`, `impact_trends()` |
| CLI | `src/oss_impact_dashboard/cli.py` | `build`, `doctor`, `snapshot-append`, `project-info` commands |
| Frontend | `web/src/app.js` | All rendering logic (1366 lines) |
| Frontend | `web/src/registry.js` | Chart/KPI/Section registry system |
| Frontend | `web/src/safe-dom.js` | DOM element creation helpers (`element()`, `clear()`, `externalLink()`) |
| HTML | `web/index.html`, `web/operations.html`, `web/impact.html`, `web/report.html` | Page shells |
| Tests (Python) | `tests/test_*.py` | Pytest-based unit tests |
| Tests (JS) | `web/tests/*.mjs` | Node-based frontend/smoke tests |
| CI | `.github/workflows/*.yml` | `test.yml`, `refresh-deploy.yml`, `generate-report.yml`, `pr-preview.yml` |

### Conventions

- **Collectors** are standalone functions (e.g., `fetch_zenodo(doi)`) returning a dict or raising. Called via `_try_source()` in `build_dataset.py` which wraps errors into `source_status` objects.
- **Metric builders** (e.g., `build_contributors()`) take raw data dicts and return structured metric dicts. Pure functions.
- **Schema version** is `4`. Any new top-level keys require a version bump.
- **Frontend** uses vanilla JS with `safe-dom.js` helpers. Charts use Chart.js via the `chart()` helper. No framework.
- **No external Python dependencies** beyond PyYAML. New collectors must use `urllib.request` (not `requests`).
- **Tests**: Python tests use `pytest` with fixtures in `tests/fixtures/`. Frontend tests are Node scripts run via `npm run test:frontend`.

### Schema Change Protocol

1. Bump `SCHEMA_VERSION` in `schema.py`
2. Add new keys to `validate_dashboard_dataset()` required list if top-level
3. Add new keys to `snapshot_record()` if cumulative
4. Update `metric_definitions` dict in `build_dataset.py`
5. Update frontend rendering in `app.js`
6. Add/update tests
7. Update `test_config_dataset.py` to validate new schema

---

## Project Plan 1 — Populate Manual Data Layer

**Priority:** Critical | **Phase:** 1 | **Effort:** 1-2 hours

### Context

`manual/funding.yml` and `manual/case-studies.yml` are empty placeholders. The report page already renders this data — it just has nothing to show. This is the single highest-impact improvement for federal funding reports.

### Subtasks

#### 1.1 Populate `manual/funding.yml`

**File:** `manual/funding.yml`

Replace the empty placeholder with real MOLE data:
- `reporting_period: "2026"`
- `accomplishments`: 5 entries (v1.2.0 release, JOSS paper, governance circles, course integration, MATLAB File Exchange)
- `maintainer_capacity`: `funded_hours: 40`, `volunteer_hours: 20`, `funding_sources` list (NSF POSE Phase II, SDSU support)
- `risks`: 3 entries (bus factor dependency, no Spack/conda-forge, limited Python bindings) with `risk`, `severity`, `mitigation`
- `requested_work`: 3 entries (Spack packaging, Python bindings, benchmark suite) with `package`, `effort`, `impact`
- `targets`: 2026 annual targets for `unique_contributors` (25→40), `median_issue_close_days` (15→7), `release_cadence_months` (12→6), `citation_count` (6→15), `openssf_score` (null→7)

#### 1.2 Populate `manual/case-studies.yml`

**File:** `manual/case-studies.yml`

Add 3 case studies:
1. "3D Viscoelastic Anisotropic Seismic Modeling" — ICOSAHOM 2014, DOI: 10.1007/978-3-319-19800-2_18
2. "MOLE in SDSU Graduate Course" — CS 650, Fall 2025, 25 students
3. "MOLE JOSS Publication" — doi:10.21105/joss.06288

Each with `title`, `authors`, `publication`/`course`, `outcome`, `doi`, `evidence_url`.

#### 1.3 Tests

**File:** `tests/test_manual_data.py` (new)

- `test_funding_yml_has_accomplishments`: Assert `accomplishments` is non-empty list
- `test_funding_yml_has_targets`: Assert `targets` non-empty with `year` and `metrics`
- `test_funding_yml_has_risks`: Assert `risks` non-empty with `risk`, `severity`, `mitigation`
- `test_case_studies_yml_has_entries`: Assert `case_studies` non-empty
- `test_case_study_has_required_fields`: Assert each has `title` and `outcome`
- `test_build_impact_passes_manual_data`: Call `build_impact(None, None, manual_dict)`, assert manual data flows through

---

## Project Plan 2 — Display GitHub Repository Metadata

**Priority:** Critical | **Phase:** 1 | **Effort:** 2-3 hours

### Context

The GitHub collector fetches repository metadata at `collectors/github.py:166` (`client.one(repo_path(owner, repo, ""))`). The `repository` dict contains `stargazers_count`, `forks_count`, `subscribers_count`, `network_count`, `open_issues_count`, `license`, `topics`. These are in `github_raw["repository"]` but never extracted into `summary` or displayed.

### Subtasks

#### 2.1 Extract metadata in `build_dataset.py`

**File:** `src/oss_impact_dashboard/build_dataset.py`

Add to `summary` dict (around line 316):
```python
"stars": (github_raw or {}).get("repository", {}).get("stargazers_count"),
"forks": (github_raw or {}).get("repository", {}).get("forks_count"),
"watchers": (github_raw or {}).get("repository", {}).get("subscribers_count"),
```

Add new top-level key `repository_metadata` with: `stars`, `forks`, `watchers`, `network_count`, `open_issues_count`, `license` (spdx_id), `default_branch`, `created_at`, `updated_at`, `pushed_at`, `size`, `language`, `topics`.

Add to `metric_definitions`: entries for `stars`, `forks`, `watchers`.

#### 2.2 Add to snapshot record

**File:** `src/oss_impact_dashboard/snapshots.py`

In `snapshot_record()` (line 39-59), add `stars`, `forks`, `watchers` from `data.get("repository_metadata")`.
In `impact_trends()` (line 102-121), add `stars`, `forks`, `watchers` arrays.

#### 2.3 Display in frontend

**File:** `web/src/app.js`

- `renderSummary()` (line ~150): Add KPI cards for stars, forks, watchers
- `renderImpactSummary()` (line ~820): Add to impact KPI strip
- `renderSnapshotTrend()` (line ~1004): Add `stars` and `forks` datasets
- `renderReport()` (line ~1202): Add to "Adoption and Downloads" table

#### 2.4 Tests

**File:** `tests/test_repository_metadata.py` (new)

- `test_summary_contains_stars`: Mock `github_raw` with `stargazers_count=42`, assert `data["summary"]["stars"]==42`
- `test_repository_metadata_extracted`: Assert all fields present
- `test_snapshot_record_includes_stars`: Assert `stars` in snapshot record
- `test_impact_trends_include_stars`: Assert `stars` array in trends

---

## Project Plan 3 — Remove `private_sources` Placeholder

**Priority:** Low | **Phase:** 1 | **Effort:** 30 min

### Context

`impact.py:45-48` returns `private_sources` with hardcoded "Access not configured" strings. `source_status` already tracks these. Frontend renders it at `app.js:842-856`.

### Subtasks

#### 3.1 Remove from `build_impact()`

**File:** `src/oss_impact_dashboard/metrics/impact.py` — Remove lines 45-48 (`private_sources` key).

#### 3.2 Remove from frontend

**File:** `web/src/app.js` — Remove `privateSources` block at lines 842-856 in `renderImpact()`.

#### 3.3 Remove from HTML

**File:** `web/impact.html` — Remove `<article class="panel col-4" data-section="privateSources">` (lines 52-54).

#### 3.4 Tests

Update `tests/test_impact_release_contributors.py`:
- `test_build_impact_no_private_sources`: Assert `"private_sources" not in result`

---

## Project Plan 4 — Populate `core_contributors`

**Priority:** High | **Phase:** 1 | **Effort:** 30 min

### Context

`core_contributors: []` in `mole.yml` means `external_contributor_share` is always `None`. Leadership team is documented in `OSE_ORGANIZATION.md`.

### Subtasks

#### 4.1 Add leadership team GitHub logins

**File:** `projects/mole.yml`

Replace `core_contributors: []` with 8 leadership team logins (Castillo, Corbino, Barra, Brzenski, Drummond, Dumett, Pagallo, Paolini). **User must verify actual GitHub usernames.**

#### 4.2 Tests

**File:** `tests/test_config_dataset.py`
- `test_core_contributors_populated`: Assert `core_contributors` is non-empty list

---

## Project Plan 5 — Bus Factor

**Priority:** High | **Phase:** 1 | **Effort:** 2-3 hours

### Context

Bus factor = minimum number of contributors accounting for >50% of contributions. `contributors.py` already has `top` list sorted by contributions.

### Subtasks

#### 5.1 Implement bus factor

**File:** `src/oss_impact_dashboard/metrics/contributors.py`

Add `_bus_factor(top_contributors: list[dict]) -> int | None`: iterate sorted contributors, accumulate contributions, return count at which cumulative >50% of total.

Add to `build_contributors()` return: `"bus_factor": _bus_factor(top)`, `"bus_factor_note"`.

#### 5.2 Add to summary

**File:** `src/oss_impact_dashboard/build_dataset.py` — Add `"bus_factor": contributors.get("bus_factor")` to `summary`. Add metric definition.

#### 5.3 Display in frontend

**File:** `web/src/app.js` — Add to `renderContributorAnalytics()` rows, `renderSummary()` KPI card, `renderReport()` contributors table.

#### 5.4 Tests

**File:** `tests/test_impact_release_contributors.py`

- `test_bus_factor_concentrated`: 1 contributor with 60% → `bus_factor==1`
- `test_bus_factor_distributed`: Each 20% → `bus_factor==3`
- `test_bus_factor_no_contributors`: → `None`
- `test_bus_factor_zero_contributions`: → `None`

---

## Project Plan 6 — OpenSSF Scorecard Collector

**Priority:** Critical | **Phase:** 2 | **Effort:** 4-6 hours

### Context

Public API: `GET https://api.scorecard.dev/projects/github.com/{owner}/{repo}`. No auth. Returns aggregate score (0-10) and 18+ check scores.

### Subtasks

#### 6.1 Create `collectors/openssf_scorecard.py`

**File:** `src/oss_impact_dashboard/collectors/openssf_scorecard.py` (new)

`fetch_openssf_scorecard(owner, repo) -> dict | None`:
- Fetch from `https://api.scorecard.dev/projects/github.com/{owner}/{repo}`
- Return `None` on 404, raise on other errors
- Return dict: `score`, `checks` (list of `{name, score, reason, details}`), `repo_url`, `commit`, `commit_date`, `scorecard_version`
- Use `urllib.request`, 30s timeout

#### 6.2 Create `metrics/security.py`

**File:** `src/oss_impact_dashboard/metrics/security.py` (new)

`build_security(scorecard_raw) -> dict`:
- Return `available=False` if no data
- Extract key checks: Code-Review, Security-Policy, Maintained, Vulnerabilities, Dependency-Update-Tool, Branch-Protection, CI-Tests, Signed-Releases, Dangerous-Workflow, Token-Permissions, Binary-Artifacts, Pinned-Dependencies, SAST, Fuzzing, Packaging, License, Webhooks
- Extract CII-Best-Practices badge level
- Return: `available`, `score`, `checks`, `all_checks`, `cii_badge_level`, `vulnerabilities`, `security_policy`, `maintained`, `commit`, `commit_date`

#### 6.3 Integrate into `build_dataset.py`

- Import and call via `_try_source()` with `source_url` pointing to scorecard.dev viewer
- Add `security` top-level key, `openssf_scorecard` to `source_status`, `openssf_score` to `summary`
- Add metric definitions for `openssf_score`, `openssf_vulnerabilities`, `openssf_maintained`

#### 6.4 Add source to `mole.yml`

```yaml
  openssf_scorecard:
    enabled: true
```

#### 6.5 Add to snapshot record

**File:** `src/oss_impact_dashboard/snapshots.py` — Add `openssf_score` to `snapshot_record()` and `impact_trends()`.

#### 6.6 Tests

**File:** `tests/test_openssf_scorecard.py` (new)

- `test_fetch_returns_none_for_404`: Mock 404
- `test_fetch_parses_response`: Mock 200 with sample JSON
- `test_build_security_no_data`: Assert `available=False`
- `test_build_security_with_data`: Assert `available=True`, checks populated
- `test_build_security_extracts_key_checks`: Assert specific checks extracted

---

## Project Plan 7 — Community Standards Compliance

**Priority:** High | **Phase:** 2 | **Effort:** 3-4 hours

### Context

GitHub GraphQL API checks community health file presence. `GitHubClient.graphql()` exists at `collectors/github.py:100`.

### Subtasks

#### 7.1 Add GraphQL query

**File:** `src/oss_impact_dashboard/collectors/github.py`

Add `fetch_community_standards(client, owner, repo) -> dict`:
- Query: `contributingGuidelines`, `codeOfConduct`, `licenseInfo`, `readme`, `securityPolicy`, `issueTemplates`, `pullRequestTemplates`, `fundingLinks`, `repositoryTopics`, `description`, `homepageUrl`
- Return parsed dict

#### 7.2 Create `metrics/community.py`

**File:** `src/oss_impact_dashboard/metrics/community.py` (new)

`build_community_standards(community_raw) -> dict`:
- Check 5 core standards (README, CONTRIBUTING, CODE_OF_CONDUCT, LICENSE, SECURITY) + issue templates, PR template, topics
- Compute `compliance_score` = present_count / total_standard
- Return: `available`, `compliance_score`, `checks` (list with `key`, `label`, `present`, `details`), `topics`, `description`, `homepage_url`

#### 7.3 Integrate into `build_dataset.py`

- Call `fetch_community_standards()` when source enabled and token available
- Add `community_standards` top-level key, add to `source_status`

#### 7.4 Add source to `mole.yml`

```yaml
  community_standards:
    enabled: true
```

#### 7.5 Tests

**File:** `tests/test_community_standards.py` (new)

- `test_build_community_no_data`: Assert `available=False`
- `test_build_community_all_present`: → `compliance_score==1.0`
- `test_build_community_partial`: Correct score
- `test_build_community_extracts_topics`: Assert topics returned

---

## Project Plan 8 — Downstream Package Adoption

**Priority:** Critical | **Phase:** 2 | **Effort:** 4-6 hours

### Context

Check ecosyste.ms API (`packages.ecosyste.ms/api/v1/packages/lookup`), Spack (GitHub `spack/spack` repo), PyPI (`pypi.org/pypi/{name}/json`), conda-forge (from ecosyste.ms results).

### Subtasks

#### 8.1 Create `collectors/package_adoption.py`

**File:** `src/oss_impact_dashboard/collectors/package_adoption.py` (new)

`fetch_package_adoption(owner, repo) -> dict`:
- `_check_ecosyste_ms(repository_url)`: Lookup, return packages with ecosystem, name, version, downloads, dependents
- `_check_spack(owner, repo)`: Check GitHub API for Spack recipe directory
- `_check_pypi(package_name)`: Check PyPI for package and version
- `_check_conda_forge`: Derived from ecosyste.ms results
- Return dict with each registry's result

#### 8.2 Create `metrics/adoption.py`

**File:** `src/oss_impact_dashboard/metrics/adoption.py` (new)

`build_adoption(adoption_raw) -> dict`:
- Build `registries` list with `name`, `found`, `available`, `details` per registry
- Aggregate `total_downloads`, `found_count`
- Return: `available`, `registries`, `found_count`, `total_downloads`, `ecosyste_ms_packages`

#### 8.3 Integrate into `build_dataset.py`

- Call via `_try_source()`, add `adoption` top-level key, add to `source_status`, add `adoption_found_count` to `summary`

#### 8.4 Add source to `mole.yml`

```yaml
  package_adoption:
    enabled: true
```

#### 8.5 Tests

**File:** `tests/test_package_adoption.py` (new)

- `test_build_adoption_no_data`: Assert `available=False`
- `test_build_adoption_with_spack_found`: Mock Spack found
- `test_build_adoption_with_pypi`: Mock PyPI with version
- `test_build_adoption_aggregates_downloads`: Multiple packages, assert total

---

## Project Plan 9 — Security Health Section (UI)

**Priority:** Critical | **Phase:** 2 | **Effort:** 3-4 hours | **Depends on:** Plan 6

### Subtasks

#### 9.1 Add Security section to `index.html`

**File:** `web/index.html` — Add `<article class="panel col-6"><div data-section="security"></div></article>` in dashboard grid.

#### 9.2 Add `renderSecurity()` to `app.js`

**File:** `web/src/app.js`

New function rendering:
- OpenSSF aggregate score (doughnut chart, 0-10)
- Individual check scores (horizontal bar chart)
- CII Best Practices badge status
- Vulnerability count, security policy presence
- Scorecard commit date

#### 9.3 Call in init

Add `renderSecurity(dashboardData)` to init chain (around line 1338).

#### 9.4 Add to PDF report

Add "Security & Quality" section in `renderReport()`.

#### 9.5 Tests

**File:** `web/tests/security.mjs` (extend) — Test security section renders when data available, hidden when unavailable.

---

## Project Plan 10 — Adoption Matrix Section (UI)

**Priority:** Critical | **Phase:** 2 | **Effort:** 2-3 hours | **Depends on:** Plan 8

### Subtasks

#### 10.1 Add Adoption section to `impact.html`

Add `<article class="panel col-6" data-section="adoption"></article>`.

#### 10.2 Add `renderAdoption()` to `app.js`

New function rendering:
- Package registry presence grid (Spack, conda-forge, PyPI, ecosyste.ms)
- Download counts per registry
- Dependent packages/repositories count
- GitHub stars/forks/watchers with trend

#### 10.3 Call in init and add to PDF report

#### 10.4 Tests

**File:** `web/tests/adoption-ui.mjs` (new)

---

## Project Plan 11 — Community Standards Checklist (UI)

**Priority:** High | **Phase:** 2 | **Effort:** 2 hours | **Depends on:** Plan 7

### Subtasks

#### 11.1 Add section to `index.html`

Add `<article class="panel col-6" data-section="communityStandards"></article>`.

#### 11.2 Add `renderCommunityStandards()` to `app.js`

Visual checklist with checkmark/cross per standard, compliance percentage at top.

#### 11.3 Call in init

#### 11.4 Tests

**File:** `web/tests/community-standards-ui.mjs` (new)

---

## Project Plan 12 — Newcomer Funnel Metrics

**Priority:** Medium | **Phase:** 3 | **Effort:** 3-4 hours

### Context

Derived from existing issue/PR/event timeline data. No new API calls.

### Subtasks

#### 12.1 Implement in `contributors.py`

**File:** `src/oss_impact_dashboard/metrics/contributors.py`

Add `_newcomer_funnel(items, period) -> dict`:
- For each new contributor in period, find first issue/PR date and first merged PR date
- Compute: `median_time_to_first_pr_days`, `median_time_to_first_merged_pr_days`, `newcomer_retention_3m`, `newcomer_conversion_rate`

Add to `build_contributors()` return: `newcomer_funnel`.

#### 12.2 Add to summary and metric definitions

#### 12.3 Display in frontend

Add to `renderContributorAnalytics()` and Contributor Diversity panel (Plan 22).

#### 12.4 Tests

**File:** `tests/test_impact_release_contributors.py`

- `test_newcomer_funnel_basic`: Mock items, assert funnel metrics
- `test_newcomer_conversion_rate`: Assert ratio correct
- `test_newcomer_retention`: Assert 3-month retention

---

## Project Plan 13 — Change Request Closure Ratio

**Priority:** Medium | **Phase:** 3 | **Effort:** 1-2 hours

### Subtasks

#### 13.1 Implement in `operations.py`

**File:** `src/oss_impact_dashboard/metrics/operations.py`

Compute: `merged / (merged + closed_unmerged + open_over_threshold_prs)`. Add `change_request_closure_ratio` to summary.

#### 13.2 Add to metric definitions and frontend

Add to KPI cards and PDF report "Development Activity" table.

#### 13.3 Tests

**File:** `tests/test_operations.py`

- `test_closure_ratio_all_merged`: → 1.0
- `test_closure_ratio_mixed`: Correct ratio
- `test_closure_ratio_no_prs`: → `None`

---

## Project Plan 14 — Defect Resolution Duration

**Priority:** Medium | **Phase:** 3 | **Effort:** 1-2 hours

### Subtasks

#### 14.1 Implement in `operations.py`

Filter closed issues by `Bug` canonical label, compute `percentile_stats()` on `days_to_close`. Add `median_bug_close_days` to summary.

#### 14.2 Add to metric definitions and frontend

#### 14.3 Tests

**File:** `tests/test_operations.py`

- `test_bug_close_days`: Bug-labeled issues, assert median
- `test_bug_close_days_no_bugs`: → `None`

---

## Project Plan 15 — Release Cadence Consistency

**Priority:** Low | **Phase:** 3 | **Effort:** 1 hour

### Subtasks

#### 15.1 Implement in `releases.py`

**File:** `src/oss_impact_dashboard/metrics/releases.py`

Compute stddev of release intervals (already in `intervals` list). Add `release_cadence_stddev_days`.

#### 15.2 Add to metric definitions and PDF report

#### 15.3 Tests

- `test_cadence_stddev`: Mock intervals, assert stddev
- `test_cadence_stddev_single_release`: → `None`

---

## Project Plan 16 — Label-Specific Aging

**Priority:** Low | **Phase:** 3 | **Effort:** 2 hours

### Subtasks

#### 16.1 Implement in `operations.py`

For each label in `label_metrics`, compute median age of open items. Add `median_open_age_days` per label.

#### 16.2 Display in frontend

Add to label chart tooltip or secondary display.

#### 16.3 Tests

- `test_label_specific_aging`: Mock items, assert median age per label

---

## Project Plan 17 — Extend Snapshot History

**Priority:** Medium | **Phase:** 3 | **Effort:** 1-2 hours | **Depends on:** Plans 2, 6

### Subtasks

#### 17.1 Add fields to `snapshot_record()`

**File:** `src/oss_impact_dashboard/snapshots.py`

Add: `stars`, `forks`, `watchers`, `openssf_score`, `adoption_found_count`, `bus_factor`.

#### 17.2 Add to `impact_trends()`

Add corresponding arrays.

#### 17.3 Tests

Assert new fields in `snapshot_record()` and `impact_trends()` outputs.

---

## Project Plan 18 — Governance Health Tracker

**Priority:** Medium | **Phase:** 4 | **Effort:** 3-4 hours

### Subtasks

#### 18.1 Create `manual/governance.yml`

**File:** `manual/governance.yml` (new)

Schema: `steering_council` (active_members, meetings_per_year, last_meeting, decisions_this_period), `governance_circles` (4 entries: name, active_members, last_activity), `community_events` (list: event, date, attendees).

#### 18.2 Extend `collectors/manual.py`

**File:** `src/oss_impact_dashboard/collectors/manual.py` — Add loading of `governance.yml`.

#### 18.3 Include in `build_dataset.py`

Add `governance` to `impact.manual` or as top-level key.

#### 18.4 Tests

- `test_governance_yml_loads`: Assert steering_council, circles, events present
- `test_governance_circles_count`: Assert 4 circles

---

## Project Plan 19 — Annual Targets Progress Tracker

**Priority:** Critical | **Phase:** 4 | **Effort:** 3-4 hours | **Depends on:** Plan 1

### Subtasks

#### 19.1 Create `metrics/targets.py`

**File:** `src/oss_impact_dashboard/metrics/targets.py` (new)

`build_targets_progress(manual_funding, summary) -> dict`:
- For each target metric, look up current value from `summary`
- Compute progress: `(current - baseline) / (target - baseline)`
- Determine status: `on-track` (≥0.5), `behind` (<0.5), `exceeded` (current≥target), `no-baseline`
- Return list of `{metric, baseline, target, current, progress, status, expected_outcome}`

#### 19.2 Integrate into `build_dataset.py`

Add `targets_progress` top-level key.

#### 19.3 Display in report page

**File:** `web/src/app.js`

Replace static "Baseline to Target Outcomes" table with progress bars, color-coded status badges, delta from baseline.

#### 19.4 Tests

**File:** `tests/test_targets.py` (new)

- `test_targets_progress_on_track`: Between baseline and target
- `test_targets_progress_exceeded`: Current ≥ target
- `test_targets_progress_no_baseline`: Baseline is None
- `test_targets_progress_no_data`: Empty targets

---

## Project Plan 20 — Restructure PDF Report for NSF

**Priority:** Critical | **Phase:** 4 | **Effort:** 4-6 hours | **Depends on:** Plans 1, 6, 8, 19

### Subtasks

#### 20.1 Restructure `renderReport()` in `app.js`

**File:** `web/src/app.js`

Reorder into 12 NSF-aligned sections:
1. **Project Overview** (enhance with license, topics, description)
2. **Executive KPI Summary** (add stars, forks, openssf_score, bus_factor)
3. **Community Health** (new — contributor, engagement, governance, standards)
4. **Security & Quality** (new — Scorecard, CI, standards compliance)
5. **Adoption & Impact** (enhanced — registries, stars, citations, downloads)
6. **Development Activity** (add closure ratio, defect resolution)
7. **Release Delivery** (add cadence consistency)
8. **Sustainability** (new — maintainer capacity, funding, risks)
9. **Targets & Progress** (new — from Plan 19)
10. **Accomplishments** (populated from Plan 1)
11. **Case Studies** (populated from Plan 1)
12. **Methodology & Limitations** (existing, keep)

#### 20.2 Update report CSS

**File:** `web/src/styles.css` — Add print-friendly styles for progress bars, status badges, section breaks.

#### 20.3 Tests

Update `tests/test_report_pdf.py` and `web/tests/pdf-publish.mjs` to validate new 12-section structure.

---

## Project Plan 21 — Governance Health Panel (UI)

**Priority:** Medium | **Phase:** 4 | **Effort:** 2-3 hours | **Depends on:** Plan 18

### Subtasks

#### 21.1 Add Governance section to `index.html`

Add `<article class="panel col-6" data-section="governance"></article>`.

#### 21.2 Add `renderGovernance()` to `app.js`

Render: steering council (members, meetings, decisions), 4 governance circles (name, members, last activity), community events list.

#### 21.3 Call in init

#### 21.4 Tests

**File:** `web/tests/governance-ui.mjs` (new)

---

## Project Plan 22 — Contributor Diversity Panel (UI)

**Priority:** Medium | **Phase:** 4 | **Effort:** 2-3 hours | **Depends on:** Plans 5, 12

### Subtasks

#### 22.1 Add Diversity section to `impact.html`

Add `<article class="panel col-6" data-section="contributorDiversity"></article>`.

#### 22.2 Add `renderContributorDiversity()` to `app.js`

Render: bus factor, new vs. repeat trend, newcomer funnel, external vs. core share, top contributor concentration.

#### 22.3 Call in init

#### 22.4 Tests

**File:** `web/tests/diversity-ui.mjs` (new)

---

## Project Plan 23 — CI Workflow-Specific Breakdown

**Priority:** Low | **Phase:** 3 | **Effort:** 2-3 hours

### Subtasks

#### 23.1 Extend `collectors/github_actions.py`

Group runs by workflow name. Return per-workflow: `total_runs`, `success_rate`, `median_duration`, `failed_runs`.

#### 23.2 Display in frontend

In `renderCiReliability()`, add per-workflow breakdown table.

#### 23.3 Tests

- `test_workflow_breakdown`: Mock runs from different workflows, assert per-workflow stats

---

## Project Plan 24 — Docs Visitor Trend on Impact Page

**Priority:** Low | **Phase:** 3 | **Effort:** 1-2 hours

### Subtasks

Add a dedicated documentation trends chart on the impact page using snapshot history `documentation_visitors` data. The `renderSnapshotTrend()` already includes this dataset — add a separate, focused chart.

---

## Project Plan 25 — Libyears / Dependency Freshness

**Priority:** Future | **Phase:** 5 | **Effort:** 4-6 hours

### Subtasks

#### 25.1 Create `collectors/dependency_freshness.py`

For C++/MATLAB project (no central registry):
- Parse `CMakeLists.txt` for dependency versions
- Check GitHub Dependabot alerts via API
- Parse `Project.toml` for Julia dependencies
- Compare installed vs latest releases
- Compute Libyears: sum of time since each dep's installed version was released

#### 25.2 Create `metrics/dependency_freshness.py`

Build: `total_libyears`, `outdated_count`, `most_outdated` list.

#### 25.3 Integrate and display

Add to `build_dataset.py`, `mole.yml`, UI section.

#### 25.4 Tests

- `test_libyears_computation`: Mock data, assert libyears
- `test_no_dependencies`: Graceful handling

---

## Project Plan 26 — Organizational Diversity

**Priority:** Future | **Phase:** 5 | **Effort:** 4-6 hours

### Subtasks

#### 26.1 Fetch GitHub user profiles

Extend GitHub collector to fetch user profiles for top contributors (company, location fields). Use `/users/{login}` endpoint.

#### 26.2 Create `metrics/diversity.py`

Compute: organizational diversity (unique companies), elephant factor (min companies for 50% of commits), geographic diversity (unique locations).

#### 26.3 Display in Contributor Diversity panel

Add org diversity breakdown to the panel from Plan 22.

#### 26.4 Tests

- `test_org_diversity`: Mock profiles with companies, assert diversity count
- `test_elephant_factor`: Mock company distribution, assert factor

---

## Project Plan 27 — MATLAB File Exchange Metrics

**Priority:** Future | **Phase:** 5 | **Effort:** 2-3 hours

### Subtasks

#### 27.1 Create `collectors/matlab_fileexchange.py`

Check MATLAB File Exchange page for MOLE. May require manual entry or HTML parsing (no public API). Track: downloads, ratings, submission date.

#### 27.2 Add to `manual/` or automated collector

If no API, add as manual YAML field in `funding.yml` or new `manual/matlab-fex.yml`.

#### 27.3 Display in Adoption Matrix

Add MATLAB File Exchange row to the adoption grid from Plan 10.

#### 27.4 Tests

- `test_matlab_fex_data_loads`: Assert data present

---

## Project Plan 28 — Period Comparison Extensions

**Priority:** Low | **Phase:** 3 | **Effort:** 2-3 hours

### Subtasks

#### 28.1 Extend period comparisons

Currently `operations.py` and `contributors.py` have period comparisons. Extend to:
- `releases.py`: Add period comparisons for release counts and downloads
- `impact.py`: Add period comparisons for Zenodo/OpenAlex (if time-series data available)
- Documentation analytics: Period-over-period visitor comparison

#### 28.2 Display in frontend

Add period comparison deltas to relevant KPI cards and tables.

#### 28.3 Tests

- `test_release_period_comparison`: Assert delta computed
- `test_docs_period_comparison`: Assert visitor delta

---

## Project Plan 29 — Schema Version Bump & Validation

**Priority:** Critical | **Phase:** Cross-cutting | **Effort:** 1-2 hours | **Depends on:** All plans that add top-level keys

### Subtasks

#### 29.1 Bump `SCHEMA_VERSION`

**File:** `src/oss_impact_dashboard/schema.py`

Bump from `4` to `5` (once all new top-level keys are added).

#### 29.2 Update `validate_dashboard_dataset()`

Add new required keys: `security`, `community_standards`, `adoption`, `repository_metadata`, `targets_progress` (if added as top-level).

#### 29.3 Update `test_config_dataset.py`

Ensure schema validation tests pass with new version.

#### 29.4 Update frontend

No frontend changes needed — frontend reads keys defensively with optional chaining.

---

## Project Plan 30 — CI/CD Workflow Updates

**Priority:** Medium | **Phase:** Cross-cutting | **Effort:** 1-2 hours

### Subtasks

#### 30.1 Update `refresh-deploy.yml`

**File:** `.github/workflows/refresh-deploy.yml`

No new secrets needed for OpenSSF Scorecard (public API) or package adoption (public APIs). Community standards uses existing GitHub token.

If new env vars are needed for future collectors (e.g., MATLAB File Exchange API key), add them here.

#### 30.2 Update `test.yml`

Ensure new test files are picked up by `pytest` (they will be automatically since `testpaths = ["tests"]`).

#### 30.3 Update `generate-report.yml`

No changes needed — report generation uses the same `build` command.

#### 30.4 Update `pr-preview.yml`

Ensure PR previews include new data sources. May need to add env vars for new collectors if they require tokens.

---

## Dependency Graph & Execution Order

### Phase 1: Quick Wins (1-2 weeks)

```
Plan 1 (Manual Data) ─────────────────────────────┐
Plan 2 (Stars/Forks) ──────────────────┐          │
Plan 3 (Remove private_sources)         │          │
Plan 4 (core_contributors)              │          │
Plan 5 (Bus Factor) ────────────────────┤          │
                                        ↓          ↓
                                    Plan 17 (Snapshots) — depends on 2, 5
                                    Plan 29 (Schema) — after all Phase 1
```

**Recommended order:** 1 → 4 → 3 → 2 → 5 → 17 → 29

### Phase 2: Security & Adoption (2-4 weeks)

```
Plan 6 (OpenSSF Scorecard) ──→ Plan 9 (Security UI)
Plan 7 (Community Standards) ──→ Plan 11 (Checklist UI)
Plan 8 (Package Adoption) ──→ Plan 10 (Adoption UI)
                                    ↓
                              Plan 29 (Schema bump)
```

**Recommended order:** 6 → 7 → 8 → 9 → 10 → 11 → 29

### Phase 3: Derived Metrics (2-3 weeks)

```
Plan 12 (Newcomer Funnel) ──┐
Plan 13 (Closure Ratio)     │
Plan 14 (Defect Resolution) │
Plan 15 (Cadence Consist.)  ├──→ Plan 29 (Schema bump)
Plan 16 (Label Aging)       │
Plan 23 (CI Breakdown)      │
Plan 24 (Docs Trend)        │
Plan 28 (Period Comparisons)┘
```

**Recommended order:** 13 → 14 → 15 → 16 → 12 → 23 → 24 → 28 → 29

### Phase 4: Governance & Reporting (2-3 weeks)

```
Plan 18 (Governance Data) ──→ Plan 21 (Governance UI)
Plan 1 (targets) ──→ Plan 19 (Targets Progress) ──→ Plan 20 (PDF Restructure)
Plan 5 + Plan 12 ──→ Plan 22 (Diversity UI)
```

**Recommended order:** 18 → 19 → 21 → 22 → 20 → 29

### Phase 5: Advanced / Future

```
Plan 25 (Libyears)
Plan 26 (Org Diversity) ──→ extends Plan 22
Plan 27 (MATLAB File Exchange) ──→ extends Plan 10
```

---

*End of Technical Plan*
