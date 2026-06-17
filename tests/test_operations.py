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
