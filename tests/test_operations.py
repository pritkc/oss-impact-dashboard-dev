from oss_impact_dashboard.metrics.operations import build_operations, labels_at_time, normalize_item
from oss_impact_dashboard.schema import UNLABELED


def test_label_added_after_closure_is_excluded():
    labels, source = labels_at_time(
        [
            {"event": "labeled", "label": {"name": "Bug"}, "created_at": "2026-01-02T00:00:00Z"},
            {"event": "labeled", "label": {"name": "stale"}, "created_at": "2026-01-11T00:00:00Z"},
        ],
        "2026-01-10T00:00:00Z",
        fallback_labels=["Bug", "stale"],
    )
    assert labels == ["Bug"]
    assert source == "repository-events"


def test_label_removed_before_closure_is_excluded():
    labels, _ = labels_at_time(
        [
            {
                "event": "labeled",
                "label": {"name": "Enhancement"},
                "created_at": "2026-01-02T00:00:00Z",
            },
            {
                "event": "unlabeled",
                "label": {"name": "Enhancement"},
                "created_at": "2026-01-08T00:00:00Z",
            },
        ],
        "2026-01-10T00:00:00Z",
        fallback_labels=["Enhancement"],
    )
    assert labels == []


def test_normalized_closed_item_uses_closure_labels_for_metrics():
    issue = {
        "number": 10,
        "state": "closed",
        "title": "Closed bug",
        "html_url": "https://github.com/csrc-sdsu/mole/issues/10",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-12T00:00:00Z",
        "closed_at": "2026-01-11T00:00:00Z",
        "labels": [{"name": "stale"}],
        "user": {"login": "octocat"},
    }
    record = normalize_item(
        issue,
        None,
        [
            {"event": "labeled", "label": {"name": "Bug"}, "created_at": "2026-01-03T00:00:00Z"},
            {"event": "labeled", "label": {"name": "stale"}, "created_at": "2026-01-12T00:00:00Z"},
        ],
        "https://github.com/csrc-sdsu/mole",
        "2026-01-21T00:00:00Z",
    )
    assert record["labels_current"] == ["stale"]
    assert record["labels_at_close"] == ["Bug"]
    assert record["metric_labels"] == ["Bug"]
    assert record["days_to_close"] == 10.0


def test_build_operations_core_kpis():
    raw = {
        "labels": [{"name": "Bug", "color": "B60205", "description": ""}],
        "pulls": [{"number": 2, "merged_at": "2026-01-05T00:00:00Z"}],
        "events": [
            {
                "event": "labeled",
                "issue": {"number": 1},
                "label": {"name": "Bug"},
                "created_at": "2026-01-02T00:00:00Z",
            }
        ],
        "issues": [
            {
                "number": 1,
                "state": "closed",
                "title": "Closed issue",
                "html_url": "https://github.com/csrc-sdsu/mole/issues/1",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-03T00:00:00Z",
                "closed_at": "2026-01-03T00:00:00Z",
                "labels": [],
                "user": {"login": "octocat"},
            },
            {
                "number": 2,
                "state": "closed",
                "title": "Merged PR",
                "html_url": "https://github.com/csrc-sdsu/mole/pull/2",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-05T00:00:00Z",
                "closed_at": "2026-01-05T00:00:00Z",
                "pull_request": {},
                "labels": [],
                "user": {"login": "hubot"},
            },
            {
                "number": 3,
                "state": "open",
                "title": "Needs triage",
                "html_url": "https://github.com/csrc-sdsu/mole/issues/3",
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-01T00:00:00Z",
                "closed_at": None,
                "labels": [],
                "user": {"login": "newuser"},
            },
        ],
    }
    data = build_operations(
        raw,
        "csrc-sdsu/mole",
        stale_days=90,
        generated_at="2026-02-01T00:00:00Z",
    )
    assert data["summary"]["open_issues"] == 1
    assert data["summary"]["untriaged_items"] == 1
    assert data["summary"]["median_issue_close_days"] == 2.0
    assert data["summary"]["median_pr_merge_days"] == 4.0
    assert any(metric["label"] == UNLABELED for metric in data["label_metrics"])


