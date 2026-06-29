"""Shared pytest fixtures.

Credential resolution is environment-driven, so the test suite must never
inherit a developer's real ``.env`` values. Without isolation, sourcing
``.env`` before running pytest leaks live tokens/keys into tests and makes
credential assertions non-deterministic (and can surface real secrets in
failure output). This autouse fixture strips all credential-shaped variables
before every test; individual tests opt back in via ``monkeypatch.setenv``.
"""

from __future__ import annotations

import os

import pytest

_CREDENTIAL_PREFIXES = (
    "GH_PAT",
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "GOATCOUNTER_API_KEY",
    "OSS_DASHBOARD_GITHUB_TOKEN",
    "READTHEDOCS_TOTP",
)


@pytest.fixture(autouse=True)
def _isolate_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in list(os.environ):
        if name.startswith(_CREDENTIAL_PREFIXES):
            monkeypatch.delenv(name, raising=False)
