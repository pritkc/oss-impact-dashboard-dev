"""Tests for annual targets progress tracker."""
from oss_impact_dashboard.metrics.targets import build_targets_progress


def test_no_manual_data():
    result = build_targets_progress(None, {})
    assert result["available"] is False


def test_no_targets():
    manual = {"project_data": {"targets": []}}
    result = build_targets_progress(manual, {})
    assert result["available"] is False


def test_progress_with_data():
    manual = {
        "project_data": {
            "reporting_period": "2026",
            "targets": [
                {
                    "year": 2026,
                    "metrics": [
                        {"metric": "unique_contributors", "baseline": 25, "target": 40, "expected_outcome": "More contributors"},
                        {"metric": "median_issue_close_days", "baseline": 15, "target": 7, "expected_outcome": "Faster resolution"},
                    ],
                }
            ],
        }
    }
    summary = {"unique_contributors": 30, "median_issue_close_days": 10}
    result = build_targets_progress(manual, summary)
    assert result["available"] is True
    assert len(result["targets"]) == 2

    contrib_target = [t for t in result["targets"] if t["metric"] == "unique_contributors"][0]
    assert contrib_target["baseline"] == 25
    assert contrib_target["target"] == 40
    assert contrib_target["current"] == 30
    assert contrib_target["progress"] is not None
    assert 0 < contrib_target["progress"] < 1

    issue_target = [t for t in result["targets"] if t["metric"] == "median_issue_close_days"][0]
    assert issue_target["progress"] is not None
    assert 0 < issue_target["progress"] < 1


def test_progress_clamped():
    """Progress is clamped to [0, 1]."""
    manual = {
        "project_data": {
            "targets": [
                {"year": 2026, "metrics": [
                    {"metric": "unique_contributors", "baseline": 25, "target": 40, "expected_outcome": "More"},
                ]},
            ],
        }
    }
    summary = {"unique_contributors": 50}
    result = build_targets_progress(manual, summary)
    assert result["targets"][0]["progress"] == 1.0


def test_progress_missing_current():
    """Missing current value → progress is None."""
    manual = {
        "project_data": {
            "targets": [
                {"year": 2026, "metrics": [
                    {"metric": "openssf_score", "baseline": None, "target": 7, "expected_outcome": "Security"},
                ]},
            ],
        }
    }
    result = build_targets_progress(manual, {})
    assert result["targets"][0]["progress"] is None
