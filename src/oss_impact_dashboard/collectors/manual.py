from __future__ import annotations

from pathlib import Path
from typing import Any

from oss_impact_dashboard.config import load_yaml


def load_manual(root: Path) -> dict[str, Any]:
    project_data = root / "project-data.yml"
    case_studies = root / "case-studies.yml"
    return {
        "project_data": load_yaml(project_data) if project_data.exists() else {},
        "case_studies": (load_yaml(case_studies) if case_studies.exists() else {}).get(
            "case_studies", []
        ),
    }