def test_closed_unmerged_pr_reduces_backlog():
    raw = {
        "labels": [],
        "pulls": [{"number": 1, "merged_at": None}],
        "events": [],
        "issues": [
            {
                "number": 1,
                "state": "closed",
                "title": "Closed unmerged PR",
                "html_url": "https://github.com/csrc-sdsu/mole/pull/1",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-03T00:00:00Z",
                "closed_at": "2026-01-03T00:00:00Z",
                "pull_request": {},
                "labels": [],
                "user": {"login": "octocat"},
            }
        ],
    }
    data = build_operations(raw, "csrc-sdsu/mole", 90, "2026-01-31T00:00:00Z")
    assert data["trends"]["prs_closed"] == [1]
    assert data["trends"]["prs_merged"] == [0]
    assert data["trends"]["backlog"][-1] == 0


def test_merged_pr_reduces_backlog_once():
    raw = {
        "labels": [],
        "pulls": [{"number": 2, "merged_at": "2026-01-05T00:00:00Z"}],
        "events": [],
        "issues": [
            {
                "number": 2,
                "state": "closed",
                "title": "Merged PR",
                "html_url": "https://github.com/csrc-sdsu/mole/pull/2",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-05T00:00:00Z",
                "closed_at": "2026-01-05T00:00:00Z",
                "pull_request": {},
                "labels": [],
                "user": {"login": "octocat"},
            }
        ],
    }
    data = build_operations(raw, "csrc-sdsu/mole", 90, "2026-01-31T00:00:00Z")
    assert data["trends"]["prs_closed"] == [1]
    assert data["trends"]["prs_merged"] == [1]
    assert data["trends"]["backlog"][-1] == 0


def test_current_backlog_equals_open_issues_plus_open_prs_and_month_gaps_are_zero():
    raw = {
        "labels": [],
        "pulls": [{"number": 2, "merged_at": None}],
        "events": [],
        "issues": [
            {
                "number": 1,
                "state": "open",
                "title": "Open issue",
                "html_url": "https://github.com/csrc-sdsu/mole/issues/1",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "closed_at": None,
                "labels": [],
                "user": {"login": "octocat"},
            },
            {
                "number": 2,
                "state": "open",
                "title": "Open PR",
                "html_url": "https://github.com/csrc-sdsu/mole/pull/2",
                "created_at": "2026-03-01T00:00:00Z",
                "updated_at": "2026-03-01T00:00:00Z",
                "closed_at": None,
                "pull_request": {},
                "labels": [],
                "user": {"login": "octocat"},
            },
        ],
    }
    data = build_operations(raw, "csrc-sdsu/mole", 90, "2026-03-31T00:00:00Z")
    assert data["trends"]["months"] == ["2026-01", "2026-02", "2026-03"]
    assert data["trends"]["issues_opened"] == [1, 0, 0]
    assert data["summary"]["current_backlog"] == 2
    assert data["trends"]["backlog"][-1] == 2


def test_reopened_issue_and_deterministic_age():
    raw = {
        "labels": [],
        "pulls": [],
        "events": [
            {
                "event": "reopened",
                "issue": {"number": 1},
                "created_at": "2026-02-01T00:00:00Z",
            }
        ],
        "issues": [
            {
                "number": 1,
                "state": "open",
                "title": "Reopened issue",
                "html_url": "https://github.com/csrc-sdsu/mole/issues/1",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-02-01T00:00:00Z",
                "closed_at": None,
                "labels": [],
                "user": {"login": "octocat"},
            }
        ],
    }
    first = build_operations(raw, "csrc-sdsu/mole", 90, "2026-03-01T00:00:00Z")
    second = build_operations(raw, "csrc-sdsu/mole", 90, "2026-03-01T00:00:00Z")
    assert first["items"][0]["age_days"] == 59.0
    assert first["items"] == second["items"]
    assert first["queues"]["recently_reopened"][0]["number"] == 1


def test_label_aliases_merge_categories():
    raw = {
        "labels": [{"name": "bug", "color": "ff0000"}, {"name": "Bug", "color": "00ff00"}],
        "pulls": [],
        "events": [],
        "issues": [
            {
                "number": 1,
                "state": "open",
                "title": "Lowercase bug",
                "html_url": "https://github.com/csrc-sdsu/mole/issues/1",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "closed_at": None,
                "labels": [{"name": "bug"}],
                "user": {"login": "octocat"},
            },
            {
                "number": 2,
                "state": "open",
                "title": "Uppercase bug",
                "html_url": "https://github.com/csrc-sdsu/mole/issues/2",
                "created_at": "2026-01-02T00:00:00Z",
                "updated_at": "2026-01-02T00:00:00Z",
                "closed_at": None,
                "labels": [{"name": "Bug"}],
                "user": {"login": "octocat"},
            },
        ],
    }
    data = build_operations(
        raw,
        "csrc-sdsu/mole",
        90,
        "2026-01-31T00:00:00Z",
        label_aliases={"bug": "Bug"},
    )
    bug_metrics = [metric for metric in data["label_metrics"] if metric["label"] == "Bug"]
    assert len(bug_metrics) == 1
    assert bug_metrics[0]["total"] == 2


