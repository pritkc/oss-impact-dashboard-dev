from __future__ import annotations

import json
from pathlib import Path

from oss_impact_dashboard.cli import main
from oss_impact_dashboard.config import load_project_config


def test_build_index_writes_manifest_and_per_project_datasets(tmp_path: Path, monkeypatch):
    project_dir = tmp_path / "projects"
    project_dir.mkdir()
    project = project_dir / "demo.yml"
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
    enabled: false
""",
        encoding="utf-8",
    )
    manual = tmp_path / "manual"
    manual.mkdir()
    output_dir = tmp_path / "data"
    monkeypatch.chdir(tmp_path)

    assert (
        main(
            [
                "build-index",
                "--projects",
                "projects/demo.yml",
                "--safe-project",
                "--output-dir",
                str(output_dir),
            ]
        )
        == 0
    )

    manifest = json.loads((output_dir / "projects.json").read_text(encoding="utf-8"))
    assert manifest["default_project"] == "demo"
    assert manifest["projects"] == [
        {
            "id": "demo",
            "name": "Demo",
            "repository": "owner/repo",
            "environment": "production",
        }
    ]
    assert (output_dir / "projects" / "demo.json").exists()
    assert (output_dir / "dashboard.json").exists()
    dataset = json.loads((output_dir / "projects" / "demo.json").read_text(encoding="utf-8"))
    assert dataset["project"]["id"] == "demo"


def test_tracker_config_command_prints_project_tracker_settings(
    tmp_path: Path,
    monkeypatch,
    capsys,
):
    project_dir = tmp_path / "projects"
    project_dir.mkdir()
    project = project_dir / "demo.yml"
    project.write_text(
        """
project:
  id: demo
  name: Demo
  repository: owner/repo
  documentation_url: https://docs.example.org/
sources:
  documentation_analytics:
    provider: goatcounter
    enabled: true
    site_url: https://example.goatcounter.com
""",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    assert main(["tracker-config", "--project", "projects/demo.yml"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload == {
        "site_url": "https://example.goatcounter.com",
        "tracked_domain": "docs.example.org",
    }


def test_example_project_validates_and_builds_without_secrets(tmp_path: Path, monkeypatch):
    manual = tmp_path / "manual"
    manual.mkdir()
    (manual / "project-data.yml").write_text("accomplishments: []\n", encoding="utf-8")
    (manual / "case-studies.yml").write_text("case_studies: []\n", encoding="utf-8")
    output_dir = tmp_path / "data"
    monkeypatch.chdir(Path.cwd())

    assert main(["validate-project", "--project", "projects/example.yml"]) == 0
    assert (
        main(
            [
                "build-index",
                "--projects",
                "projects/example.yml",
                "--safe-project",
                "--manual-root",
                str(manual),
                "--output-dir",
                str(output_dir),
            ]
        )
        == 0
    )
    dataset = json.loads((output_dir / "projects" / "example.json").read_text(encoding="utf-8"))
    assert dataset["project"]["id"] == "example"


def test_mole_project_config_is_official():
    config = load_project_config(Path("projects/mole.yml"))
    assert config.repository == "csrc-sdsu/mole"
    assert config.documentation_url == "https://mole-docs.readthedocs.io"
    assert config.sources["documentation_analytics"]["site_url"]


def test_mole_local_project_config_targets_fork():
    config = load_project_config(Path("projects/mole-local.yml"))
    assert config.repository == "pritkc/mole"
    assert config.environment == "development"
    assert config.documentation_url == "https://mole-docs.readthedocs.io"
