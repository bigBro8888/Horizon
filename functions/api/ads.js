import { adsFromRow, DEFAULT_ADS, getDatabase, json } from "../_lib/common.js";

export async function onRequestGet(context) {
  try {
    const database = getDatabase(context);
    const row = await database
      .prepare(
        `SELECT enabled, publisher_id, home_feed_slot, article_inline_slot,
                article_end_slot
         FROM ad_settings
         WHERE id = 1`
      )
      .first();
    return json({ ads: adsFromRow(row) });
  } catch (error) {
    console.error("loading ad settings failed", error);
    return json({ ads: { ...DEFAULT_ADS }, fallback: true });
  }
}
