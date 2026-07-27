import {
  cleanPath,
  cleanReferrer,
  getDatabase,
  isBot,
  json,
  shanghaiDay,
  visitorHash,
} from "../_lib/common.js";

const IGNORED_PREFIXES = ["/api/", "/static/", "/media/", "/admin"];

export async function onRequestPost(context) {
  const request = context.request;
  const userAgent = request.headers.get("user-agent") || "";
  if (isBot(userAgent)) return json({ ok: true, tracked: false });

  let payload = {};
  try {
    payload = await request.json();
  } catch (_) {
    return json({ ok: false, error: "请求格式无效" }, 400);
  }

  const path = cleanPath(payload.path);
  if (IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return json({ ok: true, tracked: false });
  }

  try {
    const database = getDatabase(context);
    const day = shanghaiDay();
    const siteOrigin = new URL(request.url).origin;
    const referrer = cleanReferrer(payload.referrer, siteOrigin);
    const hash = await visitorHash(request, day, context.env.ANALYTICS_SALT);

    await database.batch([
      database
        .prepare(
          `INSERT INTO traffic_daily (day, pageviews)
           VALUES (?, 1)
           ON CONFLICT(day) DO UPDATE SET pageviews = pageviews + 1`
        )
        .bind(day),
      database
        .prepare(
          `INSERT INTO traffic_page_daily (day, path, pageviews)
           VALUES (?, ?, 1)
           ON CONFLICT(day, path) DO UPDATE SET pageviews = pageviews + 1`
        )
        .bind(day, path),
      database
        .prepare(
          `INSERT INTO traffic_referrer_daily (day, referrer, pageviews)
           VALUES (?, ?, 1)
           ON CONFLICT(day, referrer) DO UPDATE SET pageviews = pageviews + 1`
        )
        .bind(day, referrer),
      database
        .prepare(
          `INSERT OR IGNORE INTO traffic_visitor_daily (day, visitor_hash)
           VALUES (?, ?)`
        )
        .bind(day, hash),
    ]);

    return json({ ok: true, tracked: true }, 202);
  } catch (error) {
    console.error("traffic tracking failed", error);
    return json({ ok: false, error: "流量统计服务暂不可用" }, 503);
  }
}

export function onRequestGet() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}
