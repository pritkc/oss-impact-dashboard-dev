"""Tests for governance health metrics."""
from oss_impact_dashboard.metrics.governance import build_governance


def test_governance_with_full_data():
    """All governance signals present → score computed."""
    community_standards = {
        "available": True,
        "compliance_score": 1.0,
        "checks": [
            {"label": "README", "present": True},
            {"label": "CONTRIBUTING", "present": True},
            {"label": "CODE_OF_CONDUCT", "present": True},
            {"label": "LICENSE", "present": True},
            {"label": "SECURITY", "present": True},
        ],
    }
    contributors = {
        "bus_factor": 3,
        "core_contributors_configured": True,
        "external_contributor_share": 0.4,
    }
    security = {
        "available": True,
        "score": 7.5,
        "checks": [{"name": "Security-Policy", "score": 5}],
    }
    result = build_governance(None, community_standards, contributors, security)
    assert result["available"] is True
    assert result["governance_score"] is not None
    assert result["has_code_of_conduct"] is True
    assert result["has_contributing_guidelines"] is True
    assert result["has_license"] is True
    assert result["bus_factor"] == 3
    assert result["openssf_score"] == 7.5


def test_governance_with_no_data():
    """No data → available=True but score=None."""
    result = build_governance(None, None, None, None)
    assert result["available"] is True
    assert result["governance_score"] is not None
    assert result["has_code_of_conduct"] is False
    assert result["bus_factor"] is None


def test_governance_low_bus_factor():
    """Bus factor < 3 → not counted as healthy."""
    community_standards = {"checks": []}
    contributors = {"bus_factor": 1, "core_contributors_configured": False}
    security = {"available": False, "checks": []}
    result = build_governance(None, community_standards, contributors, security)
    assert result["bus_factor"] == 1
