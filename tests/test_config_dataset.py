from pathlib import Path

from oss_impact_dashboard.build_dataset import build_dataset
from oss_impact_dashboard.config import load_project_config, validate_project_path


def test_config_validation(tmp_path: Path):
    path = tmp_path / "project.yml"
    path.write_text(
        "project:\n  id: demo\n  name: Demo\n  repository: owner/repo\n",
        encoding="utf-8",
    )
    config = load_project_config(path)
    assert config.owner_repo == ("owner", "repo")
    assert config.environment == "production"
    assert config.stale_days == 90
    assert config.label_aliases == {}


def test_config_environment_validation_and_safe_project_path(tmp_path: Path):
    project_dir = tmp_path / "projects"
    project_dir.mkdir()
    path = project_dir / "project.yml"
    path.write_text(
        "project:\n  id: demo\n  name: Demo\n  repository: owner/repo\n  environment: staging\n",
        encoding="utf-8",
    )
    assert load_project_config(path).environment == "staging"
    assert validate_project_path("projects/project.yml", root=tmp_path) == path.resolve()
    bad = project_dir / "bad.yml"
    bad.write_text(
        "project:\n  id: demo\n  name: Demo\n  repository: owner/repo\n  environment: qa\n",
        encoding="utf-8",
    )
    try:
        load_project_config(bad)
    except ValueError as exc:
        assert "project.environment" in str(exc)
    else:
        raise AssertionError("invalid environment should fail")
    for candidate in ("../project.yml", "temp/project.yml", "projects/../pyproject.toml"):
        try:
            validate_project_path(candidate, root=tmp_path)
        except (ValueError, FileNotFoundError):
            pass
        else:
            raise AssertionError(f"unsafe path accepted: {candidate}")


def test_dataset_survives_disabled_github(tmp_path: Path):
    project = tmp_path / "project.yml"
    project.write_text(
        """
project:
  id: demo
  name: Demo
  repository: owner/repo
sources:
  github:
    enabled: false
reporting:
  stale_days: 30
""",
        encoding="utf-8",
    )
    manual = tmp_path / "manual"
    manual.mkdir()
    (manual / "funding.yml").write_text("accomplishments: []\n", encoding="utf-8")
    data = build_dataset(load_project_config(project), manual_root=manual)
    assert data["schema_version"] == 4
    assert data["source_status"]["github"]["status"] == "unavailable"
    assert data["items"] == []
    assert data["project"]["environment"] == "production"
    assert data["documentation_analytics"]["status"] == "unavailable"


def test_dataset_has_source_limitations_and_single_impact_shape(tmp_path: Path):
    project = tmp_path / "project.yml"
    project.write_text(
        """
project:
  id: demo
  name: Demo
  repository: owner/repo
sources:
  github:
    enabled: false
  zenodo:
    enabled: false
  openalex:
    enabled: false
reporting:
  default_period_months: 6
  stale_days: 45
label_aliases:
  bug: Bug
""",
        encoding="utf-8",
    )
    manual = tmp_path / "manual"
    manual.mkdir()
    data = build_dataset(load_project_config(project), manual_root=manual)
    assert data["reporting_period"]["stale_days"] == 45
    assert data["source_status"]["github"]["limitation"]
    assert "zenodo" in data["impact"]


def test_dataset_uses_readthedocs_as_explicit_documentation_fallback(tmp_path: Path):
    csv_path = tmp_path / "rtd.csv"
    csv_path.write_text(
        "type,page,query,views,result_count,status\n"
        "page,/index.html,,9,,\n"
        "search,,missing,2,0,\n"
        "404,/missing.html,,5,,404\n",
        encoding="utf-8",
    )
    project = tmp_path / "project.yml"
    project.write_text(
        f"""
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
  readthedocs:
    enabled: true
    analytics_csv: {csv_path}
""",
        encoding="utf-8",
    )
    manual = tmp_path / "manual"
    manual.mkdir()
    data = build_dataset(load_project_config(project), manual_root=manual)
    assert data["documentation_analytics"]["provider"] == "readthedocs_csv"
    assert data["documentation_analytics"]["status"] == "partial"
    assert data["source_status"]["documentation_analytics"]["status"] == "partial"
    assert data["summary"]["documentation_search_count"] == 2
