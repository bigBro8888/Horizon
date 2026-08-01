"use strict";

const I18N = {
  zh: {
    heroKicker: "",
    heroMeta: (n) => `共 ${n} 篇`,
    empty: "暂无内容，系统会在下次定时任务后自动生成。",
    footer: "Now AI News · AI 驱动的科技新闻",
    admin: "后台",
    background: "背景",
    discussion: "社区讨论",
    references: "参考链接",
    readOriginal: "阅读原文",
    source: "来源",
    today: "今日",
    relToday: "今天",
    relYesterday: "昨天",
    relDaysAgo: (n) => `${n} 天前`,
    all: "全部",
    date: "日期",
    allDates: "全部日期",
    searchPlaceholder: "搜索标题、摘要、标签",
    newsTime: "新闻时间",
    prev: "上一页",
    next: "下一页",
    pageInfo: (page, pages, total) => `第 ${page}/${pages} 页 · ${total} 条`,
    shareTools: "分享与收藏",
    favorite: "收藏",
    favoriteHint: "已提示收藏：请按 Ctrl+D（Mac 为 ⌘D）加入浏览器收藏夹",
    wechatTitle: "微信分享",
    wechatText: "请用微信扫码打开并分享当前页面",
    copyLink: "复制链接",
    copied: "链接已复制",
    instagramHint: "Instagram 不支持网页直连分享，链接已复制，可粘贴到 Instagram",
    sharePopupBlocked: "弹窗被拦截，请允许后重试",
  },
  en: {
    heroKicker: "",
    heroMeta: (n) => `${n} stories`,
    empty: "No content yet. The system will generate it on the next scheduled run.",
    footer: "Now AI News · AI-powered tech news",
    admin: "Admin",
    background: "Background",
    discussion: "Discussion",
    references: "References",
    readOriginal: "Read original",
    source: "Source",
    today: "Today",
    relToday: "Today",
    relYesterday: "Yesterday",
    relDaysAgo: (n) => `${n} days ago`,
    all: "All",
    date: "Date",
    allDates: "All dates",
    searchPlaceholder: "Search title, summary, tags",
    newsTime: "News time",
    prev: "Previous",
    next: "Next",
    pageInfo: (page, pages, total) => `Page ${page}/${pages} · ${total} items`,
    shareTools: "Share & save",
    favorite: "Save",
    favoriteHint: "Press Ctrl+D (⌘D on Mac) to bookmark this page",
    wechatTitle: "Share to WeChat",
    wechatText: "Scan the QR code with WeChat to open and share this page",
    copyLink: "Copy link",
    copied: "Link copied",
    instagramHint: "Instagram has no web share URL. Link copied — paste it in Instagram",
    sharePopupBlocked: "Popup blocked. Please allow popups and try again",
  },
};

const state = {
  lang: "zh",
  site: null,
  issues: [],
  allArticles: [],
  filteredArticles: [],
  dateFilter: "",
  query: "",
  page: 1,
  pageSize: 18,
};

const FEED_STATE_KEY = "horizon_feed_state";
const ISSUE_CACHE_KEY = "horizon_issue_cache";
const ISSUE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/* --------------------------- language detection --------------------------- */
function detectLang() {
  const stored = localStorage.getItem("horizon_lang");
  if (stored === "zh" || stored === "en") return stored;

  const langs = (navigator.languages || [navigator.language || ""]).map((l) => l.toLowerCase());
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (e) {
    tz = "";
  }
  const zhTimezones = ["Asia/Shanghai", "Asia/Chongqing", "Asia/Urumqi", "Asia/Harbin"];
  const isSimplifiedChinese =
    langs.some((l) => l === "zh" || l === "zh-cn" || l === "zh-hans" || l.startsWith("zh-hans")) ||
    zhTimezones.includes(tz);
  return isSimplifiedChinese ? "zh" : "en";
}

