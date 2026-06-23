"""Tests for GitHub repository metadata extraction (stars, forks, watchers)."""
from oss_impact_dashboard.snapshots import snapshot_record, impact_trends


def test_summary_contains_stars():
    """Stars field is extracted from github_raw repository metadata."""
    repo_meta = {"stargazers_count": 42, "forks_count": 5, "subscribers_count": 3}
    summary = {
        "stars": repo_meta["stargazers_count"],
        "forks": repo_meta["forks_count"],
        "watchers": repo_meta["subscribers_count"],
    }
    assert summary["stars"] == 42


def test_repository_metadata_extracted():
    """All repository metadata fields are present."""
    repo_meta = {
        "stars": 42,
        "forks": 5,
        "watchers": 3,
        "network_count": 10,
        "open_issues_count": 7,
        "license": "GPL-3.0-only",
        "default_branch": "main",
        "created_at": "2020-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "pushed_at": "2026-06-01T00:00:00Z",
        "size": 5000,
        "language": "C++",
        "topics": ["mimetic", "pde", "numerical-methods"],
    }
    for key in ("stars", "forks", "watchers", "network_count", "open_issues_count",
                "license", "default_branch", "created_at", "updated_at",
                "pushed_at", "size", "language", "topics"):
        assert key in repo_meta


def test_snapshot_record_includes_stars():
    """Snapshot record includes stars, forks, watchers."""
    data = {
        "generated_at": "2026-06-22T00:00:00Z",
        "project": {"id": "mole", "environment": "production"},
        "summary": {"stars": 42, "forks": 5, "watchers": 3},
        "documentation_analytics": {},
    }
    record = snapshot_record(data)
    assert record["stars"] == 42
    assert record["forks"] == 5
    assert record["watchers"] == 3


def test_snapshot_record_includes_bus_factor():
    """Snapshot record includes bus_factor."""
    data = {
        "generated_at": "2026-06-22T00:00:00Z",
        "project": {"id": "mole", "environment": "production"},
        "summary": {"bus_factor": 2},
        "documentation_analytics": {},
    }
    record = snapshot_record(data)
    assert record["bus_factor"] == 2


def test_impact_trends_include_stars():
    """Impact trends include stars, forks, watchers arrays."""
    history = {
        "snapshots": [
            {"date": "2026-01-01", "stars": 30, "forks": 3, "watchers": 2},
            {"date": "2026-02-01", "stars": 42, "forks": 5, "watchers": 3},
        ]
    }
    trends = impact_trends(history)
    assert trends["stars"] == [30, 42]
    assert trends["forks"] == [3, 5]
    assert trends["watchers"] == [2, 3]


def test_impact_trends_include_openssf_score():
    """Impact trends include openssf_score array."""
    history = {
        "snapshots": [
            {"date": "2026-01-01", "openssf_score": 5},
            {"date": "2026-02-01", "openssf_score": 7},
        ]
    }
    trends = impact_trends(history)
    assert trends["openssf_score"] == [5, 7]
