"""Build a Cloudflare Pages compatible static site.

The dynamic FastAPI server is useful for local development, but Cloudflare
Pages only serves static files. This exporter copies the frontend assets and
generated issue/media data into ``public/`` and renders each article to
``public/article/<slug>/index.html`` for SEO-friendly URLs.
"""

from __future__ import annotations

import html
import json
import shutil
from pathlib import Path
from typing import Any

import markdown

from .issue import make_article_slug

PROJECT_ROOT = Path(__file__).resolve().parents[2]
STATIC_DIR = PROJECT_ROOT / "src" / "web" / "static"
DATA_DIR = PROJECT_ROOT / "data"
PUBLIC_DIR = PROJECT_ROOT / "public"
ADSENSE_SCRIPT = (
    '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4598371924010228"\n'
    '     crossorigin="anonymous"></script>'
)


def _copytree(src: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    if src.exists():
        shutil.copytree(src, dest)


def _load_issue(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    date = data.get("date") or path.stem
    for article in data.get("articles", []):
        if not article.get("slug"):
            slug = make_article_slug(
                date,
                str(article.get("id", "")),
                str((article.get("title") or {}).get("en") or (article.get("title") or {}).get("zh") or ""),
                article.get("rank"),
            )
            article["slug"] = slug
        article["path"] = article.get("path") or f"/article/{article['slug']}"
    return data


def _localized(article: dict[str, Any], key: str, lang: str = "zh") -> str:
    value = article.get(key) or {}
    if isinstance(value, dict):
        fallback = "zh" if lang == "en" else "en"
        return str(value.get(lang) or value.get(fallback) or "")
    return str(value or "")


def _article_html(issue: dict[str, Any], article: dict[str, Any], lang: str = "zh") -> str:
    is_en = lang == "en"
    title = _localized(article, "title", lang)
    summary = _localized(article, "summary", lang)
    body = _localized(article, "body", lang)
    image_path = article.get("image_path") or ""
    image_url = f"/{image_path}" if image_path else ""
    canonical = f"/en/article/{article.get('slug')}" if is_en else article.get("path") or f"/article/{article.get('slug')}"
    body_html = markdown.markdown(body, extensions=["extra", "sane_lists", "nl2br"], output_format="html5")
    tags = " ".join(f"<span>#{html.escape(str(tag))}</span>" for tag in article.get("tags", [])[:6])
    sources = "".join(
        f'<a href="{html.escape(str(src.get("url", "")))}" target="_blank" rel="noopener">{html.escape(str(src.get("title") or src.get("url") or ""))}</a>'
        for src in article.get("sources", [])
        if src.get("url")
    )
    original = html.escape(str(article.get("url") or ""))
    safe_title = html.escape(title)
    safe_summary = html.escape(summary[:180])
    html_lang = "en" if is_en else "zh-CN"
    site_title = "Horizon Tech" if is_en else "Horizon 科技前沿"
    back_text = "← Back to home" if is_en else "← 返回首页"
    time_label = "News time" if is_en else "新闻时间"
    source_label = "Source" if is_en else "来源"
    original_text = "Read original" if is_en else "阅读原文"
    references_text = "References" if is_en else "参考链接"

    return f"""<!DOCTYPE html>
<html lang="{html_lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{safe_title} - {site_title}</title>
  <meta name="description" content="{safe_summary}" />
  <link rel="canonical" href="{html.escape(canonical)}" />
  <link rel="alternate" hreflang="zh-CN" href="/article/{html.escape(str(article.get('slug') or ''))}" />
  <link rel="alternate" hreflang="en" href="/en/article/{html.escape(str(article.get('slug') or ''))}" />
  <meta property="og:title" content="{safe_title}" />
  <meta property="og:description" content="{safe_summary}" />
  {f'<meta property="og:image" content="{html.escape(image_url)}" />' if image_url else ''}
  {ADSENSE_SCRIPT}
  <link rel="stylesheet" href="/static/styles.css?v=20" />
</head>
<body>
  <div class="aurora" aria-hidden="true"></div>
  <main class="article-page">
    <a class="article-back" href="/" data-smart-back>{back_text}</a>
    {f'<img class="article-page-cover" src="{html.escape(image_url)}" alt="{safe_title}" />' if image_url else ''}
    <div class="article-page-tags">{tags}</div>
    <h1>{safe_title}</h1>
    <p class="article-page-meta">{time_label}: {html.escape(str(article.get("fetched_at") or article.get("published_at") or issue.get("generated_at") or ""))} · {source_label}: {html.escape(str(article.get("source") or ""))}</p>
    <article class="article-page-body">{body_html}</article>
    <section class="article-page-links">
      <a class="source-primary" href="{original}" target="_blank" rel="noopener">{original_text}</a>
      {f'<h2>{references_text}</h2>{sources}' if sources else ''}
    </section>
  </main>
  <script>
    document.querySelector("[data-smart-back]").addEventListener("click", function (event) {{
      if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) {{
        event.preventDefault();
        history.back();
      }}
    }});
  </script>
</body>
</html>"""


def _write_issues() -> list[dict[str, Any]]:
    issues_src = DATA_DIR / "issues"
    public_issues = PUBLIC_DIR / "data" / "issues"
    public_issues.mkdir(parents=True, exist_ok=True)
    for article_root in (PUBLIC_DIR / "article", PUBLIC_DIR / "en" / "article"):
        if article_root.exists():
            shutil.rmtree(article_root)
    issue_metas: list[dict[str, Any]] = []

    if not issues_src.exists():
        (public_issues / "index.json").write_text("[]\n", encoding="utf-8")
        return []

    for issue_path in sorted(issues_src.glob("*.json"), reverse=True):
        issue = _load_issue(issue_path)
        date = issue.get("date") or issue_path.stem
        articles = issue.get("articles", [])
        out_path = public_issues / f"{date}.json"
        out_path.write_text(json.dumps(issue, ensure_ascii=False, indent=2), encoding="utf-8")
        issue_metas.append(
            {
                "date": date,
                "count": int(issue.get("count", len(articles))),
                "generated_at": issue.get("generated_at"),
            }
        )

        for article in articles:
            slug = article.get("slug")
            if not slug:
                continue
            article_dir = PUBLIC_DIR / "article" / slug
            article_dir.mkdir(parents=True, exist_ok=True)
            (article_dir / "index.html").write_text(_article_html(issue, article, "zh"), encoding="utf-8")

            en_article_dir = PUBLIC_DIR / "en" / "article" / slug
            en_article_dir.mkdir(parents=True, exist_ok=True)
            (en_article_dir / "index.html").write_text(_article_html(issue, article, "en"), encoding="utf-8")

    (public_issues / "index.json").write_text(
        json.dumps(issue_metas, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return issue_metas


def _write_site_info() -> None:
    data_dir = PUBLIC_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    config_path = DATA_DIR / "config.json"
    site = {
        "title_zh": "Horizon 科技前沿",
        "title_en": "Horizon Tech",
        "description_zh": "AI 自动生成的每日科技新闻",
        "description_en": "AI-curated daily technology news",
    }
    if config_path.exists():
        try:
            raw = json.loads(config_path.read_text(encoding="utf-8"))
            site.update(raw.get("site") or {})
        except Exception:
            pass
    (data_dir / "site.json").write_text(
        json.dumps({"site": site, "static_site": True}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def build() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    _copytree(STATIC_DIR, PUBLIC_DIR / "static")
    _copytree(DATA_DIR / "media", PUBLIC_DIR / "media")

    index_html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    (PUBLIC_DIR / "index.html").write_text(index_html, encoding="utf-8")
    (PUBLIC_DIR / "ads.txt").write_text(
        "google.com, pub-4598371924010228, DIRECT, f08c47fec0942fa0\n",
        encoding="utf-8",
    )
    (PUBLIC_DIR / "_headers").write_text(
        "/ads.txt\n  Content-Type: text/plain; charset=utf-8\n",
        encoding="utf-8",
    )
    _write_site_info()
    _write_issues()


def main() -> None:
    build()
    print(f"Static site exported to {PUBLIC_DIR}")


if __name__ == "__main__":
    main()
