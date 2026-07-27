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

export const ADMIN_SESSION_COOKIE = "nowai_admin_session";
export const DEFAULT_ADMIN_PASSWORD = "dk++8429";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlEncode(value) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

export function getAdminPassword(env) {
  return String(env?.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD);
}

function sessionSecret(env) {
  return `${getAdminPassword(env)}|${env?.ANALYTICS_SALT || "now-ai-news"}`;
}

async function hmacSign(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return bytesToHex(new Uint8Array(signature));
}

export async function createAdminSessionToken(env, label = "password-admin") {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${expiresAt}.${label}`;
  const signature = await hmacSign(payload, sessionSecret(env));
  return base64UrlEncode(`${payload}.${signature}`);
}

export async function verifyAdminSessionToken(token, env) {
  if (!token) return null;
  let decoded = "";
  try {
    decoded = base64UrlDecode(token);
  } catch (_) {
    return null;
  }
  const parts = decoded.split(".");
  if (parts.length !== 3) return null;
  const [expiresAtRaw, label, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  const expected = await hmacSign(`${expiresAtRaw}.${label}`, sessionSecret(env));
  if (expected !== signature) return null;
  return label || "password-admin";
}

export function readCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export function adminSessionCookie(token, maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000)) {
  return [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

export function clearAdminSessionCookie() {
  return [
    `${ADMIN_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=0",
  ].join("; ");
}

export async function resolveAdminIdentity(request, env) {
  const email = adminEmail(request);
  if (email) {
    return { label: email, via: "access" };
  }
  const token = readCookie(request, ADMIN_SESSION_COOKIE);
  const label = await verifyAdminSessionToken(token, env);
  if (label) {
    return { label, via: "password" };
  }
  return null;
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
