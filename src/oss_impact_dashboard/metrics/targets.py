"""Build annual targets progress metrics from manual data and current dataset."""
from __future__ import annotations

from typing import Any


def build_targets_progress(
    manual: dict[str, Any] | None,
    summary: dict[str, Any] | None,
) -> dict[str, Any]:
    """Compare current metrics against annual targets defined in project-data.yml."""
    if not manual:
        return {"available": False, "targets": [], "message": "No project data available."}

    project_data = manual.get("project_data") or {}
    targets_list = project_data.get("targets") or []
    if not targets_list:
        return {"available": False, "targets": [], "message": "No targets defined in project-data.yml."}

    summary = summary or {}
    progress_items = []

    for target_entry in targets_list:
        year = target_entry.get("year")
        for metric in target_entry.get("metrics", []):
            metric_name = metric.get("metric")
            baseline = metric.get("baseline")
            target = metric.get("target")
            expected_outcome = metric.get("expected_outcome", "")
            current = summary.get(metric_name)

            progress = None
            if current is not None and target is not None and baseline is not None:
                if target > baseline:
                    if target != baseline:
                        progress = round((current - baseline) / (target - baseline), 3)
                elif target < baseline:
                    if baseline != target:
                        progress = round((baseline - current) / (baseline - target), 3)
                else:
                    progress = 1.0 if current == target else 0.0

            progress = max(0.0, min(1.0, progress)) if progress is not None else None

            progress_items.append({
                "year": year,
                "metric": metric_name,
                "baseline": baseline,
                "target": target,
                "current": current,
                "progress": progress,
                "expected_outcome": expected_outcome,
                "on_track": progress is not None and progress >= 0.5,
            })

    return {
        "available": True,
        "targets": progress_items,
        "reporting_period": project_data.get("reporting_period"),
        "message": None,
    }
