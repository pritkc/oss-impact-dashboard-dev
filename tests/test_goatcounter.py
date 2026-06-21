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
    parse_hits,
    parse_toprefs,
    parse_total,
    reporting_window,
    settings_from_env,
)


def test_goatcounter_configuration_validation(monkeypatch):
    monkeypatch.setenv("GOATCOUNTER_API_KEY", "secret-token")
    monkeypatch.setenv("GOATCOUNTER_SITE_URL", "https://example.goatcounter.com/")
    monkeypatch.setenv("GOATCOUNTER_TRACKED_DOMAIN", "docs.example.org")
    settings = settings_from_env()
    assert settings.site_url == "https://example.goatcounter.com"
    assert settings.api_base == "https://example.goatcounter.com/api/v0"
    assert settings.count_endpoint == "https://example.goatcounter.com/count"
    monkeypatch.setenv("GOATCOUNTER_SITE_URL", "http://example.goatcounter.com")
    try:
        settings_from_env()
    except GoatCounterConfigError as exc:
        assert "HTTPS" in str(exc)
    else:
        raise AssertionError("insecure site URL should fail")
    monkeypatch.setenv("GOATCOUNTER_SITE_URL", "https://example.goatcounter.com")
    monkeypatch.setenv("GOATCOUNTER_TRACKED_DOMAIN", "https://docs.example.org")
    try:
        settings_from_env()
    except GoatCounterConfigError as exc:
        assert "hostname" in str(exc)
    else:
        raise AssertionError("full tracked URL should fail")


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
        {"count": 10, "visits": 6},
        {"hits": [{"path": "/index.html", "count": 10, "day": "2026-01-01"}]},
        {"toprefs": [{"referrer": "github.com", "count": 3}]},
    ]

    def fake_urlopen(request, timeout):
        calls.append((request, timeout))
        return FakeResponse(payloads[len(calls) - 1], {"X-RateLimit-Remaining": "99"})

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
    assert calls[0][0].headers["Authorization"] == "Bearer secret-token"
    assert all(call[1] == 20 for call in calls)


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
    else:
        raise AssertionError("HTTP error should fail")


def test_doctor_command_does_not_print_secrets(tmp_path: Path, monkeypatch, capsys):
    project_dir = tmp_path / "projects"
    project_dir.mkdir()
    project = project_dir / "dev.yml"
    project.write_text(
        """
project:
  id: demo
  name: Demo
  repository: owner/repo
sources:
  github:
    enabled: false
  documentation_analytics:
    provider: goatcounter
    enabled: true
""",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GOATCOUNTER_API_KEY", "secret-token")
    monkeypatch.setenv("GOATCOUNTER_SITE_URL", "https://example.goatcounter.com")
    monkeypatch.setenv("GOATCOUNTER_TRACKED_DOMAIN", "docs.example.org")
    monkeypatch.setattr(GoatCounterClient, "get_json", lambda self, endpoint, params: {"count": 1})
    assert main(["doctor", "--project", "projects/dev.yml"]) == 0
    output = capsys.readouterr().out
    assert "Project config: valid" in output
    assert "GoatCounter API key: configured" in output
    assert "secret-token" not in output
