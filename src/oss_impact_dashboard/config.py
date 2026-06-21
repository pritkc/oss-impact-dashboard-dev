from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

VALID_ENVIRONMENTS = {"development", "staging", "production"}


@dataclass(frozen=True)
class ProjectConfig:
    id: str
    name: str
    repository: str
    environment: str
    documentation_url: str | None
    citation_url: str | None
    sources: dict[str, Any]
    reporting: dict[str, Any]
    label_aliases: dict[str, str]
    core_contributors: list[str]
    priority_label_patterns: list[str]

    @property
    def owner_repo(self) -> tuple[str, str]:
        if "/" not in self.repository:
            raise ValueError("project.repository must use owner/name format")
        owner, repo = self.repository.split("/", 1)
        return owner, repo

    @property
    def stale_days(self) -> int:
        return int(self.reporting.get("stale_days", 90))

    @property
    def period_months(self) -> int:
        return int(self.reporting.get("default_period_months", 12))

    @property
    def freshness_warning_hours(self) -> int:
        return int(self.reporting.get("freshness_warning_hours", 48))


def load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(path)
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a YAML object")
    return data


def validate_project_path(path: str | Path, *, root: str | Path = ".") -> Path:
    root_path = Path(root).resolve()
    candidate = Path(path)
    if candidate.is_absolute():
        raise ValueError("Project config must be a relative path inside projects/")
    if not candidate.parts or candidate.parts[0] != "projects":
        raise ValueError("Project config must be inside projects/")
    resolved = (root_path / candidate).resolve()
    projects_dir = (root_path / "projects").resolve()
    if projects_dir not in resolved.parents:
        raise ValueError("Project config path traversal is not allowed")
    if resolved.suffix not in {".yml", ".yaml"}:
        raise ValueError("Project config must be a YAML file")
    if not resolved.exists():
        raise FileNotFoundError(candidate)
    return resolved


def load_project_config(path: str | Path) -> ProjectConfig:
    raw = load_yaml(Path(path))
    project = raw.get("project") or {}
    missing = [key for key in ("id", "name", "repository") if not project.get(key)]
    if missing:
        raise ValueError(f"Missing required project fields: {', '.join(missing)}")
    environment = str(project.get("environment") or "production")
    if environment not in VALID_ENVIRONMENTS:
        allowed = ", ".join(sorted(VALID_ENVIRONMENTS))
        raise ValueError(f"project.environment must be one of: {allowed}")

    return ProjectConfig(
        id=str(project["id"]),
        name=str(project["name"]),
        repository=str(project["repository"]),
        environment=environment,
        documentation_url=project.get("documentation_url"),
        citation_url=project.get("citation_url"),
        sources=raw.get("sources") or {},
        reporting=raw.get("reporting") or {},
        label_aliases=raw.get("label_aliases") or {},
        core_contributors=raw.get("core_contributors") or [],
        priority_label_patterns=raw.get("priority_label_patterns") or ["priority", "urgent"],
    )


def source_enabled(config: ProjectConfig, source: str) -> bool:
    return bool((config.sources.get(source) or {}).get("enabled"))
