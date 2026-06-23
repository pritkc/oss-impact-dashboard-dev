"""Build security metrics from OpenSSF Scorecard raw data."""
from __future__ import annotations

from typing import Any

KEY_CHECKS = [
    "Code-Review",
    "Security-Policy",
    "Maintained",
    "Vulnerabilities",
    "Dependency-Update-Tool",
    "Branch-Protection",
    "CI-Tests",
    "Signed-Releases",
    "Dangerous-Workflow",
    "Token-Permissions",
    "Binary-Artifacts",
    "Pinned-Dependencies",
    "SAST",
    "Fuzzing",
    "Packaging",
    "License",
    "Webhooks",
]


def build_security(scorecard_raw: dict[str, Any] | None) -> dict[str, Any]:
    if not scorecard_raw:
        return {
            "available": False,
            "score": None,
            "checks": [],
            "cii_badge_level": None,
            "message": "OpenSSF Scorecard data not available for this repository.",
        }

    checks_by_name = {check["name"]: check for check in scorecard_raw.get("checks", [])}

    check_summaries = []
    for name in KEY_CHECKS:
        check = checks_by_name.get(name)
        if check:
            check_summaries.append({
                "name": name,
                "score": check.get("score"),
                "reason": check.get("reason"),
            })

    cii_check = checks_by_name.get("CII-Best-Practices")
    cii_badge_level = None
    if cii_check:
        cii_badge_level = cii_check.get("reason")

    return {
        "available": True,
        "score": scorecard_raw.get("score"),
        "checks": check_summaries,
        "all_checks": scorecard_raw.get("checks", []),
        "cii_badge_level": cii_badge_level,
        "commit": scorecard_raw.get("commit"),
        "commit_date": scorecard_raw.get("commit_date"),
        "scorecard_version": scorecard_raw.get("scorecard_version"),
        "vulnerabilities": (checks_by_name.get("Vulnerabilities") or {}).get("score"),
        "security_policy": (checks_by_name.get("Security-Policy") or {}).get("score"),
        "maintained": (checks_by_name.get("Maintained") or {}).get("score"),
        "message": None,
    }
