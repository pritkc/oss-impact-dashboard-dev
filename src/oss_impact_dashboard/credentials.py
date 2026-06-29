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


def readthedocs_username_env_names(project_id: str) -> tuple[str, ...]:
    suffix = project_env_suffix(project_id)
    return (f"RTD_USERNAME_{suffix}",)


def readthedocs_password_env_names(project_id: str) -> tuple[str, ...]:
    suffix = project_env_suffix(project_id)
    return (f"RTD_PASSWORD_{suffix}",)


def readthedocs_totp_secret_env_names(project_id: str) -> tuple[str, ...]:
    suffix = project_env_suffix(project_id)
    return (f"RTD_TOTP_SECRET_{suffix}",)


def readthedocs_username_for_project(project_id: str, *, project_count: int = 1) -> str | None:
    suffix = project_env_suffix(project_id)
    return _resolve_credential(
        f"RTD_USERNAME_{suffix}",
        "RTD_USERNAME",
        project_count=project_count,
    )


def readthedocs_password_for_project(project_id: str, *, project_count: int = 1) -> str | None:
    suffix = project_env_suffix(project_id)
    return _resolve_credential(
        f"RTD_PASSWORD_{suffix}",
        "RTD_PASSWORD",
        project_count=project_count,
    )


def readthedocs_totp_secret_for_project(project_id: str, *, project_count: int = 1) -> str | None:
    suffix = project_env_suffix(project_id)
    return _resolve_credential(
        f"RTD_TOTP_SECRET_{suffix}",
        "RTD_TOTP_SECRET",
        project_count=project_count,
    )


def readthedocs_credentials_configured(project_id: str, *, project_count: int = 1) -> bool:
    return all(
        (
            readthedocs_username_for_project(project_id, project_count=project_count),
            readthedocs_password_for_project(project_id, project_count=project_count),
            readthedocs_totp_secret_for_project(project_id, project_count=project_count),
        )
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
    if kind == "readthedocs_username":
        return _credential_label(
            f"RTD_USERNAME_{suffix}",
            "RTD_USERNAME",
            project_count=project_count,
        )
    if kind == "readthedocs_password":
        return _credential_label(
            f"RTD_PASSWORD_{suffix}",
            "RTD_PASSWORD",
            project_count=project_count,
        )
    if kind == "readthedocs_totp":
        return _credential_label(
            f"RTD_TOTP_SECRET_{suffix}",
            "RTD_TOTP_SECRET",
            project_count=project_count,
        )
    raise ValueError(f"Unsupported credential kind: {kind}")
