from __future__ import annotations

from typing import Any

from oss_impact_dashboard.collectors.github import (
    GitHubClient,
    fetch_community_standards,
    fetch_community_standards_from_contents,
    repo_path,
)
from oss_impact_dashboard.schema import days_between, now_iso


def _files_present_from_profile(profile: dict[str, Any] | None) -> dict[str, bool]:
    files = (profile or {}).get("files") or {}
    return {
        "readme": bool(files.get("readme")),
        "license": bool(files.get("license")),
        "contributing": bool(files.get("contributing")),
        "code_of_conduct": bool(files.get("code_of_conduct")),
        "security": bool(files.get("security")),
        "issue_template": bool(files.get("issue_template")),
        "pull_request_template": bool(files.get("pull_request_template")),
        "citation": bool(files.get("citation")),
    }


def _summarize_branch_protection(protection: dict[str, Any] | None) -> dict[str, Any]:
    if not protection:
        return {
            "default_branch_protected": False,
            "required_status_checks_count": 0,
            "requires_pull_request_reviews": False,
            "required_approving_review_count": 0,
            "enforces_admins": False,
            "allows_force_pushes": None,
            "allows_deletions": None,
        }
    status_checks = protection.get("required_status_checks") or {}
    pr_reviews = protection.get("required_pull_request_reviews") or {}
    return {
        "default_branch_protected": True,
        "required_status_checks_count": len(status_checks.get("contexts") or []),
        "requires_pull_request_reviews": bool(pr_reviews),
        "required_approving_review_count": int(
            pr_reviews.get("required_approving_review_count") or 0
        ),
        "enforces_admins": bool(protection.get("enforce_admins", {}).get("enabled")),
        "allows_force_pushes": bool(protection.get("allow_force_pushes", {}).get("enabled")),
        "allows_deletions": bool(protection.get("allow_deletions", {}).get("enabled")),
    }


def summarize_governance(
    community_profile: dict[str, Any] | None,
    community_fallback: dict[str, Any] | None,
    branch_protection: dict[str, Any] | None,
    rulesets: list[dict[str, Any]] | None,
    environments: list[dict[str, Any]] | None,
    deployments: list[dict[str, Any]] | None,
    pages: dict[str, Any] | None,
) -> dict[str, Any]:
    health_percentage = None
    files_present = _files_present_from_profile(community_profile)
    if community_fallback:
        for key, value in (community_fallback.get("files_present") or {}).items():
            files_present[key] = bool(value) or files_present.get(key, False)

    if community_profile:
        health_percentage = community_profile.get("health_percentage")

    protected_environments = sum(
        1 for env in environments or [] if (env.get("protection_rules") or [])
    )

    latest_deployment_state = None
    latest_deployment_environment = None
    latest_deployment_age_days = None
    recent_success = 0
    recent_total = 0
    if deployments:
        latest = deployments[0]
        latest_deployment_state = latest.get("state") or latest.get("status")
        latest_deployment_environment = latest.get("environment")
        latest_deployment_age_days = days_between(latest.get("created_at"), now_iso())
        for deployment in deployments[:10]:
            state = str(deployment.get("state") or deployment.get("status") or "").casefold()
            if state:
                recent_total += 1
                if state in {"success", "active"}:
                    recent_success += 1

    return {
        "available": bool(
            community_profile
            or community_fallback
            or branch_protection
            or rulesets
            or environments
            or deployments
            or pages
        ),
        "community_profile": {
            "health_percentage": health_percentage,
            "files_present": files_present,
        },
        **_summarize_branch_protection(branch_protection),
        "rulesets_count": len(rulesets or []),
        "environments_count": len(environments or []),
        "protected_environments_count": protected_environments,
        "deployments": {
            "latest_deployment_state": latest_deployment_state,
            "latest_deployment_environment": latest_deployment_environment,
            "latest_deployment_age_days": latest_deployment_age_days,
            "recent_success_rate": (
                round(recent_success / recent_total, 3) if recent_total else None
            ),
        },
        "pages": {
            "status": (pages or {}).get("status"),
            "cname": (pages or {}).get("cname"),
            "source_branch": ((pages or {}).get("source") or {}).get("branch"),
        }
        if pages
        else {},
    }


def _safe_one(client: GitHubClient, path: str) -> dict[str, Any] | None:
    try:
        return client.one(path)
    except Exception:  # noqa: BLE001
        return None


def _safe_list(client: GitHubClient, path: str) -> list[dict[str, Any]]:
    try:
        return [item for item in client.paginate(path) if isinstance(item, dict)]
    except Exception:  # noqa: BLE001
        return []


def fetch_github_governance(owner: str, repo: str, token: str | None = None) -> dict[str, Any]:
    effective_token = token
    if not effective_token:
        raise RuntimeError(
            "Missing project GitHub token. Set the project-specific "
            "GH_PAT_<SUFFIX> variable."
        )

    client = GitHubClient(token=effective_token, request_budget=35)
    community_profile = None
    community_fallback = None
    try:
        community_profile = client.one(repo_path(owner, repo, "community/profile"))
    except Exception:  # noqa: BLE001
        community_fallback = fetch_community_standards_from_contents(client, owner, repo)

    repository = client.one(repo_path(owner, repo, ""))
    default_branch = repository.get("default_branch") or "main"
    branch_protection = _safe_one(
        client, repo_path(owner, repo, f"branches/{default_branch}/protection")
    )
    rulesets = _safe_list(client, repo_path(owner, repo, "rulesets", per_page="100"))
    environments = _safe_list(client, repo_path(owner, repo, "environments", per_page="100"))
    deployments = _safe_list(client, repo_path(owner, repo, "deployments", per_page="10"))
    pages = _safe_one(client, repo_path(owner, repo, "pages"))

    if community_profile is None and community_fallback is None:
        try:
            community_fallback = fetch_community_standards_from_contents(client, owner, repo)
        except Exception:  # noqa: BLE001
            community_fallback = None

    community_for_standards = None
    if community_profile:
        try:
            community_for_standards = fetch_community_standards(client, owner, repo)
        except Exception:  # noqa: BLE001
            community_for_standards = community_fallback
    elif community_fallback:
        community_for_standards = community_fallback

    summary = summarize_governance(
        community_profile,
        community_fallback,
        branch_protection,
        rulesets,
        environments,
        deployments,
        pages,
    )
    return {
        **summary,
        "community_standards_raw": community_for_standards,
        "requests_used": client.requests_used,
        "rate_limit_remaining": client.rate_limit_remaining,
        "authenticated": True,
    }
