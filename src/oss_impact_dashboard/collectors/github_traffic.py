from __future__ import annotations

from typing import Any

from oss_impact_dashboard.collectors.github import GitHubClient, repo_path

TRAFFIC_WINDOW_DAYS = 14


def _normalize_daily(series: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized = []
    for entry in series or []:
        timestamp = entry.get("timestamp") or entry.get("week") or ""
        date = str(timestamp)[:10] if timestamp else ""
        normalized.append(
            {
                "date": date,
                "count": int(entry.get("count") or 0),
                "uniques": int(entry.get("uniques") or 0),
            }
        )
    return normalized


def _normalize_paths(paths: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return [
        {
            "path": item.get("path") or "",
            "title": item.get("title") or item.get("path") or "",
            "count": int(item.get("count") or 0),
            "uniques": int(item.get("uniques") or 0),
        }
        for item in (paths or [])
    ]


def _normalize_referrers(referrers: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return [
        {
            "referrer": item.get("referrer") or "unknown",
            "count": int(item.get("count") or 0),
            "uniques": int(item.get("uniques") or 0),
        }
        for item in (referrers or [])
    ]


def summarize_traffic(raw: dict[str, Any]) -> dict[str, Any]:
    views = raw.get("views") or {}
    clones = raw.get("clones") or {}
    views_total = int(views.get("count") or 0)
    views_unique = int(views.get("uniques") or 0)
    clones_total = int(clones.get("count") or 0)
    clones_unique = int(clones.get("uniques") or 0)
    unique_view_rate = round(views_unique / views_total, 3) if views_total else None
    clone_to_view_rate = (
        round(clones_unique / views_unique, 3) if views_unique else None
    )
    return {
        "views_total": views_total,
        "views_unique": views_unique,
        "clones_total": clones_total,
        "clones_unique": clones_unique,
        "daily_views": _normalize_daily(views.get("views")),
        "daily_clones": _normalize_daily(clones.get("clones")),
        "popular_paths": _normalize_paths(raw.get("popular_paths")),
        "popular_referrers": _normalize_referrers(raw.get("popular_referrers")),
        "window_days": TRAFFIC_WINDOW_DAYS,
        "unique_view_rate": unique_view_rate,
        "clone_to_view_rate": clone_to_view_rate,
    }


def _get_payload(client: GitHubClient, owner: str, repo: str, endpoint: str) -> Any:
    payload, _links = client.get_json(f"{client.api_root}{repo_path(owner, repo, endpoint)}")
    return payload


def fetch_github_traffic(owner: str, repo: str, token: str | None = None) -> dict[str, Any]:
    effective_token = token
    if not effective_token:
        raise RuntimeError(
            "Missing project GitHub token. Set the project-specific "
            "GH_PAT_<SUFFIX> variable."
        )

    client = GitHubClient(token=effective_token, request_budget=20)
    raw = {
        "views": _get_payload(client, owner, repo, "traffic/views"),
        "clones": _get_payload(client, owner, repo, "traffic/clones"),
        "popular_paths": _get_payload(client, owner, repo, "traffic/popular/paths"),
        "popular_referrers": _get_payload(client, owner, repo, "traffic/popular/referrers"),
    }
    return {
        **summarize_traffic(raw),
        "requests_used": client.requests_used,
        "rate_limit_remaining": client.rate_limit_remaining,
        "authenticated": True,
    }
