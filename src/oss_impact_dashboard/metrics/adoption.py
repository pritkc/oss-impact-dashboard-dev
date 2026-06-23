"""Build adoption metrics from package registry data."""
from __future__ import annotations

from typing import Any


def build_adoption(adoption_raw: dict[str, Any] | None) -> dict[str, Any]:
    if not adoption_raw:
        return {"available": False, "registries": [], "total_downloads": None}

    registries = []
    total_downloads = 0

    spack = adoption_raw.get("spack") or {}
    registries.append({
        "name": "Spack",
        "found": spack.get("found"),
        "available": spack.get("available"),
        "details": "HPC package manager" if spack.get("found") else "Not registered",
    })

    conda = adoption_raw.get("conda_forge") or {}
    registries.append({
        "name": "conda-forge",
        "found": conda.get("found"),
        "available": conda.get("available"),
        "details": "Conda package manager" if conda.get("found") else "Not registered",
    })

    pypi = adoption_raw.get("pypi") or {}
    if pypi.get("found"):
        registries.append({
            "name": "PyPI",
            "found": True,
            "available": True,
            "version": pypi.get("version"),
            "details": f"v{pypi.get('version', 'unknown')}",
        })
    else:
        registries.append({
            "name": "PyPI",
            "found": False,
            "available": pypi.get("available"),
            "details": "Not registered",
        })

    ecosyste = adoption_raw.get("ecosyste_ms") or {}
    for pkg in ecosyste.get("packages", []):
        downloads = pkg.get("downloads") or 0
        if downloads:
            total_downloads += downloads
        registries.append({
            "name": f"{pkg.get('ecosystem', 'unknown')}/{pkg.get('name', 'unknown')}",
            "found": True,
            "available": True,
            "version": pkg.get("latest_version"),
            "downloads": downloads,
            "dependents_count": pkg.get("dependents_count"),
            "dependent_repos_count": pkg.get("dependent_repos_count"),
            "package_url": pkg.get("package_url"),
        })

    found_count = sum(1 for r in registries if r.get("found"))

    return {
        "available": True,
        "registries": registries,
        "found_count": found_count,
        "total_registries_checked": len(adoption_raw.get("registries_checked", [])),
        "total_downloads": total_downloads if total_downloads else None,
        "ecosyste_ms_packages": ecosyste.get("packages", []),
    }