def test_reporting_period_options_and_previous_period_comparisons():
    raw = {
        "labels": [],
        "pulls": [{"number": 2, "merged_at": "2026-06-10T00:00:00Z"}],
        "events": [],
        "issues": [
            {
                "number": 1,
                "state": "closed",
                "title": "Closed issue",
                "html_url": "https://github.com/csrc-sdsu/mole/issues/1",
                "created_at": "2025-12-01T00:00:00Z",
                "updated_at": "2026-01-15T00:00:00Z",
                "closed_at": "2026-01-15T00:00:00Z",
                "labels": [],
                "user": {"login": "octocat"},
            },
            {
                "number": 2,
                "state": "closed",
                "title": "Merged PR",
                "html_url": "https://github.com/csrc-sdsu/mole/pull/2",
                "created_at": "2026-05-01T00:00:00Z",
                "updated_at": "2026-06-10T00:00:00Z",
                "closed_at": "2026-06-10T00:00:00Z",
                "pull_request": {},
                "labels": [],
                "user": {"login": "octocat"},
            },
        ],
    }
    data = build_operations(
        raw,
        "csrc-sdsu/mole",
        90,
        "2026-06-30T00:00:00Z",
        default_period_months=12,
    )
    assert [period["id"] for period in data["periods"]["options"]] == ["3m", "6m", "12m", "all"]
    assert data["periods"]["default"] == "12m"
    assert data["period_summaries"]["3m"]["prs_merged"] == 1
    assert data["period_summaries"]["6m"]["issues_closed"] == 1
    assert data["period_comparisons"]["3m"]["prs_opened"]["previous"] == 0
    assert data["summary"]["current_backlog"] == 0


def test_engagement_metrics_use_comments_and_reviews_without_fabricating_missing_data():
    raw = {
        "labels": [],
        "pulls": [{"number": 2, "merged_at": None}],
        "events": [],
        "issue_comments": [
            {
                "issue_number": 1,
                "created_at": "2026-01-03T00:00:00Z",
                "user": {"login": "maintainer"},
            },
            {
                "issue_number": 2,
                "created_at": "2026-01-04T00:00:00Z",
                "user": {"login": "maintainer"},
            },
        ],
        "pull_reviews": [
            {
                "pull_number": 2,
                "submitted_at": "2026-01-05T00:00:00Z",
                "user": {"login": "reviewer"},
            }
        ],
        "issues": [
            {
                "number": 1,
                "state": "open",
                "title": "Open issue",
                "html_url": "https://github.com/csrc-sdsu/mole/issues/1",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-03T00:00:00Z",
                "closed_at": None,
                "labels": [],
                "user": {"login": "author"},
            },
            {
                "number": 2,
                "state": "open",
                "title": "Open PR",
                "html_url": "https://github.com/csrc-sdsu/mole/pull/2",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-05T00:00:00Z",
                "closed_at": None,
                "pull_request": {},
                "labels": [],
                "user": {"login": "author"},
            },
        ],
    }
    data = build_operations(raw, "csrc-sdsu/mole", 90, "2026-01-31T00:00:00Z")
    assert data["summary"]["median_first_response_days"] == 2.5
    assert data["summary"]["median_first_review_days"] == 4.0
    assert data["summary"]["awaiting_review_count"] == 0
    assert data["summary"]["issues_without_external_response_count"] == 0
    assert data["engagement"]["p90_first_response_days"] == 2.9


def test_engagement_queues_are_unavailable_without_collected_sources():
    raw = {
        "labels": [],
        "pulls": [{"number": 1, "merged_at": None}],
        "events": [],
        "issues": [
            {
                "number": 1,
                "state": "open",
                "title": "Open PR",
                "html_url": "https://github.com/csrc-sdsu/mole/pull/1",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "closed_at": None,
                "pull_request": {},
                "labels": [],
                "user": {"login": "author"},
            }
        ],
    }
    data = build_operations(raw, "csrc-sdsu/mole", 90, "2026-01-31T00:00:00Z")
    assert data["summary"]["awaiting_review_count"] is None
    assert data["queues"]["awaiting_review"] == []
