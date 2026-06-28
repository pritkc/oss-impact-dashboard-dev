from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

API_ROOT = "https://api.github.com"


def github_token() -> str | None:
    for name in ("GH_TOKEN", "GITHUB_TOKEN"):
        value = os.environ.get(name)
        if value:
            return value
    return None


def next_link(link_header: str) -> str | None:
    for part in link_header.split(","):
        section = part.strip()
        if 'rel="next"' not in section:
            continue
        start = section.find("<")
        end = section.find(">")
        if start != -1 and end != -1 and end > start:
            return section[start + 1 : end]
    return None


def repo_path(owner: str, repo: str, endpoint: str, **params: str) -> str:
    query = urllib.parse.urlencode(params)
    path = f"/repos/{owner}/{repo}"
    if endpoint:
        path = f"{path}/{endpoint}"
    return f"{path}?{query}" if query else path


@dataclass
class GitHubClient:
    token: str | None = None
    api_root: str = API_ROOT
    max_retries: int = 3
    request_budget: int = 500
    requests_used: int = 0
    rate_limit_remaining: str | None = None

    def get_json(self, url: str) -> tuple[Any, str]:
        if self.requests_used >= self.request_budget:
            raise RuntimeError(f"GitHub request budget exceeded: {self.request_budget}")

        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "oss-impact-dashboard",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        for attempt in range(self.max_retries):
            request = urllib.request.Request(url, headers=headers)
            self.requests_used += 1
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    self.rate_limit_remaining = response.headers.get("X-RateLimit-Remaining")
                    payload = json.loads(response.read().decode("utf-8"))
                    return payload, response.headers.get("Link", "")
            except urllib.error.HTTPError as error:
                retryable = error.code in {403, 429, 502, 503, 504}
                if retryable and attempt + 1 < self.max_retries:
                    time.sleep(2**attempt)
                    continue
                detail = error.read().decode("utf-8", errors="replace")
                message = f"GitHub API request failed: {error.code} {url}\n{detail}"
                raise RuntimeError(message) from error

        raise RuntimeError(f"GitHub API request failed after retries: {url}")

    def paginate(self, path: str) -> list[Any]:
        url = f"{self.api_root}{path}"
        items: list[Any] = []
        while url:
            payload, links = self.get_json(url)
            if not isinstance(payload, list):
                raise RuntimeError(f"Expected list response from {url}")
            items.extend(payload)
            url = next_link(links)
        return items

    def one(self, path: str) -> dict[str, Any]:
        payload, _ = self.get_json(f"{self.api_root}{path}")
        if not isinstance(payload, dict):
            raise RuntimeError(f"Expected object response from {path}")
        return payload

    def graphql(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        if self.requests_used >= self.request_budget:
            raise RuntimeError(f"GitHub request budget exceeded: {self.request_budget}")
        if not self.token:
            raise RuntimeError("GitHub GraphQL requires an authenticated token")

        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "User-Agent": "oss-impact-dashboard",
        }
        request = urllib.request.Request(
            "https://api.github.com/graphql",
            data=json.dumps({"query": query, "variables": variables}).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        self.requests_used += 1
        with urllib.request.urlopen(request, timeout=30) as response:
            self.rate_limit_remaining = response.headers.get("X-RateLimit-Remaining")
            payload = json.loads(response.read().decode("utf-8"))
        if payload.get("errors"):
            raise RuntimeError(f"GitHub GraphQL request failed: {payload['errors']}")
        return payload.get("data") or {}


def fetch_recent_pull_reviews(client: GitHubClient, owner: str, repo: str) -> list[dict[str, Any]]:
    query = """
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        pullRequests(first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
          nodes {
            number
            reviews(first: 20) {
              nodes {
                createdAt
                submittedAt
                state
                author { login }
              }
            }
          }
        }
      }
    }
    """
    data = client.graphql(query, {"owner": owner, "repo": repo})
    pulls = ((data.get("repository") or {}).get("pullRequests") or {}).get("nodes") or []
    reviews = []
    for pull in pulls:
        for review in ((pull.get("reviews") or {}).get("nodes") or []):
            reviews.append(
                {
                    "pull_number": pull.get("number"),
                    "submitted_at": review.get("submittedAt"),
                    "created_at": review.get("createdAt"),
                    "state": review.get("state"),
                    "user": {"login": (review.get("author") or {}).get("login")},
                }
            )
    return reviews


def fetch_community_standards(client: GitHubClient, owner: str, repo: str) -> dict[str, Any]:
    """Fetch community standards file presence via GitHub REST API.

    Uses the community profile endpoint which returns file metadata for
    README, CONTRIBUTING, CODE_OF_CONDUCT, LICENSE, SECURITY, issue and
    pull request templates.  Repository topics, description and homepage
    are fetched from the repository endpoint.
    """
    profile = client.one(repo_path(owner, repo, "community/profile"))
    files = profile.get("files") or {}

    repo_info = client.one(repo_path(owner, repo, ""))

    issue_template = files.get("issue_template")
    pr_template = files.get("pull_request_template")

    return {
        "contributing_guidelines": files.get("contributing"),
        "code_of_conduct": files.get("code_of_conduct"),
        "license_info": files.get("license"),
        "readme": files.get("readme"),
        "security_policy": files.get("security"),
        "issue_templates": [issue_template] if issue_template else [],
        "pull_request_templates": [pr_template] if pr_template else [],
        "topics": repo_info.get("topics") or [],
        "description": repo_info.get("description"),
        "homepage_url": repo_info.get("homepage"),
    }


def fetch_github(owner: str, repo: str, token: str | None = None) -> dict[str, Any]:
    client = GitHubClient(token=token)
    repository = client.one(repo_path(owner, repo, ""))
    labels = client.paginate(repo_path(owner, repo, "labels", per_page="100"))
    issue_path = repo_path(
        owner, repo, "issues", state="all", per_page="100", sort="created", direction="asc"
    )
    pull_path = repo_path(
        owner, repo, "pulls", state="all", per_page="100", sort="created", direction="asc"
    )
    issues = client.paginate(issue_path)
    pulls = client.paginate(pull_path)
    events = client.paginate(repo_path(owner, repo, "issues/events", per_page="100"))
    issue_comments = client.paginate(
        repo_path(owner, repo, "issues/comments", per_page="100", sort="created", direction="asc")
    )
    releases = client.paginate(repo_path(owner, repo, "releases", per_page="100"))
    contributors = client.paginate(
        repo_path(owner, repo, "contributors", per_page="100", anon="false")
    )
    pull_reviews = []
    review_collection_error = None
    if client.token:
        try:
            pull_reviews = fetch_recent_pull_reviews(client, owner, repo)
        except Exception as exc:  # noqa: BLE001 - review timing is optional engagement data.
            review_collection_error = str(exc)
    return {
        "repository": repository,
        "labels": labels,
        "issues": issues,
        "pulls": pulls,
        "events": events,
        "issue_comments": issue_comments,
        "pull_reviews": pull_reviews,
        "review_collection_error": review_collection_error,
        "releases": releases,
        "contributors": contributors,
        "requests_used": client.requests_used,
        "rate_limit_remaining": client.rate_limit_remaining,
        "authenticated": bool(client.token),
    }
