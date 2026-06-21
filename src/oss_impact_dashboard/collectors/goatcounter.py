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
    ) -> None:
        if timeout < 15 or timeout > 30:
            raise ValueError("GoatCounter timeout must be between 15 and 30 seconds")
        self.settings = settings
        self.timeout = timeout
        self.max_retries = max_retries
        self.requests_used = 0
        self.rate_limit_remaining: str | None = None
        self.rate_limit_reset: str | None = None

    def get_json(self, endpoint: str, params: dict[str, str]) -> Any:
        if self.requests_used >= 3:
            raise GoatCounterAPIError("GoatCounter request limit exceeded")
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
                if retryable and attempt + 1 < self.max_retries and self.requests_used < 3:
                    retry_after = error.headers.get("Retry-After")
                    sleep_seconds = min(float(retry_after or 2**attempt), 5.0)
                    time.sleep(sleep_seconds)
                    continue
                raise GoatCounterAPIError(
                    f"GoatCounter API request failed with HTTP {error.code}"
                ) from error
            except urllib.error.URLError as error:
                if attempt + 1 < self.max_retries and self.requests_used < 3:
                    time.sleep(min(2**attempt, 5.0))
                    continue
                raise GoatCounterAPIError("GoatCounter API request failed") from error
            except json.JSONDecodeError as error:
                raise GoatCounterAPIError("GoatCounter API returned malformed JSON") from error
        raise GoatCounterAPIError("GoatCounter API request failed after retries")


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


def _path(row: dict[str, Any]) -> str:
    return str(row.get("path") or row.get("page") or row.get("name") or "")


def parse_total(payload: Any) -> dict[str, int]:
    if not isinstance(payload, dict):
        raise GoatCounterAPIError("GoatCounter total response must be an object")
    source = payload.get("total") if isinstance(payload.get("total"), dict) else payload
    page_hits = _count(source, "pageviews", "page_hits", "hits", "count")
    visitors = _count(source, "visitors", "visitor_count", "visits", "uniques", "unique")
    return {"page_hit_count": page_hits, "visitor_count": visitors or page_hits}


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
        day = str(row.get("day") or row.get("date") or row.get("period") or "")
        if event or path.startswith("event:"):
            if path == EVENT_SEARCH:
                search_count += count
            elif path == EVENT_NO_RESULTS:
                no_result_search_count += count
            elif path.startswith(EVENT_404_PREFIX):
                missing_path = path.removeprefix(EVENT_404_PREFIX) or "/"
                not_found[missing_path] = not_found.get(missing_path, 0) + count
            continue
        if day:
            trend[day[:10]] = trend.get(day[:10], 0) + count
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


def parse_toprefs(payload: Any) -> list[dict[str, Any]]:
    refs = []
    for row in _rows(payload, ("toprefs", "refs", "referrers", "items")):
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
) -> dict[str, Any]:
    return {
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
        "collected_at": None,
        "requests_used": 0,
        "limitations": LIMITATIONS,
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
    hits = parse_hits(client.get_json("/stats/hits", {**period, "group": "day", "limit": "100"}))
    refs = parse_toprefs(client.get_json("/stats/toprefs", {**period, "limit": "20"}))
    return {
        "provider": "goatcounter",
        "status": "available",
        **total,
        **hits,
        "top_referrers": refs,
        "reporting_period": period,
        "collected_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "requests_used": client.requests_used,
        "rate_limit_remaining": client.rate_limit_remaining,
        "rate_limit_reset": client.rate_limit_reset,
        "limitations": LIMITATIONS,
        "provenance": {
            "site_url": resolved.site_url,
            "tracked_domain": resolved.tracked_domain,
            "endpoints": ["/api/v0/stats/total", "/api/v0/stats/hits", "/api/v0/stats/toprefs"],
        },
    }
