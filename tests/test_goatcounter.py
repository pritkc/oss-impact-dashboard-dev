import io
import json
import urllib.error
from pathlib import Path

from oss_impact_dashboard.cli import main
from oss_impact_dashboard.collectors.goatcounter import (
    GoatCounterAPIError,
    GoatCounterClient,
    GoatCounterConfigError,
    GoatCounterSettings,
    fetch_goatcounter_analytics,
    fetch_paginated_hits,
    parse_hits,
    parse_toprefs,
    parse_total,
    reporting_window,
    settings_from_project,
    validate_documentation_hostname,
)


def test_settings_from_project_uses_yaml_and_documentation_url(monkeypatch):
    monkeypatch.setenv("GOATCOUNTER_API_KEY_DEMO", "secret-token")
    docs_cfg = {
        "provider": "goatcounter",
        "enabled": True,
        "site_url": "https://example.goatcounter.com/",
    }
    settings = settings_from_project("demo", "https://docs.example.org/en/latest/", docs_cfg)
    assert settings.site_url == "https://example.goatcounter.com"
    assert settings.tracked_domain == "docs.example.org"
    assert settings.api_base == "https://example.goatcounter.com/api/v0"


def test_goatcounter_configuration_validation(monkeypatch):
    monkeypatch.setenv("GOATCOUNTER_API_KEY_DEMO", "secret-token")
    docs_cfg = {
        "provider": "goatcounter",
        "enabled": True,
        "site_url": "https://example.goatcounter.com/",
    }
    settings = settings_from_project("demo", "https://docs.example.org/en/latest/", docs_cfg)
    assert settings.site_url == "https://example.goatcounter.com"
    assert settings.api_base == "https://example.goatcounter.com/api/v0"
    assert settings.count_endpoint == "https://example.goatcounter.com/count"
    assert settings.tracked_domain == "docs.example.org"

    insecure_cfg = {**docs_cfg, "site_url": "http://example.goatcounter.com"}
    try:
        settings_from_project("demo", "https://docs.example.org/", insecure_cfg)
    except GoatCounterConfigError as exc:
        assert "HTTPS" in str(exc)
    else:
        raise AssertionError("insecure site URL should fail")

    try:
        settings_from_project("demo", None, docs_cfg)
    except GoatCounterConfigError as exc:
        assert "documentation_url" in str(exc)
    else:
        raise AssertionError("missing documentation URL should fail")

    monkeypatch.delenv("GOATCOUNTER_API_KEY_DEMO", raising=False)
    try:
        settings_from_project("demo", "https://docs.example.org/", docs_cfg)
    except GoatCounterConfigError as exc:
        assert "GOATCOUNTER_API_KEY_DEMO is missing" in str(exc)
    else:
        raise AssertionError("missing project API key should fail")


def test_reporting_window_is_rounded_to_hour():
    period = reporting_window(1)
    assert period["start"].endswith(":00:00Z")
    assert period["end"].endswith(":00:00Z")


def test_goatcounter_response_parsing():
    total = parse_total({"count": 100, "visits": 40})
    assert total == {"page_hit_count": 100, "visitor_count": 40}
    hits = parse_hits(
        {
            "hits": [
                {"path": "/index.html", "title": "Home", "count": 7, "day": "2026-01-01"},
                {"path": "/guide.html", "count": 3, "day": "2026-01-01"},
                {
                    "path": "event:documentation-search",
                    "count": 5,
                    "event": True,
                    "day": "2026-01-01",
                },
                {
                    "path": "event:documentation-search-no-results",
                    "count": 2,
                    "event": True,
                    "day": "2026-01-01",
                },
                {"path": "event:documentation-404:/missing.html", "count": 4, "event": True},
            ]
        }
    )
    assert hits["trend"] == [{"date": "2026-01-01", "count": 10}]
    assert hits["popular_pages"][0]["path"] == "/index.html"
    assert hits["search_count"] == 5
    assert hits["no_result_search_count"] == 2
    assert hits["not_found_count"] == 4
    assert hits["not_found_pages"] == [{"path": "/missing.html", "count": 4}]
    refs = parse_toprefs({"toprefs": [{"referrer": "github.com", "count": 8}]})
    assert refs == [{"referrer": "github.com", "count": 8}]


def test_goatcounter_official_total_response_parsing():
    total = parse_total(
        {
            "total": 17,
            "total_events": 5,
            "total_utc": 18,
            "stats": [],
        }
    )
    assert total["visitor_count"] == 12
    assert total["page_hit_count"] is None
    assert total["total"] == 17
    assert total["total_events"] == 5
    assert total["total_utc"] == 18
    assert parse_total({"total": 2, "total_events": 5, "total_utc": 2, "stats": []})[
        "visitor_count"
    ] == 0


