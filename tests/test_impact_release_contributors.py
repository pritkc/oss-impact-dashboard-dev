from oss_impact_dashboard.collectors.zenodo import record_id
from oss_impact_dashboard.metrics.contributors import build_contributors
from oss_impact_dashboard.metrics.impact import build_impact
from oss_impact_dashboard.metrics.releases import build_releases


def test_release_metrics_count_assets_and_periods():
    releases = [
        {
            "name": "v1",
            "tag_name": "v1.0.0",
            "published_at": "2026-01-01T00:00:00Z",
            "html_url": "https://github.test/releases/v1",
            "assets": [{"download_count": 2}],
        },
        {
            "name": "v2",
            "tag_name": "v2.0.0",
            "published_at": "2026-02-01T00:00:00Z",
            "html_url": "https://github.test/releases/v2",
            "assets": [{"download_count": 3}, {"download_count": 4}],
        },
    ]
    data = build_releases(
        releases,
        "2026-03-01T00:00:00Z",
        [{"id": "feb", "start": "2026-02-01T00:00:00Z", "end": "2026-03-01T00:00:00Z"}],
    )
    assert data["total_releases"] == 2
    assert data["period_counts"]["feb"] == 1
    assert data["latest_release"]["tag"] == "v2.0.0"
    assert data["latest_release_age_days"] == 28.0
    assert data["median_release_interval_days"] == 31.0
    assert data["release_asset_downloads"] == 9
    assert data["period_summaries"]["feb"]["releases"] == 1
    assert data["period_summaries"]["feb"]["asset_downloads"] == 7
    assert data["period_comparisons"]["feb"]["releases"]["previous"] == 1
    assert "source archives" in data["note"]


def test_zero_release_download_explains_missing_uploaded_assets():
    data = build_releases(
        [{"tag_name": "v1", "published_at": "2026-01-01T00:00:00Z", "assets": []}],
        "2026-02-01T00:00:00Z",
        [],
    )
    assert data["release_asset_downloads"] == 0
    assert "No uploaded release assets" in data["zero_download_explanation"]


def test_contributor_metrics_do_not_infer_core_contributors():
    items = [
        {
            "type": "issue",
            "author": "alice",
            "created_at": "2026-01-01T00:00:00Z",
        },
        {
            "type": "pull_request",
            "author": "bob",
            "merged_at": "2026-01-03T00:00:00Z",
            "created_at": "2026-01-02T00:00:00Z",
        },
    ]
    github_contributors = [
        {"login": "alice", "type": "User", "contributions": 5, "html_url": "https://github.test/a"},
        {"login": "ci-bot", "type": "Bot", "contributions": 99, "html_url": "https://github.test/b"},
    ]
    data = build_contributors(
        items,
        github_contributors,
        core_contributors=None,
        period_options=[
            {"id": "jan", "start": "2026-01-01T00:00:00Z", "end": "2026-01-31T00:00:00Z"}
        ],
    )
    assert data["unique_contributors"] == 2
    assert data["commit_contributors"] == 1
    assert data["issue_or_pr_authors"] == 2
    assert data["pr_authors"] == 1
    assert data["merged_pr_authors"] == 1
    assert data["core_contributors_configured"] is False
    assert data["external_contributor_share"] is None
    assert data["contributor_trend"] == [{"month": "2026-01", "contributors": 2}]
    assert data["top_contributors"][0]["login"] == "alice"
    assert data["contribution_concentration"]["top_1_share"] == 1
    assert data["period_summaries"]["jan"]["new_contributors"] == 2
    assert data["period_summaries"]["jan"]["first_time_pr_authors"] == 1


def test_impact_metrics_shape_zenodo_and_openalex_fixture():
    data = build_impact(
        {
            "doi": "10.5281/zenodo.1",
            "metadata": {"title": "MOLE", "doi": "10.5281/zenodo.1", "version": "1.0"},
            "links": {"html": "https://zenodo.org/records/1"},
            "stats": {
                "views": 10,
                "downloads": 4,
                "unique_views": 8,
                "unique_downloads": 3,
            },
        },
        {
            "id": "https://openalex.org/W1",
            "title": "Paper",
            "doi": "https://doi.org/10.21105/test",
            "publication_year": 2024,
            "cited_by_count": 6,
            "counts_by_year": [{"year": 2026, "cited_by_count": 2}],
        },
        {"funding": {}, "case_studies": []},
    )
    assert data["zenodo"]["downloads"] == 4
    assert data["zenodo"]["unique_downloads"] == 3
    assert data["zenodo"]["record_url"] == "https://zenodo.org/records/1"
    assert data["openalex"]["cited_by_count"] == 6
    assert data["openalex"]["citations_by_year"] == [{"year": 2026, "cited_by_count": 2}]
    assert record_id("https://zenodo.org/records/20128874") == "20128874"
