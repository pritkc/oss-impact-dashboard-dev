from __future__ import annotations

from typing import Any

from oss_impact_dashboard.collectors.github import (
    GitHubClient,
    fetch_community_standards,
    fetch_github,
)
from oss_impact_dashboard.collectors.github_actions import fetch_github_actions
from oss_impact_dashboard.collectors.github_activity import fetch_github_activity
from oss_impact_dashboard.collectors.github_governance import fetch_github_governance
from oss_impact_dashboard.collectors.github_security import fetch_github_security
from oss_impact_dashboard.collectors.github_traffic import fetch_github_traffic
from oss_impact_dashboard.collectors.goatcounter import (
    LIMITATIONS as GOATCOUNTER_LIMITATIONS,
)
from oss_impact_dashboard.collectors.goatcounter import (
    GoatCounterAPIError,
    GoatCounterConfigError,
    fetch_goatcounter_analytics,
    reporting_window,
    settings_from_project,
    tracker_metadata,
    unavailable_documentation_analytics,
)
from oss_impact_dashboard.collectors.openalex import fetch_openalex
from oss_impact_dashboard.collectors.openssf_scorecard import fetch_openssf_scorecard
from oss_impact_dashboard.collectors.package_adoption import fetch_package_adoption
from oss_impact_dashboard.collectors.readthedocs import (
    fetch_readthedocs_analytics,
    readthedocs_project_slug,
)
from oss_impact_dashboard.collectors.zenodo import fetch_zenodo
from oss_impact_dashboard.config import ProjectConfig, source_enabled
from oss_impact_dashboard.credentials import github_token_for_project, project_env_suffix
from oss_impact_dashboard.metrics.adoption import build_adoption
from oss_impact_dashboard.metrics.community import build_community_standards
from oss_impact_dashboard.metrics.contributors import build_contributors
from oss_impact_dashboard.metrics.impact import build_impact
from oss_impact_dashboard.metrics.operations import build_operations
from oss_impact_dashboard.metrics.releases import build_releases
from oss_impact_dashboard.metrics.security import build_security
from oss_impact_dashboard.schema import (
    SCHEMA_VERSION,
    now_iso,
    source_status,
    unavailable,
    validate_dashboard_dataset,
)
from oss_impact_dashboard.snapshots import impact_trends, load_snapshot_history


def _try_source(name: str, enabled: bool, fn, *, source_url: str | None = None, limitation: str):
    if not enabled:
        status = unavailable("Access not configured")
        return None, {**status, "source_url": source_url, "limitation": limitation}
    try:
        data = fn()
        if data is None:
            status = unavailable("Identifier not configured")
            return None, {**status, "source_url": source_url, "limitation": limitation}
        return data, source_status("available", source_url=source_url, limitation=limitation)
    except Exception as exc:  # noqa: BLE001 - source failures should not stop the dashboard.
        return None, source_status("error", str(exc), source_url=source_url, limitation=limitation)


def _readthedocs_documentation_analytics(
    readthedocs_raw: dict[str, Any],
    *,
    reporting_period: dict[str, str],
) -> dict[str, Any]:
    no_result_count = sum(
        item.get("count", 0) for item in readthedocs_raw.get("no_result_searches", [])
    )
    not_found_pages = [
        {"path": item.get("page"), "count": item.get("views", item.get("count", 0))}
        for item in readthedocs_raw.get("not_found_pages", [])
    ]
    return {
        "provider": "readthedocs_csv",
        "status": "partial",
        "message": "Using Read the Docs CSV fallback because GoatCounter is unavailable.",
        "visitor_count": readthedocs_raw.get("views_total"),
        "page_hit_count": readthedocs_raw.get("views_total"),
        "trend": [],
        "popular_pages": [
            {
                "path": item.get("page"),
                "title": item.get("page"),
                "count": item.get("views", item.get("count", 0)),
            }
            for item in readthedocs_raw.get("top_pages", [])
        ],
        "top_referrers": [],
        "search_count": readthedocs_raw.get("search_total", 0),
        "no_result_search_count": no_result_count,
        "not_found_count": sum(item.get("count", 0) for item in not_found_pages),
        "not_found_pages": sorted(
            not_found_pages,
            key=lambda item: (-(item.get("count") or 0), item.get("path") or ""),
        ),
        "reporting_period": reporting_period,
        "collected_at": None,
        "requests_used": 0,
        "limitations": [
            *GOATCOUNTER_LIMITATIONS,
            "Read the Docs CSV fallback does not provide visitor trend or referrer data.",
        ],
        "provenance": {"provider": "readthedocs_csv"},
    }


