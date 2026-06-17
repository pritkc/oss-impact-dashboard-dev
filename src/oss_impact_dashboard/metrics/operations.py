from __future__ import annotations

from collections import Counter, defaultdict
from datetime import UTC, datetime
from typing import Any

from oss_impact_dashboard.schema import UNLABELED, days_between, parse_timestamp, percentile_stats


def label_name(label: Any) -> str | None:
    if isinstance(label, str):
        return label
    if isinstance(label, dict):
        return label.get("name")
    return None


def current_label_names(item: dict[str, Any]) -> list[str]:
    names = [label_name(label) for label in item.get("labels", [])]
    return sorted(name for name in names if name)


def label_catalog(labels: list[dict[str, Any]]) -> list[dict[str, str]]:
    catalog = []
    for label in labels:
        name = label.get("name")
        if name:
            catalog.append(
                {
                    "name": name,
                    "color": label.get("color") or "ededed",
                    "description": label.get("description") or "",
                }
            )
    return sorted(catalog, key=lambda item: item["name"].casefold())


def labels_at_time(
    timeline: list[dict[str, Any]],
    as_of: str | None,
    fallback_labels: list[str] | None = None,
) -> tuple[list[str], str]:
    as_of_dt = parse_timestamp(as_of)
    if not as_of_dt:
        return sorted(fallback_labels or []), "current"

    label_events = []
    for event in timeline:
        event_type = event.get("event")
        if event_type not in {"labeled", "unlabeled"}:
            continue
        name = label_name(event.get("label"))
        created_at = parse_timestamp(event.get("created_at"))
        if name and created_at:
            label_events.append((created_at, event_type, name))

    if not label_events:
        return sorted(fallback_labels or []), "current-fallback"

    labels: set[str] = set()
    for created_at, event_type, name in sorted(label_events, key=lambda item: item[0]):
        if created_at > as_of_dt:
            break
        if event_type == "labeled":
            labels.add(name)
        elif event_type == "unlabeled":
            labels.discard(name)
    return sorted(labels), "repository-events"


def item_type(issue: dict[str, Any]) -> str:
    return "pull_request" if "pull_request" in issue else "issue"


def normalize_item(
    issue: dict[str, Any],
    pull: dict[str, Any] | None,
    timeline: list[dict[str, Any]],
    repository_url: str,
) -> dict[str, Any]:
    current_labels = current_label_names(issue)
    closed_at = issue.get("closed_at")
    labels_at_close: list[str] = []
    labels_at_close_source = "not-closed"
    if closed_at:
        labels_at_close, labels_at_close_source = labels_at_time(
            timeline, closed_at, fallback_labels=current_labels
        )

    type_name = item_type(issue)
    merged_at = pull.get("merged_at") if pull else None
    reference_labels = labels_at_close if closed_at else current_labels
    created_at = issue.get("created_at")
    updated_at = issue.get("updated_at")

    return {
        "number": issue.get("number"),
        "type": type_name,
        "state": issue.get("state"),
        "title": issue.get("title") or "",
        "url": issue.get("html_url") or f"{repository_url}/issues/{issue.get('number')}",
        "created_at": created_at,
        "updated_at": updated_at,
        "closed_at": closed_at,
        "merged_at": merged_at,
        "author": (issue.get("user") or {}).get("login"),
        "labels_current": current_labels,
        "labels_at_close": labels_at_close,
        "labels_at_close_source": labels_at_close_source,
        "metric_labels": reference_labels or [UNLABELED],
        "days_to_close": days_between(created_at, closed_at),
        "days_to_merge": days_between(created_at, merged_at),
        "age_days": days_between(created_at, datetime.now(UTC).isoformat()),
    }


def _month(value: str | None) -> str | None:
    dt = parse_timestamp(value)
    return f"{dt.year:04d}-{dt.month:02d}" if dt else None


def _month_range(records: list[dict[str, Any]]) -> list[str]:
    months = sorted(
        {
            month
            for record in records
            for month in (_month(record.get("created_at")), _month(record.get("closed_at")))
            if month
        }
    )
    return months


