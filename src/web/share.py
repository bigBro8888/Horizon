"""Generate social-media share posts from daily summaries."""

from __future__ import annotations

import re
from pathlib import Path

from ..ai.client import create_ai_client
from ..models import AIConfig
from ..storage.manager import StorageManager

_HEADING_RE = re.compile(r"^##\s+\[?([^\]]+)\]?(?:\([^)]*\))?\s*(?:⭐️.*)?$", re.MULTILINE)
_LIST_ITEM_RE = re.compile(r"^\d+\.\s+\[([^\]]+)\]", re.MULTILINE)
_BLOCKQUOTE_RE = re.compile(r"^>\s*(.+)$", re.MULTILINE)
_SECTION_RE = re.compile(
    r"^##\s+\[?([^\]]+)\]?(?:\([^)]*\))?.*?\n\n((?:.(?!\n##\s))*)",
    re.MULTILINE | re.DOTALL,
)

_SHARE_SYSTEM = {
    "zh": (
        "你是一位擅长科技资讯传播的社交媒体编辑。"
        "请根据用户提供的每日新闻简报，撰写一篇适合在微信公众号、小红书、"
        "微博或 X 发布的分享帖。"
        "要求：\n"
        "1. 使用简体中文，语气自然、有洞察力，避免公文腔\n"
        "2. 开头用 1-2 句抓住今日最大亮点\n"
        "3. 精选 5-8 条最重要新闻，每条 1-2 句话点评，不要简单罗列标题\n"
        "4. 结尾加一句简短展望或阅读建议\n"
        "5. 文末附 3-6 个相关 hashtag（如 #AI #科技资讯）\n"
        "6. 总长度控制在 800-1500 字，适合直接复制发布\n"
        "7. 只输出正文，不要加「以下是分享稿」等前缀"
    ),
    "en": (
        "You are a social media editor specializing in tech news."
        "Turn the daily briefing into a post suitable for X, LinkedIn, or Reddit."
        "Requirements:\n"
        "1. Natural, insightful tone — not press-release style\n"
        "2. Open with 1-2 sentences on today's biggest story\n"
        "3. Highlight 5-8 key items with brief commentary each\n"
        "4. Close with a short takeaway\n"
        "5. End with 3-6 relevant hashtags\n"
        "6. Keep total length under 1200 words\n"
        "7. Output only the post body, no meta preamble"
    ),
}


def _shares_dir(data_dir: Path) -> Path:
    path = data_dir / "shares"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _extract_brief(markdown: str) -> str:
    """Build a compact briefing for social-post generation."""
    title_match = re.search(r"^#\s+(.+)$", markdown, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else "Horizon Daily"

    overview = " ".join(_BLOCKQUOTE_RE.findall(markdown)).strip()
    headlines = _LIST_ITEM_RE.findall(markdown)
    if not headlines:
        headlines = [m.strip() for m in _HEADING_RE.findall(markdown)]

    parts = [f"# {title}"]
    if overview:
        parts.append(f"\nOverview: {overview}")

    if headlines:
        parts.append("\nHeadlines:")
        for idx, headline in enumerate(headlines[:20], start=1):
            parts.append(f"{idx}. {headline.strip()}")

    for match in _SECTION_RE.finditer(markdown):
        headline, body = match.group(1).strip(), match.group(2).strip()
        summary_bits = []
        for line in body.splitlines():
            clean = line.strip()
            if not clean or clean.startswith(("#", ">", "-", "*", "<")):
                continue
            if clean.lower().startswith(("tags:", "标签:", "background", "背景", "discussion", "讨论")):
                continue
            summary_bits.append(clean)
            if len(" ".join(summary_bits)) > 280:
                break
        if summary_bits:
            parts.append(f"\n## {headline}\n{' '.join(summary_bits)}")

        if len("\n".join(parts)) > 12000:
            break

    return "\n".join(parts)


def _is_valid_share_text(text: str) -> bool:
    stripped = text.strip()
    return len(stripped) >= 120 and not stripped.isdigit()


async def generate_share_post(
    markdown: str,
    language: str,
    ai_config: AIConfig,
    *,
    use_cache: bool = True,
    cache_key: str | None = None,
    data_dir: Path | None = None,
) -> str:
    """Generate a social-media post from a daily summary markdown."""
    lang = "zh" if language.lower().startswith("zh") else "en"
    data_root = data_dir or Path("data")
    cache_path = None
    if use_cache and cache_key:
        cache_path = _shares_dir(data_root) / f"{cache_key}.txt"
        if cache_path.exists():
            return cache_path.read_text(encoding="utf-8")

    client = create_ai_client(ai_config)
    system = _SHARE_SYSTEM[lang]
    brief = _extract_brief(markdown)
    user = f"Language: {lang}\n\nCondensed daily briefing:\n\n{brief}"
    result = await client.complete(
        system=system,
        user=user,
        temperature=0.5,
        max_tokens=2048,
        plain_text=True,
    )
    text = result.strip()
    if not _is_valid_share_text(text):
        raise ValueError("AI returned an invalid share post, please try again")
    if cache_path is not None:
        cache_path.write_text(text, encoding="utf-8")
    return text


def load_ai_config(data_dir: Path | None = None) -> AIConfig:
    root = data_dir or Path("data")
    storage = StorageManager(data_dir=str(root))
    return storage.load_config().ai
