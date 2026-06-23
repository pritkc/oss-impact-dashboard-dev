"""Tests for OpenSSF Scorecard collector and security metrics."""
from unittest.mock import patch, MagicMock

from oss_impact_dashboard.collectors.openssf_scorecard import fetch_openssf_scorecard
from oss_impact_dashboard.metrics.security import build_security


def test_fetch_returns_none_for_404():
    """404 response returns None (repo not in Scorecard database)."""
    import urllib.error
    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="https://api.scorecard.dev/projects/github.com/test/repo",
            code=404,
            msg="Not Found",
            hdrs=None,
            fp=None,
        )
        result = fetch_openssf_scorecard("test", "repo")
        assert result is None


def test_fetch_parses_response():
    """200 response is parsed correctly."""
    sample_payload = {
        "score": 7.5,
        "checks": [
            {"name": "Code-Review", "score": 8, "reason": "All changes reviewed", "details": []},
            {"name": "Maintained", "score": 9, "reason": "Actively maintained", "details": []},
        ],
        "repo": {"uri": "github.com/test/repo", "commit": "abc123"},
        "date": "2026-06-01",
        "scorecard": {"version": "v5.0.0"},
    }
    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_response = MagicMock()
        mock_response.read.return_value = __import__("json").dumps(sample_payload).encode()
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        result = fetch_openssf_scorecard("test", "repo")
        assert result is not None
        assert result["score"] == 7.5
        assert len(result["checks"]) == 2
        assert result["checks"][0]["name"] == "Code-Review"
        assert result["commit"] == "abc123"
        assert result["commit_date"] == "2026-06-01"
        assert result["scorecard_version"] == "v5.0.0"


def test_build_security_no_data():
    """No scorecard data → available=False."""
    result = build_security(None)
    assert result["available"] is False
    assert result["score"] is None
    assert result["checks"] == []


def test_build_security_with_data():
    """Scorecard data → available=True, score and checks populated."""
    scorecard_raw = {
        "score": 7.5,
        "checks": [
            {"name": "Code-Review", "score": 8, "reason": "Reviewed", "details": []},
            {"name": "Maintained", "score": 9, "reason": "Active", "details": []},
            {"name": "Vulnerabilities", "score": 10, "reason": "No vulns", "details": []},
            {"name": "Security-Policy", "score": 5, "reason": "Missing", "details": []},
        ],
        "commit": "abc123",
        "commit_date": "2026-06-01",
        "scorecard_version": "v5.0.0",
    }
    result = build_security(scorecard_raw)
    assert result["available"] is True
    assert result["score"] == 7.5
    assert len(result["checks"]) >= 4
    assert result["vulnerabilities"] == 10
    assert result["security_policy"] == 5
    assert result["maintained"] == 9


def test_build_security_extracts_key_checks():
    """Key checks are extracted by name."""
    scorecard_raw = {
        "score": 6.0,
        "checks": [
            {"name": "Code-Review", "score": 7, "reason": "ok", "details": []},
            {"name": "CII-Best-Practices", "score": 3, "reason": "in_progress", "details": []},
        ],
        "commit": None,
        "commit_date": None,
        "scorecard_version": "v5.0.0",
    }
    result = build_security(scorecard_raw)
    check_names = [c["name"] for c in result["checks"]]
    assert "Code-Review" in check_names
    assert result["cii_badge_level"] == "in_progress"
