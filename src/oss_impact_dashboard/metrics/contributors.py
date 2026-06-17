from __future__ import annotations


def build_contributors(items: list[dict], github_contributors: list[dict]) -> dict:
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
    top = sorted(
        [
            {
                "login": item.get("login"),
                "contributions": item.get("contributions", 0),
                "url": item.get("html_url"),
            }
            for item in github_contributors
            if item.get("login")
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
        "top_contributors": top,
        "limitations": (
            "Contributor counts use public GitHub issue, PR and contributor endpoints only."
        ),
    }
