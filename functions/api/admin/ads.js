import {
  adsFromRow,
  getDatabase,
  json,
  normalizeAds,
} from "../../_lib/common.js";

const SELECT_ADS = `SELECT enabled, publisher_id, home_feed_slot,
                           article_inline_slot, article_end_slot,
                           updated_at, updated_by
                    FROM ad_settings
                    WHERE id = 1`;

export async function onRequestGet(context) {
  try {
    const database = getDatabase(context);
    const row = await database.prepare(SELECT_ADS).first();
    return json({
      ads: adsFromRow(row),
      updated_at: row?.updated_at || "",
      updated_by: row?.updated_by || "",
      email: context.data.adminEmail,
    });
  } catch (error) {
    console.error("loading admin ad settings failed", error);
    return json({ ok: false, error: "无法读取广告设置" }, 503);
  }
}

export async function onRequestPut(context) {
  let payload;
  try {
    payload = await context.request.json();
  } catch (_) {
    return json({ ok: false, error: "请求格式无效" }, 400);
  }

  let ads;
  try {
    ads = normalizeAds(payload);
  } catch (error) {
    return json({ ok: false, error: error.message }, 400);
  }

  try {
    const database = getDatabase(context);
    const updatedAt = new Date().toISOString();
    await database
      .prepare(
        `INSERT INTO ad_settings (
           id, enabled, publisher_id, home_feed_slot, article_inline_slot,
           article_end_slot, updated_at, updated_by
         ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           enabled = excluded.enabled,
           publisher_id = excluded.publisher_id,
           home_feed_slot = excluded.home_feed_slot,
           article_inline_slot = excluded.article_inline_slot,
           article_end_slot = excluded.article_end_slot,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`
      )
      .bind(
        ads.enabled ? 1 : 0,
        ads.publisher_id,
        ads.home_feed_slot,
        ads.article_inline_slot,
        ads.article_end_slot,
        updatedAt,
        context.data.adminEmail
      )
      .run();

    return json({
      ok: true,
      ads,
      updated_at: updatedAt,
      updated_by: context.data.adminEmail,
    });
  } catch (error) {
    console.error("saving ad settings failed", error);
    return json({ ok: false, error: "保存广告设置失败" }, 503);
  }
}
