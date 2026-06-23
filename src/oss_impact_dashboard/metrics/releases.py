from __future__ import annotations

import statistics

from oss_impact_dashboard.schema import days_between, percentile_stats


def _in_period(value: str | None, period: dict) -> bool:
    if not value:
        return False
    start = period.get("start")
    end = period.get("end")
    if start and value < start:
        return False
    return not end or value <= end


def _comparison(current: int | float | None, previous: int | float | None) -> dict:
    if current is None or previous is None:
        return {"current": current, "previous": previous, "delta": None, "percent": None}
    delta = round(current - previous, 2)
    return {
        "current": current,
        "previous": previous,
        "delta": delta,
        "percent": None if previous == 0 else round((delta / previous) * 100, 2),
    }


def _previous_period(period: dict) -> dict | None:
    start = period.get("start")
    end = period.get("end")
    if not start or not end:
        return None
    start_year, start_month = int(start[:4]), int(start[5:7])
    end_year, end_month = int(end[:4]), int(end[5:7])
    months = (end_year - start_year) * 12 + (end_month - start_month) + 1
    prev_end_index = start_year * 12 + start_month - 2
    prev_start_index = prev_end_index - months + 1
    return {
        "start": f"{prev_start_index // 12:04d}-{prev_start_index % 12 + 1:02d}-01T00:00:00Z",
        "end": f"{prev_end_index // 12:04d}-{prev_end_index % 12 + 1:02d}-28T23:59:59Z",
    }


def _period_summary(published: list[dict], period: dict) -> dict:
    scoped = [release for release in published if _in_period(release.get("published_at"), period)]
    downloads = sum(
        int(asset.get("download_count") or 0)
        for release in scoped
        for asset in release.get("assets") or []
    )
    assets = sum(len(release.get("assets") or []) for release in scoped)
    return {"releases": len(scoped), "asset_downloads": downloads, "asset_count": assets}


def build_releases(
    releases: list[dict], generated_at: str, period_options: list[dict] | None = None
) -> dict:
    published = [release for release in releases if release.get("published_at")]
    published.sort(key=lambda release: release.get("published_at") or "")
    intervals = []
    for previous, current in zip(published, published[1:], strict=False):
        gap = days_between(previous.get("published_at"), current.get("published_at"))
        if gap is not None:
            intervals.append(gap)

    by_release = []
    total_downloads = 0
    for release in reversed(published):
        assets = release.get("assets") or []
        downloads = sum(int(asset.get("download_count") or 0) for asset in assets)
        total_downloads += downloads
        by_release.append(
            {
                "name": release.get("name") or release.get("tag_name"),
                "tag": release.get("tag_name"),
                "published_at": release.get("published_at"),
                "url": release.get("html_url"),
                "asset_downloads": downloads,
                "asset_count": len(assets),
            }
        )

    latest = published[-1] if published else None
    latest_age = None
    if latest:
        latest_age = days_between(
            latest.get("published_at"),
            generated_at,
        )
    period_counts = {}
    period_summaries = {}
    period_comparisons = {}
    for period in period_options or []:
        period_summary = _period_summary(published, period)
        period_counts[period["id"]] = period_summary["releases"]
        period_summaries[period["id"]] = period_summary
        previous = _previous_period(period)
        if previous:
            previous_summary = _period_summary(published, previous)
            period_comparisons[period["id"]] = {
                key: _comparison(value, previous_summary.get(key))
                for key, value in period_summary.items()
            }

    zero_download_explanation = None
    if total_downloads == 0:
        asset_count = sum(len(release.get("assets") or []) for release in published)
        zero_download_explanation = (
            "No uploaded release assets were found; GitHub-generated source archives are excluded."
            if asset_count == 0
            else "Uploaded release assets exist, but GitHub currently reports zero downloads."
        )

    release_cadence_stddev_days = None
    if len(intervals) >= 1:
        release_cadence_stddev_days = round(statistics.stdev(intervals), 1) if len(intervals) >= 2 else 0.0

    return {
        "total_releases": len(published),
        "latest_release": by_release[0] if by_release else None,
        "latest_release_age_days": latest_age,
        "median_release_interval_days": percentile_stats(intervals)["median"],
        "release_cadence_stddev_days": release_cadence_stddev_days,
        "release_asset_downloads": total_downloads,
        "period_counts": period_counts,
        "period_summaries": period_summaries,
        "period_comparisons": period_comparisons,
        "by_release": by_release,
        "note": "GitHub auto-generated source archives are not counted as release-asset downloads.",
        "zero_download_explanation": zero_download_explanation,
    }