def _documentation_analytics(
    config: ProjectConfig,
    readthedocs_raw: dict[str, Any] | None,
    *,
    project_count: int = 1,
) -> tuple[dict[str, Any], dict[str, Any]]:
    docs_cfg = config.sources.get("documentation_analytics") or {}
    period = reporting_window(config.period_months)
    if not docs_cfg.get("enabled"):
        data = unavailable_documentation_analytics(
            "Documentation analytics access is not configured.",
            reporting_period=period,
        )
        return data, source_status(
            "unavailable",
            data["message"],
            limitation="Enable documentation_analytics with provider goatcounter.",
        )
    provider = docs_cfg.get("provider", "goatcounter")
    goatcounter_settings = None
    try:
        goatcounter_settings = settings_from_project(
            config.id,
            config.documentation_url,
            docs_cfg,
            require_api_key=False,
            project_count=project_count,
        )
        tracker = tracker_metadata(goatcounter_settings)
    except GoatCounterConfigError:
        tracker = tracker_metadata(None)
    if provider != "goatcounter":
        data = unavailable_documentation_analytics(
            f"Unsupported documentation analytics provider: {provider}",
            provider=str(provider),
            status="error",
            reporting_period=period,
            tracker=tracker,
        )
        return data, source_status(
            "error",
            data["message"],
            limitation="Only goatcounter is supported.",
        )
    try:
        data = fetch_goatcounter_analytics(
            period_months=config.period_months,
            settings=settings_from_project(
                config.id,
                config.documentation_url,
                docs_cfg,
                require_api_key=True,
                project_count=project_count,
            ),
        )
        if data is None:
            raise GoatCounterConfigError("GoatCounter configuration is missing")
        return data, source_status(
            data.get("status", "available"),
            data.get("message") or None,
            source_url=(data.get("provenance") or {}).get("site_url"),
            limitation="Uses GoatCounter aggregate API endpoints only.",
            provider="goatcounter",
            requests_used=data.get("requests_used"),
        )
    except Exception as exc:  # noqa: BLE001 - docs analytics must not fail the dashboard.
        goatcounter_error = exc if isinstance(exc, GoatCounterAPIError) else None
        data = unavailable_documentation_analytics(
            str(exc),
            status="error",
            reporting_period=period,
            endpoint=goatcounter_error.endpoint if goatcounter_error else None,
            http_status=goatcounter_error.http_status if goatcounter_error else None,
            requests_used=(goatcounter_error.requests_used or 0) if goatcounter_error else 0,
            collected_at=now_iso(),
            tracker=tracker,
        )
        return data, source_status(
            "error",
            str(exc),
            limitation="GoatCounter configuration and API access are required.",
            provider="goatcounter",
        )


