CREATE TABLE IF NOT EXISTS traffic_daily (
  day TEXT PRIMARY KEY,
  pageviews INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS traffic_page_daily (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);

CREATE TABLE IF NOT EXISTS traffic_referrer_daily (
  day TEXT NOT NULL,
  referrer TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, referrer)
);

CREATE TABLE IF NOT EXISTS traffic_visitor_daily (
  day TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  PRIMARY KEY (day, visitor_hash)
);

CREATE INDEX IF NOT EXISTS idx_traffic_page_day
  ON traffic_page_daily (day);

CREATE INDEX IF NOT EXISTS idx_traffic_referrer_day
  ON traffic_referrer_daily (day);

CREATE INDEX IF NOT EXISTS idx_traffic_visitor_day
  ON traffic_visitor_daily (day);

CREATE TABLE IF NOT EXISTS ad_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  publisher_id TEXT NOT NULL,
  home_feed_slot TEXT NOT NULL DEFAULT '',
  article_inline_slot TEXT NOT NULL DEFAULT '',
  article_end_slot TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO ad_settings (
  id,
  enabled,
  publisher_id,
  home_feed_slot,
  article_inline_slot,
  article_end_slot,
  updated_at,
  updated_by
) VALUES (
  1,
  1,
  'ca-pub-4598371924010228',
  '',
  '',
  '',
  datetime('now'),
  'migration'
);
