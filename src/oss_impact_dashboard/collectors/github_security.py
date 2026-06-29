from __future__ import annotations

from collections import Counter
from typing import Any

from oss_impact_dashboard.collectors.github import GitHubClient, repo_path

SEVERITY_ORDER = ("critical", "high", "medium", "low", "unknown")


def _severity_rank(severity: str | None) -> int:
    value = (severity or "unknown").casefold()
    try:
        return SEVERITY_ORDER.index(value)
    except ValueError:
        return len(SEVERITY_ORDER)


def _highest_severity(counter: Counter[str]) -> str | None:
    if not counter:
        return None
    return min(counter.keys(), key=_severity_rank)


def _count_open_alerts(alerts: list[dict[str, Any]]) -> tuple[int, Counter[str], Counter[str]]:
    open_alerts = [alert for alert in alerts if str(alert.get("state") or "").casefold() == "open"]
    by_severity: Counter[str] = Counter()
    by_tool: Counter[str] = Counter()
    for alert in open_alerts:
        rule = alert.get("rule") or {}
        security = alert.get("security_advisory") or {}
        severity = (
            rule.get("severity")
            or security.get("severity")
            or alert.get("severity")
            or "unknown"
        )
        by_severity[str(severity).casefold()] += 1
        tool = (rule.get("tool") or {}).get("name") or alert.get("tool") or "unknown"
        by_tool[str(tool)] += 1
    return len(open_alerts), by_severity, by_tool


def _oldest_open_age_days(alerts: list[dict[str, Any]]) -> float | None:
    from oss_impact_dashboard.schema import days_between, now_iso

    ages = []
    for alert in alerts:
        if str(alert.get("state") or "").casefold() != "open":
            continue
        created = alert.get("created_at") or alert.get("updated_at")
        age = days_between(created, now_iso())
        if age is not None:
            ages.append(age)
    return round(max(ages), 2) if ages else None


def summarize_github_security(
    code_scanning: list[dict[str, Any]] | None,
    dependabot: list[dict[str, Any]] | None,
    secret_scanning: list[dict[str, Any]] | None,
    advisories: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    code_open, code_by_severity, code_by_tool = _count_open_alerts(code_scanning or [])
    dep_open, dep_by_severity, _ = _count_open_alerts(dependabot or [])

    secret_open = 0
    secret_resolved = 0
    for alert in secret_scanning or []:
        state = str(alert.get("state") or "").casefold()
        if state == "open":
            secret_open += 1
        elif state in {"resolved", "revoked"}:
            secret_resolved += 1

    published_advisories = 0
    open_or_draft_advisories = 0
    for advisory in advisories or []:
        state = str(advisory.get("state") or "").casefold()
        if state == "published":
            published_advisories += 1
        elif state in {"draft", "triage"}:
            open_or_draft_advisories += 1

    combined_severity = Counter(code_by_severity) + Counter(dep_by_severity)
    all_open_alerts = code_open + dep_open + secret_open
    ages = [
        _oldest_open_age_days(code_scanning or []),
        _oldest_open_age_days(dependabot or []),
    ]
    oldest_age = max((age for age in ages if age is not None), default=None)

    return {
        "available": any(
            payload is not None
            for payload in (code_scanning, dependabot, secret_scanning, advisories)
        ),
        "code_scanning": {
            "open_alerts": code_open,
            "open_by_severity": dict(code_by_severity),
            "open_by_tool": dict(code_by_tool),
        },
        "dependabot": {
            "open_alerts": dep_open,
            "open_by_severity": dict(dep_by_severity),
            "fixed_in_period": None,
        },
        "secret_scanning": {
            "open_alerts": secret_open,
            "resolved_alerts": secret_resolved,
        },
        "repository_advisories": {
            "published_count": published_advisories,
            "open_or_draft_count": open_or_draft_advisories,
        },
        "highest_open_severity": _highest_severity(combined_severity),
        "oldest_open_alert_age_days": oldest_age,
        "total_open_alerts": all_open_alerts,
    }


def _safe_paginate(client: GitHubClient, path: str) -> list[dict[str, Any]] | None:
    try:
        payload = client.paginate(path)
        return [item for item in payload if isinstance(item, dict)]
    except Exception:  # noqa: BLE001 - optional security endpoints may be disabled.
        return None


def fetch_github_security(owner: str, repo: str, token: str | None = None) -> dict[str, Any]:
    effective_token = token
    if not effective_token:
        raise RuntimeError(
            "Missing project GitHub token. Set the project-specific "
            "GH_PAT_<SUFFIX> variable."
        )

    client = GitHubClient(token=effective_token, request_budget=40)
    code_scanning = _safe_paginate(
        client,
        repo_path(owner, repo, "code-scanning/alerts", state="open", per_page="100"),
    )
    dependabot = _safe_paginate(
        client,
        repo_path(owner, repo, "dependabot/alerts", state="open", per_page="100"),
    )
    secret_scanning = _safe_paginate(
        client,
        repo_path(owner, repo, "secret-scanning/alerts", state="open", per_page="100"),
    )
    advisories = _safe_paginate(
        client,
        repo_path(owner, repo, "security-advisories", per_page="100"),
    )

    summary = summarize_github_security(code_scanning, dependabot, secret_scanning, advisories)
    return {
        **summary,
        "requests_used": client.requests_used,
        "rate_limit_remaining": client.rate_limit_remaining,
        "authenticated": True,
    }
