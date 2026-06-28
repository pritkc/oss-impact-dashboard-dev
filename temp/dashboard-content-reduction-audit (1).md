# Dashboard Content Reduction Audit

**Rule:** Keep content only when it is automatically refreshed and supports a maintainer action, performance decision, adoption/impact assessment, or external report. Hide missing data instead of showing diagnostic or `N/A` content.

## Overview


| Action                    | Content                                                                                                      | Replacement                                                                                                                           | Prit's Note                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Remove**                | Community standards checklist                                                                                | None. GitHub already exposes it.                                                                                                      | Major reason for it's removal is it's too basic. once we have all this policies in the project, then it is just showing 100% and 8 tabs, which just wastage of space, and doesn't contribute much to the dashboard in any way. |
| **Remove**                | Governance health                                                                                            | None. It is a derived checklist, duplicates other sections, and is not a performance metric.                                          | Similar reason as above, too static text and doesn't helping much. all the content is fixed.                                                                                                                                   |
| **Remove**                | Annual targets progress                                                                                      | None unless targets and baselines are generated from an authoritative external system. Current values are manually maintained.        | we could rather keep the metrics and assign them a group or regroup into their proper sections. however, we have to make sure that values are dynamic, and not static, so make sure we are achiving it.                        |
| **Remove**                | Metric definitions panel                                                                                     | Move definitions to documentation or tooltips only.                                                                                   | Move metric defications as hower small i icon with the metrics, where it could be visible when we hover over that i icon                                                                                                       |
| **Remove**                | Package adoption registry matrix                                                                             | Replace only with automatically collected package download/adoption trends on **Impact**. Registry presence is mostly static.         | Dynamically find the data, and place the values only we can find a live datastream, otherwise retire it.                                                                                                                       |
| **Remove**                | Detailed Security health panel                                                                               | Show one actionable security alert only when a live check fails. Do not show unavailable checks or scorecard detail on Overview.      | Makes sense, only show what is configured, or what we are able to configure so far                                                                                                                                             |
| **Remove**                | Print button                                                                                                 | Use the Report/PDF flow.                                                                                                              | remove both github and print from overview, operations and impact page. There should be a small icon on the report page for it.                                                                                                |
| **Move**                  | Source availability                                                                                          | Move to a diagnostics/admin page. Keep only dataset timestamp and a stale-data warning in the header.                                 | Makes sense, move it to a new last settings/admin/diagnostics page where we can see the configurations.                                                                                                                        |
| **Remove from KPI strip** | Documentation provider, last documentation collection, search events, no-result searches, documentation 404s | Keep documentation                                                                                                                    | KEEP IT WHERE IT IS FOR NOW                                                                                                                                                                                                    |
| **Remove from KPI strip** | P90 first response and other secondary response metrics                                                      | Keep detailed response metrics on **Operations**.                                                                                     | KEEP IT WHERE IT IS FOR NOW                                                                                                                                                                                                    |
| **Simplify**              | Contributor diversity                                                                                        | Remove this Overview panel. Keep contribution concentration and new/repeat contributors on **Impact**. Do not show “Core configured.” | KEEP IT WHERE IT IS FOR NOW BUT REMOVE THE Core configured                                                                                                                                                                     |
| **Simplify**              | Needs attention                                                                                              | Show only non-empty actionable items, maximum five. No “all clear” filler.                                                            | For now, keep it as it is.                                                                                                                                                                                                     |


**Target Overview:** 6–8 KPIs, Activity trend, Needs attention.

Recommended KPIs: Open issues, Open PRs, awaiting review, untriaged, net backlog change, median first response, latest release age, CI success rate.

## Operations


| Action       | Content                                                                    | Replacement                                                                                                                                                                                | Prit's Note              |
| ------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| **Replace**  | Shared 18-card summary strip                                               | Use operations-only KPIs: untriaged, stale, awaiting review, unanswered issues, median issue close, median PR merge, P90 first response, CI success rate.                                  | Keep whatever is usefull |
| **Remove**   | Documentation, provider, collection, citation, download, and release cards | These are unrelated to operational triage.                                                                                                                                                 |                          |
| **Remove**   | Backlog composition doughnut                                               | Open issue/PR counts already exist and the split does not support an action.                                                                                                               |                          |
| **Remove**   | Current Percentiles chart                                                  | It mixes close time, merge time, median age, and P90 age in one chart. Replace only with a coherent response/review percentile view.                                                       |                          |
| **Simplify** | Label workload                                                             | Show current open backlog by label. Remove all-time closed counts.                                                                                                                         |                          |
| **Simplify** | CI reliability                                                             | Keep success rate, failed runs, median duration, and recent failed runs. Remove total, successful, and cancelled rows.                                                                     |                          |
| **Simplify** | Queue panels                                                               | Render only non-empty queues, maximum four. Remove cards containing “No items.” Avoid separate oldest-issue and oldest-PR cards when the stale queue covers them.                          |                          |
| **Simplify** | Filters                                                                    | Keep search, type/state, label, period, and age preset. Remove separate created/closed date ranges from the default toolbar. Put author and exact dates under an optional advanced filter. |                          |
| **Remove**   | JSON export                                                                | Keep CSV export only.                                                                                                                                                                      |                          |
| **Simplify** | All issues and pull requests table                                         | Default to open items. Keep number, type, title, labels, age, status, and completion time. Remove redundant created/closed columns from the default view.                                  |                          |


