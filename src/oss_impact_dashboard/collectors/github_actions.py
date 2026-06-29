from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from oss_impact_dashboard.collectors.github import GitHubClient, repo_path
from oss_impact_dashboard.schema import seconds_between


def _duration_seconds(run: dict[str, Any]) -> float | None:
    started = run.get("run_started_at") or run.get("created_at")
    completed = run.get("updated_at")
    return seconds_between(started, completed)


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return round(ordered[mid], 2)
    return round((ordered[mid - 1] + ordered[mid]) / 2, 2)


def _p90(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = int((len(ordered) - 1) * 0.9)
    return round(ordered[index], 2)


def summarize_workflow_runs(
    runs: list[dict[str, Any]],
    *,
    workflows: list[dict[str, Any]] | None = None,
    artifacts: list[dict[str, Any]] | None = None,
    caches: list[dict[str, Any]] | None = None,
    default_branch: str | None = None,
) -> dict[str, Any]:
    conclusions = Counter(str(run.get("conclusion") or "unknown") for run in runs)
    statuses = Counter(str(run.get("status") or "unknown") for run in runs)
    durations = []
    for run in runs:
        duration_seconds = _duration_seconds(run)
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
    median_duration = _median(durations)
    p90_duration = _p90(durations)

    by_workflow: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for run in runs:
        workflow_name = run.get("name") or run.get("workflow_id") or "unknown"
        by_workflow[str(workflow_name)].append(run)

    workflow_summaries = []
    for name, workflow_runs in by_workflow.items():
        completed = [run for run in workflow_runs if run.get("status") == "completed"]
        successes = sum(1 for run in completed if run.get("conclusion") == "success")
        failures = sum(
            1
            for run in completed
            if run.get("conclusion") in {"failure", "timed_out", "cancelled"}
        )
        workflow_durations = [
            value
            for value in (_duration_seconds(run) for run in workflow_runs)
            if value is not None
        ]
        workflow_summaries.append(
            {
                "name": name,
                "runs": len(workflow_runs),
                "success_rate": round(successes / len(completed), 3) if completed else None,
                "failed_runs": failures,
                "cancelled_runs": sum(
                    1 for run in completed if run.get("conclusion") == "cancelled"
                ),
                "median_duration_seconds": _median(workflow_durations),
            }
        )
    workflow_summaries.sort(key=lambda item: item["runs"], reverse=True)

    failure_by_event: Counter[str] = Counter()
    failure_by_branch: Counter[str] = Counter()
    for run in runs:
        if run.get("conclusion") in {"failure", "timed_out"}:
            failure_by_event[str(run.get("event") or "unknown")] += 1
            failure_by_branch[str(run.get("head_branch") or "unknown")] += 1

    longest_recent = sorted(
        [
            {
                "name": run.get("name") or "Workflow run",
                "duration_seconds": _duration_seconds(run),
                "conclusion": run.get("conclusion"),
                "created_at": run.get("created_at"),
            }
            for run in runs
            if _duration_seconds(run) is not None
        ],
        key=lambda item: item["duration_seconds"] or 0,
        reverse=True,
    )[:5]

    latest_default_branch_status = None
    if default_branch:
        for run in runs:
            if run.get("head_branch") == default_branch:
                latest_default_branch_status = run.get("conclusion") or run.get("status")
                break

    artifact_storage = sum(int(item.get("size_in_bytes") or 0) for item in artifacts or [])
    cache_storage = sum(int(item.get("size_in_bytes") or 0) for item in caches or [])

    return {
        "total_runs": len(runs),
        "successful_runs": successful,
        "failed_runs": failed,
        "cancelled_runs": conclusions.get("cancelled", 0),
        "success_rate": (
            round(successful / len(completed_runs), 3) if completed_runs else None
        ),
        "median_duration_seconds": median_duration,
        "p90_duration_seconds": p90_duration,
        "conclusions": dict(conclusions),
        "statuses": dict(statuses),
        "latest_runs": runs[:20],
        "duration_samples": [
            {
                "started_at": run.get("run_started_at") or run.get("created_at"),
                "completed_at": run.get("updated_at"),
                "duration_seconds": _duration_seconds(run),
            }
            for run in runs
            if _duration_seconds(run) is not None
        ],
        "recent_failed_runs": recent_failed,
        "workflows": [
            {
                "id": workflow.get("id"),
                "name": workflow.get("name"),
                "state": workflow.get("state"),
                "path": workflow.get("path"),
            }
            for workflow in (workflows or [])
        ],
        "by_workflow": workflow_summaries,
        "failure_rate_by_event": dict(failure_by_event),
        "failure_rate_by_branch": dict(failure_by_branch),
        "longest_recent_runs": longest_recent,
        "latest_default_branch_status": latest_default_branch_status,
        "artifact_count": len(artifacts or []),
        "artifact_storage_bytes": artifact_storage,
        "cache_count": len(caches or []),
        "cache_storage_bytes": cache_storage,
    }


def fetch_github_actions(
    owner: str, repo: str, token: str | None = None, per_page: int = 100
) -> dict[str, Any]:
    effective_token = token
    if not effective_token:
        raise RuntimeError(
            "Missing project GitHub token. Set the project-specific "
            "GH_PAT_<SUFFIX> variable."
        )

    client = GitHubClient(token=effective_token, request_budget=30)
    repository = client.one(repo_path(owner, repo, ""))
    default_branch = repository.get("default_branch")
    payload = client.one(repo_path(owner, repo, "actions/runs", per_page=str(per_page)))
    runs = payload.get("workflow_runs") or []

    workflows_payload = None
    artifacts = None
    caches = None
    try:
        workflows_payload = client.one(repo_path(owner, repo, "actions/workflows", per_page="100"))
    except Exception:  # noqa: BLE001
        workflows_payload = None
    try:
        artifacts_payload = client.one(repo_path(owner, repo, "actions/artifacts", per_page="30"))
        artifacts = artifacts_payload.get("artifacts") or []
    except Exception:  # noqa: BLE001
        artifacts = None
    try:
        caches = client.paginate(repo_path(owner, repo, "actions/caches", per_page="100"))
    except Exception:  # noqa: BLE001
        caches = None

    workflows = (workflows_payload or {}).get("workflows") or []
    return {
        **summarize_workflow_runs(
            runs,
            workflows=workflows,
            artifacts=artifacts if isinstance(artifacts, list) else None,
            caches=caches if isinstance(caches, list) else None,
            default_branch=default_branch,
        ),
        "requests_used": client.requests_used,
        "rate_limit_remaining": client.rate_limit_remaining,
        "authenticated": True,
    }
