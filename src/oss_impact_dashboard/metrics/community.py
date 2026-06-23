"""Build community standards compliance metrics."""
from __future__ import annotations

from typing import Any

STANDARDS_CHECKLIST = [
    ("readme", "README", "Project has a README file"),
    ("contributing_guidelines", "CONTRIBUTING", "Project has contributing guidelines"),
    ("code_of_conduct", "CODE_OF_CONDUCT", "Project has a code of conduct"),
    ("license_info", "LICENSE", "Project has a license file"),
    ("security_policy", "SECURITY", "Project has a security policy"),
]


def build_community_standards(community_raw: dict[str, Any] | None) -> dict[str, Any]:
    if not community_raw:
        return {
            "available": False,
            "compliance_score": None,
            "checks": [],
            "message": "Community standards data not collected.",
        }

    checks = []
    present_count = 0
    for key, label, description in STANDARDS_CHECKLIST:
        value = community_raw.get(key)
        present = bool(value)
        if present:
            present_count += 1
        checks.append({
            "key": key,
            "label": label,
            "description": description,
            "present": present,
            "details": value if present else None,
        })

    has_issue_templates = bool(community_raw.get("issue_templates"))
    has_pr_template = bool(community_raw.get("pull_request_templates"))
    has_topics = bool(community_raw.get("topics"))

    checks.extend([
        {
            "key": "issue_templates",
            "label": "Issue Templates",
            "description": "Project has issue templates",
            "present": has_issue_templates,
            "details": community_raw.get("issue_templates") if has_issue_templates else None,
        },
        {
            "key": "pull_request_templates",
            "label": "PR Template",
            "description": "Project has a pull request template",
            "present": has_pr_template,
            "details": community_raw.get("pull_request_templates") if has_pr_template else None,
        },
        {
            "key": "topics",
            "label": "Repository Topics",
            "description": "Project has GitHub repository topics set",
            "present": has_topics,
            "details": community_raw.get("topics") if has_topics else None,
        },
    ])

    total_standard = len(STANDARDS_CHECKLIST)
    compliance_score = round(present_count / total_standard, 3) if total_standard else None

    return {
        "available": True,
        "compliance_score": compliance_score,
        "checks": checks,
        "topics": community_raw.get("topics", []),
        "description": community_raw.get("description"),
        "homepage_url": community_raw.get("homepage_url"),
        "message": None,
    }