## Impact


| Action          | Content                                               | Replacement                                                                                                                                                                                | Prit's Note |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| **Remove**      | Project evidence                                      | The renderer only exposes manual-field counts/values and does not communicate measurable impact.                                                                                           |             |
| **Remove**      | Case studies                                          | Remove manually hardcoded case studies from the live dashboard. Use automatically sourced citations/publications where available.                                                          |             |
| **Remove**      | Print button                                          | Use the Report/PDF flow.                                                                                                                                                                   |             |
| **Merge**       | Release asset downloads chart + Release delivery list | Use one release panel with downloads by version, latest release date, cadence, and releases in period.                                                                                     |             |
| **Merge**       | Contributor trend + Contributors and community        | Keep trend, new contributors, repeat contributors, and top-three contribution concentration. Remove duplicated raw contributor counts.                                                     |             |
| **Simplify**    | Documentation analytics                               | Keep visitors/hits trend, searches, no-result searches, 404s, popular pages, and missing paths. Remove provider, reporting-period row, top referrers, and limitations from the main panel. |             |
| **Conditional** | Impact history                                        | Render only with at least two snapshots. Do not show an empty chart.                                                                                                                       |             |
| **Conditional** | All Impact KPIs and panels                            | Hide null, unavailable, or empty sources. Do not show `N/A` cards.                                                                                                                         |             |


## Report


| Action       | Content                                                                | Replacement                                                                                                               | Prit's Note |
| ------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **Remove**   | Project Overview boilerplate                                           | None. Project name, repository, reporting period, and generated date are sufficient.                                      |             |
| **Remove**   | Major Accomplishments                                                  | Manually maintained and quickly stale.                                                                                    |             |
| **Remove**   | Maintainer Capacity                                                    | Manually maintained and not verifiable from dashboard sources.                                                            |             |
| **Remove**   | Technical Debt and Sustainability Risks                                | Manually maintained narrative. Track actionable open issues/labels instead.                                               |             |
| **Remove**   | Requested Work Packages                                                | Manually maintained planning content; keep outside the performance report.                                                |             |
| **Remove**   | Baseline to Target Outcomes                                            | Remove unless targets come from an authoritative, automatically updated source.                                           |             |
| **Remove**   | Case Studies                                                           | Replace only with automatically sourced publications/citations.                                                           |             |
| **Remove**   | Governance Health                                                      | Checklist-derived and not a core performance result.                                                                      |             |
| **Remove**   | Package Adoption registry table                                        | Replace with package/download trend only when available.                                                                  |             |
| **Remove**   | Annual Targets Progress                                                | Current section only displays manually configured baselines.                                                              |             |
| **Merge**    | Contributors and Community + Contributor Diversity and Key-Person Risk | One contributor section: unique, new, repeat, top-three concentration, newcomer conversion.                               |             |
| **Merge**    | Adoption and Downloads + Documentation Reach + Documentation Details   | One Reach and Adoption section. Avoid repeating visitor/page-hit values.                                                  |             |
| **Simplify** | Security Health                                                        | Include only a current score and failed/high-risk checks when live data exists.                                           |             |
| **Simplify** | Methodology, Data Sources and Limitations                              | Use a compact footer with generated date, active sources, and material limitations. Do not print every source-status row. |             |
| **Replace**  | Top KPI cards: open issues and open PRs                                | Use report outcomes: citations, downloads, documentation visitors, contributors, releases in period.                      |             |
| **Simplify** | PDF availability/status text                                           | Show Download PDF and generated date. Show detailed status only on failure.                                               |             |


## Remove Manual Hardcoded Content From the Default Pipeline

Stop rendering and shipping the following default content:

- `manual/project-data.yml`: accomplishments, maintainer capacity, resource sources, risks, requested work, and targets.
- `manual/case-studies.yml`: all manually entered case studies.
- `core_contributors` status and external-share output unless the list can be derived automatically. Contribution concentration can remain because it is computed from activity.

Keep only one-time project identifiers in `projects/mole.yml`: project name, repository, documentation URL, citation/DOI identifiers, enabled sources, reporting period, and operational thresholds.

## Global Display Rules

1. Do not render cards or sections with null, empty, unavailable, error, or unconfigured data.
2. Do not display credential/configuration errors in the public dashboard. Put them in diagnostics/workflow logs.
3. Do not render empty queues, empty charts, or “No items” panels.
4. Do not repeat the same metric on multiple pages unless the second occurrence adds a distinct decision context.
5. Keep thresholds and labels configurable, but do not expose configuration-state fields as performance metrics.

## Intended Final Surface

- **Overview:** concise health summary and actionable exceptions.
- **Operations:** backlog, response/review speed, aging, triage queues, CI failures, drill-down table.
- **Impact:** citations, downloads/adoption, releases, contributors, documentation usage.
- **Report:** compact, automatically generated evidence from the same dynamic sources.

