"""Per-article cover images sourced from web image search.

For each high-scoring item we first try the source page's Open Graph image,
then search the web (via ddgs image search) using the article's title + tags,
then download the first usable image into ``data/media/`` so the frontend can
serve a stable local file instead of a fragile hotlink.

If the web image lookup fails, we still generate a local SVG cover so article
cards are never blank.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import re
import sys
from pathlib import Path
from typing import List, Optional
from urllib.parse import urljoin

import httpx
from ddgs import DDGS
from rich.progress import BarColumn, MofNCompleteColumn, Progress, SpinnerColumn, TextColumn
from xml.sax.saxutils import escape as xml_escape

from ..models import ContentItem

_ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
}

_MIN_BYTES = 5 * 1024  # skip tiny/broken images
_MAX_BYTES = 8 * 1024 * 1024  # skip oversized images


class ArticleImager:
    """Finds and downloads a cover image for each content item."""

    def __init__(self, media_dir: Path, max_results: int = 6):
        self.media_dir = Path(media_dir)
        self.media_dir.mkdir(parents=True, exist_ok=True)
        self.max_results = max(max_results, 1)

    async def attach_images(self, items: List[ContentItem]) -> None:
        """Attach a downloaded cover image path to each item (in-place)."""
        if not items:
            return

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            MofNCompleteColumn(),
            transient=True,
        ) as progress:
            task = progress.add_task("Fetching images", total=len(items))

            async def _process(item: ContentItem) -> None:
                try:
                    path = await self._image_for_item(item)
                    if path:
                        # Store a web-relative path served under /media
                        item.metadata["image_path"] = f"media/{path.name}"
                except Exception as exc:  # noqa: BLE001 - never fail the run over an image
                    print(f"Image fetch failed for {item.id}: {exc}")
                progress.advance(task)

            # Keep image fetching gentle and sequential-ish to avoid rate limits
            semaphore = asyncio.Semaphore(3)

            async def _guarded(item: ContentItem) -> None:
                async with semaphore:
                    await _process(item)

            await asyncio.gather(*[_guarded(item) for item in items])

    def _build_query(self, item: ContentItem) -> str:
        title = item.metadata.get("title_en") or item.title
        tags = item.ai_tags[:2] if item.ai_tags else []
        return " ".join([str(title)] + tags).strip()

    async def _search_images(self, query: str) -> List[str]:
        """Return candidate image URLs for a query."""
        def _run() -> List[str]:
            stderr = sys.stderr
            sys.stderr = open(os.devnull, "w")
            try:
                results = DDGS().images(query, max_results=self.max_results)
            finally:
                sys.stderr.close()
                sys.stderr = stderr
            urls: List[str] = []
            for r in results or []:
                url = r.get("image") or r.get("thumbnail")
                if url:
                    urls.append(url)
            return urls

        try:
            return await asyncio.to_thread(_run)
        except Exception:
            return []

    async def _image_for_item(self, item: ContentItem) -> Optional[Path]:
        query = self._build_query(item)
        if not query:
            return None

        # Stable filename derived from the item id
        safe_id = "".join(c if c.isalnum() else "-" for c in item.id)[:80]

        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=15.0,
            headers={"User-Agent": "Mozilla/5.0 (compatible; HorizonBot/1.0)"},
        ) as client:
            og_image = await self._extract_og_image(client, str(item.url))
            if og_image:
                path = await self._download(client, og_image, safe_id)
                if path:
                    return path

            candidates = await self._search_images(query)
            for url in candidates:
                path = await self._download(client, url, safe_id)
                if path:
                    return path

        return self._create_placeholder(safe_id, query, item.ai_tags)

    async def _extract_og_image(self, client: httpx.AsyncClient, page_url: str) -> Optional[str]:
        """Extract an Open Graph / Twitter image from the source page."""
        try:
            resp = await client.get(page_url)
            resp.raise_for_status()
        except Exception:
            return None

        html = resp.text[:300_000]
        patterns = [
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
            r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
        ]
        for pattern in patterns:
            match = re.search(pattern, html, flags=re.IGNORECASE)
            if match:
                return urljoin(page_url, match.group(1).strip())
        return None

    async def _download(self, client: httpx.AsyncClient, url: str, safe_id: str) -> Optional[Path]:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except Exception:
            return None

        content_type = resp.headers.get("content-type", "").split(";")[0].strip().lower()
        ext = _ALLOWED_CONTENT_TYPES.get(content_type)
        if not ext:
            return None

        data = resp.content
        if len(data) < _MIN_BYTES or len(data) > _MAX_BYTES:
            return None

        out_path = self.media_dir / f"{safe_id}{ext}"
        try:
            out_path.write_bytes(data)
        except Exception:
            return None
        return out_path

    def _create_placeholder(self, safe_id: str, title: str, tags: List[str]) -> Path:
        """Create a deterministic local SVG cover as the last-resort fallback."""
        digest = hashlib.sha256((safe_id + title).encode("utf-8")).hexdigest()
        hue_a = int(digest[:2], 16)
        hue_b = int(digest[2:4], 16)
        color_a = f"hsl({200 + hue_a % 80}, 78%, 28%)"
        color_b = f"hsl({250 + hue_b % 70}, 74%, 18%)"
        tag_text = " · ".join(tags[:3]) if tags else "AI Tech News"
        short_title = title[:86] + ("..." if len(title) > 86 else "")

        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{color_a}"/>
      <stop offset="100%" stop-color="{color_b}"/>
    </linearGradient>
    <radialGradient id="glow" cx="70%" cy="18%" r="55%">
      <stop offset="0%" stop-color="#67e8f9" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#67e8f9" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect width="1280" height="720" fill="url(#glow)"/>
  <g opacity="0.24" stroke="#dbeafe" stroke-width="1">
    <path d="M120 170H420M220 270H620M90 390H520M760 180H1160M700 330H1040M820 480H1190"/>
    <circle cx="420" cy="170" r="6"/><circle cx="620" cy="270" r="6"/><circle cx="520" cy="390" r="6"/>
    <circle cx="760" cy="180" r="6"/><circle cx="1040" cy="330" r="6"/><circle cx="820" cy="480" r="6"/>
  </g>
  <text x="82" y="112" fill="#67e8f9" font-family="Inter, Segoe UI, Arial" font-size="28" font-weight="700">Horizon AI Brief</text>
  <foreignObject x="82" y="250" width="1040" height="230">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Inter, Segoe UI, Arial; color: #eef2ff; font-size: 54px; font-weight: 800; line-height: 1.18;">
      {xml_escape(short_title)}
    </div>
  </foreignObject>
  <text x="82" y="620" fill="#c7d2fe" font-family="Inter, Segoe UI, Arial" font-size="26">{xml_escape(tag_text)}</text>
</svg>"""
        out_path = self.media_dir / f"{safe_id}.svg"
        out_path.write_text(svg, encoding="utf-8")
        return out_path
