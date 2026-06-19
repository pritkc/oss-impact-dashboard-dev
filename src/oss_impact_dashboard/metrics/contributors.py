from __future__ import annotations


def build_contributors(
    items: list[dict],
    github_contributors: list[dict],
    core_contributors: list[str] | None = None,
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
    core = {login.casefold() for login in (core_contributors or [])}
    external_authors = {
        author for author in issue_pr_authors if core and author.casefold() not in core
    }
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
    return {
        "unique_contributors": len(issue_pr_authors | commit_contributors),
        "issue_or_pr_authors": len(issue_pr_authors),
        "pr_authors": len(pr_authors),
        "merged_pr_authors": len(merged_pr_authors),
        "commit_contributors": len(commit_contributors),
        "external_contributor_share": (
            round(len(external_authors) / len(issue_pr_authors), 3)
            if core and issue_pr_authors
            else None
        ),
        "core_contributors_configured": bool(core),
        "contributor_trend": contributor_trend,
        "top_contributors": top,
        "limitations": (
            "Contributor counts use public GitHub issue, PR and contributor endpoints only."
        ),
    }
