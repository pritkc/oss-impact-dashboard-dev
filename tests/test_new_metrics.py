"""Tests for newcomer funnel, change request closure ratio, and defect resolution duration."""
from oss_impact_dashboard.metrics.operations import build_operations


def _make_raw(items, pulls=None, labels=None):
    return {
        "issues": items,
        "pulls": pulls or [],
        "events": [],
        "issue_comments": [],
        "pull_reviews": [],
        "releases": [],
        "contributors": [],
        "labels": labels or [],
    }


def test_newcomer_funnel():
    """Newcomer funnel counts first-time PR authors and their merge conversion."""
    raw = _make_raw(
        items=[
            {"number": 1, "author": {"login": "alice"},
             "created_at": "2026-01-01T00:00:00Z", "state": "closed",
             "closed_at": "2026-01-05T00:00:00Z",
             "pull_request": {"url": "https://github.test/owner/repo/pulls/1"},
             "labels": [], "html_url": "https://github.test/owner/repo/pulls/1"},
            {"number": 2, "author": {"login": "bob"},
             "created_at": "2026-02-01T00:00:00Z", "state": "open",
             "pull_request": {"url": "https://github.test/owner/repo/pulls/2"},
             "labels": [], "html_url": "https://github.test/owner/repo/pulls/2"},
        ],
        pulls=[
            {"number": 1, "merged_at": "2026-01-05T00:00:00Z"},
            {"number": 2, "merged_at": None},
        ],
    )
    data = build_operations(raw, "owner/repo", 90, "2026-03-01T00:00:00Z")
    funnel = data["newcomer_funnel"]
    assert "first_pr_authors" in funnel
    assert "first_pr_merged" in funnel
    assert "conversion_rate" in funnel


def test_change_request_closure_ratio():
    """CR closure ratio = merged / (merged + closed_unmerged + stale_open)."""
    raw = _make_raw(
        items=[
            {"number": 1, "author": {"login": "alice"},
             "created_at": "2026-01-01T00:00:00Z", "state": "closed",
             "closed_at": "2026-01-05T00:00:00Z",
             "pull_request": {"url": "https://github.test/owner/repo/pulls/1"},
             "labels": [], "html_url": "https://github.test/owner/repo/pulls/1"},
            {"number": 2, "author": {"login": "bob"},
             "created_at": "2026-01-01T00:00:00Z", "state": "closed",
             "closed_at": "2026-01-10T00:00:00Z",
             "pull_request": {"url": "https://github.test/owner/repo/pulls/2"},
             "labels": [], "html_url": "https://github.test/owner/repo/pulls/2"},
        ],
        pulls=[
            {"number": 1, "merged_at": "2026-01-05T00:00:00Z"},
            {"number": 2, "merged_at": None},
        ],
    )
    data = build_operations(raw, "owner/repo", 90, "2026-03-01T00:00:00Z")
    ratio = data["summary"]["change_request_closure_ratio"]
    assert ratio is not None
    assert 0 <= ratio <= 1


def test_defect_resolution_duration():
    """Median bug close days is computed for issues labeled 'Bug'."""
    raw = _make_raw(
        items=[
            {"number": 1, "type": "issue", "author": {"login": "alice"},
             "created_at": "2026-01-01T00:00:00Z", "state": "closed",
             "closed_at": "2026-01-10T00:00:00Z",
             "labels": [{"name": "Bug"}],
             "html_url": "https://github.test/owner/repo/issues/1"},
            {"number": 2, "type": "issue", "author": {"login": "bob"},
             "created_at": "2026-01-01T00:00:00Z", "state": "closed",
             "closed_at": "2026-01-20T00:00:00Z",
             "labels": [{"name": "Bug"}],
             "html_url": "https://github.test/owner/repo/issues/2"},
        ],
    )
    data = build_operations(raw, "owner/repo", 90, "2026-03-01T00:00:00Z")
    median = data["summary"]["median_bug_close_days"]
    assert median is not None
    assert median > 0


def test_no_bugs_returns_none_median():
    """No bug-labeled issues → median_bug_close_days is None."""
    raw = _make_raw(
        items=[
            {"number": 1, "type": "issue", "author": {"login": "alice"},
             "created_at": "2026-01-01T00:00:00Z", "state": "closed",
             "closed_at": "2026-01-10T00:00:00Z",
             "labels": [{"name": "Enhancement"}],
             "html_url": "https://github.test/owner/repo/issues/1"},
        ],
    )
    data = build_operations(raw, "owner/repo", 90, "2026-03-01T00:00:00Z")
    assert data["summary"]["median_bug_close_days"] is None
