from __future__ import annotations

from pathlib import Path
from typing import Any

from oss_impact_dashboard.collectors.github import fetch_github
from oss_impact_dashboard.collectors.manual import load_manual
from oss_impact_dashboard.collectors.openalex import fetch_openalex
from oss_impact_dashboard.collectors.zenodo import fetch_zenodo
from oss_impact_dashboard.config import ProjectConfig, source_enabled
from oss_impact_dashboard.metrics.contributors import build_contributors
from oss_impact_dashboard.metrics.impact import build_impact
from oss_impact_dashboard.metrics.operations import build_operations
from oss_impact_dashboard.metrics.releases import build_releases
from oss_impact_dashboard.schema import now_iso, source_status, unavailable


def _try_source(name: str, enabled: bool, fn):
    if not enabled:
        return None, unavailable("Access not configured")
    try:
        data = fn()
        if data is None:
            return None, unavailable("Identifier not configured")
        return data, source_status("available")
    except Exception as exc:  # noqa: BLE001 - source failures should not stop the dashboard.
        return None, source_status("error", str(exc))


def build_dataset(config: ProjectConfig, manual_root: Path | None = None) -> dict[str, Any]:
    generated_at = now_iso()
    owner, repo = config.owner_repo
    github_raw, github_status = _try_source(
        "github", source_enabled(config, "github"), lambda: fetch_github(owner, repo)
    )
    manual = load_manual(manual_root or Path("manual"))

    zenodo_cfg = config.sources.get("zenodo") or {}
    zenodo_raw, zenodo_status = _try_source(
        "zenodo",
        source_enabled(config, "zenodo"),
        lambda: fetch_zenodo(zenodo_cfg.get("record_or_doi")),
    )
    openalex_cfg = config.sources.get("openalex") or {}
    openalex_raw, openalex_status = _try_source(
        "openalex",
        source_enabled(config, "openalex"),
        lambda: fetch_openalex(openalex_cfg.get("doi")),
    )

    if github_raw:
        operations = build_operations(
            github_raw,
            config.repository,
            config.stale_days,
            generated_at,
        )
        releases = build_releases(github_raw.get("releases", []))
        contributors = build_contributors(operations["items"], github_raw.get("contributors", []))
    else:
        operations = {"summary": {}, "items": [], "trends": {}, "queues": {}, "label_metrics": []}
        releases = {}
        contributors = {}

    return {
        "schema_version": 1,
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
        },
        "source_status": {
            "github": {
                **github_status,
                "requests_used": (github_raw or {}).get("requests_used"),
                "rate_limit_remaining": (github_raw or {}).get("rate_limit_remaining"),
                "authenticated": (github_raw or {}).get("authenticated", False),
            },
            "github_traffic": unavailable("Access not configured"),
            "readthedocs": unavailable("Access not configured"),
            "zenodo": zenodo_status,
            "openalex": openalex_status,
        },
        "summary": {
            **operations.get("summary", {}),
            "total_releases": releases.get("total_releases"),
            "unique_contributors": contributors.get("unique_contributors"),
            "zenodo_downloads": (
                build_impact(zenodo_raw, openalex_raw, manual).get("zenodo") or {}
            ).get("downloads"),
            "citation_count": (
                build_impact(zenodo_raw, openalex_raw, manual).get("openalex") or {}
            ).get("cited_by_count"),
        },
        "operations": operations,
        "releases": releases,
        "contributors": contributors,
        "impact": build_impact(zenodo_raw, openalex_raw, manual),
        "trends": operations.get("trends", {}),
        "items": operations.get("items", []),
        "metric_definitions": {
            "median_issue_close_days": "Median days from issue creation to close.",
            "median_pr_merge_days": "Median days from pull request creation to merge.",
            "untriaged_items": "Open issues or pull requests with no labels.",
            "stale_items": "Open items older than reporting.stale_days.",
            "release_asset_downloads": (
                "GitHub release asset downloads, excluding generated source archives."
            ),
        },
    }
