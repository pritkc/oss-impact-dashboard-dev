from __future__ import annotations

import json
from pathlib import Path

from oss_impact_dashboard.cli import main
from oss_impact_dashboard.config import discover_project_paths, load_project_config


def _write_project(project_dir: Path, project_id: str, name: str) -> Path:
    path = project_dir / f"{project_id}.yml"
    path.write_text(
        f"""
project:
  id: {project_id}
  name: {name}
  repository: owner/{project_id}
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
    return path


def test_discover_project_paths_defaults_to_all_yaml_files(tmp_path: Path, monkeypatch):
    project_dir = tmp_path / "projects"
    project_dir.mkdir()
    _write_project(project_dir, "alpha", "Alpha")
    _write_project(project_dir, "beta", "Beta")
    monkeypatch.chdir(tmp_path)

    discovered = discover_project_paths()
    assert [path.as_posix() for path in discovered] == [
        "projects/alpha.yml",
        "projects/beta.yml",
    ]


def test_build_index_discovers_all_projects_when_projects_omitted(
    tmp_path: Path, monkeypatch
):
    project_dir = tmp_path / "projects"
    project_dir.mkdir()
    _write_project(project_dir, "alpha", "Alpha")
    _write_project(project_dir, "beta", "Beta")
    manual = tmp_path / "manual"
    manual.mkdir()
    output_dir = tmp_path / "data"
    monkeypatch.chdir(tmp_path)

    assert main(["build-index", "--safe-project", "--output-dir", str(output_dir)]) == 0

    manifest = json.loads((output_dir / "projects.json").read_text(encoding="utf-8"))
    assert [entry["id"] for entry in manifest["projects"]] == ["alpha", "beta"]


def test_build_index_from_cache_rebuilds_manifest(tmp_path: Path, monkeypatch):
    project_dir = tmp_path / "projects"
    project_dir.mkdir()
    _write_project(project_dir, "demo", "Demo")
    output_dir = tmp_path / "data"
    projects_dir = output_dir / "projects"
    projects_dir.mkdir(parents=True)
    cached = {
        "project": {
            "id": "demo",
            "name": "Demo",
            "repository": "owner/demo",
            "environment": "production",
        },
        "items": [{"id": "item-1"}],
    }
    (projects_dir / "demo.json").write_text(json.dumps(cached), encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    assert (
        main(
            [
                "build-index",
                "--from-cache",
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
    assert manifest["projects"][0]["id"] == "demo"
    dashboard = json.loads((output_dir / "dashboard.json").read_text(encoding="utf-8"))
    assert dashboard["project"]["id"] == "demo"


def test_build_index_from_cache_errors_when_dataset_missing(tmp_path: Path, monkeypatch):
    project_dir = tmp_path / "projects"
    project_dir.mkdir()
    _write_project(project_dir, "demo", "Demo")
    output_dir = tmp_path / "data"
    monkeypatch.chdir(tmp_path)

    try:
        main(
            [
                "build-index",
                "--from-cache",
                "--projects",
                "projects/demo.yml",
                "--safe-project",
                "--output-dir",
                str(output_dir),
            ]
        )
    except SystemExit as exc:
        assert exc.code != 0
    else:
        raise AssertionError("expected build-index --from-cache to fail without cached JSON")


def test_list_projects_command(tmp_path: Path, monkeypatch, capsys):
    project_dir = tmp_path / "projects"
    project_dir.mkdir()
    _write_project(project_dir, "alpha", "Alpha")
    monkeypatch.chdir(tmp_path)

    assert main(["list-projects"]) == 0
    assert capsys.readouterr().out.strip() == "projects/alpha.yml"


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
                "--output-dir",
                str(output_dir),
            ]
        )
        == 0
    )
    dataset = json.loads((output_dir / "projects" / "example.json").read_text(encoding="utf-8"))
    assert dataset["project"]["id"] == "example"
    assert "targets_progress" not in dataset
    assert "manual" not in dataset.get("impact", {})


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
