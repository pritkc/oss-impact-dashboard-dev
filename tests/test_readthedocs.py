from __future__ import annotations

import base64
import hashlib
import hmac
import struct
from pathlib import Path

import pytest

from oss_impact_dashboard.collectors.readthedocs import (
    RTDAuthenticationError,
    RTDExportError,
    dedupe_history_entries,
    fetch_readthedocs_analytics,
    import_rtd_exports_from_dir,
    load_rtd_cache,
    mark_rtd_dataset_stale,
    merge_rtd_exports,
    parse_search_csv,
    parse_traffic_csv,
    update_rtd_history,
    validate_csv_bytes,
    write_rtd_cache,
)
from oss_impact_dashboard.credentials import (
    readthedocs_credentials_configured,
    readthedocs_password_for_project,
    readthedocs_totp_secret_for_project,
    readthedocs_username_for_project,
)
from oss_impact_dashboard.rtd_totp import RTDTOTPError, generate_totp

TRAFFIC_200_CSV = """Date,Version,Path,Views
2026-06-01 00:00:00,latest,/index.html,9
2026-06-01 00:00:00,latest,/tutorial.html,4
2026-06-02 00:00:00,latest,/index.html,2
"""

TRAFFIC_404_CSV = """Date,Version,Path,Views
2026-06-01 00:00:00,latest,/missing.html,5
2026-06-01 00:00:00,latest,/old-page.html,1
"""

SEARCH_CSV = """Created Date,Query,Total Results
2026-06-01 00:00:00,install,7
2026-06-01 00:00:00,missing,0
2026-06-02 00:00:00,api,3
"""


def _totp_secret() -> str:
    return base64.b32encode(b"test-secret-key").decode("ascii").rstrip("=")


def test_validate_csv_rejects_html_login_page():
    with pytest.raises(RTDAuthenticationError):
        validate_csv_bytes(
            b"<!doctype html><html><form action='/accounts/login/'></form>",
            expected_headers={"date", "path", "views", "version"},
        )


def test_parse_traffic_csv_preserves_version_path_and_views():
    parsed = parse_traffic_csv(TRAFFIC_200_CSV, status_code=200)
    assert parsed["views_total"] == 15
    assert parsed["unique_pages"] == 2
    assert parsed["top_pages"][0]["path"] == "/index.html"
    assert parsed["top_pages"][0]["version"] == "latest"
    assert parsed["daily_views"] == [
        {"date": "2026-06-01", "views": 13},
        {"date": "2026-06-02", "views": 2},
    ]


def test_parse_traffic_csv_classifies_404_rows():
    parsed = parse_traffic_csv(TRAFFIC_404_CSV, status_code=404)
    assert parsed["views_total"] == 6
    assert parsed["rows"][0]["status"] == 404
    assert parsed["rows"][0]["path"] == "/missing.html"


def test_parse_search_csv_counts_searches_and_zero_results_without_queries_in_output():
    parsed = parse_search_csv(SEARCH_CSV)
    assert parsed["search_total"] == 3
    assert parsed["no_result_search_count"] == 1
    assert "query" not in parsed
    assert parsed["daily_searches"][-1]["searches"] == 1


def test_merge_rtd_exports_builds_sanitized_dataset():
    traffic_200 = parse_traffic_csv(TRAFFIC_200_CSV, status_code=200)
    traffic_404 = parse_traffic_csv(TRAFFIC_404_CSV, status_code=404)
    search = parse_search_csv(SEARCH_CSV)
    dataset = merge_rtd_exports(
        traffic_200=traffic_200,
        traffic_404=traffic_404,
        search=search,
        project_slug="mole-docs",
        collected_at="2026-06-03T10:00:00+00:00",
    )
    assert dataset["views_total"] == 15
    assert dataset["not_found_count"] == 6
    assert dataset["search_total"] == 3
    assert dataset["no_result_search_count"] == 1
    assert "top_searches" not in dataset


