from __future__ import annotations

import statistics
from datetime import UTC, datetime
from typing import Any

UNLABELED = "(unlabeled)"


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
