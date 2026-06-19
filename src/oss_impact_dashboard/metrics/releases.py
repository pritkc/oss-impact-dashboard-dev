from __future__ import annotations

from oss_impact_dashboard.schema import days_between, percentile_stats


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
    for period in period_options or []:
        start = period.get("start")
        end = period.get("end")
        period_counts[period["id"]] = sum(
            1
            for release in published
            if release.get("published_at")
            and (not start or release["published_at"] >= start)
            and release["published_at"] <= end
        )

    return {
        "total_releases": len(published),
        "latest_release": by_release[0] if by_release else None,
        "latest_release_age_days": latest_age,
        "median_release_interval_days": percentile_stats(intervals)["median"],
        "release_asset_downloads": total_downloads,
        "period_counts": period_counts,
        "by_release": by_release,
        "note": "GitHub auto-generated source archives are not counted as release-asset downloads.",
    }
