from __future__ import annotations

from pathlib import Path
from typing import Any

from oss_impact_dashboard.collectors.github import fetch_github
from oss_impact_dashboard.collectors.github_actions import fetch_github_actions
from oss_impact_dashboard.collectors.github_traffic import fetch_github_traffic
from oss_impact_dashboard.collectors.manual import load_manual
from oss_impact_dashboard.collectors.openalex import fetch_openalex
from oss_impact_dashboard.collectors.readthedocs import fetch_readthedocs_analytics
from oss_impact_dashboard.collectors.zenodo import fetch_zenodo
from oss_impact_dashboard.config import ProjectConfig, source_enabled
from oss_impact_dashboard.metrics.contributors import build_contributors
from oss_impact_dashboard.metrics.impact import build_impact
from oss_impact_dashboard.metrics.operations import build_operations
from oss_impact_dashboard.metrics.releases import build_releases
from oss_impact_dashboard.schema import (
    SCHEMA_VERSION,
    now_iso,
    source_status,
    unavailable,
    validate_dashboard_dataset,
)


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
    impact = build_impact(zenodo_raw, openalex_raw, manual)

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
        )
    else:
        operations = {"summary": {}, "items": [], "trends": {}, "queues": {}, "label_metrics": []}
        releases = {}
        contributors = {}

    data = {
        "schema_version": SCHEMA_VERSION,
        "project": {
            "id": config.id,
            "name": config.name,
            "repository": config.repository,
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
            },
            "github_traffic": traffic_status,
            "github_actions": actions_status,
            "readthedocs": readthedocs_status,
            "zenodo": zenodo_status,
            "openalex": openalex_status,
        },
        "summary": {
            **operations.get("summary", {}),
            "total_releases": releases.get("total_releases"),
            "latest_release_age_days": releases.get("latest_release_age_days"),
            "unique_contributors": contributors.get("unique_contributors"),
            "github_traffic_views": (traffic_raw or {}).get("views_total"),
            "readthedocs_views": (readthedocs_raw or {}).get("views_total"),
            "zenodo_downloads": (impact.get("zenodo") or {}).get("downloads"),
            "zenodo_views": (impact.get("zenodo") or {}).get("views"),
            "citation_count": (impact.get("openalex") or {}).get("cited_by_count"),
        },
        "operations": operations,
        "releases": releases,
        "contributors": contributors,
        "impact": impact,
        "github_traffic": traffic_raw or {},
        "github_actions": actions_raw or {},
        "readthedocs": readthedocs_raw or {},
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
        },
    }
    validate_dashboard_dataset(data)
    return data
