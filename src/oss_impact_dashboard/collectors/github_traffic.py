from __future__ import annotations

from typing import Any

from oss_impact_dashboard.collectors.github import GitHubClient, github_token, repo_path


def summarize_traffic(raw: dict[str, Any]) -> dict[str, Any]:
    views = raw.get("views") or {}
    clones = raw.get("clones") or {}
    return {
        "views_total": int(views.get("count") or 0),
        "views_unique": int(views.get("uniques") or 0),
        "clones_total": int(clones.get("count") or 0),
        "clones_unique": int(clones.get("uniques") or 0),
        "popular_paths": raw.get("popular_paths") or [],
        "popular_referrers": raw.get("popular_referrers") or [],
    }


def _get_payload(client: GitHubClient, owner: str, repo: str, endpoint: str) -> Any:
    payload, _links = client.get_json(f"{client.api_root}{repo_path(owner, repo, endpoint)}")
    return payload


def fetch_github_traffic(owner: str, repo: str, token: str | None = None) -> dict[str, Any]:
    effective_token = token or github_token()
    if not effective_token:
        raise RuntimeError("GitHub traffic requires an authenticated token")

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
