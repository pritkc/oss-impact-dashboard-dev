from oss_impact_dashboard.credentials import (
    github_token_for_project,
    goatcounter_api_key_for_project,
    project_env_suffix,
)


def test_project_env_suffix_normalizes_ids():
    assert project_env_suffix("mole-local") == "MOLE_LOCAL"
    assert project_env_suffix("fivetran") == "FIVETRAN"


def test_github_token_for_project_prefers_project_specific(monkeypatch):
    monkeypatch.setenv("GH_PAT_MOLE_LOCAL", "fork-token")
    monkeypatch.setenv("GH_PAT", "shared-token")
    assert github_token_for_project("mole-local", project_count=2) == "fork-token"


def test_github_token_for_project_uses_fallback_for_single_project(monkeypatch):
    monkeypatch.delenv("GH_PAT_MOLE_LOCAL", raising=False)
    monkeypatch.setenv("GH_PAT", "shared-token")
    assert github_token_for_project("mole-local", project_count=1) == "shared-token"


def test_github_token_for_project_ignores_fallback_for_multi_project(monkeypatch):
    monkeypatch.delenv("GH_PAT_MOLE_LOCAL", raising=False)
    monkeypatch.setenv("GH_PAT", "shared-token")
    assert github_token_for_project("mole-local", project_count=2) is None


def test_goatcounter_api_key_for_project_prefers_project_specific(monkeypatch):
    monkeypatch.setenv("GOATCOUNTER_API_KEY_MOLE", "mole-key")
    monkeypatch.setenv("GOATCOUNTER_API_KEY", "shared-key")
    assert goatcounter_api_key_for_project("mole", project_count=2) == "mole-key"
    assert goatcounter_api_key_for_project("mole-local", project_count=2) is None


def test_goatcounter_api_key_for_project_uses_fallback_for_single_project(monkeypatch):
    monkeypatch.delenv("GOATCOUNTER_API_KEY_EXAMPLE", raising=False)
    monkeypatch.setenv("GOATCOUNTER_API_KEY", "shared-key")
    assert goatcounter_api_key_for_project("example", project_count=1) == "shared-key"
