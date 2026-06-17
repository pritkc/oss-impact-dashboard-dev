from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any


def fetch_openalex(doi: str | None) -> dict[str, Any] | None:
    if not doi:
        return None
    encoded = urllib.parse.quote(doi, safe="")
    url = f"https://api.openalex.org/works/doi:{encoded}"
    request = urllib.request.Request(url, headers={"User-Agent": "oss-impact-dashboard"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))

