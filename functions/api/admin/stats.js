import { dayBefore, getDatabase, json } from "../../_lib/common.js";

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const requestedRange = Number(url.searchParams.get("range") || 7);
  const range = [1, 7, 30].includes(requestedRange) ? requestedRange : 7;
  const startDay = dayBefore(range - 1);

  try {
    const database = getDatabase(context);
    const [totals, visitors, daily, pages, referrers] = await database.batch([
      database
        .prepare(
          `SELECT COALESCE(SUM(pageviews), 0) AS pageviews
           FROM traffic_daily
           WHERE day >= ?`
        )
        .bind(startDay),
      database
        .prepare(
          `SELECT COUNT(DISTINCT visitor_hash) AS visitors
           FROM traffic_visitor_daily
           WHERE day >= ?`
        )
        .bind(startDay),
      database
        .prepare(
          `SELECT d.day, d.pageviews,
                  COUNT(DISTINCT v.visitor_hash) AS visitors
           FROM traffic_daily d
           LEFT JOIN traffic_visitor_daily v ON v.day = d.day
           WHERE d.day >= ?
           GROUP BY d.day, d.pageviews
           ORDER BY d.day ASC`
        )
        .bind(startDay),
      database
        .prepare(
          `SELECT path, SUM(pageviews) AS pageviews
           FROM traffic_page_daily
           WHERE day >= ?
           GROUP BY path
           ORDER BY pageviews DESC
           LIMIT 12`
        )
        .bind(startDay),
      database
        .prepare(
          `SELECT referrer, SUM(pageviews) AS pageviews
           FROM traffic_referrer_daily
           WHERE day >= ?
           GROUP BY referrer
           ORDER BY pageviews DESC
           LIMIT 10`
        )
        .bind(startDay),
    ]);

    const cleanupBefore = dayBefore(90);
    context.waitUntil(
      database
        .prepare("DELETE FROM traffic_visitor_daily WHERE day < ?")
        .bind(cleanupBefore)
        .run()
        .catch((error) => console.error("traffic cleanup failed", error))
    );

    return json({
      range,
      start_day: startDay,
      pageviews: Number(rows(totals)[0]?.pageviews || 0),
      visitors: Number(rows(visitors)[0]?.visitors || 0),
      daily: rows(daily).map((item) => ({
        day: item.day,
        pageviews: Number(item.pageviews || 0),
        visitors: Number(item.visitors || 0),
      })),
      top_pages: rows(pages).map((item) => ({
        path: item.path,
        pageviews: Number(item.pageviews || 0),
      })),
      top_referrers: rows(referrers).map((item) => ({
        referrer: item.referrer,
        pageviews: Number(item.pageviews || 0),
      })),
      email: context.data.adminEmail,
    });
  } catch (error) {
    console.error("loading traffic stats failed", error);
    return json({ ok: false, error: "无法读取流量数据，请检查 D1 绑定和迁移" }, 503);
  }
}
