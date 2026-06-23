"""Tests for community standards compliance metrics."""
from oss_impact_dashboard.metrics.community import build_community_standards


def test_build_community_no_data():
    """No data → available=False."""
    result = build_community_standards(None)
    assert result["available"] is False
    assert result["compliance_score"] is None
    assert result["checks"] == []


def test_build_community_all_present():
    """All core standards present → compliance_score == 1.0."""
    community_raw = {
        "readme": {"name": "README.md", "path": "README.md"},
        "contributing_guidelines": {"name": "CONTRIBUTING.md", "path": "CONTRIBUTING.md"},
        "code_of_conduct": {"name": "Code of Conduct", "key": "contributor_covenant"},
        "license_info": {"name": "GPL-3.0", "spdxId": "GPL-3.0-only"},
        "security_policy": {"name": "SECURITY.md", "path": "SECURITY.md"},
        "issue_templates": [{"name": "Bug", "filename": "bug.md"}],
        "pull_request_templates": [{"filename": "pull_request_template.md"}],
        "topics": ["mimetic", "pde"],
        "description": "MOLE library",
        "homepage_url": "https://mole.example",
    }
    result = build_community_standards(community_raw)
    assert result["available"] is True
    assert result["compliance_score"] == 1.0
    assert len(result["checks"]) == 8
    assert all(c["present"] for c in result["checks"])


def test_build_community_partial():
    """Some missing → correct compliance score."""
    community_raw = {
        "readme": {"name": "README.md"},
        "license_info": {"name": "GPL-3.0", "spdxId": "GPL-3.0-only"},
    }
    result = build_community_standards(community_raw)
    assert result["available"] is True
    assert result["compliance_score"] == 0.4  # 2/5


def test_build_community_extracts_topics():
    """Topics list is returned."""
    community_raw = {
        "readme": {"name": "README.md"},
        "topics": ["mimetic", "pde", "numerical-methods"],
    }
    result = build_community_standards(community_raw)
    assert result["topics"] == ["mimetic", "pde", "numerical-methods"]
