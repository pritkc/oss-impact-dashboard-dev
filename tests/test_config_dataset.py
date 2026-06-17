from pathlib import Path

from oss_impact_dashboard.build_dataset import build_dataset
from oss_impact_dashboard.config import load_project_config


def test_config_validation(tmp_path: Path):
    path = tmp_path / "project.yml"
    path.write_text(
        "project:\n  id: demo\n  name: Demo\n  repository: owner/repo\n",
        encoding="utf-8",
    )
    config = load_project_config(path)
    assert config.owner_repo == ("owner", "repo")
    assert config.stale_days == 90


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
    assert data["schema_version"] == 1
    assert data["source_status"]["github"]["status"] == "unavailable"
    assert data["items"] == []
