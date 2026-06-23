"""Tests for package adoption metrics."""
from oss_impact_dashboard.metrics.adoption import build_adoption


def test_build_adoption_no_data():
    """No data → available=False."""
    result = build_adoption(None)
    assert result["available"] is False
    assert result["registries"] == []


def test_build_adoption_with_spack_found():
    """Spack found → registry entry with found=True."""
    adoption_raw = {
        "spack": {"available": True, "found": True},
        "pypi": {"available": True, "found": False},
        "conda_forge": {"available": True, "found": False},
        "ecosyste_ms": {"available": True, "packages": []},
        "registries_checked": ["ecosyste.ms", "spack", "pypi", "conda-forge"],
    }
    result = build_adoption(adoption_raw)
    assert result["available"] is True
    spack_entry = [r for r in result["registries"] if r["name"] == "Spack"][0]
    assert spack_entry["found"] is True


def test_build_adoption_with_pypi():
    """PyPI found → version extracted."""
    adoption_raw = {
        "spack": {"available": True, "found": False},
        "pypi": {"available": True, "found": True, "version": "1.2.0"},
        "conda_forge": {"available": True, "found": False},
        "ecosyste_ms": {"available": True, "packages": []},
        "registries_checked": ["ecosyste.ms", "spack", "pypi", "conda-forge"],
    }
    result = build_adoption(adoption_raw)
    pypi_entry = [r for r in result["registries"] if r["name"] == "PyPI"][0]
    assert pypi_entry["found"] is True
    assert pypi_entry["version"] == "1.2.0"


def test_build_adoption_aggregates_downloads():
    """Multiple packages with downloads → total computed."""
    adoption_raw = {
        "spack": {"available": True, "found": False},
        "pypi": {"available": True, "found": False},
        "conda_forge": {"available": True, "found": False},
        "ecosyste_ms": {
            "available": True,
            "packages": [
                {"ecosystem": "cran", "name": "mole", "downloads": 100, "latest_version": "1.0"},
                {"ecosystem": "npm", "name": "mole-js", "downloads": 200, "latest_version": "0.9"},
            ],
        },
        "registries_checked": ["ecosyste.ms", "spack", "pypi", "conda-forge"],
    }
    result = build_adoption(adoption_raw)
    assert result["total_downloads"] == 300
    assert result["found_count"] >= 2
