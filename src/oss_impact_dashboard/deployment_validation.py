"""Validation rules for datasets that are safe to publish."""

from __future__ import annotations

from typing import Any

from oss_impact_dashboard.config import ProjectConfig


def deployment_dataset_errors(
    data: dict[str, Any],
    config: ProjectConfig,
    *,
    require_github: bool = False,
    require_items: bool = False,
    require_production: bool = False,
) -> list[str]:
    """Return publish-blocking errors without inspecting credential values."""

    errors: list[str] = []
    project = data.get("project") or {}
    if project.get("id") != config.id:
        errors.append(f"dataset project id is {project.get('id')!r}; expected {config.id!r}")
    if project.get("repository") != config.repository:
        errors.append(
            f"dataset repository is {project.get('repository')!r}; expected {config.repository!r}"
        )
    if require_production and project.get("environment") != "production":
        errors.append(
            f"dataset environment is {project.get('environment')!r}; expected 'production'"
        )
    if require_production and config.environment != "production":
        errors.append(
            f"project config environment is {config.environment!r}; expected 'production'"
        )

    statuses = data.get("source_status") or {}
    github_status = (statuses.get("github") or {}).get("status")
    if require_github and github_status != "available":
        errors.append(f"GitHub source status is {github_status!r}; expected 'available'")
    if require_items and not isinstance(data.get("items"), list):
        errors.append("dataset items is not a list")
    elif require_items and not data.get("items"):
        errors.append("dataset contains zero GitHub issues or pull requests")

    for source_name, source_config in config.sources.items():
        if not isinstance(source_config, dict) or not source_config.get("enabled"):
            continue
        status = statuses.get(source_name)
        if status is None:
            errors.append(f"enabled source {source_name!r} has no status")
        elif status.get("status") == "error":
            errors.append(
                f"enabled source {source_name!r} is in error: "
                f"{status.get('message') or 'no error message'}"
            )

    return errors
