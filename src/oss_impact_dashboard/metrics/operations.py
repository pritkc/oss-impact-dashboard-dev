from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from oss_impact_dashboard.schema import UNLABELED, days_between, parse_timestamp, percentile_stats


@dataclass(frozen=True)
class Period:
    id: str
    label: str
    start: str | None
    end: str


def label_name(label: Any) -> str | None:
    if isinstance(label, str):
        return label
    if isinstance(label, dict):
        return label.get("name")
    return None


def canonical_label(name: str, aliases: dict[str, str] | None = None) -> str:
    if not aliases:
        return name
    return aliases.get(name.casefold(), name)


def canonical_labels(labels: list[str], aliases: dict[str, str] | None = None) -> list[str]:
    canonical = {canonical_label(label, aliases) for label in labels if label}
    return sorted(canonical, key=str.casefold)


def current_label_names(item: dict[str, Any], aliases: dict[str, str] | None = None) -> list[str]:
    names = [label_name(label) for label in item.get("labels", [])]
    return canonical_labels([name for name in names if name], aliases)


def original_label_names(item: dict[str, Any]) -> list[str]:
    names = [label_name(label) for label in item.get("labels", [])]
    return sorted(name for name in names if name)


def label_catalog(
    labels: list[dict[str, Any]], aliases: dict[str, str] | None = None
) -> list[dict[str, str]]:
    by_name: dict[str, dict[str, str]] = {}
    for label in labels:
        name = label.get("name")
        if not name:
            continue
        canonical = canonical_label(name, aliases)
        by_name.setdefault(
            canonical,
            {
                "name": canonical,
                "color": label.get("color") or "ededed",
                "description": label.get("description") or "",
            },
        )
    return sorted(by_name.values(), key=lambda item: item["name"].casefold())


def labels_at_time(
    timeline: list[dict[str, Any]],
    as_of: str | None,
    fallback_labels: list[str] | None = None,
    aliases: dict[str, str] | None = None,
) -> tuple[list[str], str]:
    as_of_dt = parse_timestamp(as_of)
    if not as_of_dt:
        return canonical_labels(fallback_labels or [], aliases), "current"

    label_events = []
    for event in timeline:
        event_type = event.get("event")
        if event_type not in {"labeled", "unlabeled"}:
            continue
        name = label_name(event.get("label"))
        created_at = parse_timestamp(event.get("created_at"))
        if name and created_at:
            label_events.append((created_at, event_type, canonical_label(name, aliases)))

    if not label_events:
        return canonical_labels(fallback_labels or [], aliases), "current-fallback"

    labels: set[str] = set()
    for created_at, event_type, name in sorted(label_events, key=lambda item: item[0]):
        if created_at > as_of_dt:
            break
        if event_type == "labeled":
            labels.add(name)
        elif event_type == "unlabeled":
            labels.discard(name)
    return sorted(labels, key=str.casefold), "repository-events"


def item_type(issue: dict[str, Any]) -> str:
    return "pull_request" if "pull_request" in issue else "issue"


def _event_months(timeline: list[dict[str, Any]], event_name: str) -> list[str]:
    months = []
    for event in timeline:
        if event.get("event") == event_name:
            month = month_key(event.get("created_at"))
            if month:
                months.append(month)
    return months


def normalize_item(
    issue: dict[str, Any],
    pull: dict[str, Any] | None,
    timeline: list[dict[str, Any]],
    repository_url: str,
    generated_at: str,
    aliases: dict[str, str] | None = None,
) -> dict[str, Any]:
    current_labels = current_label_names(issue, aliases)
    closed_at = issue.get("closed_at")
    labels_at_close: list[str] = []
    labels_at_close_source = "not-closed"
    if closed_at:
        labels_at_close, labels_at_close_source = labels_at_time(
            timeline, closed_at, fallback_labels=current_labels, aliases=aliases
        )

    type_name = item_type(issue)
    merged_at = pull.get("merged_at") if pull else None
    reference_labels = labels_at_close if closed_at else current_labels
    created_at = issue.get("created_at")
    updated_at = issue.get("updated_at")
    state = "merged" if type_name == "pull_request" and merged_at else issue.get("state")

    return {
        "number": issue.get("number"),
        "type": type_name,
        "state": state,
        "raw_state": issue.get("state"),
        "title": issue.get("title") or "",
        "url": issue.get("html_url") or f"{repository_url}/issues/{issue.get('number')}",
        "created_at": created_at,
        "updated_at": updated_at,
        "closed_at": closed_at,
        "merged_at": merged_at,
        "author": (issue.get("user") or {}).get("login"),
        "labels_original": original_label_names(issue),
        "labels_current": current_labels,
        "labels_at_close": labels_at_close,
        "labels_at_close_source": labels_at_close_source,
        "metric_labels": reference_labels or [UNLABELED],
        "days_to_close": days_between(created_at, closed_at),
        "days_to_merge": days_between(created_at, merged_at),
        "age_days": days_between(created_at, generated_at),
        "reopened_months": _event_months(timeline, "reopened"),
        "closed_event_months": _event_months(timeline, "closed"),
    }


