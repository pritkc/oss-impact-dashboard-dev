from __future__ import annotations

import json
import re
import urllib.request
from typing import Any


def record_id(value: str | None) -> str | None:
    if not value:
        return None
    match = re.search(r"(?:records/|record/)?(\d+)$", value.strip())
    return match.group(1) if match else None


def fetch_zenodo(record_or_doi: str | None) -> dict[str, Any] | None:
    identifier = record_id(record_or_doi)
    if not identifier:
        return None
    url = f"https://zenodo.org/api/records/{identifier}"
    request = urllib.request.Request(url, headers={"User-Agent": "oss-impact-dashboard"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))

