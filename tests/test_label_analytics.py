from oss_impact_dashboard.metrics.label_analytics import (
    build_label_group_metrics,
    build_label_metrics,
    build_stale_burden,
    normalize_label_aliases,
    records_for_group,
)
from oss_impact_dashboard.metrics.operations import build_operations, normalize_item


def _closed_issue(number, label, created, closed, aliases=None):
    issue = {
        "number": number,
        "state": "closed",
        "title": f"Issue {number}",
        "html_url": f"https://github.com/org/repo/issues/{number}",
        "created_at": created,
        "updated_at": closed,
        "closed_at": closed,
        "labels": [{"name": label}],
        "user": {"login": "author"},
    }
    return normalize_item(
        issue,
        None,
        [],
        "https://github.com/org/repo",
        "2026-06-30T00:00:00Z",
        aliases,
    )


def test_normalize_label_aliases_casefold():
    assert normalize_label_aliases({"Bug": "Defect", "bug": "Defect"}) == {
        "bug": "Defect"
    }


def test_label_aliases_merge_duplicate_labels():
    raw = {
        "labels": [
            {"name": "Bug", "color": "ff0000"},
            {"name": "bug", "color": "00ff00"},
        ],
        "pulls": [],
        "events": [],
        "issues": [
            {
                "number": 1,
                "state": "closed",
                "title": "Lowercase bug",
                "html_url": "https://github.com/csrc-sdsu/mole/issues/1",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-05T00:00:00Z",
                "closed_at": "2026-01-05T00:00:00Z",
                "labels": [{"name": "bug"}],
                "user": {"login": "octocat"},
            },
            {
                "number": 2,
                "state": "closed",
                "title": "Uppercase bug",
                "html_url": "https://github.com/csrc-sdsu/mole/issues/2",
                "created_at": "2026-01-02T00:00:00Z",
                "updated_at": "2026-01-06T00:00:00Z",
                "closed_at": "2026-01-06T00:00:00Z",
                "labels": [{"name": "Bug"}],
                "user": {"login": "octocat"},
            },
        ],
    }
    without = build_operations(raw, "csrc-sdsu/mole", 90, "2026-06-30T00:00:00Z")
    with_aliases = build_operations(
        raw,
        "csrc-sdsu/mole",
        90,
        "2026-06-30T00:00:00Z",
        label_aliases={"bug": "Bug"},
    )
    bug_metrics = [m for m in without["label_metrics"] if m["label"].casefold() == "bug"]
    assert len(bug_metrics) == 2
    merged = [m for m in with_aliases["label_metrics"] if m["label"] == "Bug"]
    assert len(merged) == 1
    assert merged[0]["total"] == 2
    assert merged[0]["median_close_days"] is None


def test_period_label_metrics_filter_by_period():
    records = [
        _closed_issue(1, "Documentation", "2026-05-01T00:00:00Z", "2026-05-10T00:00:00Z"),
        _closed_issue(2, "Documentation", "2025-01-01T00:00:00Z", "2025-02-01T00:00:00Z"),
    ]
    label_info = {"Documentation": {"name": "Documentation", "color": "0075ca", "description": ""}}
    period = {
        "id": "3m",
        "label": "3 months",
        "start": "2026-04-01T00:00:00Z",
        "end": "2026-06-30T00:00:00Z",
    }
    metrics = build_label_metrics(records, ["Documentation"], label_info, period=period)
    doc = metrics[0]
    assert doc["opened"] == 1
    assert doc["closed"] == 1
    assert doc["median_close_days"] is None


def test_group_metrics_deduplicate_multi_label_items():
    records = [
        normalize_item(
            {
                "number": 10,
                "state": "open",
                "title": "Multi label",
                "html_url": "https://github.com/org/repo/issues/10",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "closed_at": None,
                "labels": [{"name": "C++"}, {"name": "Bug"}],
                "user": {"login": "dev"},
            },
            None,
            [],
            "https://github.com/org/repo",
            "2026-06-30T00:00:00Z",
        )
    ]
    groups = [
        {"id": "languages", "name": "Language / API", "labels": ["C++", "Fortran"]},
        {"id": "work_type", "name": "Work type", "labels": ["Bug", "Enhancement"]},
    ]
    language = build_label_group_metrics(records, groups, period=None)[0]
    assert language["open"] == 1
    assert language["total"] == 1


def test_stale_burden_counts_open_stale_with_domain():
    records = [
        normalize_item(
            {
                "number": 1,
                "state": "open",
                "title": "Stale matlab",
                "html_url": "https://github.com/org/repo/issues/1",
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z",
                "closed_at": None,
                "labels": [{"name": "stale"}, {"name": "Octave/MATLAB"}],
                "user": {"login": "dev"},
            },
            None,
            [],
            "https://github.com/org/repo",
            "2026-06-30T00:00:00Z",
        )
    ]
    rows = build_stale_burden(records, ["Octave/MATLAB", "C++"])
    assert len(rows) == 1
    assert rows[0]["domain_label"] == "Octave/MATLAB"
    assert rows[0]["open_stale"] == 1


def test_records_for_group_dedupes_by_number():
    records = [
        normalize_item(
            {
                "number": 5,
                "state": "open",
                "title": "Both",
                "html_url": "https://github.com/org/repo/issues/5",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "closed_at": None,
                "labels": [{"name": "C++"}, {"name": "Bug"}],
                "user": {"login": "dev"},
            },
            None,
            [],
            "https://github.com/org/repo",
            "2026-06-30T00:00:00Z",
        )
    ]
    grouped = records_for_group(records, ["C++", "Bug"])
    assert len(grouped) == 1


def test_build_operations_exposes_label_period_and_group_metrics():
    raw = {
        "labels": [{"name": "Documentation", "color": "0075ca", "description": ""}],
        "pulls": [],
        "events": [],
        "issues": [
            {
                "number": 1,
                "state": "closed",
                "title": "Docs fix",
                "html_url": "https://github.com/org/repo/issues/1",
                "created_at": "2026-05-01T00:00:00Z",
                "updated_at": "2026-05-04T00:00:00Z",
                "closed_at": "2026-05-04T00:00:00Z",
                "labels": [{"name": "Documentation"}],
                "user": {"login": "dev"},
            }
        ],
    }
    groups = [
        {"id": "work_type", "name": "Work type", "labels": ["Documentation"]},
    ]
    data = build_operations(
        raw,
        "org/repo",
        90,
        "2026-06-30T00:00:00Z",
        label_groups=groups,
    )
    assert "12m" in data["label_metrics_by_period"]
    assert data["label_metrics_by_period"]["12m"][0]["label"] == "Documentation"
    assert "12m" in data["label_group_metrics"]
    assert data["label_trends"]["months"]
    assert isinstance(data["label_cooccurrence"], list)