def test_goatcounter_official_hits_and_toprefs_response_parsing():
    hits = parse_hits(
        {
            "hits": [
                {
                    "count": 10,
                    "path_id": 1,
                    "path": "/docs/page/",
                    "event": False,
                    "title": "Page",
                    "stats": [
                        {
                            "day": "2026-06-20",
                            "hourly": [],
                            "daily": 10,
                            "weekly": 10,
                            "monthly": 10,
                        }
                    ],
                },
                {
                    "count": 3,
                    "path_id": 2,
                    "path": "event:documentation-search",
                    "event": True,
                    "title": "Documentation search",
                    "stats": [{"day": "2026-06-20", "daily": 3}],
                },
                {
                    "count": 2,
                    "path_id": 3,
                    "path": "event:documentation-404:/missing/",
                    "event": True,
                    "title": "Documentation 404",
                    "stats": [{"day": "2026-06-21", "daily": 2}],
                },
            ],
            "total": 15,
            "more": False,
        }
    )
    assert hits["trend"] == [{"date": "2026-06-20", "count": 10}]
    assert hits["popular_pages"] == [{"path": "/docs/page/", "title": "Page", "count": 10}]
    assert hits["search_count"] == 3
    assert hits["not_found_pages"] == [{"path": "/missing/", "count": 2}]
    refs = parse_toprefs({"stats": [{"id": "example", "name": "Example", "count": 4}]})
    assert refs == [{"referrer": "Example", "count": 4}]


def test_goatcounter_malformed_response():
    try:
        parse_total([])
    except GoatCounterAPIError:
        pass
    else:
        raise AssertionError("malformed total should fail")
    try:
        parse_hits({"hits": ["bad"]})
    except GoatCounterAPIError:
        pass
    else:
        raise AssertionError("malformed hits should fail")


class FakeResponse:
    def __init__(self, payload, headers=None):
        self.payload = payload
        self.headers = headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


def test_goatcounter_fetch_uses_authorization_and_three_requests(monkeypatch):
    calls = []
    payloads = [
        {"total": 10, "total_events": 4, "total_utc": 10, "stats": []},
        {"hits": [{"path": "/index.html", "count": 10, "day": "2026-01-01"}]},
        {"stats": [{"name": "github.com", "count": 3}]},
    ]

    def fake_urlopen(request, timeout):
        calls.append((request, timeout))
        return FakeResponse(payloads[len(calls) - 1], {"X-Rate-Limit-Remaining": "99"})

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    data = fetch_goatcounter_analytics(
        period_months=1,
        settings=GoatCounterSettings(
            api_key="secret-token",
            site_url="https://example.goatcounter.com",
            tracked_domain="docs.example.org",
        ),
    )
    assert data["requests_used"] == 3
    assert data["visitor_count"] == 6
    assert data["page_hit_count"] is None
    assert calls[0][0].headers["Authorization"] == "Bearer secret-token"
    assert all(call[1] == 20 for call in calls)


def test_goatcounter_hits_pagination_collects_later_events(monkeypatch):
    calls = []
    payloads = [
        {"hits": [{"path_id": 1, "path": "/one", "count": 1}], "more": True},
        {
            "hits": [
                {
                    "path_id": 2,
                    "path": "event:documentation-search-no-results",
                    "event": True,
                    "count": 3,
                }
            ],
            "more": False,
        },
    ]

    def fake_get_json(self, endpoint, params):
        calls.append((endpoint, params))
        return payloads[len(calls) - 1]

    monkeypatch.setattr(GoatCounterClient, "get_json", fake_get_json)
    client = GoatCounterClient(
        GoatCounterSettings(
            api_key="secret-token",
            site_url="https://example.goatcounter.com",
            tracked_domain="docs.example.org",
        )
    )
    data = fetch_paginated_hits(client, reporting_window(1), limit=1, max_pages=4)
    assert data["popular_pages"] == [{"path": "/one", "title": "/one", "count": 1}]
    assert data["no_result_search_count"] == 3
    assert data["partial"] is False
    assert calls[1][1]["exclude_paths"] == ["1"]


def test_goatcounter_hits_pagination_encodes_exclude_paths_url(monkeypatch):
    captured_urls = []

    def fake_urlopen(request, timeout):
        captured_urls.append(request.full_url)
        if len(captured_urls) == 1:
            payload = {"hits": [{"path_id": 1, "path": "/one", "count": 1}], "more": True}
        else:
            payload = {
                "hits": [
                    {
                        "path_id": 2,
                        "path": "event:documentation-search-no-results",
                        "event": True,
                        "count": 3,
                    }
                ],
                "more": False,
            }
        return FakeResponse(payload)

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    client = GoatCounterClient(
        GoatCounterSettings(
            api_key="secret-token",
            site_url="https://example.goatcounter.com",
            tracked_domain="docs.example.org",
        )
    )
    fetch_paginated_hits(client, reporting_window(1), limit=1, max_pages=4)
    assert "exclude_paths=1" in captured_urls[1]
    assert "exclude=" not in captured_urls[1]


def test_goatcounter_hits_pagination_marks_partial_on_budget(monkeypatch):
    calls = []

    def fake_get_json(self, endpoint, params):
        calls.append(params)
        return {
            "hits": [{"path_id": len(calls), "path": f"/{len(calls)}", "count": 1}],
            "more": True,
        }

    monkeypatch.setattr(GoatCounterClient, "get_json", fake_get_json)
    client = GoatCounterClient(
        GoatCounterSettings(
            api_key="secret-token",
            site_url="https://example.goatcounter.com",
            tracked_domain="docs.example.org",
        )
    )
    data = fetch_paginated_hits(client, reporting_window(1), limit=1, max_pages=2)
    assert data["partial"] is True
    assert data["pages_requested"] == 2
    assert len(calls) == 2


