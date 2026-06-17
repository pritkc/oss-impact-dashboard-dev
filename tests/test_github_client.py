import pytest

from oss_impact_dashboard.collectors.github import GitHubClient, next_link


def test_next_link_parses_header():
    header = (
        '<https://api.github.com/page/2>; rel="next", '
        '<https://api.github.com/page/5>; rel="last"'
    )
    assert next_link(header) == "https://api.github.com/page/2"


def test_request_budget_blocks_unbounded_collection():
    client = GitHubClient(request_budget=0)
    with pytest.raises(RuntimeError, match="budget"):
        client.get_json("https://api.github.com/repos/example/example")