def build_dataset(
    config: ProjectConfig,
    *,
    project_count: int = 1,
) -> dict[str, Any]:
    generated_at = now_iso()
    owner, repo = config.owner_repo
    github_token = github_token_for_project(config.id, project_count=project_count)
    github_raw, github_status = _try_source(
        "github",
        source_enabled(config, "github"),
        lambda: fetch_github(owner, repo, token=github_token),
        source_url=f"https://github.com/{config.repository}",
        limitation=(
            "Uses public GitHub repository, issue, pull request, release and contributor APIs. "
            "Some historic label and reopen events may be unavailable."
        ),
    )
    zenodo_cfg = config.sources.get("zenodo") or {}
    zenodo_raw, zenodo_status = _try_source(
        "zenodo",
        source_enabled(config, "zenodo"),
        lambda: fetch_zenodo(zenodo_cfg.get("record_or_doi")),
        source_url=str(zenodo_cfg.get("record_or_doi") or ""),
        limitation="Zenodo statistics are cumulative public record totals.",
    )
    openalex_cfg = config.sources.get("openalex") or {}
    openalex_raw, openalex_status = _try_source(
        "openalex",
        source_enabled(config, "openalex"),
        lambda: fetch_openalex(openalex_cfg.get("doi")),
        source_url=f"https://openalex.org/doi:{openalex_cfg.get('doi')}",
        limitation="OpenAlex citation counts can lag publisher and Crossref updates.",
    )
    traffic_raw, traffic_status = _try_source(
        "github_traffic",
        source_enabled(config, "github_traffic"),
        lambda: fetch_github_traffic(owner, repo, token=github_token),
        source_url=f"https://api.github.com/repos/{config.repository}/traffic",
        limitation=(
            "Requires repository traffic permissions; implementation is credential-gated."
        ),
    )
    actions_raw, actions_status = _try_source(
        "github_actions",
        source_enabled(config, "github_actions"),
        lambda: fetch_github_actions(owner, repo, token=github_token),
        source_url=f"https://api.github.com/repos/{config.repository}/actions/runs",
        limitation="Requires Actions read permissions and an authenticated token.",
    )
    activity_raw, activity_status = _try_source(
        "github_activity",
        source_enabled(config, "github") and bool(github_token),
        lambda: fetch_github_activity(owner, repo, token=github_token),
        source_url=f"https://api.github.com/repos/{config.repository}/stats/participation",
        limitation="Repository statistics may be computed asynchronously by GitHub.",
    )
    if activity_raw and activity_raw.get("partial"):
        activity_status = {
            **activity_status,
            "status": "partial",
            "message": "GitHub statistics were not fully available at collection time.",
        }
    security_raw, github_security_status = _try_source(
        "github_security",
        source_enabled(config, "github") and bool(github_token),
        lambda: fetch_github_security(owner, repo, token=github_token),
        source_url=f"https://api.github.com/repos/{config.repository}/code-scanning/alerts",
        limitation="Aggregated alert counts only; sensitive vulnerability details are omitted.",
    )
    governance_raw, github_governance_status = _try_source(
        "github_governance",
        (
            source_enabled(config, "community_standards")
            or source_enabled(config, "github_traffic")
        )
        and bool(github_token),
        lambda: fetch_github_governance(owner, repo, token=github_token),
        source_url=f"https://api.github.com/repos/{config.repository}/community/profile",
        limitation=(
            "Branch protection, rulesets, environments, and community profile data require "
            "repository admin access."
        ),
    )
    readthedocs_cfg = config.sources.get("readthedocs") or {}
    readthedocs_enabled = source_enabled(config, "readthedocs")
    readthedocs_raw = None
    readthedocs_status = unavailable("Access not configured")
    if readthedocs_enabled:
        try:
            readthedocs_raw = fetch_readthedocs_analytics(
                readthedocs_cfg,
                project_id=config.id,
                documentation_url=config.documentation_url,
            )
            if readthedocs_raw is None:
                slug = readthedocs_project_slug(readthedocs_cfg, config.documentation_url)
                readthedocs_status = {
                    **unavailable(
                        "Read the Docs cache is empty; run the RTD collection workflow first."
                    ),
                    "source_url": config.documentation_url,
                    "limitation": (
                        "Requires automated Read the Docs collection or a validated CSV import."
                    ),
                    "project_slug": slug,
                }
            elif readthedocs_raw.get("status") == "stale":
                readthedocs_status = source_status(
                    "partial",
                    readthedocs_raw.get("message"),
                    source_url=config.documentation_url,
                    limitation=(
                        "Reuses the last successful Read the Docs dataset when collection fails."
                    ),
                    provider="readthedocs",
                    project_slug=(readthedocs_raw.get("provenance") or {}).get("project_slug"),
                )
            else:
                readthedocs_status = source_status(
                    "available",
                    source_url=config.documentation_url,
                    limitation=(
                        "Native Read the Docs exports; search aggregates omit raw query text."
                    ),
                    provider="readthedocs",
                    project_slug=(readthedocs_raw.get("provenance") or {}).get("project_slug"),
                )
        except Exception as exc:  # noqa: BLE001 - RTD failures should not stop the dashboard.
            readthedocs_status = source_status(
                "error",
                str(exc),
                source_url=config.documentation_url,
                limitation="Read the Docs cache import failed.",
                provider="readthedocs",
            )
    else:
        readthedocs_status = {
            **readthedocs_status,
            "source_url": config.documentation_url,
            "limitation": "Enable sources.readthedocs to collect native RTD analytics.",
        }
    documentation_analytics, documentation_status = _documentation_analytics(
        config,
        readthedocs_raw,
        project_count=project_count,
    )
    impact = build_impact(zenodo_raw, openalex_raw)

    scorecard_raw, scorecard_status = _try_source(
        "openssf_scorecard",
        source_enabled(config, "openssf_scorecard"),
        lambda: fetch_openssf_scorecard(owner, repo),
        source_url=f"https://scorecard.dev/viewer/?uri=github.com/{config.repository}",
        limitation=(
            "OpenSSF Scorecard evaluates the top 1M GitHub projects; "
            "repos outside this set may not have scores."
        ),
    )
    security = build_security(scorecard_raw)

    # Community standards
    community_raw = None
    github_token_variable = f"GITHUB_TOKEN_{project_env_suffix(config.id)}"
    community_status = source_status(
        "error",
        f"Community standards check requires {github_token_variable}",
    )
    if source_enabled(config, "community_standards"):
        token = github_token
        if token:
            try:
                client = GitHubClient(token=token)
                community_raw = fetch_community_standards(client, owner, repo)
                community_status = source_status(
                    "available",
                    source_url=f"https://github.com/{config.repository}/community",
                )
            except Exception as exc:  # noqa: BLE001
                if governance_raw and governance_raw.get("community_standards_raw"):
                    community_raw = governance_raw["community_standards_raw"]
                    community_status = source_status(
                        "partial",
                        "Community profile unavailable; using repository contents fallback.",
                        source_url=f"https://github.com/{config.repository}",
                    )
                else:
                    community_status = source_status("error", str(exc))

    community_standards = build_community_standards(community_raw)

    # Package adoption
    adoption_raw, adoption_status = _try_source(
        "package_adoption",
        source_enabled(config, "package_adoption"),
        lambda: fetch_package_adoption(owner, repo),
        source_url=f"https://packages.ecosyste.ms/api/v1/packages/lookup?repository_url=https://github.com/{config.repository}",
        limitation=(
            "Checks Spack, conda-forge, PyPI, and ecosyste.ms"
            " for package registry presence."
        ),
    )
    adoption = build_adoption(adoption_raw)

    if github_raw:
        operations = build_operations(
            github_raw,
            config.repository,
            config.stale_days,
            generated_at,
            default_period_months=config.period_months,
        )
        releases = build_releases(
            github_raw.get("releases", []),
            generated_at,
            operations.get("periods", {}).get("options", []),
        )
        contributors = build_contributors(
            operations["items"],
            github_raw.get("contributors", []),
            period_options=operations.get("periods", {}).get("options", []),
        )
    else:
        operations = {"summary": {}, "items": [], "trends": {}, "queues": {}, "label_metrics": []}
        releases = {}
        contributors = {}

    snapshot_cfg = config.sources.get("snapshots") or {}
    snapshot_history = {"schema_version": 1, "snapshots": []}
    if snapshot_cfg.get("history_path"):
        snapshot_history = load_snapshot_history(snapshot_cfg["history_path"])
    snapshot_trends = impact_trends(snapshot_history)
    repo_obj = (github_raw or {}).get("repository") or {}
    default_branch = repo_obj.get("default_branch") or "main"
    documentation_url = config.documentation_url or repo_obj.get("homepage")
    citation_url = (
        config.citation_url
        or f"https://github.com/{config.repository}/blob/{default_branch}/CITATION.cff"
    )
    project_name = config.name or repo_obj.get("full_name") or config.repository

    data = {
        "schema_version": SCHEMA_VERSION,
        "project": {
            "id": config.id,
            "name": project_name,
            "repository": config.repository,
            "environment": config.environment,
            "repository_url": f"https://github.com/{config.repository}",
            "documentation_url": documentation_url,
            "citation_url": citation_url,
        },
        "generated_at": generated_at,
        "reporting_period": {
            "default_period_months": config.period_months,
            "stale_days": config.stale_days,
            "freshness_warning_hours": config.freshness_warning_hours,
            "periods": operations.get("periods", {}),
        },
        "source_status": {
            "github": {
                **github_status,
                "requests_used": (github_raw or {}).get("requests_used"),
                "rate_limit_remaining": (github_raw or {}).get("rate_limit_remaining"),
                "authenticated": (github_raw or {}).get("authenticated", False),
                "review_collection_error": (github_raw or {}).get("review_collection_error"),
            },
            "engagement": source_status(
                "available" if operations.get("engagement", {}).get("available") else "unavailable",
                "Derived from collected issue comments and bounded recent PR review data."
                if operations.get("engagement", {}).get("available")
                else "Issue comment or PR review data was not collected.",
                limitation=operations.get("engagement", {}).get("limitations"),
            ),
            "github_traffic": traffic_status,
            "github_actions": actions_status,
            "github_activity": activity_status,
            "github_security": github_security_status,
            "github_governance": github_governance_status,
            "documentation_analytics": documentation_status,
            "readthedocs": readthedocs_status,
            "snapshots": source_status(
                "available" if snapshot_history.get("snapshots") else "unavailable",
                source_url=snapshot_cfg.get("history_path"),
                limitation=(
                    "Stores only cumulative metrics that cannot be reconstructed from issue, PR "
                    "or release timestamps."
                ),
            ),
            "zenodo": zenodo_status,
            "openalex": openalex_status,
            "openssf_scorecard": scorecard_status,
            "community_standards": community_status,
            "package_adoption": adoption_status,
        },
        "summary": {
            **operations.get("summary", {}),
            "total_releases": releases.get("total_releases"),
            "latest_release_age_days": releases.get("latest_release_age_days"),
            "unique_contributors": contributors.get("unique_contributors"),
            "bus_factor": contributors.get("bus_factor"),
            "github_traffic_views": (traffic_raw or {}).get("views_total"),
            "github_traffic_clones": (traffic_raw or {}).get("clones_total"),
            "github_traffic_views_unique": (traffic_raw or {}).get("views_unique"),
            "github_traffic_clones_unique": (traffic_raw or {}).get("clones_unique"),
            "github_commits_last_4w": (activity_raw or {}).get("commits_last_4w"),
            "github_commits_last_52w": (activity_raw or {}).get("total_commits_52w"),
            "github_open_security_alerts": (security_raw or {}).get("total_open_alerts"),
            "readthedocs_views": (readthedocs_raw or {}).get("views_total"),
            "readthedocs_search_total": (readthedocs_raw or {}).get("search_total"),
            "readthedocs_no_result_search_count": (readthedocs_raw or {}).get(
                "no_result_search_count"
            ),
            "readthedocs_not_found_count": (readthedocs_raw or {}).get("not_found_count"),
            "documentation_visitors": documentation_analytics.get("visitor_count"),
            "documentation_page_hits": documentation_analytics.get("page_hit_count"),
            "documentation_search_count": documentation_analytics.get("search_count"),
            "documentation_no_result_search_count": documentation_analytics.get(
                "no_result_search_count"
            ),
            "documentation_not_found_count": documentation_analytics.get("not_found_count"),
            "zenodo_downloads": (impact.get("zenodo") or {}).get("downloads"),
            "zenodo_views": (impact.get("zenodo") or {}).get("views"),
            "citation_count": (impact.get("openalex") or {}).get("cited_by_count"),
            "stars": ((github_raw or {}).get("repository") or {}).get("stargazers_count"),
            "forks": ((github_raw or {}).get("repository") or {}).get("forks_count"),
            "watchers": ((github_raw or {}).get("repository") or {}).get("subscribers_count"),
            "openssf_score": (security or {}).get("score"),
            "adoption_found_count": (adoption or {}).get("found_count"),
            "release_cadence_stddev_days": releases.get("release_cadence_stddev_days"),
        },
        "repository_metadata": {
            "stars": ((github_raw or {}).get("repository") or {}).get("stargazers_count"),
            "forks": ((github_raw or {}).get("repository") or {}).get("forks_count"),
            "watchers": ((github_raw or {}).get("repository") or {}).get("subscribers_count"),
            "network_count": ((github_raw or {}).get("repository") or {}).get("network_count"),
            "open_issues_count": (
                (github_raw or {}).get("repository") or {}
            ).get("open_issues_count"),
            "license": (
                ((github_raw or {}).get("repository") or {}).get("license") or {}
            ).get("spdx_id"),
            "default_branch": ((github_raw or {}).get("repository") or {}).get("default_branch"),
            "created_at": ((github_raw or {}).get("repository") or {}).get("created_at"),
            "updated_at": ((github_raw or {}).get("repository") or {}).get("updated_at"),
            "pushed_at": ((github_raw or {}).get("repository") or {}).get("pushed_at"),
            "size": ((github_raw or {}).get("repository") or {}).get("size"),
            "language": ((github_raw or {}).get("repository") or {}).get("language"),
            "topics": ((github_raw or {}).get("repository") or {}).get("topics", []),
        },
        "security": security,
        "community_standards": community_standards,
        "adoption": adoption,
        "operations": operations,
        "releases": releases,
        "contributors": contributors,
        "impact": impact,
        "github_traffic": traffic_raw or {},
        "github_actions": actions_raw or {},
        "github_activity": activity_raw or {},
        "github_security": security_raw or {},
        "github_governance": {
            key: value
            for key, value in (governance_raw or {}).items()
            if key != "community_standards_raw"
        },
        "documentation_analytics": documentation_analytics,
        "readthedocs": readthedocs_raw or {},
        "snapshots": {
            "history": snapshot_history,
            "trends": snapshot_trends,
        },
        "trends": operations.get("trends", {}),
        "items": operations.get("items", []),
        "metric_definitions": {
            "median_issue_close_days": "Median days from issue creation to close.",
            "median_pr_merge_days": "Median days from pull request creation to merge.",
            "untriaged_items": "Open issues or pull requests with no labels.",
            "stale_items": "Open items older than reporting.stale_days.",
            "open_over_threshold_items": (
                "Open issues and pull requests older than reporting.stale_days."
            ),
            "release_asset_downloads": (
                "GitHub release asset downloads, excluding generated source archives."
            ),
            "median_first_response_days": (
                "Median days until the first issue or PR comment by someone other than the author."
            ),
            "median_first_review_days": (
                "Median days until the first pull-request review by someone other than the author."
            ),
            "github_actions_success_rate": (
                "Completed successful workflow runs divided by completed runs."
            ),
            "readthedocs_no_result_searches": (
                "Documentation search queries that returned zero results."
            ),
            "documentation_visitors": (
                "Aggregate documentation visitors from the configured documentation "
                "analytics provider."
            ),
            "documentation_search_count": "Documentation search events without raw query text.",
            "documentation_not_found_count": "Documentation 404 events grouped by normalized path.",
            "stars": "GitHub repository star count.",
            "forks": "GitHub repository fork count.",
            "watchers": "GitHub repository watcher (subscriber) count.",
            "bus_factor": (
                "Minimum number of contributors whose departure would leave >50% of "
                "contributions uncovered."
            ),
            "openssf_score": "OpenSSF Scorecard aggregate security score (0-10, higher is better).",
            "change_request_closure_ratio": (
                "PRs merged divided by (merged + closed-unmerged + open-beyond-threshold)."
            ),
            "median_bug_close_days": "Median days from bug-labeled issue creation to close.",
            "release_cadence_stddev_days": (
                "Standard deviation of release intervals in days."
                " Lower means more consistent cadence."
            ),
            "newcomer_funnel": (
                "First-time PR authors in the default period and how many had their PR merged."
            ),
            "community_standards_compliance_score": (
                "Fraction of expected community standard files present in the repository."
            ),
            "adoption_found_count": (
                "Number of package registries where the project is registered."
            ),
            "github_traffic_views": "GitHub repository page views over the last 14 days.",
            "github_traffic_clones": "GitHub repository clone events over the last 14 days.",
            "github_traffic_views_unique": "Unique visitors to the GitHub repository over 14 days.",
            "github_traffic_clones_unique": "Unique cloners of the GitHub repository over 14 days.",
            "github_commits_last_4w": (
                "Total commits in the last four weeks from GitHub statistics."
            ),
            "github_commits_last_52w": "Total commits in the last 52 weeks from GitHub statistics.",
            "github_open_security_alerts": (
                "Aggregate count of open code scanning, Dependabot, and secret scanning alerts."
            ),
            "github_activity_weekly_commits": (
                "Weekly commit counts from GitHub repository statistics."
            ),
            "github_governance_health_percentage": (
                "GitHub community profile health percentage when available."
            ),
        },
    }
    validate_dashboard_dataset(data)
    return data
