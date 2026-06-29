from __future__ import annotations

import csv
import io
import json
import re
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

RTD_PROVIDER = "readthedocs"
RTD_RETENTION_DAYS = 90
RTD_HISTORY_SCHEMA_VERSION = 1
TOP_PAGE_LIMIT = 20
TOP_NOT_FOUND_LIMIT = 20

TRAFFIC_HEADERS = {"date", "version", "path", "views"}
SEARCH_HEADERS = {"created date", "query", "total results"}

HTML_MARKERS = (
    "<!doctype html",
    "<html",
    "<head",
    "<body",
    "<form",
    "accounts/login",
)


def looks_like_html_bytes(content: bytes) -> bool:
    sample = content[:4096].decode("utf-8", errors="replace").casefold()
    if sample.startswith("\ufeff"):
        sample = sample[1:]
    return any(marker in sample for marker in HTML_MARKERS)


class RTDExportError(ValueError):
    """Raised when an RTD export is invalid or unavailable."""


class RTDAuthenticationError(RTDExportError):
    """Raised when RTD returns a login page instead of CSV data."""


def _normalize_header(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().casefold())


def _parse_int(value: object, default: int = 0) -> int:
    if value in (None, ""):
        return default
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return default


def validate_csv_bytes(content: bytes, *, expected_headers: set[str]) -> None:
    if not content or not content.strip():
        raise RTDExportError("Downloaded export is empty")
    if looks_like_html_bytes(content):
        raise RTDAuthenticationError("Downloaded export looks like an HTML login page")
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RTDExportError("Downloaded export is not valid UTF-8 text") from exc
    reader = csv.reader(io.StringIO(text))
    header = next(reader, None)
    if not header:
        raise RTDExportError("Downloaded export is missing a CSV header row")
    normalized = {_normalize_header(item) for item in header}
    missing = expected_headers - normalized
    if missing:
        raise RTDExportError(
            "Downloaded export has unexpected CSV columns: "
            + ", ".join(sorted(expected_headers))
        )


def _row_value(row: dict[str, str], *names: str) -> str:
    normalized = {_normalize_header(key): value for key, value in row.items()}
    for name in names:
        value = normalized.get(_normalize_header(name))
        if value not in (None, ""):
            return str(value).strip()
    return ""


def parse_traffic_csv(content: str | bytes, *, status_code: int) -> dict[str, Any]:
    if isinstance(content, bytes):
        validate_csv_bytes(content, expected_headers=TRAFFIC_HEADERS)
        text = content.decode("utf-8")
    else:
        text = content
        validate_csv_bytes(text.encode("utf-8"), expected_headers=TRAFFIC_HEADERS)

    rows: list[dict[str, Any]] = []
    daily_views: dict[str, int] = defaultdict(int)
    total_views = 0
    unique_pages: set[tuple[str, str]] = set()

    for row in csv.DictReader(io.StringIO(text)):
        date_value = _row_value(row, "Date")
        version = _row_value(row, "Version")
        path = _row_value(row, "Path")
        views = _parse_int(_row_value(row, "Views"))
        day = date_value[:10] if date_value else ""
        if day:
            daily_views[day] += views
        total_views += views
        if path:
            unique_pages.add((version, path))
        rows.append(
            {
                "date": day or date_value,
                "version": version,
                "path": path,
                "views": views,
                "status": status_code,
            }
        )

    rows.sort(key=lambda item: (-item["views"], item["path"], item["version"]))
    return {
        "status_code": status_code,
        "views_total": total_views,
        "unique_pages": len(unique_pages),
        "rows": rows,
        "daily_views": [
            {"date": day, "views": count}
            for day, count in sorted(daily_views.items())
        ],
        "top_pages": [
            {
                "path": item["path"],
                "version": item["version"],
                "views": item["views"],
            }
            for item in rows[:TOP_PAGE_LIMIT]
        ],
    }


def parse_search_csv(content: str | bytes) -> dict[str, Any]:
    if isinstance(content, bytes):
        validate_csv_bytes(content, expected_headers=SEARCH_HEADERS)
        text = content.decode("utf-8")
    else:
        text = content
        validate_csv_bytes(text.encode("utf-8"), expected_headers=SEARCH_HEADERS)

    search_total = 0
    no_result_search_count = 0
    daily_searches: dict[str, int] = defaultdict(int)
    daily_no_results: dict[str, int] = defaultdict(int)

    for row in csv.DictReader(io.StringIO(text)):
        created = _row_value(row, "Created Date")
        day = created[:10] if created else ""
        total_results = _parse_int(_row_value(row, "Total Results"), default=-1)
        search_total += 1
        if day:
            daily_searches[day] += 1
        if total_results == 0:
            no_result_search_count += 1
            if day:
                daily_no_results[day] += 1

    return {
        "search_total": search_total,
        "no_result_search_count": no_result_search_count,
        "daily_searches": [
            {"date": day, "searches": count}
            for day, count in sorted(daily_searches.items())
        ],
        "daily_no_result_searches": [
            {"date": day, "searches": count}
            for day, count in sorted(daily_no_results.items())
        ],
    }


