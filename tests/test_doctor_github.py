import io
import urllib.error
from pathlib import Path

from oss_impact_dashboard.cli import main
from oss_impact_dashboard.collectors.github import GitHubClient


def test_doctor_command_checks_github_endpoints(tmp_path: Path, monkeypatch, capsys):
    project_dir = tmp_path / "projects"
    project_dir.mkdir()
    project = project_dir / "test.yml"
    project.write_text(
        """
project:
  id: demo
  name: Demo
  repository: owner/repo
  documentation_url: https://docs.example.org/
sources:
  github:
    enabled: true
  github_traffic:
    enabled: true
  github_actions:
    enabled: true
  documentation_analytics:
    enabled: false
""",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GH_PAT_DEMO", "secret-token")
    calls = []

    def fake_get_json(self, url):
        calls.append(url)
        if url.endswith("/repos/owner/repo"):
            return {"full_name": "owner/repo"}, ""
        if url.endswith("/repos/owner/repo/traffic/views"):
            raise urllib.error.HTTPError(
                url,
                403,
                "Forbidden",
                {},
                io.BytesIO(b'{"message":"Resource not accessible"}'),
            )
        if url.endswith("/repos/owner/repo/actions/runs?per_page=1"):
            return {"workflow_runs": []}, ""
        raise AssertionError(f"unexpected url: {url}")

    monkeypatch.setattr(GitHubClient, "get_json", fake_get_json)
    assert main(["doctor", "--project", "projects/test.yml"]) == 0
    output = capsys.readouterr().out
    assert "GitHub repository: available" in output
    assert "GitHub traffic views: error" in output
    assert "owner-only" in output
    assert "GitHub actions runs: available" in output
    assert "secret-token" not in output
    assert any("/repos/owner/repo/traffic/views" in call for call in calls)
