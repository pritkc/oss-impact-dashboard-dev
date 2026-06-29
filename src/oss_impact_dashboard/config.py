from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

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


def discover_project_paths(explicit: list[str] | None = None) -> list[Path]:
    if explicit:
        return [validate_project_path(path) for path in explicit]
    return sorted(Path("projects").glob("*.yml"))


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
    missing = [key for key in ("id", "repository") if not project.get(key)]
    if missing:
        raise ValueError(f"Missing required project fields: {', '.join(missing)}")
    repo_name = str(project["repository"]).split("/")[-1]
    display_name = str(project.get("name") or project.get("id") or repo_name)
    environment = str(project.get("environment") or "production")
    if environment not in VALID_ENVIRONMENTS:
        allowed = ", ".join(sorted(VALID_ENVIRONMENTS))
        raise ValueError(f"project.environment must be one of: {allowed}")

    return ProjectConfig(
        id=str(project["id"]),
        name=display_name,
        repository=str(project["repository"]),
        environment=environment,
        documentation_url=project.get("documentation_url"),
        citation_url=project.get("citation_url"),
        sources=raw.get("sources") or {},
        reporting=raw.get("reporting") or {},
    )


def source_enabled(config: ProjectConfig, source: str) -> bool:
    return bool((config.sources.get(source) or {}).get("enabled"))


def documentation_analytics_config(config: ProjectConfig) -> dict[str, Any]:
    return config.sources.get("documentation_analytics") or {}


def goatcounter_site_url(config: ProjectConfig) -> str | None:
    value = documentation_analytics_config(config).get("site_url")
    return str(value) if value else None


def tracker_config_for_project(config: ProjectConfig) -> dict[str, str]:
    hostname = ""
    if config.documentation_url:
        parsed = urlparse(config.documentation_url)
        hostname = (parsed.hostname or "").lower()
    return {
        "site_url": goatcounter_site_url(config) or "",
        "tracked_domain": hostname,
    }