def test_goatcounter_http_errors_are_sanitized(monkeypatch):
    def fake_urlopen(request, timeout):
        raise urllib.error.HTTPError(
            request.full_url,
            401,
            "Unauthorized",
            {},
            io.BytesIO(b'{"message":"bad token"}'),
        )

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    client = GoatCounterClient(
        GoatCounterSettings(
            api_key="secret-token",
            site_url="https://example.goatcounter.com",
            tracked_domain="docs.example.org",
        )
    )
    try:
        client.get_json("/stats/total", {})
    except GoatCounterAPIError as exc:
        assert "secret-token" not in str(exc)
        assert "Authorization" not in str(exc)
        assert "HTTP 401" in str(exc)
        assert exc.http_status == 401
        assert exc.endpoint == "/stats/total"
        assert exc.requests_used == 1
    else:
        raise AssertionError("HTTP error should fail")


def test_goatcounter_http_error_classes_are_preserved(monkeypatch):
    expected = {
        401: "missing or incorrect API key",
        403: "insufficient permission",
        429: "rate limited",
        500: "temporary provider error",
    }

    for status, reason in expected.items():
        def fake_urlopen(request, timeout, status=status):
            raise urllib.error.HTTPError(
                request.full_url,
                status,
                "error",
                {},
                io.BytesIO(b"{}"),
            )

        monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
        client = GoatCounterClient(
            GoatCounterSettings(
                api_key="secret-token",
                site_url="https://example.goatcounter.com",
                tracked_domain="docs.example.org",
            ),
            max_retries=1,
        )
        try:
            client.get_json("/stats/hits", {})
        except GoatCounterAPIError as exc:
            assert exc.http_status == status
            assert exc.requests_used == 1
            assert reason in str(exc)
            assert "secret-token" not in str(exc)
        else:
            raise AssertionError(f"HTTP {status} should fail")


def test_doctor_command_does_not_print_secrets(tmp_path: Path, monkeypatch, capsys):
    project_dir = tmp_path / "projects"
    project_dir.mkdir()
    project = project_dir / "test.yml"
    project.write_text(
        """
project:
  id: demo
  name: Demo
  repository: owner/repo
  documentation_url: https://docs.example.org/path/
sources:
  github:
    enabled: false
  documentation_analytics:
    provider: goatcounter
    enabled: true
    site_url: https://example.goatcounter.com
""",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GOATCOUNTER_API_KEY_DEMO", "secret-token")
    monkeypatch.setattr(
        GoatCounterClient,
        "get_json",
        lambda self, endpoint, params: {
            "/stats/total": {
                "total": 1,
                "total_events": 0,
                "total_utc": 1,
                "stats": [],
            },
            "/stats/hits": {"hits": [], "more": False},
            "/stats/toprefs": {"stats": []},
        }[endpoint],
    )
    assert main(["doctor", "--project", "projects/test.yml"]) == 0
    output = capsys.readouterr().out
    assert "Project config: valid" in output
    assert "GoatCounter API key: configured" in output
    assert "GoatCounter total endpoint: available" in output
    assert "GoatCounter hits endpoint: available" in output
    assert "GoatCounter toprefs endpoint: available" in output
    assert "secret-token" not in output


def test_doctor_command_reports_sanitized_total_schema_error(
    tmp_path: Path,
    monkeypatch,
    capsys,
):
    project_dir = tmp_path / "projects"
    project_dir.mkdir()
    project = project_dir / "test.yml"
    project.write_text(
        """
project:
  id: demo
  name: Demo
  repository: owner/repo
  documentation_url: https://docs.example.org/
sources:
  github:
    enabled: false
  documentation_analytics:
    provider: goatcounter
    enabled: true
    site_url: https://example.goatcounter.com
""",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GOATCOUNTER_API_KEY_DEMO", "secret-token")
    monkeypatch.setattr(GoatCounterClient, "get_json", lambda self, endpoint, params: {"count": 1})
    assert main(["doctor", "--project", "projects/test.yml"]) == 1
    output = capsys.readouterr().out
    assert "GoatCounter API: error" in output
    assert "GoatCounter /stats/total schema error" in output
    assert "secret-token" not in output
    assert "Authorization" not in output


def test_documentation_hostname_validation():
    assert (
        validate_documentation_hostname("https://docs.example.org/en/latest/", "docs.example.org")
        == "docs.example.org"
    )
    for url, tracked in [
        ("https://other.example.org/", "docs.example.org"),
        (None, "docs.example.org"),
        ("not-a-url", "docs.example.org"),
    ]:
        try:
            validate_documentation_hostname(url, tracked)
        except GoatCounterConfigError:
            pass
        else:
            raise AssertionError(f"host validation accepted {url!r} / {tracked!r}")
