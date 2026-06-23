"""OpenSSF Scorecard collector — fetches security health scores from api.scorecard.dev."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

SCORECARD_API_ROOT = "https://api.scorecard.dev/projects/github.com"


def fetch_openssf_scorecard(owner: str, repo: str) -> dict[str, Any] | None:
    """Fetch OpenSSF Scorecard results for a GitHub repository.

    Returns dict with:
      - score: aggregate score (0-10)
      - checks: list of {name, score, reason, details}
      - repo_url, commit, commit_date, scorecard_version
    Returns None if the repo is not in the Scorecard database.
    """
    url = f"{SCORECARD_API_ROOT}/{owner}/{repo}"
    headers = {
        "Accept": "application/json",
        "User-Agent": "oss-impact-dashboard",
    }
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Scorecard API failed: {error.code} {url}\n{detail}") from error

    checks = []
    for check in payload.get("checks", []):
        checks.append({
            "name": check.get("name"),
            "score": check.get("score"),
            "reason": check.get("reason"),
            "details": check.get("details"),
        })

    return {
        "score": payload.get("score"),
        "checks": checks,
        "repo_url": (payload.get("repo") or {}).get("uri"),
        "commit": (payload.get("repo") or {}).get("commit"),
        "commit_date": payload.get("date"),
        "scorecard_version": (payload.get("scorecard") or {}).get("version"),
    }
