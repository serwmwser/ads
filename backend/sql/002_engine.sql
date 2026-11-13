-- 002_engine: география, категории, партнёры (white-label), ЕСИА, расширение объявлений

CREATE TABLE IF NOT EXISTS regions (
  code  TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  slug  TEXT NOT NULL UNIQUE,
  sort  INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS cities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  region_code TEXT NOT NULL REFERENCES regions(code),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  population  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (region_code, slug)
);
CREATE INDEX IF NOT EXISTS cities_region_idx ON cities(region_code, name);
CREATE INDEX IF NOT EXISTS cities_slug_idx ON cities(slug);

CREATE TABLE IF NOT EXISTS categories (
  code      TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  parent    TEXT,
  sort      INTEGER NOT NULL DEFAULT 100,
  active    INTEGER NOT NULL DEFAULT 1
);

INSERT INTO categories (code, title, parent, sort) VALUES ('transport', 'Транспорт', NULL, 10) ON CONFLICT (code) DO NOTHING;
INSERT INTO categories (code, title, parent, sort) VALUES ('realty', 'Недвижимость', NULL, 20) ON CONFLICT (code) DO NOTHING;
INSERT INTO categories (code, title, parent, sort) VALUES ('jobs', 'Работа', NULL, 30) ON CONFLICT (code) DO NOTHING;
INSERT INTO categories (code, title, parent, sort) VALUES ('services', 'Услуги', NULL, 40) ON CONFLICT (code) DO NOTHING;
INSERT INTO categories (code, title, parent, sort) VALUES ('electronics', 'Электроника', NULL, 50) ON CONFLICT (code) DO NOTHING;
INSERT INTO categories (code, title, parent, sort) VALUES ('home', 'Дом и дача', NULL, 60) ON CONFLICT (code) DO NOTHING;
INSERT INTO categories (code, title, parent, sort) VALUES ('clothes', 'Одежда и обувь', NULL, 70) ON CONFLICT (code) DO NOTHING;
INSERT INTO categories (code, title, parent, sort) VALUES ('kids', 'Детские товары', NULL, 80) ON CONFLICT (code) DO NOTHING;
INSERT INTO categories (code, title, parent, sort) VALUES ('animals', 'Животные', NULL, 90) ON CONFLICT (code) DO NOTHING;
INSERT INTO categories (code, title, parent, sort) VALUES ('hobby', 'Хобби и отдых', NULL, 100) ON CONFLICT (code) DO NOTHING;
INSERT INTO categories (code, title, parent, sort) VALUES ('other', 'Другое', NULL, 999) ON CONFLICT (code) DO NOTHING;

ALTER TABLE ads ADD COLUMN region_code TEXT NOT NULL DEFAULT '';
ALTER TABLE ads ADD COLUMN city_id INTEGER;
ALTER TABLE ads ADD COLUMN contact_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE ads ADD COLUMN show_phone INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ads ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ads ADD COLUMN partner_id INTEGER;
ALTER TABLE ads ADD COLUMN reject_reason TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS ads_region_idx ON ads(region_code, city_id, status);
CREATE INDEX IF NOT EXISTS ads_user_idx ON ads(user_id, id DESC);
CREATE INDEX IF NOT EXISTS ads_partner_idx ON ads(partner_id, status);

CREATE TABLE IF NOT EXISTS partners (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id  INTEGER NOT NULL REFERENCES users(id),
  name           TEXT NOT NULL,
  domain         TEXT NOT NULL DEFAULT '',
  default_region TEXT NOT NULL DEFAULT '',
  default_city   INTEGER,
  rate_limit_min INTEGER NOT NULL DEFAULT 60,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS partners_owner_idx ON partners(owner_user_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id  INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  key_prefix  TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL DEFAULT '',
  scope       TEXT NOT NULL DEFAULT 'read',
  active      INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS api_keys_partner_idx ON api_keys(partner_id);

CREATE TABLE IF NOT EXISTS esia_accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  esia_oid    TEXT NOT NULL UNIQUE,
  trusted     INTEGER NOT NULL DEFAULT 0,
  linked_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_views (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id      INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  views      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (ad_id, day)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad_id      INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, ad_id)
);
