from __future__ import annotations


def _in_period(value: str | None, period: dict) -> bool:
    if not value:
        return False
    start = period.get("start")
    end = period.get("end")
    if start and value < start:
        return False
    return not end or value <= end


def _previous_period(period: dict) -> dict | None:
    start = period.get("start")
    end = period.get("end")
    if not start or not end:
        return None
    start_year, start_month = int(start[:4]), int(start[5:7])
    end_year, end_month = int(end[:4]), int(end[5:7])
    months = (end_year - start_year) * 12 + (end_month - start_month) + 1
    prev_end_index = start_year * 12 + start_month - 2
    prev_start_index = prev_end_index - months + 1
    return {
        "start": f"{prev_start_index // 12:04d}-{prev_start_index % 12 + 1:02d}-01T00:00:00Z",
        "end": f"{prev_end_index // 12:04d}-{prev_end_index % 12 + 1:02d}-28T23:59:59Z",
    }


def _comparison(current: int | float | None, previous: int | float | None) -> dict:
    if current is None or previous is None:
        return {"current": current, "previous": previous, "delta": None, "percent": None}
    delta = round(current - previous, 2)
    return {
        "current": current,
        "previous": previous,
        "delta": delta,
        "percent": None if previous == 0 else round((delta / previous) * 100, 2),
    }


def _period_author_summary(items: list[dict], period: dict) -> dict:
    historic_first_seen: dict[str, str] = {}
    for item in sorted(items, key=lambda item: item.get("created_at") or ""):
        author = item.get("author")
        if author and author not in historic_first_seen:
            historic_first_seen[author] = item.get("created_at") or ""

    scoped = [
        item for item in items if item.get("author") and _in_period(item.get("created_at"), period)
    ]
    authors = {item["author"] for item in scoped}
    new_authors = {
        author for author in authors if _in_period(historic_first_seen.get(author), period)
    }
    repeat_authors = authors - new_authors
    first_time_pr_authors = {
        item["author"]
        for item in scoped
        if item.get("type") == "pull_request"
        and item.get("author")
        and _in_period(historic_first_seen.get(item["author"]), period)
    }
    first_time_merged_pr_authors = {
        item["author"]
        for item in scoped
        if item.get("type") == "pull_request"
        and item.get("merged_at")
        and item.get("author")
        and _in_period(historic_first_seen.get(item["author"]), period)
    }
    return {
        "contributors": len(authors),
        "new_contributors": len(new_authors),
        "repeat_contributors": len(repeat_authors),
        "first_time_pr_authors": len(first_time_pr_authors),
        "first_time_merged_pr_authors": len(first_time_merged_pr_authors),
    }


def _concentration(top: list[dict]) -> dict:
    total = sum(int(item.get("contributions") or 0) for item in top)
    result = {}
    for count in (1, 3, 5):
        numerator = sum(int(item.get("contributions") or 0) for item in top[:count])
        result[f"top_{count}_share"] = round(numerator / total, 3) if total else None
    return result


def _bus_factor(top_contributors: list[dict]) -> int | None:
    """Minimum number of contributors accounting for >50% of total contributions."""
    if not top_contributors:
        return None
    total = sum(int(item.get("contributions") or 0) for item in top_contributors)
    if total == 0:
        return None
    cumulative = 0
    for i, item in enumerate(top_contributors, 1):
        cumulative += int(item.get("contributions") or 0)
        if cumulative / total > 0.5:
            return i
    return len(top_contributors)


def build_contributors(
    items: list[dict],
    github_contributors: list[dict],
    period_options: list[dict] | None = None,
) -> dict:
    issue_pr_authors = {item.get("author") for item in items if item.get("author")}
    pr_authors = {
        item.get("author")
        for item in items
        if item.get("type") == "pull_request" and item.get("author")
    }
    merged_pr_authors = {
        item.get("author")
        for item in items
        if item.get("type") == "pull_request" and item.get("merged_at") and item.get("author")
    }
    commit_contributors = set()
    for item in github_contributors:
        if item.get("login") and item.get("type") != "Bot":
            commit_contributors.add(item.get("login"))
    monthly_authors = {}
    for item in items:
        month = (item.get("created_at") or "")[:7]
        author = item.get("author")
        if month and author:
            monthly_authors.setdefault(month, set()).add(author)
    contributor_trend = [
        {"month": month, "contributors": len(authors)}
        for month, authors in sorted(monthly_authors.items())
    ]
    top = sorted(
        [
            {
                "login": item.get("login"),
                "contributions": item.get("contributions", 0),
                "url": item.get("html_url"),
            }
            for item in github_contributors
            if item.get("login") and item.get("type") != "Bot"
        ],
        key=lambda item: item["contributions"],
        reverse=True,
    )[:10]
    period_summaries = {}
    period_comparisons = {}
    for period in period_options or []:
        summary = _period_author_summary(items, period)
        period_summaries[period["id"]] = summary
        previous = _previous_period(period)
        if previous:
            previous_summary = _period_author_summary(items, previous)
            period_comparisons[period["id"]] = {
                key: _comparison(value, previous_summary.get(key))
                for key, value in summary.items()
            }
    return {
        "unique_contributors": len(issue_pr_authors | commit_contributors),
        "issue_or_pr_authors": len(issue_pr_authors),
        "pr_authors": len(pr_authors),
        "merged_pr_authors": len(merged_pr_authors),
        "commit_contributors": len(commit_contributors),
        "contribution_concentration": _concentration(top),
        "bus_factor": _bus_factor(top),
        "bus_factor_note": (
            "Minimum number of contributors accounting for >50% of total contributions. "
            "A lower number indicates higher key-person risk."
        ),
        "contributor_trend": contributor_trend,
        "top_contributors": top,
        "period_summaries": period_summaries,
        "period_comparisons": period_comparisons,
        "limitations": (
            "Contributor counts use public GitHub issue, PR and contributor endpoints only."
        ),
    }