def parse_readthedocs_csv(path: str | Path) -> dict[str, Any]:
    """Parse a legacy combined RTD CSV export for backward compatibility."""
    text = Path(path).read_text(encoding="utf-8")
    if looks_like_html_bytes(text.encode("utf-8")):
        raise RTDAuthenticationError("Legacy RTD CSV path contains HTML instead of CSV data")
    rows: list[dict[str, Any]] = []
    searches = 0
    no_result_searches = 0
    not_found_pages: list[dict[str, Any]] = []
    total_views = 0
    unique_pages: set[str] = set()

    for row in csv.DictReader(io.StringIO(text)):
        views = _parse_int(
            _row_value(row, "views", "View Count", "count", "Views"),
        )
        page = _row_value(row, "page", "Page", "path", "Path")
        query = _row_value(row, "query", "search_query", "Search Query", "Query")
        result_count = _row_value(row, "result_count", "results", "Result Count", "Total Results")
        status = _row_value(row, "status", "Status")
        row_type = _row_value(row, "type", "Type").casefold()

        if query or row_type == "search":
            searches += views or 1
            if result_count in {"0", "0.0"} or row_type in {"no_result", "no-results"}:
                no_result_searches += views or 1
            continue

        if status == "404" or row_type in {"404", "not_found", "not-found"}:
            not_found_pages.append({"page": page, "views": views})
            continue

        rows.append({"page": page, "views": views})
        total_views += views
        if page:
            unique_pages.add(page)

    rows.sort(key=lambda item: item["views"], reverse=True)
    not_found_pages.sort(key=lambda item: item["views"], reverse=True)
    return {
        "provider": RTD_PROVIDER,
        "views_total": total_views,
        "unique_pages": len(unique_pages),
        "top_pages": rows[:TOP_PAGE_LIMIT],
        "search_total": searches,
        "no_result_search_count": no_result_searches,
        "not_found_pages": not_found_pages[:TOP_NOT_FOUND_LIMIT],
        "not_found_count": sum(item["views"] for item in not_found_pages),
        "row_count": len(rows),
        "imported_at": Path(path).stat().st_mtime,
    }


def merge_rtd_exports(
    *,
    traffic_200: dict[str, Any],
    traffic_404: dict[str, Any],
    search: dict[str, Any],
    project_slug: str,
    collected_at: str | None = None,
) -> dict[str, Any]:
    not_found_pages = [
        {
            "path": item["path"],
            "version": item["version"],
            "views": item["views"],
        }
        for item in traffic_404.get("rows", [])
    ]
    not_found_pages.sort(key=lambda item: (-item["views"], item["path"], item["version"]))

    return {
        "provider": RTD_PROVIDER,
        "views_total": traffic_200.get("views_total", 0),
        "unique_pages": traffic_200.get("unique_pages", 0),
        "top_pages": traffic_200.get("top_pages", [])[:TOP_PAGE_LIMIT],
        "daily_views": traffic_200.get("daily_views", []),
        "search_total": search.get("search_total", 0),
        "no_result_search_count": search.get("no_result_search_count", 0),
        "daily_searches": search.get("daily_searches", []),
        "daily_no_result_searches": search.get("daily_no_result_searches", []),
        "not_found_count": traffic_404.get("views_total", 0),
        "not_found_pages": not_found_pages[:TOP_NOT_FOUND_LIMIT],
        "collection": {
            "collected_at": collected_at or datetime.now(UTC).replace(microsecond=0).isoformat(),
            "stale": False,
            "last_error": None,
            "retention_days": RTD_RETENTION_DAYS,
            "project_slug": project_slug,
            "exports": ["traffic_200", "traffic_404", "search"],
        },
        "provenance": {
            "provider": RTD_PROVIDER,
            "project_slug": project_slug,
        },
    }


def readthedocs_cache_dir(config: dict[str, Any], project_id: str) -> Path:
    custom = config.get("cache_dir")
    if custom:
        return Path(str(custom))
    return Path("data/rtd-cache") / project_id


def readthedocs_project_slug(config: dict[str, Any], documentation_url: str | None) -> str | None:
    slug = config.get("project_slug")
    if slug:
        return str(slug)
    if not documentation_url:
        return None
    hostname = (urlparse(documentation_url).hostname or "").lower()
    if hostname.endswith(".readthedocs.io"):
        return hostname.removesuffix(".readthedocs.io")
    return None


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    loaded = json.loads(path.read_text(encoding="utf-8"))
    return loaded if isinstance(loaded, dict) else None


def load_rtd_history(cache_dir: Path) -> dict[str, Any]:
    loaded = _load_json(cache_dir / "history.json")
    if not loaded:
        return {"schema_version": RTD_HISTORY_SCHEMA_VERSION, "entries": []}
    return {
        "schema_version": loaded.get("schema_version", RTD_HISTORY_SCHEMA_VERSION),
        "entries": loaded.get("entries", []),
    }