def month_key(value: str | None) -> str | None:
    dt = parse_timestamp(value)
    return f"{dt.year:04d}-{dt.month:02d}" if dt else None


def add_months(year: int, month: int, count: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + count
    return index // 12, index % 12 + 1


def month_series(start: str, end: str) -> list[str]:
    start_dt = parse_timestamp(f"{start}-01T00:00:00Z")
    end_dt = parse_timestamp(f"{end}-01T00:00:00Z")
    if not start_dt or not end_dt or start_dt > end_dt:
        return []
    months = []
    year, month = start_dt.year, start_dt.month
    while f"{year:04d}-{month:02d}" <= end:
        months.append(f"{year:04d}-{month:02d}")
        year, month = add_months(year, month, 1)
    return months


def period_start(end_dt: datetime, months: int) -> str:
    year, month = add_months(end_dt.year, end_dt.month, -(months - 1))
    return f"{year:04d}-{month:02d}-01T00:00:00Z"


def build_periods(generated_at: str, default_months: int) -> dict[str, Any]:
    end_dt = parse_timestamp(generated_at)
    if not end_dt:
        raise ValueError("generated_at must be an ISO timestamp")
    end = generated_at
    available = [
        Period("3m", "3 months", period_start(end_dt, 3), end),
        Period("6m", "6 months", period_start(end_dt, 6), end),
        Period("12m", "12 months", period_start(end_dt, 12), end),
        Period("all", "All time", None, end),
    ]
    default_id = f"{default_months}m" if default_months in {3, 6, 12} else "12m"
    return {
        "default": default_id,
        "options": [period.__dict__ for period in available],
    }


def in_period(record: dict[str, Any], field: str, period: dict[str, Any]) -> bool:
    value = parse_timestamp(record.get(field))
    end = parse_timestamp(period["end"])
    start = parse_timestamp(period.get("start"))
    if not value or not end:
        return False
    if start and value < start:
        return False
    return value <= end


def previous_period(period: dict[str, Any]) -> dict[str, Any] | None:
    start = parse_timestamp(period.get("start"))
    end = parse_timestamp(period.get("end"))
    if not start or not end:
        return None
    months = (end.year - start.year) * 12 + (end.month - start.month) + 1
    prev_end_year, prev_end_month = add_months(start.year, start.month, -1)
    prev_start_year, prev_start_month = add_months(prev_end_year, prev_end_month, -(months - 1))
    return {
        "id": f"previous-{period['id']}",
        "label": f"Previous {period['label']}",
        "start": f"{prev_start_year:04d}-{prev_start_month:02d}-01T00:00:00Z",
        "end": f"{prev_end_year:04d}-{prev_end_month:02d}-28T23:59:59Z",
    }


def comparison(current: int | float | None, previous: int | float | None) -> dict[str, Any]:
    if current is None or previous is None:
        return {"current": current, "previous": previous, "delta": None, "percent": None}
    delta = round(current - previous, 2)
    percent = None if previous == 0 else round((delta / previous) * 100, 2)
    return {"current": current, "previous": previous, "delta": delta, "percent": percent}


def period_summary(records: list[dict[str, Any]], period: dict[str, Any]) -> dict[str, Any]:
    issues_opened = [
        r for r in records if r["type"] == "issue" and in_period(r, "created_at", period)
    ]
    issues_closed = [
        r for r in records if r["type"] == "issue" and in_period(r, "closed_at", period)
    ]
    prs_opened = [
        r for r in records if r["type"] == "pull_request" and in_period(r, "created_at", period)
    ]
    prs_closed = [
        r for r in records if r["type"] == "pull_request" and in_period(r, "closed_at", period)
    ]
    prs_merged = [
        r for r in records if r["type"] == "pull_request" and in_period(r, "merged_at", period)
    ]
    close_days = [r["days_to_close"] for r in issues_closed if r.get("days_to_close") is not None]
    merge_days = [r["days_to_merge"] for r in prs_merged if r.get("days_to_merge") is not None]
    return {
        "issues_opened": len(issues_opened),
        "issues_closed": len(issues_closed),
        "prs_opened": len(prs_opened),
        "prs_closed": len(prs_closed),
        "prs_merged": len(prs_merged),
        "net_backlog_change": (
            len(issues_opened) + len(prs_opened) - len(issues_closed) - len(prs_closed)
        ),
        "median_issue_close_days": percentile_stats(close_days)["median"],
        "median_pr_merge_days": percentile_stats(merge_days)["median"],
    }


def monthly_trends(records: list[dict[str, Any]], generated_at: str) -> dict[str, Any]:
    generated_month = month_key(generated_at)
    first_month = min(
        [
            month
            for record in records
            for month in (month_key(record.get("created_at")), month_key(record.get("closed_at")))
            if month
        ],
        default=generated_month,
    )
    months = month_series(first_month, generated_month or first_month)
    opened_issues = Counter()
    closed_issues = Counter()
    reopened_issues = Counter()
    opened_prs = Counter()
    closed_prs = Counter()
    merged_prs = Counter()
    closed_unmerged_prs = Counter()

    for record in records:
        created = month_key(record.get("created_at"))
        closed = month_key(record.get("closed_at"))
        merged = month_key(record.get("merged_at"))
        if record["type"] == "issue":
            if created:
                opened_issues[created] += 1
            if closed:
                closed_issues[closed] += 1
            for reopened_month in record.get("reopened_months", []):
                reopened_issues[reopened_month] += 1
        if record["type"] == "pull_request":
            if created:
                opened_prs[created] += 1
            if closed:
                closed_prs[closed] += 1
                if not record.get("merged_at"):
                    closed_unmerged_prs[closed] += 1
            if merged:
                merged_prs[merged] += 1

    current_open = sum(1 for record in records if not record.get("closed_at"))
    running = 0
    backlog = []
    for month in months:
        running += opened_issues[month] + opened_prs[month] + reopened_issues[month]
        running -= closed_issues[month] + closed_prs[month]
        backlog.append(max(running, 0))

    if backlog and backlog[-1] != current_open:
        # Public REST data may not include every historic close/reopen event. Keep the latest
        # point exact so the trend reconciles to today's open issue + PR count.
        backlog[-1] = current_open

    return {
        "months": months,
        "issues_opened": [opened_issues[m] for m in months],
        "issues_closed": [closed_issues[m] for m in months],
        "issues_reopened": [reopened_issues[m] for m in months],
        "prs_opened": [opened_prs[m] for m in months],
        "prs_closed": [closed_prs[m] for m in months],
        "prs_merged": [merged_prs[m] for m in months],
        "prs_closed_unmerged": [closed_unmerged_prs[m] for m in months],
        "completed": [closed_issues[m] + closed_prs[m] for m in months],
        "backlog": backlog,
        "current_backlog": current_open,
    }


def age_buckets(open_records: list[dict[str, Any]]) -> dict[str, int]:
    buckets = {"under_30": 0, "days_30_90": 0, "days_91_180": 0, "over_180": 0}
    for record in open_records:
        age = record.get("age_days") or 0
        if age < 30:
            buckets["under_30"] += 1
        elif age <= 90:
            buckets["days_30_90"] += 1
        elif age <= 180:
            buckets["days_91_180"] += 1
        else:
            buckets["over_180"] += 1
    return buckets


def _github_number_from_url(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return int(value.rstrip("/").split("/")[-1])
    except ValueError:
        return None


def _actor_login(payload: dict[str, Any]) -> str | None:
    actor = payload.get("user") or payload.get("author") or {}
    if isinstance(actor, dict):
        return actor.get("login")
    return None


def add_engagement_metrics(records: list[dict[str, Any]], raw: dict[str, Any]) -> dict[str, Any]:
    by_number = {record.get("number"): record for record in records}
    comments_by_number: dict[int, list[dict[str, Any]]] = defaultdict(list)
    raw_comments = raw.get("issue_comments", []) or raw.get("comments", [])
    raw_reviews = raw.get("pull_reviews", []) or raw.get("reviews", [])
    comments_available = "issue_comments" in raw or "comments" in raw
    reviews_available = "pull_reviews" in raw or "reviews" in raw
    for comment in raw_comments:
        number = comment.get("issue_number") or _github_number_from_url(comment.get("issue_url"))
        if number is not None:
            comments_by_number[int(number)].append(comment)

    reviews_by_number: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for review in raw_reviews:
        number = review.get("number") or review.get("pull_number")
        if number is None:
            number = _github_number_from_url(review.get("pull_request_url"))
        if number is not None:
            reviews_by_number[int(number)].append(review)

    response_days = []
    review_days = []
    for number, record in by_number.items():
        first_response = None
        for comment in sorted(
            comments_by_number.get(int(number or 0), []),
            key=lambda item: item.get("created_at") or "",
        ):
            if _actor_login(comment) == record.get("author"):
                continue
            first_response = comment.get("created_at")
            break
        record["first_response_at"] = first_response
        record["first_response_days"] = days_between(record.get("created_at"), first_response)
        if record["first_response_days"] is not None:
            response_days.append(record["first_response_days"])

        first_review = None
        if record.get("type") == "pull_request":
            for review in sorted(
                reviews_by_number.get(int(number or 0), []),
                key=lambda item: item.get("submitted_at") or item.get("created_at") or "",
            ):
                if _actor_login(review) == record.get("author"):
                    continue
                first_review = review.get("submitted_at") or review.get("created_at")
                break
        record["first_review_at"] = first_review
        record["first_review_days"] = days_between(record.get("created_at"), first_review)
        if record["first_review_days"] is not None:
            review_days.append(record["first_review_days"])

    awaiting_review = [
        record
        for record in records
        if record.get("type") == "pull_request"
        and not record.get("closed_at")
        and not record.get("first_review_at")
    ]
    issues_without_external_response = [
        record
        for record in records
        if record.get("type") == "issue"
        and not record.get("closed_at")
        and not record.get("first_response_at")
    ]
    source_available = comments_available or reviews_available
    return {
        "available": source_available,
        "comments_available": comments_available,
        "reviews_available": reviews_available,
        "comment_count": sum(len(items) for items in comments_by_number.values()),
        "review_count": sum(len(items) for items in reviews_by_number.values()),
        "median_first_response_days": percentile_stats(response_days)["median"],
        "p75_first_response_days": percentile_stats(response_days)["p75"],
        "p90_first_response_days": percentile_stats(response_days)["p90"],
        "median_first_review_days": percentile_stats(review_days)["median"],
        "p75_first_review_days": percentile_stats(review_days)["p75"],
        "p90_first_review_days": percentile_stats(review_days)["p90"],
        "awaiting_review_count": len(awaiting_review) if reviews_available else None,
        "issues_without_external_response_count": (
            len(issues_without_external_response) if comments_available else None
        ),
        "awaiting_review": sorted(
            awaiting_review, key=lambda item: item.get("created_at") or ""
        )[:10]
        if reviews_available
        else [],
        "issues_without_external_response": sorted(
            issues_without_external_response, key=lambda item: item.get("created_at") or ""
        )[:10]
        if comments_available
        else [],
        "limitations": (
            "First-response and review metrics require collected issue comments and PR reviews. "
            "When review data is absent, review timing is reported as unavailable."
        ),
    }


def build_operations(
    raw: dict[str, Any],
    repository_name: str,
    stale_days: int,
    generated_at: str,
    *,
    default_period_months: int = 12,
    label_aliases: dict[str, str] | None = None,
    priority_label_patterns: list[str] | None = None,
) -> dict[str, Any]:
    aliases = {key.casefold(): value for key, value in (label_aliases or {}).items()}
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
            generated_at,
            aliases,
        )
        for issue in raw.get("issues", [])
    ]
    engagement = add_engagement_metrics(records, raw)

    open_records = [record for record in records if not record.get("closed_at")]
    open_issues = [r for r in open_records if r["type"] == "issue"]
    open_prs = [r for r in open_records if r["type"] == "pull_request"]
    closed_issues = [r for r in records if r["type"] == "issue" and r.get("closed_at")]
    merged_prs = [r for r in records if r["type"] == "pull_request" and r.get("merged_at")]
    untriaged = [r for r in open_records if r.get("metric_labels") == [UNLABELED]]
    open_over_threshold = [r for r in open_records if (r.get("age_days") or 0) >= stale_days]
    issue_close_days = [
        r["days_to_close"] for r in closed_issues if r.get("days_to_close") is not None
    ]
    pr_merge_days = [r["days_to_merge"] for r in merged_prs if r.get("days_to_merge") is not None]

    label_info = {item["name"]: item for item in label_catalog(raw.get("labels", []), aliases)}
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

    priority_patterns = [pattern.casefold() for pattern in (priority_label_patterns or [])]
    high_priority = [
        record
        for record in open_records
        if any(
            pattern in label.casefold()
            for pattern in priority_patterns
            for label in record.get("metric_labels", [])
        )
    ]
    recently_reopened = [
        record
        for record in records
        if record.get("reopened_months") and not record.get("closed_at")
    ]
    queues = {
        "oldest_open_issues": sorted(
            open_issues, key=lambda item: item.get("created_at") or ""
        )[:10],
        "oldest_open_pull_requests": sorted(
            open_prs, key=lambda item: item.get("created_at") or ""
        )[:10],
        "untriaged": sorted(untriaged, key=lambda item: item.get("created_at") or "")[:10],
        "open_over_threshold": sorted(
            open_over_threshold, key=lambda item: item.get("created_at") or ""
        )[:10],
        "recently_reopened": sorted(
            recently_reopened, key=lambda item: item.get("updated_at") or "", reverse=True
        )[:10],
        "high_priority": sorted(high_priority, key=lambda item: item.get("created_at") or "")[:10],
        "awaiting_review": engagement["awaiting_review"],
        "issues_without_external_response": engagement["issues_without_external_response"],
    }
    trends = monthly_trends(records, generated_at)
    periods = build_periods(generated_at, default_period_months)
    summaries = {period["id"]: period_summary(records, period) for period in periods["options"]}
    comparisons = {}
    for period in periods["options"]:
        previous = previous_period(period)
        if not previous:
            continue
        prev_summary = period_summary(records, previous)
        comparisons[period["id"]] = {
            key: comparison(value, prev_summary.get(key))
            for key, value in summaries[period["id"]].items()
            if isinstance(value, int | float) or value is None
        }

    default_period_summary = summaries[periods["default"]]

    return {
        "summary": {
            "total_items": len(records),
            "open_issues": len(open_issues),
            "open_pull_requests": len(open_prs),
            "current_backlog": len(open_issues) + len(open_prs),
            "untriaged_items": len(untriaged),
            "open_over_threshold_items": len(open_over_threshold),
            "stale_items": len(open_over_threshold),
            "median_issue_close_days": default_period_summary["median_issue_close_days"],
            "median_pr_merge_days": default_period_summary["median_pr_merge_days"],
            "all_time_median_issue_close_days": percentile_stats(issue_close_days)["median"],
            "all_time_median_pr_merge_days": percentile_stats(pr_merge_days)["median"],
            "net_backlog_change": default_period_summary["net_backlog_change"],
            "median_first_response_days": engagement["median_first_response_days"],
            "median_first_review_days": engagement["median_first_review_days"],
            "p90_first_response_days": engagement["p90_first_response_days"],
            "p90_first_review_days": engagement["p90_first_review_days"],
            "awaiting_review_count": engagement["awaiting_review_count"],
            "issues_without_external_response_count": (
                engagement["issues_without_external_response_count"]
            ),
        },
        "age_distribution": percentile_stats(
            [r["age_days"] for r in open_records if r.get("age_days")]
        ),
        "age_buckets": age_buckets(open_records),
        "labels": list(label_info.values()),
        "label_metrics": label_metrics,
        "queues": queues,
        "items": sorted(records, key=lambda item: item.get("number") or 0, reverse=True),
        "trends": trends,
        "periods": periods,
        "period_summaries": summaries,
        "period_comparisons": comparisons,
        "engagement": engagement,
        "generated_at": generated_at,
        "definitions": {
            "open_over_threshold_items": (
                "Open issues and pull requests older than the configured "
                f"{stale_days}-day threshold."
            ),
            "github_stale_label": (
                "The GitHub stale label is preserved separately in label filters and label metrics."
            ),
        },
    }
