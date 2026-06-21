from __future__ import annotations

import json
from pathlib import Path
from typing import Any

SNAPSHOT_SCHEMA_VERSION = 1


def load_snapshot(path: str | Path) -> dict[str, Any] | None:
    snapshot = Path(path)
    if not snapshot.exists():
        return None
    return json.loads(snapshot.read_text(encoding="utf-8"))


def load_snapshot_history(path: str | Path) -> dict[str, Any]:
    loaded = load_snapshot(path)
    if not loaded:
        return {"schema_version": SNAPSHOT_SCHEMA_VERSION, "snapshots": []}
    if isinstance(loaded, list):
        return {"schema_version": SNAPSHOT_SCHEMA_VERSION, "snapshots": loaded}
    return {
        "schema_version": loaded.get("schema_version", SNAPSHOT_SCHEMA_VERSION),
        "snapshots": loaded.get("snapshots", []),
        "policy": loaded.get("policy", {}),
    }


def write_snapshot(path: str | Path, data: dict[str, Any]) -> None:
    snapshot = Path(path)
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    snapshot.write_text(
        json.dumps(data, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def snapshot_record(data: dict[str, Any]) -> dict[str, Any]:
    summary = data.get("summary") or {}
    project = data.get("project") or {}
    docs = data.get("documentation_analytics") or {}
    return {
        "date": (data.get("generated_at") or "")[:10],
        "generated_at": data.get("generated_at"),
        "project_id": project.get("id"),
        "environment": project.get("environment", "production"),
        "github_traffic_views": summary.get("github_traffic_views"),
        "github_traffic_clones": (data.get("github_traffic") or {}).get("clones_total"),
        "readthedocs_views": summary.get("readthedocs_views"),
        "documentation_visitors": docs.get("visitor_count"),
        "documentation_page_hits": docs.get("page_hit_count"),
        "documentation_search_count": docs.get("search_count"),
        "documentation_no_result_search_count": docs.get("no_result_search_count"),
        "documentation_not_found_count": docs.get("not_found_count"),
        "zenodo_downloads": summary.get("zenodo_downloads"),
        "zenodo_views": summary.get("zenodo_views"),
        "citation_count": summary.get("citation_count"),
    }


def append_snapshot(
    history: dict[str, Any],
    record: dict[str, Any],
    *,
    branch: str | None = None,
    protected_branch: str = "main",
) -> dict[str, Any]:
    if branch and branch != protected_branch:
        return {
            **history,
            "write_allowed": False,
            "blocked_reason": f"Snapshot writes are restricted to {protected_branch}.",
        }
    def same_identity(item: dict[str, Any]) -> bool:
        item_project = item.get("project_id", record.get("project_id"))
        item_environment = item.get("environment", "production")
        return (
            item.get("date") == record.get("date")
            and item_project == record.get("project_id")
            and item_environment == record.get("environment", "production")
        )

    snapshots = [item for item in history.get("snapshots", []) if not same_identity(item)]
    snapshots.append(record)
    snapshots.sort(key=lambda item: item.get("date") or "")
    return {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "policy": {
            "protected_branch": protected_branch,
            "dedupe": "one snapshot per date",
            "identity": "date, project_id and environment",
            "retention": (
                "Persistent cumulative metrics only; issue and PR history is reconstructed."
            ),
        },
        "write_allowed": True,
        "snapshots": snapshots,
    }


def impact_trends(history: dict[str, Any]) -> dict[str, Any]:
    snapshots = history.get("snapshots", [])
    return {
        "dates": [item.get("date") for item in snapshots],
        "github_traffic_views": [item.get("github_traffic_views") for item in snapshots],
        "readthedocs_views": [item.get("readthedocs_views") for item in snapshots],
        "documentation_visitors": [item.get("documentation_visitors") for item in snapshots],
        "documentation_page_hits": [item.get("documentation_page_hits") for item in snapshots],
        "documentation_search_count": [
            item.get("documentation_search_count") for item in snapshots
        ],
        "documentation_no_result_search_count": [
            item.get("documentation_no_result_search_count") for item in snapshots
        ],
        "documentation_not_found_count": [
            item.get("documentation_not_found_count") for item in snapshots
        ],
        "zenodo_downloads": [item.get("zenodo_downloads") for item in snapshots],
        "citation_count": [item.get("citation_count") for item in snapshots],
    }


def dedupe_items(items: list[dict[str, Any]], key: str = "id") -> list[dict[str, Any]]:
    seen: set[Any] = set()
    deduped: list[dict[str, Any]] = []
    for item in items:
        marker = item.get(key)
        if marker in seen:
            continue
        seen.add(marker)
        deduped.append(item)
    return deduped