def write_rtd_history(cache_dir: Path, history: dict[str, Any]) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.joinpath("history.json").write_text(
        json.dumps(history, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def update_rtd_history(
    history: dict[str, Any],
    dataset: dict[str, Any],
    *,
    collected_at: str,
) -> dict[str, Any]:
    day = collected_at[:10]
    entry = {
        "date": day,
        "collected_at": collected_at,
        "views_total": dataset.get("views_total"),
        "search_total": dataset.get("search_total"),
        "no_result_search_count": dataset.get("no_result_search_count"),
        "not_found_count": dataset.get("not_found_count"),
    }
    entries = [
        item
        for item in history.get("entries", [])
        if not (item.get("date") == day and item.get("collected_at") == collected_at)
    ]
    entries.append(entry)
    entries.sort(key=lambda item: (item.get("date") or "", item.get("collected_at") or ""))
    return {
        "schema_version": RTD_HISTORY_SCHEMA_VERSION,
        "entries": entries,
    }


def dedupe_history_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[tuple[str, str], dict[str, Any]] = {}
    for item in entries:
        key = (str(item.get("date") or ""), str(item.get("collected_at") or ""))
        deduped[key] = item
    return sorted(
        deduped.values(),
        key=lambda item: (item.get("date") or "", item.get("collected_at") or ""),
    )


def load_rtd_cache(cache_dir: Path) -> dict[str, Any] | None:
    return _load_json(cache_dir / "latest.json")


def write_rtd_cache(cache_dir: Path, dataset: dict[str, Any]) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.joinpath("latest.json").write_text(
        json.dumps(dataset, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def write_collection_state(cache_dir: Path, state: dict[str, Any]) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.joinpath("collection-state.json").write_text(
        json.dumps(state, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def load_collection_state(cache_dir: Path) -> dict[str, Any] | None:
    return _load_json(cache_dir / "collection-state.json")


def mark_rtd_dataset_stale(
    dataset: dict[str, Any],
    *,
    message: str,
    last_error: str,
) -> dict[str, Any]:
    updated = dict(dataset)
    collection = dict(updated.get("collection") or {})
    collection.update(
        {
            "stale": True,
            "last_error": last_error,
        }
    )
    updated["collection"] = collection
    updated["status"] = "stale"
    updated["message"] = message
    return updated


def import_rtd_exports_from_dir(
    cache_dir: Path,
    *,
    project_slug: str,
    collected_at: str | None = None,
) -> dict[str, Any]:
    raw_dir = cache_dir / "raw"
    traffic_200 = parse_traffic_csv((raw_dir / "traffic-200.csv").read_bytes(), status_code=200)
    traffic_404 = parse_traffic_csv((raw_dir / "traffic-404.csv").read_bytes(), status_code=404)
    search = parse_search_csv((raw_dir / "search.csv").read_bytes())
    timestamp = collected_at or datetime.now(UTC).replace(microsecond=0).isoformat()
    dataset = merge_rtd_exports(
        traffic_200=traffic_200,
        traffic_404=traffic_404,
        search=search,
        project_slug=project_slug,
        collected_at=timestamp,
    )
    history = update_rtd_history(load_rtd_history(cache_dir), dataset, collected_at=timestamp)
    history["entries"] = dedupe_history_entries(history["entries"])
    dataset["history"] = history
    write_rtd_cache(cache_dir, dataset)
    write_rtd_history(cache_dir, history)
    write_collection_state(
        cache_dir,
        {
            "last_success_at": timestamp,
            "last_attempt_at": timestamp,
            "last_error": None,
        },
    )
    return dataset


def fetch_readthedocs_analytics(
    config: dict[str, Any],
    *,
    project_id: str,
    documentation_url: str | None = None,
) -> dict[str, Any] | None:
    legacy_csv = config.get("analytics_csv")
    if legacy_csv:
        return parse_readthedocs_csv(legacy_csv)

    cache_dir = readthedocs_cache_dir(config, project_id)
    cached = load_rtd_cache(cache_dir)
    if not cached:
        return None

    collection = cached.get("collection") or {}
    state = load_collection_state(cache_dir) or {}
    if collection.get("stale") or state.get("last_error"):
        message = (
            "Reusing the last successful Read the Docs dataset because the latest "
            "scheduled collection failed."
        )
        return mark_rtd_dataset_stale(
            cached,
            message=message,
            last_error=str(state.get("last_error") or collection.get("last_error") or "unknown"),
        )

    history = load_rtd_history(cache_dir)
    if history.get("entries"):
        cached = {**cached, "history": history}
    return cached


def rtd_export_urls(project_slug: str) -> dict[str, str]:
    base = f"https://app.readthedocs.org/dashboard/{project_slug}"
    return {
        "traffic_200": f"{base}/traffic-analytics/?download=true",
        "traffic_404": f"{base}/traffic-analytics/?download=true&status=404",
        "search": f"{base}/search-analytics/?download=true",
    }
