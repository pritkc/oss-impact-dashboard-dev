from __future__ import annotations

from pathlib import Path
from typing import Any

from oss_impact_dashboard.collectors.github import fetch_community_standards, fetch_github, GitHubClient, github_token
from oss_impact_dashboard.collectors.github_actions import fetch_github_actions
from oss_impact_dashboard.collectors.github_traffic import fetch_github_traffic
from oss_impact_dashboard.collectors.goatcounter import (
    LIMITATIONS as GOATCOUNTER_LIMITATIONS,
)
from oss_impact_dashboard.collectors.goatcounter import (
    GoatCounterAPIError,
    GoatCounterConfigError,
    fetch_goatcounter_analytics,
    reporting_window,
    settings_from_env,
    tracker_metadata,
    unavailable_documentation_analytics,
)
from oss_impact_dashboard.collectors.manual import load_manual
from oss_impact_dashboard.collectors.openssf_scorecard import fetch_openssf_scorecard
from oss_impact_dashboard.collectors.openalex import fetch_openalex
from oss_impact_dashboard.collectors.package_adoption import fetch_package_adoption
from oss_impact_dashboard.collectors.readthedocs import fetch_readthedocs_analytics
from oss_impact_dashboard.collectors.zenodo import fetch_zenodo
from oss_impact_dashboard.config import ProjectConfig, source_enabled
from oss_impact_dashboard.metrics.adoption import build_adoption
from oss_impact_dashboard.metrics.community import build_community_standards
from oss_impact_dashboard.metrics.contributors import build_contributors
from oss_impact_dashboard.metrics.governance import build_governance
from oss_impact_dashboard.metrics.impact import build_impact
from oss_impact_dashboard.metrics.operations import build_operations
from oss_impact_dashboard.metrics.releases import build_releases
from oss_impact_dashboard.metrics.security import build_security
from oss_impact_dashboard.metrics.targets import build_targets_progress
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
    try:
        tracker = tracker_metadata(settings_from_env(require_api_key=False))
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
        data = fetch_goatcounter_analytics(period_months=config.period_months)
        if data is None:
            raise GoatCounterConfigError("GoatCounter environment configuration is missing")
        return data, source_status(
            data.get("status", "available"),
            data.get("message") or None,
            source_url=(data.get("provenance") or {}).get("site_url"),
            limitation="Uses GoatCounter aggregate API endpoints only.",
            provider="goatcounter",
            requests_used=data.get("requests_used"),
        )
    except Exception as exc:  # noqa: BLE001 - docs analytics must not fail the dashboard.
        if readthedocs_raw:
            data = _readthedocs_documentation_analytics(readthedocs_raw, reporting_period=period)
            data["tracker"] = tracker
            return data, source_status(
                "partial",
                data["message"],
                limitation="GoatCounter unavailable; using explicit Read the Docs CSV fallback.",
                provider=data["provider"],
            )
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


