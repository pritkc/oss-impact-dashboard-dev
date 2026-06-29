from oss_impact_dashboard.collectors.github_actions import summarize_workflow_runs
from oss_impact_dashboard.collectors.github_activity import summarize_activity
from oss_impact_dashboard.collectors.github_governance import summarize_governance
from oss_impact_dashboard.collectors.github_security import summarize_github_security
from oss_impact_dashboard.collectors.github_traffic import summarize_traffic
from oss_impact_dashboard.metrics.operations import build_review_load


def test_github_traffic_summary_extended():
    summary = summarize_traffic(
        {
            "views": {
                "count": 30,
                "uniques": 10,
                "views": [{"timestamp": "2026-06-01T00:00:00Z", "count": 12, "uniques": 4}],
            },
            "clones": {
                "count": 8,
                "uniques": 3,
                "clones": [{"timestamp": "2026-06-01T00:00:00Z", "count": 5, "uniques": 2}],
            },
            "popular_paths": [{"path": "/owner/repo", "title": "Repo", "count": 12, "uniques": 4}],
            "popular_referrers": [{"referrer": "github.com", "count": 5, "uniques": 2}],
        }
    )
    assert summary["views_total"] == 30
    assert summary["daily_views"][0]["date"] == "2026-06-01"
    assert summary["window_days"] == 14
    assert summary["unique_view_rate"] == round(10 / 30, 3)


def test_github_activity_summary():
    commit_activity = [
        {"total": 1, "week": "2026-01-01T00:00:00Z"},
        {"total": 2, "week": "2026-01-08T00:00:00Z"},
    ]
    summary = summarize_activity(
        {"all": [0, 1, 2, 3], "owner": [0, 1, 0, 1]},
        commit_activity,
        [{"author": {"login": "alice"}, "total": 5, "weeks": [{"total": 2}, {"total": 3}]}],
        [[1, 10, 2], [2, 5, 1]],
    )
    assert summary["total_commits_52w"] == 3
    assert summary["commits_last_4w"] == 3
    assert summary["contributor_commit_totals"][0]["login"] == "alice"
    assert summary["net_code_change_52w"] == 12


def test_github_security_summary():
    summary = summarize_github_security(
        [{"state": "open", "rule": {"severity": "high", "tool": {"name": "CodeQL"}}}],
        [{"state": "open", "security_advisory": {"severity": "critical"}}],
        [{"state": "open"}, {"state": "resolved"}],
        [{"state": "published"}, {"state": "draft"}],
    )
    assert summary["total_open_alerts"] == 3
    assert summary["code_scanning"]["open_alerts"] == 1
    assert summary["secret_scanning"]["resolved_alerts"] == 1
    assert summary["repository_advisories"]["published_count"] == 1


def test_github_governance_summary():
    summary = summarize_governance(
        {"health_percentage": 80, "files": {"readme": {}, "license": {}}},
        None,
        {"required_pull_request_reviews": {"required_approving_review_count": 1}},
        [{"id": 1}],
        [{"name": "production", "protection_rules": [{}]}],
        [{"state": "success", "environment": "production", "created_at": "2026-06-01T00:00:00Z"}],
        {"status": "built", "cname": None, "source": {"branch": "gh-pages"}},
    )
    assert summary["community_profile"]["health_percentage"] == 80
    assert summary["default_branch_protected"] is True
    assert summary["rulesets_count"] == 1
    assert summary["protected_environments_count"] == 1


def test_github_actions_workflow_summary():
    summary = summarize_workflow_runs(
        [
            {
                "status": "completed",
                "conclusion": "success",
                "name": "CI",
                "event": "push",
                "head_branch": "main",
                "run_started_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:10:00Z",
            },
            {
                "status": "completed",
                "conclusion": "failure",
                "name": "CI",
                "event": "push",
                "head_branch": "main",
                "run_started_at": "2026-01-02T00:00:00Z",
                "updated_at": "2026-01-02T00:20:00Z",
            },
        ],
        workflows=[{"id": 1, "name": "CI", "state": "active", "path": ".github/workflows/ci.yml"}],
        default_branch="main",
    )
    assert summary["by_workflow"][0]["name"] == "CI"
    assert summary["by_workflow"][0]["runs"] == 2
    assert summary["latest_default_branch_status"] == "success"


def test_build_review_load():
    records = [
        {
            "number": 1,
            "type": "pull_request",
            "author": "alice",
            "closed_at": None,
            "first_review_at": None,
            "first_review_days": None,
        },
        {
            "number": 2,
            "type": "issue",
            "author": "bob",
            "closed_at": None,
            "first_response_at": "2026-01-02T00:00:00Z",
        },
    ]
    raw = {
        "pulls": [{"number": 1, "draft": False, "requested_reviewers": [{"login": "reviewer"}]}],
        "pull_reviews": [],
        "issues": [],
    }
    review_load = build_review_load(records, raw, stale_days=90)
    assert review_load["open_prs_waiting_for_review"] == 1
    assert review_load["requested_reviewers_count"] == 1
