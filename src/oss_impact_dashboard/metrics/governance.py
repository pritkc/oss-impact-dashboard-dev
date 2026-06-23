"""Build governance health metrics from project config and community data."""
from __future__ import annotations

from typing import Any


def build_governance(
    config: dict[str, Any] | None,
    community_standards: dict[str, Any] | None,
    contributors: dict[str, Any] | None,
    security: dict[str, Any] | None,
) -> dict[str, Any]:
    """Assess governance health from available data sources."""
    checks = []
    score_count = 0
    total_checks = 0

    cs = community_standards or {}
    cs_checks = cs.get("checks", [])
    for check in cs_checks:
        total_checks += 1
        if check.get("present"):
            score_count += 1

    checks.append({
        "category": "Community Standards",
        "items": [
            {"name": c.get("label", ""), "present": c.get("present", False)}
            for c in cs_checks
        ],
        "score": f"{score_count}/{total_checks}" if total_checks else "N/A",
    })

    sec = security or {}
    total_checks += 1
    if sec.get("available") and sec.get("score") is not None:
        score_count += 1 if sec.get("score", 0) >= 5 else 0
    checks.append({
        "category": "Security Policy",
        "items": [
            {"name": "OpenSSF Scorecard", "present": sec.get("available", False)},
            {"name": "Security policy file", "present": any(
                c.get("name") == "Security-Policy" and c.get("score") is not None
                for c in sec.get("checks", [])
            )},
        ],
        "score": f"{sec.get('score', 'N/A')}/10" if sec.get("available") else "N/A",
    })

    contrib = contributors or {}
    bus_factor = contrib.get("bus_factor")
    total_checks += 1
    bus_healthy = bus_factor is not None and bus_factor >= 3
    if bus_healthy:
        score_count += 1
    checks.append({
        "category": "Contributor Diversity",
        "items": [
            {"name": "Bus factor", "present": bus_factor is not None, "value": bus_factor},
            {"name": "Core contributors configured", "present": contrib.get("core_contributors_configured", False)},
            {"name": "External contributor share", "present": contrib.get("external_contributor_share") is not None},
        ],
        "score": str(bus_factor) if bus_factor is not None else "N/A",
    })

    governance_score = round(score_count / total_checks, 3) if total_checks else None

    return {
        "available": True,
        "governance_score": governance_score,
        "checks": checks,
        "has_code_of_conduct": any(
            c.get("label") == "CODE_OF_CONDUCT" and c.get("present")
            for c in cs_checks
        ),
        "has_contributing_guidelines": any(
            c.get("label") == "CONTRIBUTING" and c.get("present")
            for c in cs_checks
        ),
        "has_license": any(
            c.get("label") == "LICENSE" and c.get("present")
            for c in cs_checks
        ),
        "bus_factor": bus_factor,
        "openssf_score": sec.get("score"),
    }