def build_dataset(config: ProjectConfig, manual_root: Path | None = None) -> dict[str, Any]:
    generated_at = now_iso()
    owner, repo = config.owner_repo
    github_raw, github_status = _try_source(
        "github",
        source_enabled(config, "github"),
        lambda: fetch_github(owner, repo),
        source_url=f"https://github.com/{config.repository}",
        limitation=(
            "Uses public GitHub repository, issue, pull request, release and contributor APIs. "
            "Some historic label and reopen events may be unavailable."
        ),
    )
    manual = load_manual(manual_root or Path("manual"))

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
        lambda: fetch_github_traffic(owner, repo),
        source_url=f"https://api.github.com/repos/{config.repository}/traffic",
        limitation=(
            "Requires repository traffic permissions; implementation is credential-gated."
        ),
    )
    actions_raw, actions_status = _try_source(
        "github_actions",
        source_enabled(config, "github_actions"),
        lambda: fetch_github_actions(owner, repo),
        source_url=f"https://api.github.com/repos/{config.repository}/actions/runs",
        limitation="Requires Actions read permissions and an authenticated token.",
    )
    readthedocs_cfg = config.sources.get("readthedocs") or {}
    readthedocs_raw, readthedocs_status = _try_source(
        "readthedocs",
        source_enabled(config, "readthedocs"),
        lambda: fetch_readthedocs_analytics(readthedocs_cfg),
        source_url=config.documentation_url,
        limitation="Requires Read the Docs analytics access or a validated CSV import.",
    )
    documentation_analytics, documentation_status = _documentation_analytics(
        config,
        readthedocs_raw,
    )
    impact = build_impact(zenodo_raw, openalex_raw, manual)

    # Security, community standards, adoption, targets — populated by later plans
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
    community_status = source_status("unavailable", "Community standards check requires GitHub token")
    if source_enabled(config, "community_standards"):
        token = github_token()
        if token:
            try:
                client = GitHubClient(token=token)
                community_raw = fetch_community_standards(client, owner, repo)
                community_status = source_status(
                    "available",
                    source_url=f"https://github.com/{config.repository}/community",
                )
            except Exception as exc:  # noqa: BLE001
                community_status = source_status("error", str(exc))

    community_standards = build_community_standards(community_raw)

    # Package adoption
    adoption_raw, adoption_status = _try_source(
        "package_adoption",
        source_enabled(config, "package_adoption"),
        lambda: fetch_package_adoption(owner, repo),
        source_url=f"https://packages.ecosyste.ms/api/v1/packages/lookup?repository_url=https://github.com/{config.repository}",
        limitation="Checks Spack, conda-forge, PyPI, and ecosyste.ms for package registry presence.",
    )
    adoption = build_adoption(adoption_raw)

    if github_raw:
        operations = build_operations(
            github_raw,
            config.repository,
            config.stale_days,
            generated_at,
            default_period_months=config.period_months,
            label_aliases=config.label_aliases,
            priority_label_patterns=config.priority_label_patterns,
        )
        releases = build_releases(
            github_raw.get("releases", []),
            generated_at,
            operations.get("periods", {}).get("options", []),
        )
        contributors = build_contributors(
            operations["items"],
            github_raw.get("contributors", []),
            core_contributors=config.core_contributors,
            period_options=operations.get("periods", {}).get("options", []),
        )
    else:
        operations = {"summary": {}, "items": [], "trends": {}, "queues": {}, "label_metrics": []}
        releases = {}
        contributors = {}

    governance = build_governance(None, community_standards, contributors, security)

    # Targets progress (Plan 19)
    targets_progress = build_targets_progress(manual, operations.get("summary"))

    snapshot_cfg = config.sources.get("snapshots") or {}
    snapshot_history = {"schema_version": 1, "snapshots": []}
    if snapshot_cfg.get("history_path"):
        snapshot_history = load_snapshot_history(snapshot_cfg["history_path"])
    snapshot_trends = impact_trends(snapshot_history)

    data = {
        "schema_version": SCHEMA_VERSION,
        "project": {
            "id": config.id,
            "name": config.name,
            "repository": config.repository,
            "environment": config.environment,
            "repository_url": f"https://github.com/{config.repository}",
            "documentation_url": config.documentation_url,
            "citation_url": config.citation_url,
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
            "readthedocs_views": (readthedocs_raw or {}).get("views_total"),
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
            "open_issues_count": ((github_raw or {}).get("repository") or {}).get("open_issues_count"),
            "license": (((github_raw or {}).get("repository") or {}).get("license") or {}).get("spdx_id"),
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
        "governance": governance,
        "targets_progress": targets_progress,
        "operations": operations,
        "releases": releases,
        "contributors": contributors,
        "impact": impact,
        "github_traffic": traffic_raw or {},
        "github_actions": actions_raw or {},
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
                "Standard deviation of release intervals in days. Lower means more consistent cadence."
            ),
            "newcomer_funnel": (
                "First-time PR authors in the default period and how many had their PR merged."
            ),
            "governance_score": (
                "Composite score (0-1) assessing community standards, security, and contributor diversity."
            ),
            "community_standards_compliance_score": (
                "Fraction of expected community standard files present in the repository."
            ),
            "adoption_found_count": (
                "Number of package registries where the project is registered."
            ),
            "targets_progress": (
                "Progress toward annual target metrics defined in project-data.yml, expressed as a 0-1 ratio."
            ),
        },
    }
    validate_dashboard_dataset(data)
    return data
