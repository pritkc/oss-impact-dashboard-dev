from __future__ import annotations

import statistics
from datetime import UTC, datetime
from typing import Any

UNLABELED = "(unlabeled)"
SCHEMA_VERSION = 5


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def seconds_between(start: str | None, end: str | None) -> float | None:
    start_dt = parse_timestamp(start)
    end_dt = parse_timestamp(end)
    if not start_dt or not end_dt:
        return None
    return max((end_dt - start_dt).total_seconds(), 0.0)


def days_between(start: str | None, end: str | None) -> float | None:
    seconds = seconds_between(start, end)
    if seconds is None:
        return None
    return round(seconds / 86400, 2)


def percentile_stats(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"median": None, "p75": None, "p90": None}
    ordered = sorted(values)

    def percentile(pct: float) -> float:
        if len(ordered) == 1:
            return ordered[0]
        rank = (len(ordered) - 1) * pct
        low = int(rank)
        high = min(low + 1, len(ordered) - 1)
        weight = rank - low
        return ordered[low] * (1 - weight) + ordered[high] * weight

    return {
        "median": round(statistics.median(ordered), 2),
        "p75": round(percentile(0.75), 2),
        "p90": round(percentile(0.9), 2),
    }


def source_status(status: str, message: str | None = None, **extra: Any) -> dict[str, Any]:
    return {
        "status": status,
        "last_updated": now_iso(),
        "message": message,
        **extra,
    }


def unavailable(message: str) -> dict[str, Any]:
    return source_status("unavailable", message)


def validate_dashboard_dataset(data: dict[str, Any]) -> None:
    required = [
        "schema_version",
        "project",
        "generated_at",
        "reporting_period",
        "source_status",
        "summary",
        "operations",
        "releases",
        "contributors",
        "impact",
        "documentation_analytics",
        "items",
        "metric_definitions",
    ]
    missing = [key for key in required if key not in data]
    if missing:
        raise ValueError(f"Dataset missing required keys: {', '.join(missing)}")
    if data["schema_version"] != SCHEMA_VERSION:
        raise ValueError(f"Expected schema_version {SCHEMA_VERSION}")
    for source, status in data["source_status"].items():
        if status.get("status") not in {"available", "unavailable", "partial", "error"}:
            raise ValueError(f"Invalid status for {source}: {status.get('status')}")
    project = data.get("project") or {}
    if project.get("environment") not in {"development", "staging", "production"}:
        raise ValueError("Invalid project environment in dataset")
    docs = data.get("documentation_analytics") or {}
    if docs.get("status") not in {"available", "unavailable", "partial", "error"}:
        raise ValueError("Invalid documentation_analytics.status")
    for key in (
        "provider",
        "visitor_count",
        "page_hit_count",
        "trend",
        "popular_pages",
        "top_referrers",
        "search_count",
        "no_result_search_count",
        "not_found_count",
        "not_found_pages",
        "reporting_period",
        "requests_used",
        "limitations",
    ):
        if key not in docs:
            raise ValueError(f"documentation_analytics missing {key}")
