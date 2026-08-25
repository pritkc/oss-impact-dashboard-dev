import json
from pathlib import Path

from oss_impact_dashboard.build_dataset import _try_source
from oss_impact_dashboard.cli import main
from oss_impact_dashboard.config import load_project_config
from oss_impact_dashboard.deployment_validation import deployment_dataset_errors


def _write_project(path: Path, *, environment: str = "production") -> None:
    path.write_text(
        f"""
project:
  id: demo
  name: Demo
  repository: owner/repo
  environment: {environment}
sources:
  github:
    enabled: true
  github_traffic:
    enabled: true
  openalex:
    enabled: false
  community_standards:
    enabled: false
""",
        encoding="utf-8",
    )


def _dataset(*, github_status: str = "available", items: list | None = None) -> dict:
    return {
        "project": {
            "id": "demo",
            "repository": "owner/repo",
            "environment": "production",
        },
        "source_status": {
            "github": {"status": github_status},
            "github_traffic": {"status": "available"},
        },
        "items": ["issue-1"] if items is None else items,
    }


def test_deployment_validation_rejects_failed_github_and_empty_items(tmp_path: Path):
    project = tmp_path / "project.yml"
    _write_project(project)
    config = load_project_config(project)

    errors = deployment_dataset_errors(
        _dataset(github_status="error", items=[]),
        config,
        require_github=True,
        require_items=True,
        require_production=True,
    )

    assert "GitHub source status is 'error'; expected 'available'" in errors
    assert "dataset contains zero GitHub issues or pull requests" in errors


def test_deployment_validation_allows_optional_unavailable_sources(tmp_path: Path):
    project = tmp_path / "project.yml"
    _write_project(project)
    config = load_project_config(project)
    data = _dataset()
    data["source_status"]["openalex"] = {"status": "unavailable"}

    assert deployment_dataset_errors(data, config, require_production=True) == []


def test_deployment_validation_rejects_enabled_source_errors(tmp_path: Path):
    project = tmp_path / "project.yml"
    _write_project(project)
    config = load_project_config(project)
    data = _dataset()
    data["source_status"]["github_traffic"] = {
        "status": "error",
        "message": "401 Bad credentials",
    }

    errors = deployment_dataset_errors(data, config)

    assert "enabled source 'github_traffic' is in error: 401 Bad credentials" in errors


def test_try_source_marks_explicit_unavailable_payload():
    data, status = _try_source(
        "github_security",
        True,
        lambda: {"available": False, "message": "Bad credentials", "requests_used": 1},
        source_url="https://api.github.com/example",
        limitation="test",
    )

    assert data["available"] is False
    assert status["status"] == "unavailable"
    assert status["message"] == "Bad credentials"
    assert status["requests_used"] == 1


def test_validate_dataset_cli_returns_failure_for_publish_blockers(tmp_path: Path, capsys):
    project = tmp_path / "project.yml"
    _write_project(project)
    dataset = tmp_path / "dashboard.json"
    dataset.write_text(
        json.dumps(_dataset(github_status="unavailable", items=[])),
        encoding="utf-8",
    )

    # The CLI intentionally requires project paths under projects/. Copy the fixture into
    # the repository fixture directory is not needed for the validator unit tests above;
    # exercise the parser and output with the real safe project config instead.
    result = main(
        [
            "validate-dataset",
            "--project",
            "projects/mole.yml",
            "--dataset",
            str(dataset),
            "--require-github",
            "--require-items",
        ]
    )

    assert result == 1
    assert "Dataset validation failed" in capsys.readouterr().out
