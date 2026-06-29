from pathlib import Path

from oss_impact_dashboard.collectors.github_actions import summarize_workflow_runs
from oss_impact_dashboard.collectors.github_traffic import summarize_traffic
from oss_impact_dashboard.collectors.readthedocs import parse_readthedocs_csv
from oss_impact_dashboard.snapshots import (
    append_snapshot,
    dedupe_items,
    impact_trends,
    load_snapshot,
    snapshot_record,
    write_snapshot,
)


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
    assert summary["daily_views"] == []
    assert summary["window_days"] == 14


def test_github_actions_summary():
    summary = summarize_workflow_runs(
        [
            {
                "status": "completed",
                "conclusion": "success",
                "run_started_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:10:00Z",
            },
            {
                "status": "completed",
                "conclusion": "failure",
                "name": "test",
                "html_url": "https://github.test/run/1",
                "created_at": "2026-01-02T00:00:00Z",
                "run_started_at": "2026-01-02T00:00:00Z",
                "updated_at": "2026-01-02T00:20:00Z",
            },
            {"status": "in_progress", "conclusion": None},
        ]
    )
    assert summary["total_runs"] == 3
    assert summary["success_rate"] == 0.5
    assert summary["median_duration_seconds"] == 900.0
    assert summary["conclusions"]["success"] == 1
    assert summary["statuses"]["completed"] == 2
    assert summary["recent_failed_runs"][0]["url"] == "https://github.test/run/1"


def test_readthedocs_csv_parser(tmp_path: Path):
    csv_path = tmp_path / "rtd.csv"
    csv_path.write_text(
        "type,page,query,views,result_count,status\n"
        "page,/index.html,,9,,\n"
        "page,/tutorial.html,,4,,\n"
        "search,,install,3,7,\n"
        "search,,missing,2,0,\n"
        "404,/missing.html,,5,,404\n",
        encoding="utf-8",
    )
    summary = parse_readthedocs_csv(csv_path)
    assert summary["views_total"] == 13
    assert summary["unique_pages"] == 2
    assert summary["top_pages"][0]["page"] == "/index.html"
    assert summary["search_total"] == 5
    assert summary["no_result_search_count"] == 2
    assert summary["not_found_pages"][0]["page"] == "/missing.html"


def test_snapshot_helpers(tmp_path: Path):
    snapshot = tmp_path / "snapshot.json"
    write_snapshot(snapshot, {"items": [{"id": 1}, {"id": 1}, {"id": 2}]})
    loaded = load_snapshot(snapshot)
    assert loaded is not None
    assert dedupe_items(loaded["items"]) == [{"id": 1}, {"id": 2}]


def test_snapshot_history_policy_and_trends():
    record = snapshot_record(
        {
            "generated_at": "2026-01-02T00:00:00Z",
            "summary": {
                "github_traffic_views": 10,
                "readthedocs_views": 20,
                "zenodo_downloads": 30,
                "zenodo_views": 40,
                "citation_count": 5,
            },
            "github_traffic": {"clones_total": 3},
            "project": {"id": "demo", "environment": "development"},
            "documentation_analytics": {
                "visitor_count": 11,
                "page_hit_count": 22,
                "search_count": 3,
                "no_result_search_count": 4,
                "not_found_count": 5,
            },
        }
    )
    blocked = append_snapshot({"snapshots": []}, record, branch="feature", protected_branch="main")
    assert blocked["write_allowed"] is False
    history = append_snapshot({"snapshots": []}, record, branch="main", protected_branch="main")
    history = append_snapshot(history, {**record, "zenodo_downloads": 31}, branch="main")
    assert len(history["snapshots"]) == 1
    assert history["snapshots"][0]["zenodo_downloads"] == 31
    assert history["snapshots"][0]["environment"] == "development"
    assert history["snapshots"][0]["documentation_visitors"] == 11
    assert impact_trends(history)["dates"] == ["2026-01-02"]
    assert impact_trends(history)["documentation_search_count"] == [3]