def test_import_rtd_exports_from_dir_writes_cache(tmp_path: Path):
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    raw_dir.joinpath("traffic-200.csv").write_text(TRAFFIC_200_CSV, encoding="utf-8")
    raw_dir.joinpath("traffic-404.csv").write_text(TRAFFIC_404_CSV, encoding="utf-8")
    raw_dir.joinpath("search.csv").write_text(SEARCH_CSV, encoding="utf-8")
    dataset = import_rtd_exports_from_dir(
        tmp_path,
        project_slug="mole-docs",
        collected_at="2026-06-03T10:00:00+00:00",
    )
    assert dataset["views_total"] == 15
    cached = load_rtd_cache(tmp_path)
    assert cached is not None
    assert cached["history"]["entries"]


def test_fetch_readthedocs_analytics_reuses_stale_cache(tmp_path: Path):
    dataset = merge_rtd_exports(
        traffic_200=parse_traffic_csv(TRAFFIC_200_CSV, status_code=200),
        traffic_404=parse_traffic_csv(TRAFFIC_404_CSV, status_code=404),
        search=parse_search_csv(SEARCH_CSV),
        project_slug="mole-docs",
        collected_at="2026-06-03T10:00:00+00:00",
    )
    write_rtd_cache(tmp_path, dataset)
    tmp_path.joinpath("collection-state.json").write_text(
        '{"last_error":"login failed"}',
        encoding="utf-8",
    )
    loaded = fetch_readthedocs_analytics(
        {"enabled": True, "cache_dir": str(tmp_path)},
        project_id="mole",
    )
    assert loaded is not None
    assert loaded["status"] == "stale"
    assert loaded["views_total"] == 15


def test_mark_rtd_dataset_stale_preserves_metrics():
    dataset = {"views_total": 10, "collection": {"collected_at": "2026-06-01"}}
    stale = mark_rtd_dataset_stale(
        dataset,
        message="reuse",
        last_error="network",
    )
    assert stale["views_total"] == 10
    assert stale["collection"]["stale"] is True
    assert stale["collection"]["last_error"] == "network"


def test_dedupe_history_entries():
    entries = [
        {"date": "2026-06-01", "collected_at": "2026-06-01T09:00:00+00:00", "views_total": 1},
        {"date": "2026-06-01", "collected_at": "2026-06-01T09:00:00+00:00", "views_total": 2},
        {"date": "2026-06-08", "collected_at": "2026-06-08T09:00:00+00:00", "views_total": 3},
    ]
    deduped = dedupe_history_entries(entries)
    assert len(deduped) == 2
    assert deduped[0]["views_total"] == 2


def test_update_rtd_history_appends_weekly_point():
    history = update_rtd_history(
        {"schema_version": 1, "entries": []},
        {"views_total": 10, "search_total": 2, "no_result_search_count": 1, "not_found_count": 3},
        collected_at="2026-06-03T10:00:00+00:00",
    )
    assert history["entries"][0]["views_total"] == 10


def test_totp_generation_is_stable_for_known_counter():
    secret = _totp_secret()
    when = 1_700_000_000
    counter = when // 30
    digest = hmac.new(
        base64.b32decode(secret, casefold=True),
        struct.pack(">Q", counter),
        hashlib.sha1,
    ).digest()
    offset = digest[-1] & 0x0F
    code = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    expected = str(code % 1_000_000).zfill(6)
    assert generate_totp(secret, when=when) == expected


def test_totp_rejects_invalid_secret():
    with pytest.raises(RTDTOTPError):
        generate_totp("not!!!valid")


def test_readthedocs_credentials_use_project_suffix(monkeypatch):
    monkeypatch.setenv("RTD_USERNAME_MOLE", "automation@example.com")
    monkeypatch.setenv("RTD_PASSWORD_MOLE", "secret")
    monkeypatch.setenv("RTD_TOTP_SECRET_MOLE", _totp_secret())
    assert readthedocs_username_for_project("mole", project_count=2) == "automation@example.com"
    assert readthedocs_password_for_project("mole", project_count=2) == "secret"
    assert readthedocs_totp_secret_for_project("mole", project_count=2) == _totp_secret()
    assert readthedocs_credentials_configured("mole", project_count=2)


def test_invalid_traffic_csv_headers_raise():
    with pytest.raises(RTDExportError):
        parse_traffic_csv("page,views\n/a,1\n", status_code=200)
