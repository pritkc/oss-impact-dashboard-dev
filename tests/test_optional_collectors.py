from pathlib import Path

from oss_impact_dashboard.collectors.github_actions import summarize_workflow_runs
from oss_impact_dashboard.collectors.github_traffic import summarize_traffic
from oss_impact_dashboard.collectors.readthedocs import parse_readthedocs_csv
from oss_impact_dashboard.snapshots import dedupe_items, load_snapshot, write_snapshot


def test_github_traffic_summary():
    summary = summarize_traffic(
        {
            "views": {"count": 30, "uniques": 10},
            "clones": {"count": 8, "uniques": 3},
            "popular_paths": [{"path": "/owner/repo", "count": 12}],
            "popular_referrers": [{"referrer": "github.com", "count": 5}],
        }
    )
    assert summary["views_total"] == 30
    assert summary["clones_unique"] == 3
    assert summary["popular_paths"][0]["path"] == "/owner/repo"


def test_github_actions_summary():
    summary = summarize_workflow_runs(
        [
            {"status": "completed", "conclusion": "success"},
            {"status": "completed", "conclusion": "failure"},
            {"status": "in_progress", "conclusion": None},
        ]
    )
    assert summary["total_runs"] == 3
    assert summary["conclusions"]["success"] == 1
    assert summary["statuses"]["completed"] == 2


def test_readthedocs_csv_parser(tmp_path: Path):
    csv_path = tmp_path / "rtd.csv"
    csv_path.write_text("page,views\n/index.html,9\n/tutorial.html,4\n", encoding="utf-8")
    summary = parse_readthedocs_csv(csv_path)
    assert summary["views_total"] == 13
    assert summary["unique_pages"] == 2
    assert summary["top_pages"][0]["page"] == "/index.html"


def test_snapshot_helpers(tmp_path: Path):
    snapshot = tmp_path / "snapshot.json"
    write_snapshot(snapshot, {"items": [{"id": 1}, {"id": 1}, {"id": 2}]})
    loaded = load_snapshot(snapshot)
    assert loaded is not None
    assert dedupe_items(loaded["items"]) == [{"id": 1}, {"id": 2}]
