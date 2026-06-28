from __future__ import annotations

from collections import Counter
from typing import Any

from oss_impact_dashboard.collectors.github import GitHubClient, repo_path
from oss_impact_dashboard.schema import seconds_between


def summarize_workflow_runs(runs: list[dict[str, Any]]) -> dict[str, Any]:
    conclusions = Counter(str(run.get("conclusion") or "unknown") for run in runs)
    statuses = Counter(str(run.get("status") or "unknown") for run in runs)
    durations = []
    for run in runs:
        started = run.get("run_started_at") or run.get("created_at")
        completed = run.get("updated_at")
        if started and completed:
            duration_seconds = seconds_between(started, completed)
            if duration_seconds is not None:
                durations.append(duration_seconds)
    completed_runs = [run for run in runs if run.get("status") == "completed"]
    successful = conclusions.get("success", 0)
    failed = conclusions.get("failure", 0) + conclusions.get("timed_out", 0)
    recent_failed = [
        {
            "name": run.get("name") or run.get("display_title") or "Workflow run",
            "run_number": run.get("run_number"),
            "status": run.get("status"),
            "conclusion": run.get("conclusion"),
            "event": run.get("event"),
            "head_branch": run.get("head_branch"),
            "created_at": run.get("created_at"),
            "updated_at": run.get("updated_at"),
            "url": run.get("html_url"),
        }
        for run in runs
        if run.get("conclusion") in {"failure", "timed_out", "cancelled"}
    ][:10]
    sorted_durations = sorted(durations)
    median_duration = None
    if sorted_durations:
        mid = len(sorted_durations) // 2
        median_duration = (
            sorted_durations[mid]
            if len(sorted_durations) % 2
            else round((sorted_durations[mid - 1] + sorted_durations[mid]) / 2, 2)
        )
    return {
        "total_runs": len(runs),
        "successful_runs": successful,
        "failed_runs": failed,
        "cancelled_runs": conclusions.get("cancelled", 0),
        "success_rate": (
            round(successful / len(completed_runs), 3) if completed_runs else None
        ),
        "median_duration_seconds": median_duration,
        "conclusions": dict(conclusions),
        "statuses": dict(statuses),
        "latest_runs": runs[:20],
        "duration_samples": [
            {
                "started_at": run.get("run_started_at") or run.get("created_at"),
                "completed_at": run.get("updated_at"),
                "duration_seconds": seconds_between(
                    run.get("run_started_at") or run.get("created_at"), run.get("updated_at")
                ),
            }
            for run in runs
            if seconds_between(
                run.get("run_started_at") or run.get("created_at"), run.get("updated_at")
            )
            is not None
        ],
        "recent_failed_runs": recent_failed,
    }


def fetch_github_actions(
    owner: str, repo: str, token: str | None = None, per_page: int = 100
) -> dict[str, Any]:
    effective_token = token
    if not effective_token:
        raise RuntimeError(
            "Missing project GitHub token. Set the project-specific "
            "GITHUB_TOKEN_<PROJECT_ID> variable."
        )

    client = GitHubClient(token=effective_token, request_budget=20)
    payload = client.one(repo_path(owner, repo, "actions/runs", per_page=str(per_page)))
    runs = payload.get("workflow_runs") or []
    return {
        **summarize_workflow_runs(runs),
        "requests_used": client.requests_used,
        "rate_limit_remaining": client.rate_limit_remaining,
        "authenticated": True,
    }
