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
    for name in ("OSS_DASHBOARD_GITHUB_TOKEN", "MOLE_READ_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"):
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


def fetch_github(owner: str, repo: str, token: str | None = None) -> dict[str, Any]:
    client = GitHubClient(token=token or github_token())
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
    releases = client.paginate(repo_path(owner, repo, "releases", per_page="100"))
    contributors = client.paginate(
        repo_path(owner, repo, "contributors", per_page="100", anon="false")
    )
    return {
        "repository": repository,
        "labels": labels,
        "issues": issues,
        "pulls": pulls,
        "events": events,
        "releases": releases,
        "contributors": contributors,
        "requests_used": client.requests_used,
        "rate_limit_remaining": client.rate_limit_remaining,
        "authenticated": bool(client.token),
    }
