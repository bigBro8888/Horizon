"""Web server for the Horizon AI tech-news site.

Serves a fully automated, bilingual news site backed by structured per-day
issue JSON (``data/issues/{date}.json``). News is generated automatically on a
configurable schedule (APScheduler); there is no public "generate" button. A
password-protected admin API manages the schedule, AI settings and site info.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import subprocess
import sys
import threading
import webbrowser
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import uvicorn
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
import markdown
from pydantic import BaseModel

from . import admin as admin_helpers
from .issue import make_article_slug

STATIC_DIR = Path(__file__).parent / "static"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
ISSUES_DIR = DATA_DIR / "issues"
MEDIA_DIR = DATA_DIR / "media"
CONFIG_PATH = DATA_DIR / "config.json"
ENV_PATH = PROJECT_ROOT / ".env"


# --------------------------------------------------------------------------- #
# Run state (subprocess-based generation)
# --------------------------------------------------------------------------- #
@dataclass
class RunState:
    running: bool = False
    started_at: str | None = None
    finished_at: str | None = None
    exit_code: int | None = None
    error: str | None = None
    process: subprocess.Popen[str] | None = field(default=None, repr=False)


_run_state = RunState()
_run_lock = threading.Lock()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _horizon_command() -> list[str]:
    scripts_dir = Path(sys.executable).resolve().parent
    horizon_bin = scripts_dir / ("horizon.exe" if os.name == "nt" else "horizon")
    if horizon_bin.exists():
        return [str(horizon_bin)]
    return [sys.executable, "-m", "src.main"]


def _read_run_log_tail(log_path: Path, max_lines: int = 12) -> str:
    if not log_path.exists():
        return ""
    lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(lines[-max_lines:])


def _monitor_run(process: subprocess.Popen[str], log_path: Path) -> None:
    global _run_state
    exit_code = process.wait()
    with _run_lock:
        _run_state.running = False
        _run_state.finished_at = _utc_now()
        _run_state.exit_code = exit_code
        if exit_code != 0:
            tail = _read_run_log_tail(log_path)
            _run_state.error = f"horizon exited with code {exit_code}" + (f"\n{tail}" if tail else "")


def _start_horizon_run() -> None:
    global _run_state
    with _run_lock:
        if _run_state.running:
            raise HTTPException(status_code=409, detail="A generation task is already running")

        command = _horizon_command()
        log_path = DATA_DIR / "horizon-run.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)

        env = os.environ.copy()
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        load_dotenv(ENV_PATH, override=False)

        with log_path.open("w", encoding="utf-8") as log_file:
            process = subprocess.Popen(
                command,
                cwd=PROJECT_ROOT,
                env=env,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
        _run_state = RunState(running=True, started_at=_utc_now(), process=process)

    thread = threading.Thread(target=_monitor_run, args=(process, log_path), daemon=True)
    thread.start()


def _scheduled_run() -> None:
    """Entry point invoked by the scheduler; swallows the 'already running' case."""
    try:
        _start_horizon_run()
        print(f"[scheduler] Triggered daily generation at {_utc_now()}")
    except HTTPException as exc:
        print(f"[scheduler] Skipped: {exc.detail}")
    except Exception as exc:  # noqa: BLE001
        print(f"[scheduler] Failed to start run: {exc}")


# --------------------------------------------------------------------------- #
# Issue (news) helpers
# --------------------------------------------------------------------------- #
def _list_issue_dates() -> list[str]:
    if not ISSUES_DIR.exists():
        return []
    dates = [p.stem for p in ISSUES_DIR.glob("*.json")]
    return sorted(dates, reverse=True)


def _load_issue(date: str) -> dict[str, Any]:
    path = ISSUES_DIR / f"{date}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Issue not found")
    data = json.loads(path.read_text(encoding="utf-8"))
    for article in data.get("articles", []):
        if not article.get("slug"):
            slug = make_article_slug(
                data.get("date", date),
                str(article.get("id", "")),
                str((article.get("title") or {}).get("en") or (article.get("title") or {}).get("zh") or ""),
                article.get("rank"),
            )
            article["slug"] = slug
            article["path"] = f"/article/{slug}"
    return data


def _find_article(slug: str) -> tuple[dict[str, Any], dict[str, Any]]:
    requested_hash = slug.rsplit("-", 1)[-1] if "-" in slug else ""
    for date in _list_issue_dates():
        issue = _load_issue(date)
        for article in issue.get("articles", []):
            article_slug = str(article.get("slug") or "")
            article_hash = article_slug.rsplit("-", 1)[-1] if "-" in article_slug else ""
            if article_slug == slug or (requested_hash and requested_hash == article_hash):
                return issue, article
    raise HTTPException(status_code=404, detail="Article not found")


def _localized(article: dict[str, Any], key: str, lang: str) -> str:
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


# --------------------------------------------------------------------------- #
# Pydantic models
# --------------------------------------------------------------------------- #
class IssueMeta(BaseModel):
    date: str
    count: int
    generated_at: str | None = None


class RunStatus(BaseModel):
    running: bool
    started_at: str | None = None
    finished_at: str | None = None
    exit_code: int | None = None
    error: str | None = None


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str


# --------------------------------------------------------------------------- #
# Auth dependency
# --------------------------------------------------------------------------- #
def require_admin(authorization: Optional[str] = Header(default=None)) -> None:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if not admin_helpers.is_valid_token(token):
        raise HTTPException(status_code=401, detail="Unauthorized")


def _run_status() -> RunStatus:
    with _run_lock:
        return RunStatus(
            running=_run_state.running,
            started_at=_run_state.started_at,
            finished_at=_run_state.finished_at,
            exit_code=_run_state.exit_code,
            error=_run_state.error,
        )


# --------------------------------------------------------------------------- #
# Scheduler
# --------------------------------------------------------------------------- #
_scheduler: BackgroundScheduler | None = None


def _configure_scheduler() -> None:
    """(Re)build scheduled jobs from config.schedule."""
    global _scheduler
    if _scheduler is None:
        return

    _scheduler.remove_all_jobs()

    raw = admin_helpers.read_raw_config(CONFIG_PATH)
    schedule = raw.get("schedule") or {}
    if not schedule.get("enabled", True):
        print("[scheduler] Automatic generation disabled by config.")
        return

    times = schedule.get("times") or ["09:00"]
    tz = schedule.get("timezone", "Asia/Shanghai")
    for t in times:
        try:
            hour, minute = (int(x) for x in str(t).split(":"))
        except Exception:
            print(f"[scheduler] Invalid time '{t}', skipping.")
            continue
        try:
            _scheduler.add_job(
                _scheduled_run,
                CronTrigger(hour=hour, minute=minute, timezone=tz),
                id=f"daily-{hour:02d}{minute:02d}",
                replace_existing=True,
            )
            print(f"[scheduler] Scheduled daily generation at {hour:02d}:{minute:02d} ({tz})")
        except Exception as exc:  # noqa: BLE001
            print(f"[scheduler] Failed to add job for {t}: {exc}")


# --------------------------------------------------------------------------- #
# App factory
# --------------------------------------------------------------------------- #
def create_app() -> FastAPI:
    app = FastAPI(title="Horizon", docs_url=None, redoc_url=None)

    # ------------------------ public news API ------------------------ #
    @app.get("/api/site")
    def site_info() -> dict[str, Any]:
        raw = admin_helpers.read_raw_config(CONFIG_PATH)
        editable = admin_helpers.extract_editable(raw)
        return {"site": editable["site"]}

    @app.get("/api/issues", response_model=list[IssueMeta])
    def list_issues() -> list[IssueMeta]:
        result: list[IssueMeta] = []
        for date in _list_issue_dates():
            try:
                data = _load_issue(date)
            except HTTPException:
                continue
            result.append(
                IssueMeta(
                    date=date,
                    count=int(data.get("count", len(data.get("articles", [])))),
                    generated_at=data.get("generated_at"),
                )
            )
        return result

    @app.get("/api/issues/latest")
    def latest_issue() -> dict[str, Any]:
        dates = _list_issue_dates()
        if not dates:
            return {"date": None, "articles": [], "count": 0}
        return _load_issue(dates[0])

    @app.get("/api/issues/{date}")
    def get_issue(date: str) -> dict[str, Any]:
        return _load_issue(date)

    @app.get("/article/{slug}", response_class=HTMLResponse)
    def article_page(slug: str) -> HTMLResponse:
        issue, article = _find_article(slug)
        return HTMLResponse(_article_html(issue, article, "zh"))

    @app.get("/en/article/{slug}", response_class=HTMLResponse)
    def english_article_page(slug: str) -> HTMLResponse:
        issue, article = _find_article(slug)
        return HTMLResponse(_article_html(issue, article, "en"))

    # ------------------------ admin API ------------------------ #
    @app.post("/api/admin/login", response_model=LoginResponse)
    def admin_login(body: LoginRequest) -> LoginResponse:
        expected = os.environ.get("ADMIN_PASSWORD")
        if not expected:
            raise HTTPException(
                status_code=503,
                detail="ADMIN_PASSWORD is not set on the server (.env).",
            )
        if body.password != expected:
            raise HTTPException(status_code=401, detail="Incorrect password")
        return LoginResponse(token=admin_helpers.issue_token())

    @app.get("/api/admin/config", dependencies=[Depends(require_admin)])
    def admin_get_config() -> dict[str, Any]:
        raw = admin_helpers.read_raw_config(CONFIG_PATH)
        return admin_helpers.extract_editable(raw)

    @app.put("/api/admin/config", dependencies=[Depends(require_admin)])
    def admin_put_config(payload: dict[str, Any]) -> dict[str, Any]:
        raw = admin_helpers.read_raw_config(CONFIG_PATH)
        updated = admin_helpers.apply_editable(raw, payload, ENV_PATH)
        admin_helpers.write_raw_config(CONFIG_PATH, updated)
        # Reload env + reschedule so changes take effect immediately.
        load_dotenv(ENV_PATH, override=True)
        _configure_scheduler()
        return admin_helpers.extract_editable(updated)

    @app.post("/api/admin/run", response_model=RunStatus, dependencies=[Depends(require_admin)])
    def admin_run() -> RunStatus:
        _start_horizon_run()
        return _run_status()

    @app.get("/api/admin/run/status", response_model=RunStatus, dependencies=[Depends(require_admin)])
    def admin_run_status() -> RunStatus:
        return _run_status()

    # ------------------------ pages + static ------------------------ #
    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/admin")
    def admin_page() -> FileResponse:
        return FileResponse(STATIC_DIR / "admin.html")

    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    # ------------------------ lifecycle ------------------------ #
    @app.on_event("startup")
    def _startup() -> None:
        global _scheduler
        _scheduler = BackgroundScheduler()
        _scheduler.start()
        _configure_scheduler()

    @app.on_event("shutdown")
    def _shutdown() -> None:
        global _scheduler
        if _scheduler is not None:
            _scheduler.shutdown(wait=False)
            _scheduler = None

    return app


def main() -> None:
    load_dotenv(ENV_PATH)

    parser = argparse.ArgumentParser(description="Horizon AI news site")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--open", action="store_true", help="Open browser after startup")
    args = parser.parse_args()

    display_host = "127.0.0.1" if args.host in ("0.0.0.0", "::") else args.host
    url = f"http://{display_host}:{args.port}/"
    if args.open:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    print(f"Horizon news site running at {url}")
    uvicorn.run(create_app(), host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
