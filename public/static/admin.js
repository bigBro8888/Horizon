"use strict";

const TOKEN_KEY = "horizon_admin_token";

function token() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

function $(id) {
  return document.getElementById(id);
}

async function api(path, options = {}) {
  const opts = Object.assign({ headers: {} }, options);
  opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers);
  const t = token();
  if (t) opts.headers["Authorization"] = "Bearer " + t;
  const res = await fetch(path, opts);
  if (res.status === 401) {
    setToken(null);
    showLogin();
    throw new Error("未授权，请重新登录");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch (e) {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.status === 204 ? null : res.json();
}

/* ------------------------- auth ------------------------- */
function showLogin() {
  $("login").hidden = false;
  $("app").hidden = true;
}

function showApp() {
  $("login").hidden = true;
  $("app").hidden = false;
}

async function login() {
  const msg = $("loginMsg");
  msg.textContent = "";
  msg.className = "msg";
  try {
    const data = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: $("pw").value }),
    });
    setToken(data.token);
    showApp();
    await loadConfig();
    await refreshStatus();
  } catch (e) {
    msg.textContent = e.message;
    msg.className = "msg err";
  }
}

/* ------------------------- config ------------------------- */
function fill(cfg) {
  $("schedEnabled").checked = !!cfg.schedule.enabled;
  $("schedTimes").value = (cfg.schedule.times || []).join(", ");
  $("schedTz").value = cfg.schedule.timezone || "";

  $("aiProvider").value = cfg.ai.provider || "ali";
  $("aiModel").value = cfg.ai.model || "";
  $("aiKeyEnv").value = cfg.ai.api_key_env || "";
  $("aiKey").value = "";
  $("aiKeyHint").textContent = cfg.ai.api_key_set ? "已配置（留空保持不变）" : "尚未配置，请填写";
  $("aiTemp").value = cfg.ai.temperature;
  $("aiMaxTokens").value = cfg.ai.max_tokens;
  $("aiLangs").value = (cfg.ai.languages || []).join(", ");

  $("fltThreshold").value = cfg.filtering.ai_score_threshold;
  $("fltMaxItems").value = cfg.filtering.max_items == null ? "" : cfg.filtering.max_items;
  $("fltWindow").value = cfg.filtering.time_window_hours;

  $("imgEnabled").checked = !!cfg.imagery.enabled;
  $("imgMax").value = cfg.imagery.max_results;

  $("siteTitleZh").value = cfg.site.title_zh || "";
  $("siteTitleEn").value = cfg.site.title_en || "";
  $("siteDescZh").value = cfg.site.description_zh || "";
  $("siteDescEn").value = cfg.site.description_en || "";
}

function collect() {
  const csv = (v) => v.split(",").map((s) => s.trim()).filter(Boolean);
  const numOrNull = (v) => (v === "" ? null : Number(v));
  const payload = {
    schedule: {
      enabled: $("schedEnabled").checked,
      times: csv($("schedTimes").value),
      timezone: $("schedTz").value.trim() || "Asia/Shanghai",
    },
    ai: {
      provider: $("aiProvider").value,
      model: $("aiModel").value.trim(),
      api_key_env: $("aiKeyEnv").value.trim(),
      temperature: Number($("aiTemp").value),
      max_tokens: Number($("aiMaxTokens").value),
      languages: csv($("aiLangs").value),
    },
    filtering: {
      ai_score_threshold: Number($("fltThreshold").value),
      max_items: numOrNull($("fltMaxItems").value),
      time_window_hours: Number($("fltWindow").value),
    },
    imagery: {
      enabled: $("imgEnabled").checked,
      max_results: Number($("imgMax").value),
    },
    site: {
      title_zh: $("siteTitleZh").value,
      title_en: $("siteTitleEn").value,
      description_zh: $("siteDescZh").value,
      description_en: $("siteDescEn").value,
    },
  };
  const key = $("aiKey").value.trim();
  if (key) payload.ai.api_key = key;
  return payload;
}

async function loadConfig() {
  const cfg = await api("/api/admin/config");
  fill(cfg);
}

async function saveConfig() {
  const msg = $("saveMsg");
  msg.textContent = "保存中...";
  msg.className = "msg";
  try {
    const cfg = await api("/api/admin/config", {
      method: "PUT",
      body: JSON.stringify(collect()),
    });
    fill(cfg);
    msg.textContent = "已保存，设置立即生效。";
    msg.className = "msg ok";
  } catch (e) {
    msg.textContent = "保存失败：" + e.message;
    msg.className = "msg err";
  }
}

/* ------------------------- run ------------------------- */
function renderStatus(s) {
  const el = $("runStatus");
  if (!s) {
    el.textContent = "";
    return;
  }
  const lines = [];
  lines.push("状态：" + (s.running ? "运行中…" : "空闲"));
  if (s.started_at) lines.push("开始：" + new Date(s.started_at).toLocaleString());
  if (s.finished_at) lines.push("结束：" + new Date(s.finished_at).toLocaleString());
  if (s.exit_code != null) lines.push("退出码：" + s.exit_code);
  if (s.error) lines.push("错误：\n" + s.error);
  el.textContent = lines.join("\n");
  $("runBtn").disabled = !!s.running;
}

let pollTimer = null;
async function refreshStatus() {
  try {
    const s = await api("/api/admin/run/status");
    renderStatus(s);
    if (s.running && !pollTimer) {
      pollTimer = setInterval(refreshStatus, 4000);
    } else if (!s.running && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  } catch (e) {
    renderStatus({ running: false, error: e.message });
  }
}

async function runNow() {
  $("runBtn").disabled = true;
  try {
    const s = await api("/api/admin/run", { method: "POST" });
    renderStatus(s);
    if (!pollTimer) pollTimer = setInterval(refreshStatus, 4000);
  } catch (e) {
    renderStatus({ running: false, error: e.message });
    $("runBtn").disabled = false;
  }
}

/* ------------------------- init ------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  $("loginBtn").addEventListener("click", login);
  $("pw").addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });
  $("logoutBtn").addEventListener("click", () => {
    setToken(null);
    showLogin();
  });
  $("saveBtn").addEventListener("click", saveConfig);
  $("runBtn").addEventListener("click", runNow);
  $("refreshBtn").addEventListener("click", refreshStatus);

  if (token()) {
    try {
      showApp();
      await loadConfig();
      await refreshStatus();
    } catch (e) {
      showLogin();
    }
  } else {
    showLogin();
  }
});
