from __future__ import annotations

import csv
from pathlib import Path
from typing import Any


def parse_readthedocs_csv(path: str | Path) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    searches: list[dict[str, Any]] = []
    no_result_searches: list[dict[str, Any]] = []
    not_found_pages: list[dict[str, Any]] = []
    total_views = 0
    unique_pages: set[str] = set()
    with Path(path).open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            views = int(row.get("views") or row.get("View Count") or row.get("count") or 0)
            page = row.get("page") or row.get("Page") or row.get("path") or row.get("Path") or ""
            query = row.get("query") or row.get("search_query") or row.get("Search Query") or ""
            result_count = row.get("result_count") or row.get("results") or row.get("Result Count")
            status = str(row.get("status") or row.get("Status") or "").strip()
            row_type = str(row.get("type") or row.get("Type") or "").strip().casefold()

            if query or row_type == "search":
                search_item = {"query": query, "count": views}
                searches.append(search_item)
                if result_count in {"0", 0} or row_type in {"no_result", "no-results"}:
                    no_result_searches.append(search_item)
                continue

            if status == "404" or row_type in {"404", "not_found", "not-found"}:
                not_found_pages.append({"page": page, "views": views})
                continue

            rows.append({"page": page, "views": views})
            total_views += views
            if page:
                unique_pages.add(page)

    rows.sort(key=lambda item: item["views"], reverse=True)
    searches.sort(key=lambda item: item["count"], reverse=True)
    no_result_searches.sort(key=lambda item: item["count"], reverse=True)
    not_found_pages.sort(key=lambda item: item["views"], reverse=True)
    return {
        "views_total": total_views,
        "unique_pages": len(unique_pages),
        "top_pages": rows[:20],
        "search_total": sum(item["count"] for item in searches),
        "top_searches": searches[:20],
        "no_result_searches": no_result_searches[:20],
        "not_found_pages": not_found_pages[:20],
        "row_count": len(rows),
        "imported_at": Path(path).stat().st_mtime,
    }


def fetch_readthedocs_analytics(config: dict[str, Any]) -> dict[str, Any] | None:
    csv_path = config.get("analytics_csv")
    if not csv_path:
        return None
    return parse_readthedocs_csv(csv_path)
