from __future__ import annotations

import os


def project_env_suffix(project_id: str) -> str:
    return project_id.upper().replace("-", "_")


def _resolve_credential(
    prefixed_name: str,
    fallback_name: str,
    *,
    project_count: int,
) -> str | None:
    value = os.environ.get(prefixed_name)
    if value:
        return value
    if project_count == 1:
        return os.environ.get(fallback_name)
    return None


def _credential_label(
    prefixed_name: str,
    fallback_name: str,
    *,
    project_count: int,
) -> str:
    if os.environ.get(prefixed_name):
        return prefixed_name
    if project_count == 1 and os.environ.get(fallback_name):
        return fallback_name
    return "missing"


def github_token_env_names(project_id: str) -> tuple[str, ...]:
    suffix = project_env_suffix(project_id)
    return (f"GITHUB_TOKEN_{suffix}",)


def github_token_for_project(project_id: str, *, project_count: int = 1) -> str | None:
    suffix = project_env_suffix(project_id)
    return _resolve_credential(
        f"GITHUB_TOKEN_{suffix}",
        "GITHUB_TOKEN",
        project_count=project_count,
    )


def goatcounter_api_key_env_names(project_id: str) -> tuple[str, ...]:
    suffix = project_env_suffix(project_id)
    return (f"GOATCOUNTER_API_KEY_{suffix}",)


def goatcounter_api_key_for_project(project_id: str, *, project_count: int = 1) -> str | None:
    suffix = project_env_suffix(project_id)
    return _resolve_credential(
        f"GOATCOUNTER_API_KEY_{suffix}",
        "GOATCOUNTER_API_KEY",
        project_count=project_count,
    )


def credential_source_label(
    project_id: str,
    *,
    kind: str,
    project_count: int = 1,
) -> str:
    suffix = project_env_suffix(project_id)
    if kind == "github":
        return _credential_label(
            f"GITHUB_TOKEN_{suffix}",
            "GITHUB_TOKEN",
            project_count=project_count,
        )
    if kind == "goatcounter":
        return _credential_label(
            f"GOATCOUNTER_API_KEY_{suffix}",
            "GOATCOUNTER_API_KEY",
            project_count=project_count,
        )
    raise ValueError(f"Unsupported credential kind: {kind}")
