from __future__ import annotations

from pathlib import Path
from typing import Any

from oss_impact_dashboard.config import load_yaml


def load_manual(root: Path) -> dict[str, Any]:
    funding = root / "funding.yml"
    case_studies = root / "case-studies.yml"
    return {
        "funding": load_yaml(funding) if funding.exists() else {},
        "case_studies": (load_yaml(case_studies) if case_studies.exists() else {}).get(
            "case_studies", []
        ),
    }

