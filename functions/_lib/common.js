export const DEFAULT_ADS = Object.freeze({
  enabled: true,
  publisher_id: "ca-pub-4598371924010228",
  home_feed_slot: "",
  article_inline_slot: "",
  article_end_slot: "",
});

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function getDatabase(context) {
  const database = context.env.NOWAI_DB;
  if (!database) {
    throw new Error("D1 binding NOWAI_DB is not configured");
  }
  return database;
}

export function shanghaiDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function dayBefore(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Math.max(0, Number(days) || 0));
  return shanghaiDay(date);
}

export function cleanPath(value) {
  if (typeof value !== "string") return "/";
  let path = value.trim().slice(0, 500);
  if (!path.startsWith("/")) path = `/${path}`;
  try {
    const url = new URL(path, "https://nowainews.com");
    path = url.pathname;
  } catch (_) {
    path = "/";
  }
  return path.replace(/\/{2,}/g, "/") || "/";
}

export function cleanReferrer(value, siteOrigin) {
  if (typeof value !== "string" || !value.trim()) return "direct";
  try {
    const url = new URL(value);
    if (url.origin === siteOrigin) return "internal";
    return url.hostname.toLowerCase().replace(/^www\./, "").slice(0, 200) || "direct";
  } catch (_) {
    return "direct";
  }
}

export function isBot(userAgent) {
  return /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse/i.test(
    userAgent || ""
  );
}

export async function visitorHash(request, day, salt) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const userAgent = (request.headers.get("user-agent") || "").slice(0, 300);
  const source = `${ip}|${userAgent}|${salt || "now-ai-news"}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function adminEmail(request) {
  return (
    request.headers.get("cf-access-authenticated-user-email") ||
    request.headers.get("Cf-Access-Authenticated-User-Email") ||
    ""
  )
    .trim()
    .toLowerCase();
}

export function normalizeAds(input) {
  const source = input && typeof input === "object" ? input : {};
  const publisherId = String(source.publisher_id || DEFAULT_ADS.publisher_id).trim();
  const slots = ["home_feed_slot", "article_inline_slot", "article_end_slot"];

  if (!/^ca-pub-\d{10,20}$/.test(publisherId)) {
    throw new Error("publisher_id 格式应为 ca-pub- 后接数字");
  }

  const result = {
    enabled: Boolean(source.enabled),
    publisher_id: publisherId,
  };
  for (const key of slots) {
    const value = String(source[key] || "").trim();
    if (value && !/^\d{6,30}$/.test(value)) {
      throw new Error(`${key} 只能填写广告单元的数字 ID`);
    }
    result[key] = value;
  }
  return result;
}

export function adsFromRow(row) {
  if (!row) return { ...DEFAULT_ADS };
  return {
    enabled: Boolean(row.enabled),
    publisher_id: row.publisher_id || DEFAULT_ADS.publisher_id,
    home_feed_slot: row.home_feed_slot || "",
    article_inline_slot: row.article_inline_slot || "",
    article_end_slot: row.article_end_slot || "",
  };
}