def monthly_trends(records: list[dict[str, Any]]) -> dict[str, Any]:
    months = _month_range(records)
    opened_issues = Counter()
    closed_issues = Counter()
    opened_prs = Counter()
    merged_prs = Counter()
    for record in records:
        created = _month(record.get("created_at"))
        closed = _month(record.get("closed_at"))
        merged = _month(record.get("merged_at"))
        if record["type"] == "issue" and created:
            opened_issues[created] += 1
        if record["type"] == "issue" and closed:
            closed_issues[closed] += 1
        if record["type"] == "pull_request" and created:
            opened_prs[created] += 1
        if record["type"] == "pull_request" and merged:
            merged_prs[merged] += 1

    backlog = []
    running = 0
    for month in months:
        running += opened_issues[month] + opened_prs[month]
        running -= closed_issues[month] + merged_prs[month]
        backlog.append(max(running, 0))

    return {
        "months": months,
        "issues_opened": [opened_issues[m] for m in months],
        "issues_closed": [closed_issues[m] for m in months],
        "prs_opened": [opened_prs[m] for m in months],
        "prs_merged": [merged_prs[m] for m in months],
        "backlog": backlog,
    }


def build_operations(
    raw: dict[str, Any],
    repository_name: str,
    stale_days: int,
    generated_at: str,
) -> dict[str, Any]:
    repository_url = f"https://github.com/{repository_name}"
    pulls_by_number = {pull.get("number"): pull for pull in raw.get("pulls", [])}
    events_by_number: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for event in raw.get("events", []):
        number = ((event.get("issue") or {}).get("number")) or event.get("issue_number")
        if number is not None:
            events_by_number[int(number)].append(event)

    records = [
        normalize_item(
            issue,
            pulls_by_number.get(issue.get("number")),
            events_by_number.get(int(issue.get("number") or 0), []),
            repository_url,
        )
        for issue in raw.get("issues", [])
    ]

    open_records = [record for record in records if not record.get("closed_at")]
    open_issues = [r for r in open_records if r["type"] == "issue"]
    open_prs = [r for r in open_records if r["type"] == "pull_request"]
    closed_issues = [r for r in records if r["type"] == "issue" and r.get("closed_at")]
    merged_prs = [r for r in records if r["type"] == "pull_request" and r.get("merged_at")]
    untriaged = [r for r in open_records if r.get("metric_labels") == [UNLABELED]]
    stale = [r for r in open_records if (r.get("age_days") or 0) >= stale_days]
    issue_close_days = [
        r["days_to_close"] for r in closed_issues if r.get("days_to_close") is not None
    ]
    pr_merge_days = [r["days_to_merge"] for r in merged_prs if r.get("days_to_merge") is not None]

    label_info = {item["name"]: item for item in label_catalog(raw.get("labels", []))}
    label_names = sorted(
        set(label_info)
        | {label for record in records for label in record.get("metric_labels", [])},
        key=str.casefold,
    )
    label_metrics = []
    for name in label_names:
        scoped = [record for record in records if name in record.get("metric_labels", [])]
        label_metrics.append(
            {
                "label": name,
                "color": (label_info.get(name) or {}).get("color", "ededed"),
                "description": (label_info.get(name) or {}).get("description", ""),
                "total": len(scoped),
                "open": sum(1 for record in scoped if not record.get("closed_at")),
                "closed": sum(1 for record in scoped if record.get("closed_at")),
                "issues": sum(1 for record in scoped if record["type"] == "issue"),
                "pull_requests": sum(1 for record in scoped if record["type"] == "pull_request"),
            }
        )
    label_metrics.sort(key=lambda item: (-item["total"], item["label"].casefold()))

    queues = {
        "oldest_open_issues": sorted(
            open_issues, key=lambda item: item.get("created_at") or ""
        )[:10],
        "oldest_open_pull_requests": sorted(
            open_prs, key=lambda item: item.get("created_at") or ""
        )[:10],
        "untriaged": sorted(untriaged, key=lambda item: item.get("created_at") or "")[:10],
        "stale": sorted(stale, key=lambda item: item.get("created_at") or "")[:10],
    }
    trends = monthly_trends(records)
    backlog_delta = (
        trends["backlog"][-1] - trends["backlog"][0]
        if len(trends["backlog"]) >= 2
        else 0
    )

    return {
        "summary": {
            "total_items": len(records),
            "open_issues": len(open_issues),
            "open_pull_requests": len(open_prs),
            "untriaged_items": len(untriaged),
            "stale_items": len(stale),
            "median_issue_close_days": percentile_stats(issue_close_days)["median"],
            "median_pr_merge_days": percentile_stats(pr_merge_days)["median"],
            "net_backlog_change": backlog_delta,
        },
        "age_distribution": percentile_stats(
            [r["age_days"] for r in open_records if r.get("age_days")]
        ),
        "labels": list(label_info.values()),
        "label_metrics": label_metrics,
        "queues": queues,
        "items": sorted(records, key=lambda item: item.get("number") or 0, reverse=True),
        "trends": trends,
        "generated_at": generated_at,
    }
