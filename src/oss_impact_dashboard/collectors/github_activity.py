from __future__ import annotations

import time
from statistics import median
from typing import Any

from oss_impact_dashboard.collectors.github import GitHubClient, repo_path


def _get_stats_payload(client: GitHubClient, owner: str, repo: str, endpoint: str) -> Any:
    url = f"{client.api_root}{repo_path(owner, repo, endpoint)}"
    for attempt in range(4):
        payload, _ = client.get_json(url)
        if payload is not None and payload != []:
            return payload
        if attempt + 1 < 4:
            time.sleep(1.5 * (attempt + 1))
    return payload


def _weekly_totals(weeks: list[dict[str, Any]] | None) -> list[int]:
    return [int(week.get("total") or 0) for week in (weeks or [])]


def _sum_recent(values: list[int], count: int) -> int:
    if not values:
        return 0
    return sum(values[-count:])


def summarize_activity(
    participation: dict[str, Any] | list[Any] | None,
    commit_activity: list[dict[str, Any]] | None,
    contributors: list[dict[str, Any]] | None,
    code_frequency: list[list[int]] | None,
) -> dict[str, Any]:
    participation_data = participation if isinstance(participation, dict) else {}
    weekly_commits = _weekly_totals(commit_activity)
    owner_weekly_commits = [int(value or 0) for value in participation_data.get("owner") or []]
    all_weekly_commits = [int(value or 0) for value in participation_data.get("all") or []]
    if not weekly_commits and all_weekly_commits:
        weekly_commits = all_weekly_commits

    active_weeks = sum(1 for value in weekly_commits if value > 0)
    total_commits = sum(weekly_commits)
    median_weekly = round(median(weekly_commits), 2) if weekly_commits else None

    weekly_additions = []
    weekly_deletions = []
    for entry in code_frequency or []:
        if isinstance(entry, list) and len(entry) >= 3:
            weekly_additions.append(int(entry[1] or 0))
            weekly_deletions.append(int(entry[2] or 0))

    contributor_commit_totals = []
    commit_totals = []
    for contributor in contributors or []:
        author = contributor.get("author") or {}
        login = author.get("login") or "unknown"
        total = int(contributor.get("total") or 0)
        commit_totals.append(total)
        recent_weeks = _weekly_totals(contributor.get("weeks"))
        contributor_commit_totals.append(
            {
                "login": login,
                "total_commits": total,
                "recent_weekly_commits": recent_weeks[-4:],
            }
        )
    contributor_commit_totals.sort(key=lambda item: item["total_commits"], reverse=True)

    top_share = None
    bus_factor_proxy = None
    if commit_totals:
        total_commit_count = sum(commit_totals)
        top_share = round(commit_totals[0] / total_commit_count, 3) if total_commit_count else None
        running = 0
        for index, value in enumerate(sorted(commit_totals, reverse=True), start=1):
            running += value
            if total_commit_count and running / total_commit_count > 0.5:
                bus_factor_proxy = index
                break

    return {
        "weekly_commits": weekly_commits,
        "owner_weekly_commits": owner_weekly_commits,
        "active_weeks_52w": active_weeks,
        "total_commits_52w": total_commits,
        "median_weekly_commits_52w": median_weekly,
        "commits_last_4w": _sum_recent(weekly_commits, 4),
        "commits_last_13w": _sum_recent(weekly_commits, 13),
        "weekly_additions": weekly_additions,
        "weekly_deletions": weekly_deletions,
        "net_code_change_52w": sum(weekly_additions) - sum(weekly_deletions),
        "contributor_commit_totals": contributor_commit_totals[:20],
        "top_commit_contributor_share": top_share,
        "commit_bus_factor_proxy": bus_factor_proxy,
        "partial": not weekly_commits and not contributor_commit_totals,
    }


def fetch_github_activity(owner: str, repo: str, token: str | None = None) -> dict[str, Any]:
    effective_token = token
    if not effective_token:
        raise RuntimeError(
            "Missing project GitHub token. Set the project-specific "
            "GH_PAT_<SUFFIX> variable."
        )

    client = GitHubClient(token=effective_token, request_budget=30)
    participation = _get_stats_payload(client, owner, repo, "stats/participation")
    commit_activity = _get_stats_payload(client, owner, repo, "stats/commit_activity")
    contributors = _get_stats_payload(client, owner, repo, "stats/contributors")
    code_frequency = _get_stats_payload(client, owner, repo, "stats/code_frequency")

    summary = summarize_activity(participation, commit_activity, contributors, code_frequency)
    return {
        **summary,
        "requests_used": client.requests_used,
        "rate_limit_remaining": client.rate_limit_remaining,
        "authenticated": True,
    }