/* --------------------------- mini markdown --------------------------- */
function escapeHtml(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMd(s) {
  let t = escapeHtml(s);
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  return t;
}

function renderMarkdown(md) {
  if (!md) return "";
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inList = false;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      html.push("<p>" + inlineMd(para.join(" ")) + "</p>");
      para = [];
    }
  };
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      closeList();
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push("<li>" + inlineMd(bullet[1]) + "</li>");
    } else if (heading) {
      flushPara();
      closeList();
      html.push("<p><strong>" + inlineMd(heading[1]) + "</strong></p>");
    } else {
      closeList();
      para.push(line);
    }
  }
  flushPara();
  closeList();
  return html.join("\n");
}

/* --------------------------- helpers --------------------------- */
function t() {
  return I18N[state.lang];
}

function pick(obj) {
  if (!obj) return "";
  return (obj[state.lang] || obj.en || obj.zh || "").trim();
}

function formatSiteTitle(title) {
  const safeTitle = escapeHtml(title || "Now AI News 今日科技前沿");
  return safeTitle.replace(/\bAI\b/, '<span class="title-ai">AI</span>');
}

function scoreText(score) {
  if (score == null) return "";
  return Number(score).toFixed(1);
}

function coverStyle(imagePath) {
  if (!imagePath) return "";
  return `background-image:url('/${imagePath}')`;
}

function observeLazyCovers(root) {
  const covers = root.querySelectorAll(".card-cover[data-bg]");
  if (!covers.length) return;
  if (!("IntersectionObserver" in window)) {
    covers.forEach((cover) => {
      cover.style.backgroundImage = `url('${cover.dataset.bg}')`;
      cover.removeAttribute("data-bg");
    });
    return;
  }
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const cover = entry.target;
        const bg = cover.dataset.bg;
        if (bg) {
          cover.style.backgroundImage = `url('${bg}')`;
          cover.removeAttribute("data-bg");
        }
        obs.unobserve(cover);
      });
    },
    { rootMargin: "240px 0px", threshold: 0.01 }
  );
  covers.forEach((cover) => observer.observe(cover));
}

function articlePath(a) {
  if (state.lang === "en" && a.slug) return `/en/article/${a.slug}`;
  return a.path || (a.slug ? `/article/${a.slug}` : "#");
}

function saveFeedState() {
  try {
    sessionStorage.setItem(
      FEED_STATE_KEY,
      JSON.stringify({
        lang: state.lang,
        dateFilter: state.dateFilter,
        query: state.query,
        page: state.page,
        scrollY: window.scrollY,
        savedAt: Date.now(),
      })
    );
  } catch (e) {
    /* session storage may be unavailable in strict privacy modes */
  }
}

function loadFeedState() {
  try {
    const raw = sessionStorage.getItem(FEED_STATE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || Date.now() - Number(saved.savedAt || 0) > 60 * 60 * 1000) return null;
    return saved;
  } catch (e) {
    return null;
  }
}

function saveIssueCache(issues, articles) {
  try {
    sessionStorage.setItem(
      ISSUE_CACHE_KEY,
      JSON.stringify({
        issues,
        articles,
        cachedAt: Date.now(),
      })
    );
  } catch (e) {
    /* session storage may be unavailable or full */
  }
}

function loadIssueCache() {
  try {
    const raw = sessionStorage.getItem(ISSUE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || Date.now() - Number(cached.cachedAt || 0) > ISSUE_CACHE_TTL_MS) return null;
    if (!Array.isArray(cached.issues) || !Array.isArray(cached.articles)) return null;
    return cached;
  } catch (e) {
    return null;
  }
}

async function fetchJson(path, { cache = "default" } = {}) {
  try {
    const res = await fetch(path, { cache });
    if (res.ok) return await res.json();
  } catch (e) {
    /* network or parse errors fall through */
  }
  return null;
}

function articleTime(a) {
  return a.fetched_at || a.published_at || a.generated_at || "";
}

function timeValue(a) {
  const raw = articleTime(a);
  const value = raw ? Date.parse(raw) : 0;
  return Number.isFinite(value) ? value : 0;
}

