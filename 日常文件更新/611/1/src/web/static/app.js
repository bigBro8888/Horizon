(function () {
  "use strict";

  const summaryListEl = document.getElementById("summary-list");
  const summaryCountEl = document.getElementById("summary-count");
  const readerEmptyEl = document.getElementById("reader-empty");
  const readerContentEl = document.getElementById("reader-content");
  const articleBodyEl = document.getElementById("article-body");
  const articleTocEl = document.getElementById("article-toc");
  const tocNavEl = document.getElementById("toc-nav");
  const tocSummaryEl = document.getElementById("toc-summary");
  const tocTopBtn = document.getElementById("toc-top");
  const runStatusEl = document.getElementById("run-status");
  const btnRefresh = document.getElementById("btn-refresh");
  const btnGenerate = document.getElementById("btn-generate");
  const btnShare = document.getElementById("btn-share");
  const shareModal = document.getElementById("share-modal");
  const shareModalClose = document.getElementById("share-modal-close");
  const shareLoading = document.getElementById("share-loading");
  const shareText = document.getElementById("share-text");
  const btnCopyShare = document.getElementById("btn-copy-share");
  const btnRegenerateShare = document.getElementById("btn-regenerate-share");
  const langZhBtn = document.getElementById("lang-zh");
  const langEnBtn = document.getElementById("lang-en");

  let summaries = [];
  let activeDate = null;
  let activeId = null;
  let currentLang = "zh";
  let pollTimer = null;

  function loadLangPreference() {
    try {
      const saved = localStorage.getItem("horizon-lang");
      if (saved === "en" || saved === "zh") currentLang = saved;
    } catch (_e) {
      /* noop */
    }
    updateLangButtons();
  }

  function updateLangButtons() {
    langZhBtn.classList.toggle("active", currentLang === "zh");
    langEnBtn.classList.toggle("active", currentLang === "en");
  }

  function uniqueDates() {
    const seen = new Set();
    const dates = [];
    summaries.forEach(function (item) {
      if (!seen.has(item.date)) {
        seen.add(item.date);
        dates.push(item.date);
      }
    });
    return dates;
  }

  function summaryFor(date, lang) {
    return summaries.find(function (item) {
      return item.date === date && item.language === lang;
    });
  }

  function summaryIdFor(date, lang) {
    const item = summaryFor(date, lang);
    return item ? item.id : null;
  }

  function languagesForDate(date) {
    return summaries
      .filter(function (item) {
        return item.date === date;
      })
      .map(function (item) {
        return item.language;
      });
  }

  function processScoreBadges(root) {
    const scoreRe = /⭐️\s*(\d+(?:\.\d+)?)\/10/g;
    root.querySelectorAll("h2, h3, li").forEach(function (el) {
      el.innerHTML = el.innerHTML.replace(scoreRe, function (_match, score) {
        const value = parseFloat(score);
        let tier = "low";
        if (value >= 9) tier = "high";
        else if (value >= 7) tier = "good";
        else if (value >= 5) tier = "mid";
        return '<span class="score-badge" data-tier="' + tier + '">' + score + "</span>";
      });
    });
  }

  function buildTocPanel(root) {
    const sourceList = root.querySelector("ol");
    const blockquote = root.querySelector("blockquote");

    if (!sourceList) {
      articleTocEl.hidden = true;
      tocNavEl.innerHTML = "";
      return;
    }

    sourceList.classList.add("toc-source");
    tocSummaryEl.textContent = blockquote ? blockquote.textContent.trim() : "";
    tocNavEl.innerHTML = sourceList.outerHTML;
    processScoreBadges(tocNavEl);
    articleTocEl.hidden = false;

    const tocLinks = tocNavEl.querySelectorAll('a[href^="#"]');
    tocLinks.forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        const target = root.querySelector(link.getAttribute("href"));
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  function setupTocScrollSpy(root) {
    const sections = root.querySelectorAll('a[id^="item-"]');
    const tocItems = tocNavEl.querySelectorAll("li");
    if (!sections.length || !tocItems.length) return;

    const observer = new IntersectionObserver(
      function (entries) {
        const visible = entries
          .filter(function (entry) {
            return entry.isIntersecting;
          })
          .sort(function (a, b) {
            return b.intersectionRatio - a.intersectionRatio;
          })[0];
        if (!visible) return;
        const id = visible.target.id;
        tocItems.forEach(function (li) {
          li.classList.toggle("active", !!li.querySelector('a[href="#' + id + '"]'));
        });
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: [0, 0.25, 1] }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  function markSemanticElements(root) {
    root.querySelectorAll("p").forEach(function (p) {
      const text = p.textContent.trim();
      if (/^(Tags|标签)\s*:/.test(text)) {
        p.classList.add("tag-line");
        return;
      }
      if (/^(rss|reddit|github|hackernews|hn|telegram)\s*·/i.test(text)) {
        p.classList.add("source-line");
      }
    });
  }

  function renderSummaryList() {
    const dates = uniqueDates();
    summaryCountEl.textContent = String(dates.length);
    if (!dates.length) {
      summaryListEl.innerHTML = '<p class="empty-hint">暂无日报，点击右上角「生成今日日报」开始。</p>';
      return;
    }

    summaryListEl.innerHTML = dates
      .map(function (date) {
        const activeClass = date === activeDate ? " active" : "";
        const langs = languagesForDate(date);
        const langHint =
          langs.length > 1 ? "中/EN" : langs[0] === "zh" ? "仅中文" : "EN only";
        const latest = summaries.find(function (item) {
          return item.date === date;
        });
        const modified = latest ? new Date(latest.modified_at).toLocaleString() : "";
        return (
          '<button class="summary-item' +
          activeClass +
          '" data-date="' +
          date +
          '" type="button">' +
          '<div class="date">' +
          date +
          "</div>" +
          '<div class="meta">更新于 ' +
          modified +
          " · " +
          langHint +
          "</div></button>"
        );
      })
      .join("");

    summaryListEl.querySelectorAll(".summary-item").forEach(function (button) {
      button.addEventListener("click", function () {
        loadSummaryByDate(button.dataset.date);
      });
    });
  }

  function preferredDate() {
    const dates = uniqueDates();
    return dates.length ? dates[0] : null;
  }

  async function loadSummaries(selectLatest) {
    const response = await fetch("/api/summaries");
    summaries = await response.json();
    renderSummaryList();
    if (selectLatest && summaries.length) {
      await loadSummaryByDate(preferredDate());
    } else if (activeDate) {
      renderSummaryList();
    }
  }

  async function loadSummaryByDate(date) {
    activeDate = date;
    let id = summaryIdFor(date, currentLang);
    if (!id) {
      const fallback = summaryFor(date, currentLang === "zh" ? "en" : "zh");
      if (fallback) {
        currentLang = fallback.language;
        updateLangButtons();
        try {
          localStorage.setItem("horizon-lang", currentLang);
        } catch (_e) {
          /* noop */
        }
        id = fallback.id;
      }
    }
    if (!id) return;
    await loadSummary(id);
  }

  async function setLanguage(lang) {
    if (currentLang === lang) return;
    currentLang = lang;
    updateLangButtons();
    try {
      localStorage.setItem("horizon-lang", currentLang);
    } catch (_e) {
      /* noop */
    }
    if (activeDate) {
      const id = summaryIdFor(activeDate, currentLang);
      if (id) {
        await loadSummary(id);
      } else {
        renderSummaryList();
        readerEmptyEl.hidden = false;
        readerContentEl.hidden = true;
        articleTocEl.hidden = true;
      }
    }
  }

  function openShareModal() {
    shareModal.hidden = false;
    shareText.value = "";
    shareLoading.hidden = false;
    shareLoading.textContent = "正在调用 AI 生成分享稿…";
    btnCopyShare.disabled = true;
    btnRegenerateShare.disabled = true;
    btnShare.disabled = true;
  }

  function closeShareModal() {
    shareModal.hidden = true;
    btnShare.disabled = false;
  }

  async function generateShare(refresh) {
    if (!activeId) return;
    openShareModal();

    try {
      const url =
        "/api/summaries/" +
        encodeURIComponent(activeId) +
        "/share" +
        (refresh ? "?refresh=true" : "");
      const response = await fetch(url, { method: "POST" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "生成失败");
      }
      const data = await response.json();
      shareText.value = data.text;
      shareLoading.hidden = true;
      btnCopyShare.disabled = false;
      btnRegenerateShare.disabled = false;
    } catch (err) {
      shareLoading.textContent = "生成失败：" + err.message;
      btnRegenerateShare.disabled = false;
    } finally {
      btnShare.disabled = false;
    }
  }

  async function copyShareText() {
    const text = shareText.value.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const original = btnCopyShare.textContent;
      btnCopyShare.textContent = "已复制 ✓";
      setTimeout(function () {
        btnCopyShare.textContent = original;
      }, 1800);
    } catch (_err) {
      shareText.focus();
      shareText.select();
      document.execCommand("copy");
      btnCopyShare.textContent = "已复制 ✓";
    }
  }

  async function loadSummary(id) {
    activeId = id;
    const item = summaries.find(function (s) {
      return s.id === id;
    });
    if (item) {
      activeDate = item.date;
      currentLang = item.language;
      updateLangButtons();
    }
    renderSummaryList();

    const response = await fetch("/api/summaries/" + encodeURIComponent(id));
    if (!response.ok) {
      throw new Error("Failed to load summary");
    }
    const data = await response.json();
    articleBodyEl.innerHTML = data.html;
    processScoreBadges(articleBodyEl);
    markSemanticElements(articleBodyEl);
    buildTocPanel(articleBodyEl);
    setupTocScrollSpy(articleBodyEl);

    readerEmptyEl.hidden = true;
    readerContentEl.hidden = false;
    const readerEl = document.querySelector(".reader");
    if (readerEl) readerEl.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function setRunStatus(state, message) {
    runStatusEl.className = "run-status " + state;
    runStatusEl.textContent = message;
  }

  async function pollRunStatus() {
    const response = await fetch("/api/run/status");
    const status = await response.json();

    if (status.running) {
      setRunStatus("running", "正在生成日报…");
      btnGenerate.disabled = true;
      return;
    }

    btnGenerate.disabled = false;
    clearInterval(pollTimer);
    pollTimer = null;

    if (status.exit_code === 0) {
      setRunStatus("success", "生成完成");
      await loadSummaries(true);
    } else if (status.exit_code !== null) {
      setRunStatus("error", status.error || "生成失败");
    } else {
      setRunStatus("idle", "就绪");
    }
  }

  async function startGeneration() {
    btnGenerate.disabled = true;
    setRunStatus("running", "正在启动…");

    const response = await fetch("/api/run", { method: "POST" });
    if (!response.ok) {
      const error = await response.json();
      setRunStatus("error", error.detail || "无法启动");
      btnGenerate.disabled = false;
      return;
    }

    pollTimer = setInterval(pollRunStatus, 3000);
    await pollRunStatus();
  }

  langZhBtn.addEventListener("click", function () {
    setLanguage("zh");
  });

  langEnBtn.addEventListener("click", function () {
    setLanguage("en");
  });

  btnRefresh.addEventListener("click", function () {
    loadSummaries(false);
  });

  btnGenerate.addEventListener("click", function () {
    startGeneration();
  });

  btnShare.addEventListener("click", function () {
    generateShare(false);
  });

  btnRegenerateShare.addEventListener("click", function () {
    shareLoading.hidden = false;
    shareLoading.textContent = "正在调用 AI 生成分享稿…";
    generateShare(true);
  });

  btnCopyShare.addEventListener("click", copyShareText);

  shareModalClose.addEventListener("click", closeShareModal);
  shareModal.querySelector(".modal-backdrop").addEventListener("click", closeShareModal);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !shareModal.hidden) {
      closeShareModal();
    }
  });

  tocTopBtn.addEventListener("click", function () {
    const readerEl = document.querySelector(".reader");
    if (readerEl) readerEl.scrollTop = 0;
    window.scrollTo(0, 0);
  });

  loadLangPreference();
  loadSummaries(true);
  pollRunStatus();
})();
