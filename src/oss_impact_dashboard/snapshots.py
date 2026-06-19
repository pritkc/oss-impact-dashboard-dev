from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_snapshot(path: str | Path) -> dict[str, Any] | None:
    snapshot = Path(path)
    if not snapshot.exists():
        return None
    return json.loads(snapshot.read_text(encoding="utf-8"))


def write_snapshot(path: str | Path, data: dict[str, Any]) -> None:
    snapshot = Path(path)
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    snapshot.write_text(
        json.dumps(data, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def dedupe_items(items: list[dict[str, Any]], key: str = "id") -> list[dict[str, Any]]:
    seen: set[Any] = set()
    deduped: list[dict[str, Any]] = []
    for item in items:
        marker = item.get(key)
        if marker in seen:
            continue
        seen.add(marker)
        deduped.append(item)
    return deduped