function issueDateFromTime(a) {
  const raw = articleTime(a);
  if (!raw) return a.issue_date || "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return a.issue_date || "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatNewsTime(a) {
  const raw = articleTime(a);
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString(state.lang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* --------------------------- rendering --------------------------- */
function applyStaticText() {
  const tr = t();
  document.documentElement.lang = state.lang;
  const heroKicker = document.getElementById("heroKicker");
  heroKicker.textContent = tr.heroKicker;
  heroKicker.hidden = !tr.heroKicker;
  document.getElementById("emptyText").textContent = tr.empty;
  document.getElementById("footerText").textContent = tr.footer;
  document.getElementById("adminLink").textContent = tr.admin;
  document.getElementById("sortLatest").textContent = tr.all;
  document.getElementById("filterToday").textContent = tr.today;
  document.getElementById("filterDateLabel").textContent = tr.date;
  document.getElementById("filterDateText").textContent = state.dateFilter || tr.allDates;
  document.getElementById("searchInput").placeholder = tr.searchPlaceholder;
  document.getElementById("prevPage").textContent = tr.prev;
  document.getElementById("nextPage").textContent = tr.next;

  const siteTitle = state.site ? pick({ zh: state.site.title_zh, en: state.site.title_en }) : "Horizon";
  document.getElementById("siteTitle").textContent = siteTitle;
  document.getElementById("heroTitle").innerHTML = formatSiteTitle(siteTitle);
  document.title = siteTitle;
  syncShareLabels();
}

function syncShareLabels() {
  const tr = t();
  const tools = document.getElementById("shareTools");
  if (tools) tools.setAttribute("aria-label", tr.shareTools);
  const favoriteLabel = document.getElementById("favoriteLabel");
  if (favoriteLabel) favoriteLabel.textContent = tr.favorite;
  const favoriteBtn = document.getElementById("favoriteBtn");
  if (favoriteBtn) {
    favoriteBtn.title = tr.favorite;
    favoriteBtn.setAttribute("aria-label", tr.favorite);
  }
  const wechatTitle = document.getElementById("wechatModalTitle");
  const wechatText = document.getElementById("wechatModalText");
  const copyBtn = document.getElementById("copyShareLink");
  if (wechatTitle) wechatTitle.textContent = tr.wechatTitle;
  if (wechatText) wechatText.textContent = tr.wechatText;
  if (copyBtn) copyBtn.textContent = tr.copyLink;
}

function updateLangButtons() {
  document.querySelectorAll(".lang-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === state.lang);
  });
  document.querySelectorAll("[data-share-lang]").forEach((group) => {
    group.hidden = group.dataset.shareLang !== state.lang;
  });
  syncShareLabels();
}

function sharePageUrl() {
  return window.location.href.split("#")[0];
}

function sharePageTitle() {
  return document.title || "Now AI News";
}

function showShareToast(message) {
  const toast = document.getElementById("shareToast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showShareToast.timer);
  showShareToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

async function copyShareLink() {
  const url = sharePageUrl();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    showShareToast(t().copied);
    return true;
  } catch (e) {
    showShareToast(url);
    return false;
  }
}

function openShareWindow(url) {
  const popup = window.open(url, "_blank", "noopener,noreferrer,width=640,height=720");
  if (!popup) showShareToast(t().sharePopupBlocked);
}

function closeWechatModal() {
  const modal = document.getElementById("wechatModal");
  if (modal) modal.hidden = true;
}

function openWechatModal() {
  const modal = document.getElementById("wechatModal");
  const qr = document.getElementById("wechatQr");
  if (!modal || !qr) return;
  const url = sharePageUrl();
  qr.src =
    "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=" +
    encodeURIComponent(url);
  modal.hidden = false;
}

function bookmarkPage() {
  const tr = t();
  // Browsers block programmatic bookmarks; guide the user instead.
  showShareToast(tr.favoriteHint);
  try {
    if (window.external && "AddFavorite" in window.external) {
      window.external.AddFavorite(sharePageUrl(), sharePageTitle());
    }
  } catch (e) {
    /* ignore legacy IE path failures */
  }
}

function handleShareAction(action) {
  const url = sharePageUrl();
  const title = sharePageTitle();
  if (action === "wechat") {
    openWechatModal();
    return;
  }
  if (action === "weibo") {
    openShareWindow(
      "https://service.weibo.com/share/share.php?url=" +
        encodeURIComponent(url) +
        "&title=" +
        encodeURIComponent(title)
    );
    return;
  }
  if (action === "x") {
    openShareWindow(
      "https://twitter.com/intent/tweet?url=" +
        encodeURIComponent(url) +
        "&text=" +
        encodeURIComponent(title)
    );
    return;
  }
  if (action === "facebook") {
    openShareWindow(
      "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url)
    );
    return;
  }
  if (action === "instagram") {
    copyShareLink().then(() => showShareToast(t().instagramHint));
    return;
  }
  if (action === "favorite") {
    bookmarkPage();
  }
}

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function applyFilters(resetPage = true) {
  if (resetPage) state.page = 1;
  const q = state.query.trim().toLowerCase();
  state.filteredArticles = state.allArticles
    .filter((a) => !state.dateFilter || issueDateFromTime(a) === state.dateFilter || a.issue_date === state.dateFilter)
    .filter((a) => {
      if (!q) return true;
      const haystack = [
        pick(a.title),
        pick(a.summary),
        pick(a.body),
        a.source || "",
        ...(a.tags || []),
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => timeValue(b) - timeValue(a));

  renderFeed();
  renderPager();
}

function renderFilterNav() {
  const nav = document.getElementById("filterNav");
  nav.hidden = !state.allArticles.length;
  document.getElementById("filterDate").value = state.dateFilter;
  document.getElementById("filterDateText").textContent = state.dateFilter || t().allDates;
  document.getElementById("searchInput").value = state.query;
}

function openDatePicker() {
  const input = document.getElementById("filterDate");
  if (input.showPicker) {
    input.showPicker();
  } else {
    input.focus();
    input.click();
  }
}

function renderPager() {
  const pager = document.getElementById("pager");
  const total = state.filteredArticles.length;
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  pager.hidden = total <= state.pageSize;
  state.page = Math.min(Math.max(state.page, 1), pages);
  document.getElementById("pagerInfo").textContent = t().pageInfo(state.page, pages, total);
  document.getElementById("prevPage").disabled = state.page <= 1;
  document.getElementById("nextPage").disabled = state.page >= pages;
}

function setDateFilter(date) {
  state.dateFilter = date || "";
  renderFilterNav();
  applyFilters(true);
}

function showAllArticles() {
  state.dateFilter = "";
  state.query = "";
  renderFilterNav();
  applyFilters(true);
}

function renderFeed() {
  const feed = document.getElementById("feed");
  const empty = document.getElementById("emptyState");
  feed.innerHTML = "";

  const start = (state.page - 1) * state.pageSize;
  const articles = state.filteredArticles.slice(start, start + state.pageSize);
  if (!articles.length) {
    empty.hidden = false;
    document.getElementById("heroMeta").textContent = "";
    return;
  }
  empty.hidden = true;

  const tr = t();
  document.getElementById("heroMeta").textContent = tr.heroMeta(state.filteredArticles.length);

  articles.forEach((a, idx) => {
    const card = document.createElement("article");
    card.className = "card";
    card.addEventListener("click", () => {
      saveFeedState();
      window.location.href = articlePath(a);
    });

    const cover = document.createElement("div");
    cover.className = "card-cover" + (a.image_path ? "" : " placeholder");
    if (a.image_path) {
      // Eager-load first row covers; lazy-load the rest to cut homepage bandwidth.
      if (idx < 4) {
        cover.style.cssText = coverStyle(a.image_path);
      } else {
        cover.dataset.bg = `/${a.image_path}`;
      }
    }
    cover.innerHTML =
      `<span class="card-rank">#${a.rank || idx + 1}</span>` +
      (a.score != null ? `<span class="score-badge">${scoreText(a.score)}</span>` : "");

    const body = document.createElement("div");
    body.className = "card-body";
    const title = pick(a.title);
    const summary = pick(a.summary) || "";
    const tags = (a.tags || []).slice(0, 3).map((x) => `<span class="tag">#${escapeHtml(x)}</span>`).join("");
    const rank = start + idx + 1;
    const newsTime = formatNewsTime(a);
    body.innerHTML =
      `<h3 class="card-title">${escapeHtml(title)}</h3>` +
      `<p class="card-summary">${escapeHtml(summary)}</p>` +
      `<div class="card-foot">${tags}<span class="card-source">${escapeHtml(a.source || "")}</span>` +
      (newsTime ? `<span class="card-time">${tr.newsTime}：${escapeHtml(newsTime)}</span>` : "") +
      `</div>`;

    card.appendChild(cover);
    card.appendChild(body);
    feed.appendChild(card);

    const rankEl = cover.querySelector(".card-rank");
    if (rankEl) rankEl.textContent = `#${rank}`;

    if (idx === 7) {
      const ad = document.createElement("aside");
      ad.className = "managed-ad managed-ad-feed";
      ad.dataset.adPlacement = "home_feed";
      ad.hidden = true;
      feed.appendChild(ad);
    }
  });
  observeLazyCovers(feed);
  if (window.requestIdleCallback) {
    window.requestIdleCallback(() => window.NowAINewsRuntime?.refreshAds(), { timeout: 2000 });
  } else {
    window.setTimeout(() => window.NowAINewsRuntime?.refreshAds(), 400);
  }
}

/* --------------------------- reader --------------------------- */
function openReader(a) {
  const tr = t();
  const reader = document.getElementById("reader");

  const cover = document.getElementById("readerCover");
  cover.className = "reader-cover" + (a.image_path ? "" : " placeholder");
  cover.style.cssText = a.image_path ? coverStyle(a.image_path) : "";

  document.getElementById("readerTags").innerHTML = (a.tags || [])
    .map((x) => `<span class="tag">#${escapeHtml(x)}</span>`)
    .join("");
  document.getElementById("readerTitle").textContent = pick(a.title);

  const subParts = [];
  if (a.source) subParts.push(a.source);
  if (a.author) subParts.push(a.author);
  if (articleTime(a)) subParts.push(`${tr.newsTime}: ${formatNewsTime(a)}`);
  if (a.score != null) subParts.push("★ " + scoreText(a.score) + "/10");
  document.getElementById("readerSub").textContent = subParts.join("  ·  ");

  document.getElementById("readerContent").innerHTML = renderMarkdown(pick(a.body));

  const extra = document.getElementById("readerExtra");
  extra.innerHTML = "";
  const bg = pick(a.background);
  const disc = pick(a.discussion);
  if (bg) {
    extra.innerHTML += `<div class="extra-block"><h4>${tr.background}</h4><p>${escapeHtml(bg)}</p></div>`;
  }
  if (disc) {
    extra.innerHTML += `<div class="extra-block"><h4>${tr.discussion}</h4><p>${escapeHtml(disc)}</p></div>`;
  }

  const sources = document.getElementById("readerSources");
  let srcHtml = `<a class="source-primary" href="${a.url}" target="_blank" rel="noopener">↗ ${tr.readOriginal}</a>`;
  if (a.sources && a.sources.length) {
    srcHtml += `<h4>${tr.references}</h4>`;
    srcHtml += a.sources
      .map((s) => `<a class="source-item" href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.title || s.url)}</a>`)
      .join("");
  }
  sources.innerHTML = srcHtml;

  reader.hidden = false;
  document.body.style.overflow = "hidden";
  reader.querySelector(".reader-scroll").scrollTop = 0;
}

function closeReader() {
  document.getElementById("reader").hidden = true;
  document.body.style.overflow = "";
}

/* --------------------------- data loading --------------------------- */
function setArticlesFromFeed(articles) {
  state.allArticles = (articles || [])
    .slice()
    .sort((a, b) => timeValue(b) - timeValue(a));
}

async function loadFeed() {
  const feed = await fetchJson("/data/feed.json");
  if (!feed || !Array.isArray(feed.articles)) {
    return false;
  }
  state.issues = Array.isArray(feed.issues) ? feed.issues : [];
  setArticlesFromFeed(feed.articles);
  saveIssueCache(state.issues, state.allArticles);
  return true;
}

function applySavedFeedState(savedFeedState) {
  if (!savedFeedState) return;
  state.dateFilter = savedFeedState.dateFilter || "";
  state.query = savedFeedState.query || "";
  state.page = Math.max(1, Number(savedFeedState.page) || 1);
}

function restoreSavedScroll(savedFeedState) {
  if (!savedFeedState || !Number.isFinite(Number(savedFeedState.scrollY))) return;
  requestAnimationFrame(() => {
    window.scrollTo({ top: Number(savedFeedState.scrollY), behavior: "auto" });
  });
}

async function bootstrap() {
  const savedFeedState = loadFeedState();
  state.lang = savedFeedState?.lang === "en" || savedFeedState?.lang === "zh" ? savedFeedState.lang : detectLang();
  updateLangButtons();

  const siteData = await fetchJson("/data/site.json");
  if (siteData) {
    state.site = siteData.site;
  }
  applyStaticText();

  const cachedIssues = loadIssueCache();
  let renderedFromCache = false;
  if (cachedIssues) {
    state.issues = cachedIssues.issues;
    setArticlesFromFeed(cachedIssues.articles);
    applySavedFeedState(savedFeedState);
    renderFilterNav();
    applyFilters(!savedFeedState);
    restoreSavedScroll(savedFeedState);
    renderedFromCache = true;
  }

  const loaded = await loadFeed();
  if (!loaded && !renderedFromCache) {
    state.issues = [];
    state.allArticles = [];
  }
  applySavedFeedState(savedFeedState);
  renderFilterNav();
  applyFilters(!savedFeedState && !renderedFromCache);
  restoreSavedScroll(savedFeedState);
}

function setLang(lang) {
  state.lang = lang;
  localStorage.setItem("horizon_lang", lang);
  updateLangButtons();
  applyStaticText();
  renderFilterNav();
  applyFilters(false);
}

/* --------------------------- events --------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".lang-btn").forEach((b) => {
    b.addEventListener("click", () => setLang(b.dataset.lang));
  });
  document.getElementById("shareTools")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-share]");
    if (!button) return;
    handleShareAction(button.dataset.share);
  });
  document.getElementById("copyShareLink")?.addEventListener("click", () => {
    copyShareLink();
  });
  document.querySelectorAll("[data-close-wechat]").forEach((el) => {
    el.addEventListener("click", closeWechatModal);
  });
  document.getElementById("wechatModal")?.addEventListener("click", (event) => {
    if (event.target.id === "wechatModal") closeWechatModal();
  });
  document.getElementById("sortLatest").addEventListener("click", showAllArticles);
  document.getElementById("datePickerBtn").addEventListener("click", openDatePicker);
  document.getElementById("filterDate").addEventListener("change", (e) => setDateFilter(e.target.value));
  document.getElementById("filterToday").addEventListener("click", () => setDateFilter(todayStr()));
  document.getElementById("searchInput").addEventListener("input", (e) => {
    state.query = e.target.value;
    applyFilters(true);
  });
  document.getElementById("prevPage").addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    renderFeed();
    renderPager();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.getElementById("nextPage").addEventListener("click", () => {
    state.page += 1;
    renderFeed();
    renderPager();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.querySelectorAll("[data-close='reader']").forEach((el) => {
    el.addEventListener("click", closeReader);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeWechatModal();
      closeReader();
    }
  });
  bootstrap();
});
