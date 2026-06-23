"""Tests that manual YAML files load and contain expected data."""
from pathlib import Path

from oss_impact_dashboard.collectors.manual import load_manual
from oss_impact_dashboard.metrics.impact import build_impact

MANUAL_ROOT = Path(__file__).resolve().parent.parent / "manual"


def test_project_data_yml_has_accomplishments():
    manual = load_manual(MANUAL_ROOT)
    project_data = manual.get("project_data", {})
    accomplishments = project_data.get("accomplishments", [])
    assert isinstance(accomplishments, list)
    assert len(accomplishments) >= 3


def test_project_data_yml_has_targets():
    manual = load_manual(MANUAL_ROOT)
    targets = manual.get("project_data", {}).get("targets", [])
    assert len(targets) >= 1
    for entry in targets:
        assert "year" in entry
        assert "metrics" in entry
        assert isinstance(entry["metrics"], list)
        assert len(entry["metrics"]) >= 1


def test_project_data_yml_has_risks():
    manual = load_manual(MANUAL_ROOT)
    risks = manual.get("project_data", {}).get("risks", [])
    assert len(risks) >= 1
    for risk in risks:
        assert "risk" in risk
        assert "severity" in risk
        assert "mitigation" in risk


def test_project_data_yml_has_maintainer_capacity():
    manual = load_manual(MANUAL_ROOT)
    capacity = manual.get("project_data", {}).get("maintainer_capacity", {})
    assert "allocated_hours" in capacity
    assert "volunteer_hours" in capacity


def test_case_studies_yml_has_entries():
    manual = load_manual(MANUAL_ROOT)
    case_studies = manual.get("case_studies", [])
    assert len(case_studies) >= 1


def test_case_study_has_required_fields():
    manual = load_manual(MANUAL_ROOT)
    case_studies = manual.get("case_studies", [])
    for study in case_studies:
        assert "title" in study
        assert "outcome" in study


def test_build_impact_passes_manual_data():
    manual = load_manual(MANUAL_ROOT)
    result = build_impact(None, None, manual)
    assert result["manual"]["project_data"]["accomplishments"]
    assert result["manual"]["case_studies"]
    assert "private_sources" not in result
