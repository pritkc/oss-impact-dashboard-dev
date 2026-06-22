from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

TRACKER_SCRIPT_URL = "https://gc.zgo.at/count.js"
LIMITATIONS = [
    "Search queries are intentionally not collected.",
    "Counts use GoatCounter's privacy-aware visitor model.",
]
EVENT_SEARCH = "event:documentation-search"
EVENT_NO_RESULTS = "event:documentation-search-no-results"
EVENT_404_PREFIX = "event:documentation-404:"
HITS_PAGE_LIMIT = 100
HITS_MAX_PAGES = 6


@dataclass(frozen=True)
class GoatCounterSettings:
    api_key: str
    site_url: str
    tracked_domain: str

    @property
    def api_base(self) -> str:
        return f"{self.site_url}/api/v0"

    @property
    def count_endpoint(self) -> str:
        return f"{self.site_url}/count"


class GoatCounterConfigError(RuntimeError):
    pass


class GoatCounterAPIError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        endpoint: str | None = None,
        http_status: int | None = None,
        requests_used: int | None = None,
    ) -> None:
        super().__init__(message)
        self.endpoint = endpoint
        self.http_status = http_status
        self.requests_used = requests_used


class GoatCounterSchemaError(GoatCounterAPIError):
    pass


def _normalize_site_url(value: str | None) -> str:
    if not value:
        raise GoatCounterConfigError("GOATCOUNTER_SITE_URL is missing")
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc or parsed.path not in {"", "/"}:
        raise GoatCounterConfigError("GOATCOUNTER_SITE_URL must be an HTTPS origin")
    return f"https://{parsed.netloc}".rstrip("/")


def _normalize_hostname(value: str | None) -> str:
    if not value:
        raise GoatCounterConfigError("GOATCOUNTER_TRACKED_DOMAIN is missing")
    if "://" in value or "/" in value or "?" in value or "#" in value:
        raise GoatCounterConfigError("GOATCOUNTER_TRACKED_DOMAIN must be a hostname")
    parsed = urllib.parse.urlparse(f"//{value}", scheme="https")
    hostname = parsed.hostname or ""
    if not hostname or hostname != value.lower() or any(ch.isspace() for ch in value):
        raise GoatCounterConfigError("GOATCOUNTER_TRACKED_DOMAIN must be a hostname")
    return hostname


def _hostname_from_url(value: str | None) -> str:
    if not value:
        raise GoatCounterConfigError("project.documentation_url is missing")
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise GoatCounterConfigError("project.documentation_url must be an HTTP(S) URL")
    return parsed.hostname.lower()


def validate_documentation_hostname(documentation_url: str | None, tracked_domain: str) -> str:
    documentation_hostname = _hostname_from_url(documentation_url)
    normalized_tracked_domain = _normalize_hostname(tracked_domain)
    if documentation_hostname != normalized_tracked_domain:
        raise GoatCounterConfigError(
            "RTD tracker host mismatch: "
            f"documentation_url host {documentation_hostname} does not match "
            f"GOATCOUNTER_TRACKED_DOMAIN {normalized_tracked_domain}"
        )
    return documentation_hostname


def settings_from_env(require_api_key: bool = True) -> GoatCounterSettings | None:
    site_url = os.environ.get("GOATCOUNTER_SITE_URL")
    tracked_domain = os.environ.get("GOATCOUNTER_TRACKED_DOMAIN")
    api_key = os.environ.get("GOATCOUNTER_API_KEY")
    if not site_url and not tracked_domain and not api_key:
        return None
    if require_api_key and not api_key:
        raise GoatCounterConfigError("GOATCOUNTER_API_KEY is missing")
    return GoatCounterSettings(
        api_key=api_key or "",
        site_url=_normalize_site_url(site_url),
        tracked_domain=_normalize_hostname(tracked_domain),
    )


def reporting_window(months: int, now: datetime | None = None) -> dict[str, str]:
    end = (now or datetime.now(UTC)).astimezone(UTC).replace(minute=0, second=0, microsecond=0)
    start = end - timedelta(days=max(months, 1) * 30)
    return {
        "start": start.isoformat().replace("+00:00", "Z"),
        "end": end.isoformat().replace("+00:00", "Z"),
    }


