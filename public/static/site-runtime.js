"use strict";

(function () {
  const DEFAULT_ADS = {
    enabled: true,
    publisher_id: "ca-pub-4598371924010228",
    home_feed_slot: "",
    article_inline_slot: "",
    article_end_slot: "",
  };
  let settingsPromise;
  let scriptPromise;

  function trackPageview() {
    const payload = JSON.stringify({
      path: location.pathname,
      referrer: document.referrer || "",
      lang: document.documentElement.lang || "",
    });

    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(
        "/api/track",
        new Blob([payload], { type: "application/json" })
      );
      if (sent) return;
    }
    fetch("/api/track", {
      method: "POST",
      body: payload,
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {});
  }

  async function loadSettings() {
    if (!settingsPromise) {
      settingsPromise = fetch("/api/ads", {
        cache: "no-store",
        credentials: "same-origin",
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => ({ ...DEFAULT_ADS, ...(payload?.ads || {}) }))
        .catch(() => ({ ...DEFAULT_ADS }));
    }
    return settingsPromise;
  }

  function loadAdScript(publisherId) {
    if (scriptPromise) return scriptPromise;
    const existing = document.querySelector("script[data-nowai-adsense]");
    if (existing) return Promise.resolve();

    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.dataset.nowaiAdsense = "true";
      script.crossOrigin = "anonymous";
      script.src =
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
        encodeURIComponent(publisherId);
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.appendChild(script);
    });
    return scriptPromise;
  }

  function slotFor(settings, placement) {
    const slots = {
      home_feed: settings.home_feed_slot,
      article_inline: settings.article_inline_slot,
      article_end: settings.article_end_slot,
    };
    return slots[placement] || "";
  }

  async function refreshAds() {
    const settings = await loadSettings();
    const containers = document.querySelectorAll("[data-ad-placement]");
    if (!settings.enabled) {
      containers.forEach((container) => {
        container.hidden = true;
      });
      return;
    }

    loadAdScript(settings.publisher_id).catch(() => {});
    containers.forEach((container) => {
      if (container.dataset.adMounted === "true") return;
      const slot = slotFor(settings, container.dataset.adPlacement);
      if (!slot) {
        container.hidden = true;
        return;
      }

      const unit = document.createElement("ins");
      unit.className = "adsbygoogle";
      unit.style.display = "block";
      unit.dataset.adClient = settings.publisher_id;
      unit.dataset.adSlot = slot;
      unit.dataset.adFormat = "auto";
      unit.dataset.fullWidthResponsive = "true";
      container.replaceChildren(unit);
      container.hidden = false;
      container.dataset.adMounted = "true";
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (_) {
        /* Ad blockers and delayed AdSense initialization are non-fatal. */
      }
    });
  }

  window.NowAINewsRuntime = { refreshAds };
  document.addEventListener("DOMContentLoaded", () => {
    trackPageview();
    const runAds = () => refreshAds();
    if (window.requestIdleCallback) {
      window.requestIdleCallback(runAds, { timeout: 2500 });
    } else {
      window.setTimeout(runAds, 600);
    }
  });
})();
