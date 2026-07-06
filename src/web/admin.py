"""Admin helpers: config read/write, .env updates, and token auth."""

from __future__ import annotations

import json
import re
import secrets
import time
from pathlib import Path
from typing import Any, Dict, Optional

# In-memory admin session tokens -> expiry timestamp
_TOKENS: Dict[str, float] = {}
_TOKEN_TTL = 60 * 60 * 12  # 12 hours


def issue_token() -> str:
    token = secrets.token_urlsafe(32)
    _TOKENS[token] = time.time() + _TOKEN_TTL
    return token


def is_valid_token(token: Optional[str]) -> bool:
    if not token:
        return False
    expiry = _TOKENS.get(token)
    if not expiry:
        return False
    if time.time() > expiry:
        _TOKENS.pop(token, None)
        return False
    return True


def read_raw_config(config_path: Path) -> Dict[str, Any]:
    """Read config.json as a raw dict (no env expansion)."""
    if not config_path.exists():
        return {}
    return json.loads(config_path.read_text(encoding="utf-8"))


def write_raw_config(config_path: Path, data: Dict[str, Any]) -> None:
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def update_env_var(env_path: Path, key: str, value: str) -> None:
    """Create or update a KEY=value line in the .env file, preserving others."""
    if not key:
        return
    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    pattern = re.compile(rf"^\s*{re.escape(key)}\s*=")
    replaced = False
    for i, line in enumerate(lines):
        if pattern.match(line):
            lines[i] = f"{key}={value}"
            replaced = True
            break
    if not replaced:
        lines.append(f"{key}={value}")

    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# Default editable config sections so the admin form always has a structure to
# bind to, even for a fresh config.json.
_DEFAULT_SCHEDULE = {"enabled": True, "times": ["09:00"], "timezone": "Asia/Shanghai"}
_DEFAULT_IMAGERY = {"enabled": True, "max_results": 6}
_DEFAULT_SITE = {
    "title_zh": "Horizon 科技前沿",
    "title_en": "Horizon Tech",
    "description_zh": "由 AI 自动生成的每日科技新闻",
    "description_en": "AI-curated daily technology news",
}


def extract_editable(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Return only the admin-editable slice of the config (api key masked)."""
    ai = raw.get("ai", {}) or {}
    filtering = raw.get("filtering", {}) or {}
    return {
        "ai": {
            "provider": ai.get("provider", "ali"),
            "model": ai.get("model", ""),
            "api_key_env": ai.get("api_key_env", "DASHSCOPE_API_KEY"),
            "api_key_set": bool(_env_has(ai.get("api_key_env"))),
            "temperature": ai.get("temperature", 0.3),
            "max_tokens": ai.get("max_tokens", 4096),
            "languages": ai.get("languages", ["en", "zh"]),
        },
        "filtering": {
            "ai_score_threshold": filtering.get("ai_score_threshold", 7.0),
            "max_items": filtering.get("max_items"),
            "time_window_hours": filtering.get("time_window_hours", 24),
        },
        "schedule": {**_DEFAULT_SCHEDULE, **(raw.get("schedule") or {})},
        "imagery": {**_DEFAULT_IMAGERY, **(raw.get("imagery") or {})},
        "site": {**_DEFAULT_SITE, **(raw.get("site") or {})},
    }


def _env_has(key: Optional[str]) -> bool:
    import os

    return bool(key and os.environ.get(key))


def apply_editable(raw: Dict[str, Any], payload: Dict[str, Any], env_path: Path) -> Dict[str, Any]:
    """Merge an admin-submitted editable payload back into the raw config.

    A non-empty ``ai.api_key`` value is written to the .env file (never stored
    in config.json). Returns the updated raw config dict.
    """
    raw = dict(raw)

    incoming_ai = payload.get("ai", {}) or {}
    ai = dict(raw.get("ai", {}) or {})
    for field in ("provider", "model", "api_key_env", "temperature", "max_tokens", "languages"):
        if field in incoming_ai and incoming_ai[field] is not None:
            ai[field] = incoming_ai[field]
    # Persist a freshly provided API key to .env under the configured var name.
    new_key = (incoming_ai.get("api_key") or "").strip()
    if new_key:
        update_env_var(env_path, ai.get("api_key_env", "DASHSCOPE_API_KEY"), new_key)
    raw["ai"] = ai

    incoming_filtering = payload.get("filtering", {}) or {}
    filtering = dict(raw.get("filtering", {}) or {})
    for field in ("ai_score_threshold", "max_items", "time_window_hours"):
        if field in incoming_filtering:
            filtering[field] = incoming_filtering[field]
    raw["filtering"] = filtering

    if "schedule" in payload:
        raw["schedule"] = {**_DEFAULT_SCHEDULE, **(raw.get("schedule") or {}), **(payload["schedule"] or {})}
    if "imagery" in payload:
        raw["imagery"] = {**_DEFAULT_IMAGERY, **(raw.get("imagery") or {}), **(payload["imagery"] or {})}
    if "site" in payload:
        raw["site"] = {**_DEFAULT_SITE, **(raw.get("site") or {}), **(payload["site"] or {})}

    return raw
