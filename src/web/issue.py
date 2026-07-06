"""Structured per-day issue export.

Serializes the day's selected + enriched ContentItems into a single JSON file
(``data/issues/{date}.json``) that the public frontend consumes directly. This
is the source of truth for the redesigned news site; the legacy Markdown
summaries are still produced for backward compatibility.
"""

from __future__ import annotations

import json
import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from ..models import ContentItem


def make_article_slug(date: str, article_id: str, title: str, rank: int | None = None) -> str:
    """Create a stable, human-readable article slug for SEO-friendly URLs."""
    digest = hashlib.sha1(f"{date}:{article_id}".encode("utf-8")).hexdigest()[:8]
    text = re.sub(r"[^\w\u4e00-\u9fff]+", "-", title.lower(), flags=re.UNICODE).strip("-")
    text = re.sub(r"-{2,}", "-", text)[:80].strip("-") or "article"
    prefix = f"{date}"
    if rank:
        prefix += f"-{rank:02d}"
    return f"{prefix}-{text}-{digest}"


def _article_from_item(item: ContentItem, index: int) -> Dict[str, Any]:
    meta = item.metadata or {}

    def _pick(key: str, lang: str) -> str:
        return str(meta.get(f"{key}_{lang}") or "").strip()

    sources = []
    for s in meta.get("sources") or []:
        if isinstance(s, dict) and s.get("url"):
            sources.append({"url": str(s["url"]), "title": str(s.get("title") or s["url"])})

    title_zh = _pick("title", "zh") or item.title
    title_en = _pick("title", "en") or item.title
    slug = make_article_slug("", item.id, title_en or title_zh, index)

    article = {
        "id": item.id,
        "slug": slug,
        "path": f"/article/{slug}",
        "rank": index,
        "score": item.ai_score,
        "source": item.source_type.value,
        "author": item.author,
        "url": str(item.url),
        "published_at": item.published_at.isoformat() if item.published_at else None,
        "fetched_at": item.fetched_at.isoformat() if item.fetched_at else None,
        "tags": item.ai_tags or [],
        "image_path": meta.get("image_path"),
        "title": {
            "zh": title_zh,
            "en": title_en,
        },
        "summary": {
            "zh": _pick("detailed_summary", "zh"),
            "en": _pick("detailed_summary", "en"),
        },
        "body": {
            "zh": _pick("body", "zh") or _pick("detailed_summary", "zh"),
            "en": _pick("body", "en") or _pick("detailed_summary", "en"),
        },
        "background": {
            "zh": _pick("background", "zh"),
            "en": _pick("background", "en"),
        },
        "discussion": {
            "zh": _pick("community_discussion", "zh"),
            "en": _pick("community_discussion", "en"),
        },
        "sources": sources,
    }
    return article


def build_issue(items: List[ContentItem], date: str, total_fetched: int) -> Dict[str, Any]:
    """Build the JSON-serializable issue payload for a given day."""
    articles = [_article_from_item(item, i + 1) for i, item in enumerate(items)]
    for article in articles:
        slug = make_article_slug(date, article["id"], article["title"].get("en") or article["title"].get("zh") or "", article["rank"])
        article["slug"] = slug
        article["path"] = f"/article/{slug}"
    return {
        "date": date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_fetched": total_fetched,
        "count": len(articles),
        "articles": articles,
    }


def save_issue(
    items: List[ContentItem],
    date: str,
    total_fetched: int,
    data_dir: Path = Path("data"),
) -> Path:
    """Serialize the day's issue to ``data/issues/{date}.json`` and return its path."""
    issues_dir = Path(data_dir) / "issues"
    issues_dir.mkdir(parents=True, exist_ok=True)
    payload = build_issue(items, date, total_fetched)
    out_path = issues_dir / f"{date}.json"
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return out_path