class GoatCounterClient:
    def __init__(
        self,
        settings: GoatCounterSettings,
        *,
        timeout: int = 20,
        max_retries: int = 3,
        max_requests: int = 12,
    ) -> None:
        if timeout < 15 or timeout > 30:
            raise ValueError("GoatCounter timeout must be between 15 and 30 seconds")
        self.settings = settings
        self.timeout = timeout
        self.max_retries = max_retries
        self.max_requests = max_requests
        self.requests_used = 0
        self.rate_limit_remaining: str | None = None
        self.rate_limit_reset: str | None = None

    def get_json(self, endpoint: str, params: dict[str, str]) -> Any:
        if self.requests_used >= self.max_requests:
            raise GoatCounterAPIError(
                "GoatCounter request limit exceeded",
                endpoint=endpoint,
                requests_used=self.requests_used,
            )
        query = urllib.parse.urlencode(params)
        url = (
            f"{self.settings.api_base}{endpoint}?{query}"
            if query
            else f"{self.settings.api_base}{endpoint}"
        )
        headers = {
            "Authorization": f"Bearer {self.settings.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "oss-impact-dashboard",
        }
        for attempt in range(self.max_retries):
            request = urllib.request.Request(url, headers=headers)
            self.requests_used += 1
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    self.rate_limit_remaining = response.headers.get("X-RateLimit-Remaining")
                    self.rate_limit_reset = response.headers.get("X-RateLimit-Reset")
                    payload = json.loads(response.read().decode("utf-8"))
                    return payload
            except urllib.error.HTTPError as error:
                retryable = error.code == 429 or 500 <= error.code <= 599
                if (
                    retryable
                    and attempt + 1 < self.max_retries
                    and self.requests_used < self.max_requests
                ):
                    retry_after = error.headers.get("Retry-After")
                    sleep_seconds = min(float(retry_after or 2**attempt), 5.0)
                    time.sleep(sleep_seconds)
                    continue
                reason = _http_status_reason(error.code)
                raise GoatCounterAPIError(
                    f"GoatCounter API request failed with HTTP {error.code}: {reason}",
                    endpoint=endpoint,
                    http_status=error.code,
                    requests_used=self.requests_used,
                ) from error
            except urllib.error.URLError as error:
                if attempt + 1 < self.max_retries and self.requests_used < self.max_requests:
                    time.sleep(min(2**attempt, 5.0))
                    continue
                raise GoatCounterAPIError(
                    "GoatCounter API request failed",
                    endpoint=endpoint,
                    requests_used=self.requests_used,
                ) from error
            except json.JSONDecodeError as error:
                raise GoatCounterAPIError(
                    "GoatCounter API returned malformed JSON",
                    endpoint=endpoint,
                    requests_used=self.requests_used,
                ) from error
        raise GoatCounterAPIError(
            "GoatCounter API request failed after retries",
            endpoint=endpoint,
            requests_used=self.requests_used,
        )


def _http_status_reason(status: int) -> str:
    if status == 401:
        return "missing or incorrect API key"
    if status == 403:
        return "insufficient permission"
    if status == 429:
        return "rate limited"
    if 500 <= status <= 599:
        return "temporary provider error"
    return "provider error"


def _rows(payload: Any, keys: tuple[str, ...]) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = []
        for key in keys:
            value = payload.get(key)
            if isinstance(value, list):
                rows = value
                break
        if not rows and isinstance(payload.get("data"), list):
            rows = payload["data"]
    else:
        raise GoatCounterAPIError("GoatCounter response must be a JSON object or array")
    if not all(isinstance(item, dict) for item in rows):
        raise GoatCounterAPIError("GoatCounter response rows must be objects")
    return rows


def _count(row: dict[str, Any], *keys: str) -> int:
    for key in keys:
        value = row.get(key)
        if isinstance(value, int | float):
            return int(value)
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return 0


def _optional_count(row: dict[str, Any], *keys: str) -> int | None:
    for key in keys:
        value = row.get(key)
        if isinstance(value, int | float):
            return int(value)
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return None


def _path(row: dict[str, Any]) -> str:
    return str(row.get("path") or row.get("page") or row.get("name") or "")


