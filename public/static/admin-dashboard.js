"use strict";

const dashboardState = {
  range: 7,
  stats: null,
  authenticated: false,
};

function $(id) {
  return document.getElementById(id);
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
}

function showNotice(message, isError = false) {
  const notice = $("notice");
  notice.textContent = message;
  notice.className = `notice${isError ? " error" : ""}`;
  notice.hidden = false;
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => {
    notice.hidden = true;
  }, 5000);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch (_) {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.error || `请求失败（${response.status}）`);
    error.status = response.status;
    error.loginRequired = Boolean(payload.login_required);
    throw error;
  }
  return payload;
}

function setAuthUi(authenticated, identity = {}) {
  dashboardState.authenticated = authenticated;
  $("loginGate").hidden = authenticated;
  $("adminShell").hidden = !authenticated;
  if (!authenticated) return;
  $("accountEmail").textContent =
    identity.email || identity.label || "password-admin";
  $("accountVia").textContent =
    identity.via === "access" ? "Cloudflare Access" : "密码登录";
}

function switchPanel(panel) {
  const isAnalytics = panel === "analytics";
  $("analyticsPanel").classList.toggle("active", isAnalytics);
  $("advertisingPanel").classList.toggle("active", !isAnalytics);
  $("pageTitle").textContent = isAnalytics ? "流量概览" : "广告管理";
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.panel === panel);
  });
  if (!isAnalytics) loadAds();
}

function buildDays(startDay, count) {
  const [year, month, day] = startDay.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Array.from({ length: count }, (_, index) => {
    const current = new Date(date);
    current.setUTCDate(current.getUTCDate() + index);
    return current.toISOString().slice(0, 10);
  });
}

function renderChart(stats) {
  const chart = $("trafficChart");
  chart.replaceChildren();
  const values = new Map((stats.daily || []).map((item) => [item.day, item]));
  const days = buildDays(stats.start_day, stats.range);
  const maxValue = Math.max(
    1,
    ...days.map((day) => Number(values.get(day)?.pageviews || 0))
  );

  for (const day of days) {
    const item = values.get(day) || { pageviews: 0, visitors: 0 };
    const column = document.createElement("div");
    column.className = "chart-column";
    column.title = `${day}：${item.pageviews} PV / ${item.visitors} UV`;

    const bars = document.createElement("div");
    bars.className = "chart-bars";
    const pv = document.createElement("span");
    pv.className = "chart-bar";
    pv.style.height = `${Math.max(3, (Number(item.pageviews) / maxValue) * 100)}%`;
    const uv = document.createElement("span");
    uv.className = "chart-bar visitors";
    uv.style.height = `${Math.max(3, (Number(item.visitors) / maxValue) * 100)}%`;
    bars.append(pv, uv);

    const label = document.createElement("small");
    label.textContent = day.slice(5).replace("-", "/");
    column.append(bars, label);
    chart.appendChild(column);
  }
}

function renderRankList(containerId, rows, labelKey) {
  const container = $(containerId);
  container.replaceChildren();
  if (!rows?.length) {
    const empty = document.createElement("div");
    empty.className = "empty-row";
    empty.textContent = "暂无数据";
    container.appendChild(empty);
    return;
  }

  rows.forEach((item) => {
    const row = document.createElement("div");
    row.className = "rank-row";
    const label = document.createElement("span");
    label.textContent = item[labelKey];
    label.title = item[labelKey];
    const value = document.createElement("strong");
    value.textContent = formatNumber(item.pageviews);
    row.append(label, value);
    container.appendChild(row);
  });
}

function renderStats(stats) {
  dashboardState.stats = stats;
  $("accountEmail").textContent = stats.email || "password-admin";
  $("accountVia").textContent =
    stats.via === "access" ? "Cloudflare Access" : "密码登录";
  $("pageviews").textContent = formatNumber(stats.pageviews);
  $("visitors").textContent = formatNumber(stats.visitors);
  $("pagesPerVisitor").textContent = stats.visitors
    ? (stats.pageviews / stats.visitors).toFixed(2)
    : "0.00";
  $("rangeLabel").textContent =
    stats.range === 1 ? "今日" : `近 ${stats.range} 天`;
  renderChart(stats);
  renderRankList("topPages", stats.top_pages, "path");
  renderRankList("topReferrers", stats.top_referrers, "referrer");
}

async function loadStats(range = dashboardState.range) {
  dashboardState.range = range;
  try {
    const stats = await api(`/api/admin/stats?range=${range}`);
    setAuthUi(true, stats);
    renderStats(stats);
  } catch (error) {
    if (error.status === 401 || error.loginRequired) {
      setAuthUi(false);
      return;
    }
    showNotice(error.message, true);
  }
}

function fillAdsForm(payload) {
  const ads = payload.ads || {};
  $("adsEnabled").checked = Boolean(ads.enabled);
  $("publisherId").value = ads.publisher_id || "";
  $("homeFeedSlot").value = ads.home_feed_slot || "";
  $("articleInlineSlot").value = ads.article_inline_slot || "";
  $("articleEndSlot").value = ads.article_end_slot || "";
  $("accountEmail").textContent = payload.email || $("accountEmail").textContent;
  $("adsUpdated").textContent = payload.updated_at
    ? `最近更新：${new Date(payload.updated_at).toLocaleString("zh-CN")} · ${payload.updated_by || ""}`
    : "";
}

async function loadAds() {
  try {
    fillAdsForm(await api("/api/admin/ads"));
  } catch (error) {
    if (error.status === 401 || error.loginRequired) {
      setAuthUi(false);
      return;
    }
    showNotice(error.message, true);
  }
}

async function saveAds(event) {
  event.preventDefault();
  const button = $("saveAds");
  button.disabled = true;
  button.textContent = "正在保存…";
  try {
    const payload = await api("/api/admin/ads", {
      method: "PUT",
      body: JSON.stringify({
        enabled: $("adsEnabled").checked,
        publisher_id: $("publisherId").value,
        home_feed_slot: $("homeFeedSlot").value,
        article_inline_slot: $("articleInlineSlot").value,
        article_end_slot: $("articleEndSlot").value,
      }),
    });
    fillAdsForm(payload);
    showNotice("广告设置已保存，前台将在下次访问时使用新配置。");
  } catch (error) {
    if (error.status === 401 || error.loginRequired) {
      setAuthUi(false);
      return;
    }
    showNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "保存广告设置";
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const button = $("loginButton");
  const errorBox = $("loginError");
  button.disabled = true;
  button.textContent = "正在登录…";
  errorBox.hidden = true;
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: $("loginPassword").value }),
    });
    $("loginPassword").value = "";
    await loadStats();
  } catch (error) {
    errorBox.textContent = error.message || "登录失败";
    errorBox.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "登录";
  }
}

async function handleLogout() {
  try {
    await api("/api/admin/logout", { method: "POST", body: "{}" });
  } catch (_) {
    /* Ignore logout network errors and still clear local UI. */
  }
  setAuthUi(false);
}

async function bootstrap() {
  try {
    const session = await api("/api/admin/session");
    setAuthUi(true, session);
    await loadStats();
  } catch (error) {
    setAuthUi(false);
    if (error.status && error.status !== 401) {
      $("loginError").textContent = error.message;
      $("loginError").hidden = false;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchPanel(button.dataset.panel));
  });
  document.querySelectorAll("[data-range]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-range]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      loadStats(Number(button.dataset.range));
    });
  });
  $("adsForm").addEventListener("submit", saveAds);
  $("loginForm").addEventListener("submit", handleLogin);
  $("logoutButton").addEventListener("click", handleLogout);
  bootstrap();
});
