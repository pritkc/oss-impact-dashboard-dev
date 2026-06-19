from __future__ import annotations

import csv
from pathlib import Path
from typing import Any


def parse_readthedocs_csv(path: str | Path) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    total_views = 0
    unique_pages: set[str] = set()
    with Path(path).open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            views = int(row.get("views") or row.get("View Count") or 0)
            page = row.get("page") or row.get("Page") or row.get("path") or row.get("Path") or ""
            rows.append({"page": page, "views": views})
            total_views += views
            if page:
                unique_pages.add(page)

    rows.sort(key=lambda item: item["views"], reverse=True)
    return {
        "views_total": total_views,
        "unique_pages": len(unique_pages),
        "top_pages": rows[:20],
        "row_count": len(rows),
    }


def fetch_readthedocs_analytics(config: dict[str, Any]) -> dict[str, Any] | None:
    csv_path = config.get("analytics_csv")
    if not csv_path:
        return None
    return parse_readthedocs_csv(csv_path)
