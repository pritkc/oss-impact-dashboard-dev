from __future__ import annotations

from collections import Counter
from itertools import combinations
from typing import Any

from oss_impact_dashboard.metrics.operations import in_period, month_key, month_series
from oss_impact_dashboard.schema import UNLABELED, percentile_stats

MIN_MEDIAN_SAMPLE = 3


def normalize_label_aliases(raw: dict[str, str] | None) -> dict[str, str]:
    if not raw:
        return {}
    return {str(key).casefold(): str(value) for key, value in raw.items()}


def normalize_label_groups(raw: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    for entry in raw or []:
        group_id = entry.get("id")
        name = entry.get("name")
        labels = entry.get("labels") or []
        if not group_id or not name or not labels:
            continue
        groups.append(
            {
                "id": str(group_id),
                "name": str(name),
                "labels": [str(label) for label in labels],
                "exclude_from_totals": bool(entry.get("exclude_from_totals")),
            }
        )
    return groups


def _median_if_enough(values: list[float | int], minimum: int = MIN_MEDIAN_SAMPLE) -> float | None:
    if len(values) < minimum:
        return None
    return percentile_stats(values)["median"]


def _p90_if_enough(values: list[float | int], minimum: int = MIN_MEDIAN_SAMPLE) -> float | None:
    if len(values) < minimum:
        return None
    return percentile_stats(values)["p90"]


def records_with_label(records: list[dict[str, Any]], label: str) -> list[dict[str, Any]]:
    return [record for record in records if label in record.get("metric_labels", [])]


def records_for_group(
    records: list[dict[str, Any]], group_labels: list[str]
) -> list[dict[str, Any]]:
    label_set = set(group_labels)
    by_number: dict[Any, dict[str, Any]] = {}
    for record in records:
        if any(label in label_set for label in record.get("metric_labels", [])):
            by_number[record.get("number")] = record
    return list(by_number.values())


def build_label_metric_row(
    records: list[dict[str, Any]],
    name: str,
    label_info: dict[str, dict[str, str]],
    *,
    period: dict[str, Any] | None = None,
) -> dict[str, Any]:
    scoped = records_with_label(records, name)
    scoped_open = [record for record in scoped if not record.get("closed_at")]
    scoped_open_ages = [record.get("age_days") or 0 for record in scoped_open]

    row: dict[str, Any] = {
        "label": name,
        "color": (label_info.get(name) or {}).get("color", "ededed"),
        "description": (label_info.get(name) or {}).get("description", ""),
        "open": len(scoped_open),
        "issues": sum(1 for record in scoped if record["type"] == "issue"),
        "pull_requests": sum(1 for record in scoped if record["type"] == "pull_request"),
        "median_age_days": percentile_stats(scoped_open_ages)["median"],
        "max_age_days": max(scoped_open_ages) if scoped_open_ages else None,
    }

    if period is None:
        closed = [record for record in scoped if record.get("closed_at")]
        merged_prs = [
            record
            for record in scoped
            if record["type"] == "pull_request" and record.get("merged_at")
        ]
        issue_close_days = [
            record["days_to_close"]
            for record in closed
            if record["type"] == "issue" and record.get("days_to_close") is not None
        ]
        pr_merge_days = [
            record["days_to_merge"]
            for record in merged_prs
            if record.get("days_to_merge") is not None
        ]
        completion_days = issue_close_days + pr_merge_days
        response_days = [
            record["first_response_days"]
            for record in scoped
            if record.get("first_response_days") is not None
        ]
        review_days = [
            record["first_review_days"]
            for record in scoped
            if record.get("first_review_days") is not None
        ]
        row.update(
            {
                "total": len(scoped),
                "closed": len(closed),
                "completed": len(closed),
                "median_close_days": _median_if_enough(completion_days),
                "median_merge_days": _median_if_enough(pr_merge_days),
                "p90_close_days": _p90_if_enough(completion_days),
                "median_first_response_days": _median_if_enough(response_days),
                "median_first_review_days": _median_if_enough(review_days),
                "completion_rate": (
                    round(len(closed) / len(scoped), 3) if scoped else None
                ),
            }
        )
        return row

    opened = [record for record in scoped if in_period(record, "created_at", period)]
    closed_in_period = [record for record in scoped if in_period(record, "closed_at", period)]
    merged_in_period = [
        record
        for record in scoped
        if record["type"] == "pull_request" and in_period(record, "merged_at", period)
    ]
    issue_closed = [record for record in closed_in_period if record["type"] == "issue"]
    pr_closed = [record for record in closed_in_period if record["type"] == "pull_request"]
    issue_close_days = [
        record["days_to_close"]
        for record in issue_closed
        if record.get("days_to_close") is not None
    ]
    pr_merge_days = [
        record["days_to_merge"]
        for record in merged_in_period
        if record.get("days_to_merge") is not None
    ]
    completion_days = issue_close_days + pr_merge_days

    row.update(
        {
            "opened": len(opened),
            "closed": len(closed_in_period),
            "issues_closed": len(issue_closed),
            "prs_closed": len(pr_closed),
            "merged": len(merged_in_period),
            "net_change": len(opened) - len(closed_in_period),
            "median_close_days": _median_if_enough(completion_days),
            "median_merge_days": _median_if_enough(pr_merge_days),
            "p90_close_days": _p90_if_enough(completion_days),
        }
    )
    return row


def build_label_metrics(
    records: list[dict[str, Any]],
    label_names: list[str],
    label_info: dict[str, dict[str, str]],
    *,
    period: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    metrics = [
        build_label_metric_row(records, name, label_info, period=period) for name in label_names
    ]
    if period is None:
        metrics.sort(key=lambda item: (-(item.get("total") or 0), item["label"].casefold()))
    else:
        metrics.sort(
            key=lambda item: (
                -((item.get("opened") or 0) + (item.get("closed") or 0)),
                item["label"].casefold(),
            )
        )
    return metrics


def build_label_group_metric_row(
    records: list[dict[str, Any]],
    group: dict[str, Any],
    *,
    period: dict[str, Any] | None = None,
    first_pr_by_author: dict[str, str] | None = None,
) -> dict[str, Any]:
    scoped = records_for_group(records, group["labels"])
    scoped_open = [record for record in scoped if not record.get("closed_at")]
    scoped_open_ages = [record.get("age_days") or 0 for record in scoped_open]

    row: dict[str, Any] = {
        "group_id": group["id"],
        "name": group["name"],
        "labels": group["labels"],
        "exclude_from_totals": group.get("exclude_from_totals", False),
        "open": len(scoped_open),
        "median_age_days": percentile_stats(scoped_open_ages)["median"],
    }

    if period is None:
        closed = [record for record in scoped if record.get("closed_at")]
        completion_days = [
            record["days_to_close"]
            for record in closed
            if record["type"] == "issue" and record.get("days_to_close") is not None
        ] + [
            record["days_to_merge"]
            for record in scoped
            if record["type"] == "pull_request"
            and record.get("days_to_merge") is not None
        ]
        row.update(
            {
                "total": len(scoped),
                "closed": len(closed),
                "median_close_days": _median_if_enough(completion_days),
            }
        )
        return row

    opened = [record for record in scoped if in_period(record, "created_at", period)]
    closed_in_period = [record for record in scoped if in_period(record, "closed_at", period)]
    merged_in_period = [
        record
        for record in scoped
        if record["type"] == "pull_request" and in_period(record, "merged_at", period)
    ]
    completion_days = [
        record["days_to_close"]
        for record in closed_in_period
        if record["type"] == "issue" and record.get("days_to_close") is not None
    ] + [
        record["days_to_merge"]
        for record in merged_in_period
        if record.get("days_to_merge") is not None
    ]
    newcomer_prs = []
    if first_pr_by_author:
        period_start = period.get("start")
        for record in scoped:
            if record["type"] != "pull_request":
                continue
            author = record.get("author")
            if not author:
                continue
            first_seen = first_pr_by_author.get(author)
            if first_seen and (not period_start or first_seen >= period_start):
                newcomer_prs.append(record)
    row.update(
        {
            "opened": len(opened),
            "closed": len(closed_in_period),
            "merged": len(merged_in_period),
            "throughput": len(closed_in_period),
            "net_change": len(opened) - len(closed_in_period),
            "median_close_days": _median_if_enough(completion_days),
            "newcomer_pr_share": (
                round(
                    len(newcomer_prs)
                    / len([record for record in scoped if record["type"] == "pull_request"]),
                    3,
                )
                if any(record["type"] == "pull_request" for record in scoped)
                else None
            ),
        }
    )
    return row


def build_label_group_metrics(
    records: list[dict[str, Any]],
    groups: list[dict[str, Any]],
    *,
    period: dict[str, Any] | None = None,
    first_pr_by_author: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    metrics = [
        build_label_group_metric_row(
            records,
            group,
            period=period,
            first_pr_by_author=first_pr_by_author,
        )
        for group in groups
    ]
    metrics.sort(key=lambda item: (-(item.get("open") or 0), item["name"].casefold()))
    return metrics


def build_label_trends(
    records: list[dict[str, Any]],
    generated_at: str,
    label_names: list[str],
    *,
    top_n: int = 8,
) -> dict[str, Any]:
    totals = Counter()
    for record in records:
        for label in record.get("metric_labels", []):
            if label != UNLABELED:
                totals[label] += 1
    tracked = [name for name, _ in totals.most_common(top_n)]
    if not tracked:
        return {"months": [], "by_label": {}, "by_group": {}}

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
    by_label: dict[str, dict[str, list[int]]] = {
        label: {"opened": [], "closed": []} for label in tracked
    }
    for label in tracked:
        opened = Counter()
        closed = Counter()
        scoped = records_with_label(records, label)
        for record in scoped:
            created = month_key(record.get("created_at"))
            done = month_key(record.get("closed_at"))
            if created:
                opened[created] += 1
            if done:
                closed[done] += 1
        by_label[label]["opened"] = [opened[month] for month in months]
        by_label[label]["closed"] = [closed[month] for month in months]

    return {"months": months, "labels": tracked, "by_label": by_label}


def build_stale_burden(
    records: list[dict[str, Any]],
    domain_labels: list[str],
    *,
    stale_label: str = "stale",
) -> list[dict[str, Any]]:
    open_records = [record for record in records if not record.get("closed_at")]
    stale_open = [
        record
        for record in open_records
        if stale_label in record.get("metric_labels", [])
    ]
    rows: list[dict[str, Any]] = []
    for domain in domain_labels:
        if domain.casefold() == stale_label.casefold():
            continue
        matched = [
            record
            for record in stale_open
            if domain in record.get("metric_labels", [])
        ]
        if not matched:
            continue
        ages = [record.get("age_days") or 0 for record in matched]
        rows.append(
            {
                "domain_label": domain,
                "open_stale": len(matched),
                "median_age_days": percentile_stats(ages)["median"],
                "max_age_days": max(ages) if ages else None,
            }
        )
    rows.sort(key=lambda item: (-item["open_stale"], item["domain_label"].casefold()))
    return rows


def build_label_cooccurrence(
    records: list[dict[str, Any]],
    *,
    top_n: int = 10,
) -> list[dict[str, Any]]:
    counts: Counter[tuple[str, str]] = Counter()
    for record in records:
        labels = [
            label for label in record.get("metric_labels", []) if label and label != UNLABELED
        ]
        for left, right in combinations(sorted(set(labels), key=str.casefold), 2):
            counts[(left, right)] += 1
    return [
        {"labels": [left, right], "count": count}
        for (left, right), count in counts.most_common(top_n)
    ]


def label_period_comparisons(
    current_metrics: list[dict[str, Any]],
    previous_metrics: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    previous_by_label = {item["label"]: item for item in previous_metrics}
    comparisons: dict[str, dict[str, Any]] = {}
    for item in current_metrics:
        label = item["label"]
        previous = previous_by_label.get(label, {})
        comparisons[label] = {
            "opened": _comparison_value(item.get("opened"), previous.get("opened")),
            "closed": _comparison_value(item.get("closed"), previous.get("closed")),
            "merged": _comparison_value(item.get("merged"), previous.get("merged")),
        }
    return comparisons


def group_period_comparisons(
    current_metrics: list[dict[str, Any]],
    previous_metrics: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    previous_by_id = {item["group_id"]: item for item in previous_metrics}
    comparisons: dict[str, dict[str, Any]] = {}
    for item in current_metrics:
        group_id = item["group_id"]
        previous = previous_by_id.get(group_id, {})
        comparisons[group_id] = {
            "opened": _comparison_value(item.get("opened"), previous.get("opened")),
            "closed": _comparison_value(item.get("closed"), previous.get("closed")),
            "open": _comparison_value(item.get("open"), previous.get("open")),
        }
    return comparisons


def _comparison_value(current: Any, previous: Any) -> dict[str, Any]:
    if current is None or previous is None:
        return {"current": current, "previous": previous, "delta": None, "percent": None}
    if not isinstance(current, int | float) or not isinstance(previous, int | float):
        return {"current": current, "previous": previous, "delta": None, "percent": None}
    delta = round(current - previous, 2)
    percent = None if previous == 0 else round((delta / previous) * 100, 2)
    return {"current": current, "previous": previous, "delta": delta, "percent": percent}


def hottest_backlog_group(group_metrics: list[dict[str, Any]]) -> dict[str, Any] | None:
    active = [item for item in group_metrics if not item.get("exclude_from_totals")]
    if not active:
        return None
    return max(
        active,
        key=lambda item: (
            item.get("open") or 0,
            item.get("median_age_days") or 0,
        ),
    )
