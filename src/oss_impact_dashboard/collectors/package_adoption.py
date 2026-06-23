"""Package adoption collector — checks multiple registries for project presence."""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


def _fetch_json(url: str, timeout: int = 15) -> Any:
    headers = {"Accept": "application/json", "User-Agent": "oss-impact-dashboard"}
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _check_ecosyste_ms(repository_url: str) -> dict[str, Any]:
    """Check ecosyste.ms API for package registrations."""
    api_url = (
        "https://packages.ecosyste.ms/api/v1/packages/lookup?repository_url="
        + urllib.parse.quote(repository_url, safe="")
    )
    try:
        results = _fetch_json(api_url)
        packages = []
        for entry in results or []:
            packages.append({
                "ecosystem": entry.get("ecosystem"),
                "name": entry.get("name"),
                "package_url": entry.get("package_url"),
                "latest_version": entry.get("latest_version"),
                "downloads": entry.get("downloads"),
                "dependents_count": entry.get("dependents_count"),
                "dependent_repos_count": entry.get("dependent_repos_count"),
            })
        return {"available": True, "packages": packages}
    except Exception:
        return {"available": False, "packages": [], "error": "ecosyste.ms lookup failed"}


def _check_spack(owner: str, repo: str) -> dict[str, Any]:
    """Check if a Spack recipe exists for this package."""
    spack_api = (
        f"https://api.github.com/repos/spack/spack/contents/"
        f"var/spack/repos/builtin/packages/{repo.lower()}"
    )
    try:
        result = _fetch_json(spack_api)
        return {"available": True, "found": isinstance(result, list) and len(result) > 0}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"available": True, "found": False}
        return {"available": False, "found": False, "error": str(e)}
    except Exception as e:
        return {"available": False, "found": False, "error": str(e)}


def _check_pypi(package_name: str) -> dict[str, Any]:
    """Check PyPI for package presence."""
    try:
        result = _fetch_json(f"https://pypi.org/pypi/{package_name}/json")
        info = result.get("info") or {}
        return {
            "available": True,
            "found": True,
            "version": info.get("version"),
            "summary": info.get("summary"),
            "home_page": info.get("home_page"),
        }
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"available": True, "found": False}
        return {"available": False, "found": False, "error": str(e)}
    except Exception as e:
        return {"available": False, "found": False, "error": str(e)}


def fetch_package_adoption(owner: str, repo: str) -> dict[str, Any]:
    """Check multiple package registries for adoption of this project."""
    repository_url = f"https://github.com/{owner}/{repo}"

    ecosyste = _check_ecosyste_ms(repository_url)
    spack = _check_spack(owner, repo)
    pypi = _check_pypi(repo.lower())

    conda_forge_found = any(
        p.get("ecosystem") == "conda-forge" for p in ecosyste.get("packages", [])
    )

    return {
        "ecosyste_ms": ecosyste,
        "spack": spack,
        "pypi": pypi,
        "conda_forge": {"available": ecosyste.get("available", False), "found": conda_forge_found},
        "registries_checked": ["ecosyste.ms", "spack", "pypi", "conda-forge"],
    }
