from __future__ import annotations

from typing import Any


def build_impact(
    zenodo: dict[str, Any] | None,
    openalex: dict[str, Any] | None,
    manual: dict[str, Any],
) -> dict[str, Any]:
    zenodo_stats = {}
    if zenodo:
        stats = zenodo.get("stats") or {}
        metadata = zenodo.get("metadata") or {}
        zenodo_stats = {
            "title": metadata.get("title"),
            "doi": metadata.get("doi") or zenodo.get("doi"),
            "version": metadata.get("version"),
            "record_url": zenodo.get("links", {}).get("html"),
            "views": stats.get("views"),
            "downloads": stats.get("downloads"),
            "unique_views": stats.get("unique_views"),
            "unique_downloads": stats.get("unique_downloads"),
        }

    openalex_stats = {}
    if openalex:
        counts_by_year = openalex.get("counts_by_year") or []
        openalex_stats = {
            "title": openalex.get("title"),
            "doi": openalex.get("doi"),
            "cited_by_count": openalex.get("cited_by_count"),
            "publication_year": openalex.get("publication_year"),
            "openalex_url": openalex.get("id"),
            "citations_by_year": [
                {"year": item.get("year"), "cited_by_count": item.get("cited_by_count", 0)}
                for item in counts_by_year
            ],
        }

    return {
        "zenodo": zenodo_stats,
        "openalex": openalex_stats,
        "manual": manual,
        "private_sources": {
            "github_traffic": "Access not configured",
            "readthedocs": "Access not configured",
        },
    }
