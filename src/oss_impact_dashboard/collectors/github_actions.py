from __future__ import annotations

from collections import Counter
from typing import Any

from oss_impact_dashboard.collectors.github import GitHubClient, github_token, repo_path


def summarize_workflow_runs(runs: list[dict[str, Any]]) -> dict[str, Any]:
    conclusions = Counter(str(run.get("conclusion") or "unknown") for run in runs)
    statuses = Counter(str(run.get("status") or "unknown") for run in runs)
    durations = []
    for run in runs:
        started = run.get("run_started_at") or run.get("created_at")
        completed = run.get("updated_at")
        if started and completed:
            durations.append({"started_at": started, "completed_at": completed})
    return {
        "total_runs": len(runs),
        "conclusions": dict(conclusions),
        "statuses": dict(statuses),
        "latest_runs": runs[:20],
        "duration_samples": durations,
    }


def fetch_github_actions(
    owner: str, repo: str, token: str | None = None, per_page: int = 100
) -> dict[str, Any]:
    effective_token = token or github_token()
    if not effective_token:
        raise RuntimeError("GitHub Actions metrics require an authenticated token")

    client = GitHubClient(token=effective_token, request_budget=20)
    payload = client.one(repo_path(owner, repo, "actions/runs", per_page=str(per_page)))
    runs = payload.get("workflow_runs") or []
    return {
        **summarize_workflow_runs(runs),
        "requests_used": client.requests_used,
        "rate_limit_remaining": client.rate_limit_remaining,
        "authenticated": True,
    }