def validate_official_total_response(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise GoatCounterSchemaError("GoatCounter /stats/total schema error: object expected")
    for key in ("total", "total_events", "total_utc"):
        if not isinstance(payload.get(key), int | float):
            raise GoatCounterSchemaError(
                f"GoatCounter /stats/total schema error: numeric {key} missing"
            )
    if not isinstance(payload.get("stats"), list):
        raise GoatCounterSchemaError(
            "GoatCounter /stats/total schema error: stats list missing"
        )


def parse_total(payload: Any) -> dict[str, int | None]:
    if not isinstance(payload, dict):
        raise GoatCounterAPIError("GoatCounter total response must be an object")
    if all(key in payload for key in ("total", "total_events", "total_utc", "stats")):
        validate_official_total_response(payload)
        total = _count(payload, "total")
        total_events = _count(payload, "total_events")
        total_utc = _count(payload, "total_utc")
        return {
            "visitor_count": max(total - total_events, 0),
            "page_hit_count": None,
            "total": total,
            "total_events": total_events,
            "total_utc": total_utc,
        }
    source = payload.get("total") if isinstance(payload.get("total"), dict) else payload
    page_hits = _optional_count(source, "pageviews", "page_hits", "hits")
    visitors = _optional_count(source, "visitors", "visitor_count", "visits", "uniques", "unique")
    if visitors is None and page_hits is not None:
        visitors = page_hits
    if page_hits is None:
        page_hits = _optional_count(source, "count")
    return {"page_hit_count": page_hits, "visitor_count": visitors or page_hits or 0}


def _daily_stats(row: dict[str, Any]) -> dict[str, int]:
    daily: dict[str, int] = {}
    stats = row.get("stats")
    if isinstance(stats, list):
        for item in stats:
            if not isinstance(item, dict):
                raise GoatCounterAPIError("GoatCounter hit stats rows must be objects")
            day = item.get("day")
            count = _optional_count(item, "daily", "count")
            if day and count is not None:
                key = str(day)[:10]
                daily[key] = daily.get(key, 0) + count
    if not daily:
        day = str(row.get("day") or row.get("date") or row.get("period") or "")
        if day:
            daily[day[:10]] = _count(row, "count", "hits", "pageviews", "visits")
    return daily


def parse_hits(payload: Any) -> dict[str, Any]:
    pages: dict[str, dict[str, Any]] = {}
    trend: dict[str, int] = {}
    search_count = 0
    no_result_search_count = 0
    not_found: dict[str, int] = {}
    for row in _rows(payload, ("hits", "paths", "items")):
        path = _path(row)
        count = _count(row, "count", "hits", "pageviews", "visits")
        event = bool(row.get("event"))
        if event or path.startswith("event:"):
            if path == EVENT_SEARCH:
                search_count += count
            elif path == EVENT_NO_RESULTS:
                no_result_search_count += count
            elif path.startswith(EVENT_404_PREFIX):
                missing_path = path.removeprefix(EVENT_404_PREFIX) or "/"
                not_found[missing_path] = not_found.get(missing_path, 0) + count
            continue
        for day, daily_count in _daily_stats(row).items():
            trend[day] = trend.get(day, 0) + daily_count
        if path:
            existing = pages.setdefault(
                path,
                {
                    "path": path,
                    "title": str(row.get("title") or path),
                    "count": 0,
                },
            )
            existing["count"] += count
    return {
        "trend": [{"date": key, "count": trend[key]} for key in sorted(trend)],
        "popular_pages": sorted(
            pages.values(),
            key=lambda item: (-item["count"], item["path"]),
        )[:20],
        "search_count": search_count,
        "no_result_search_count": no_result_search_count,
        "not_found_count": sum(not_found.values()),
        "not_found_pages": [
            {"path": key, "count": not_found[key]}
            for key in sorted(not_found, key=lambda item: (-not_found[item], item))
        ],
    }


def _hit_cursor(row: dict[str, Any]) -> str:
    value = row.get("path_id") or row.get("id") or row.get("path") or row.get("page")
    return str(value) if value is not None else ""


def _hit_rows(payload: Any) -> list[dict[str, Any]]:
    return _rows(payload, ("hits", "paths", "items"))


def _has_more(payload: Any) -> bool:
    return isinstance(payload, dict) and payload.get("more") is True


def fetch_paginated_hits(
    client: GoatCounterClient,
    period: dict[str, str],
    *,
    limit: int = HITS_PAGE_LIMIT,
    max_pages: int = HITS_MAX_PAGES,
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    excluded: list[str] = []
    partial = False
    pages_requested = 0
    for page in range(max_pages):
        pages_requested += 1
        params = {**period, "group": "day", "limit": str(limit)}
        if excluded:
            params["exclude"] = ",".join(excluded)
        payload = client.get_json("/stats/hits", params)
        page_rows = _hit_rows(payload)
        rows.extend(page_rows)
        excluded.extend(cursor for cursor in (_hit_cursor(row) for row in page_rows) if cursor)
        if not _has_more(payload):
            break
        if page + 1 == max_pages:
            partial = True
    parsed = parse_hits({"hits": rows})
    parsed["partial"] = partial
    parsed["pages_requested"] = pages_requested
    return parsed


def parse_toprefs(payload: Any) -> list[dict[str, Any]]:
    refs = []
    for row in _rows(payload, ("stats", "toprefs", "refs", "referrers", "items")):
        referrer = str(row.get("referrer") or row.get("name") or row.get("path") or "")
        if referrer:
            refs.append({"referrer": referrer, "count": _count(row, "count", "hits", "visits")})
    return sorted(refs, key=lambda item: (-item["count"], item["referrer"]))[:20]


def unavailable_documentation_analytics(
    message: str,
    *,
    provider: str = "goatcounter",
    status: str = "unavailable",
    reporting_period: dict[str, str] | None = None,
    endpoint: str | None = None,
    http_status: int | None = None,
    requests_used: int = 0,
    collected_at: str | None = None,
    tracker: dict[str, Any] | None = None,
) -> dict[str, Any]:
    data = {
        "provider": provider,
        "status": status,
        "message": message,
        "visitor_count": None,
        "page_hit_count": None,
        "trend": [],
        "popular_pages": [],
        "top_referrers": [],
        "search_count": None,
        "no_result_search_count": None,
        "not_found_count": None,
        "not_found_pages": [],
        "reporting_period": reporting_period or {},
        "collected_at": collected_at,
        "requests_used": requests_used,
        "limitations": LIMITATIONS,
    }
    if endpoint:
        data["endpoint"] = endpoint
    if http_status is not None:
        data["http_status"] = http_status
    if tracker is not None:
        data["tracker"] = tracker
    return data


def tracker_metadata(settings: GoatCounterSettings | None) -> dict[str, Any]:
    return {
        "enabled": bool(settings and settings.site_url and settings.tracked_domain),
        "site_origin": settings.site_url if settings else "",
        "tracked_domain": settings.tracked_domain if settings else "",
        "script_path": "rtd-goatcounter.js",
    }


def fetch_goatcounter_analytics(
    *,
    period_months: int,
    now: datetime | None = None,
    settings: GoatCounterSettings | None = None,
) -> dict[str, Any] | None:
    resolved = settings or settings_from_env(require_api_key=True)
    if resolved is None:
        return None
    period = reporting_window(period_months, now)
    client = GoatCounterClient(resolved)
    total = parse_total(client.get_json("/stats/total", period))
    hits = fetch_paginated_hits(client, period)
    refs = parse_toprefs(client.get_json("/stats/toprefs", {**period, "limit": "20"}))
    return {
        "provider": "goatcounter",
        "status": "partial" if hits.get("partial") else "available",
        "message": "GoatCounter hits pagination reached its safety budget."
        if hits.get("partial")
        else "",
        **total,
        **hits,
        "top_referrers": refs,
        "reporting_period": period,
        "collected_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "requests_used": client.requests_used,
        "rate_limit_remaining": client.rate_limit_remaining,
        "rate_limit_reset": client.rate_limit_reset,
        "limitations": LIMITATIONS,
        "tracker": tracker_metadata(resolved),
        "provenance": {
            "site_url": resolved.site_url,
            "tracked_domain": resolved.tracked_domain,
            "endpoints": ["/api/v0/stats/total", "/api/v0/stats/hits", "/api/v0/stats/toprefs"],
        },
    }
