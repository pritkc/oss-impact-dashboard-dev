from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True)
class ProjectConfig:
    id: str
    name: str
    repository: str
    documentation_url: str | None
    citation_url: str | None
    sources: dict[str, Any]
    reporting: dict[str, Any]

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


def load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(path)
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a YAML object")
    return data


def load_project_config(path: str | Path) -> ProjectConfig:
    raw = load_yaml(Path(path))
    project = raw.get("project") or {}
    missing = [key for key in ("id", "name", "repository") if not project.get(key)]
    if missing:
        raise ValueError(f"Missing required project fields: {', '.join(missing)}")

    return ProjectConfig(
        id=str(project["id"]),
        name=str(project["name"]),
        repository=str(project["repository"]),
        documentation_url=project.get("documentation_url"),
        citation_url=project.get("citation_url"),
        sources=raw.get("sources") or {},
        reporting=raw.get("reporting") or {},
    )


def source_enabled(config: ProjectConfig, source: str) -> bool:
    return bool((config.sources.get(source) or {}).get("enabled"))

