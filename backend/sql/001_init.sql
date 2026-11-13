CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  phone        TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role         TEXT NOT NULL DEFAULT 'user',
  is_blocked   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at   TEXT
);

CREATE TABLE IF NOT EXISTS auth_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  phone      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS auth_codes_phone_idx ON auth_codes(phone, id DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tariffs (
  code          TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  price_kopeks  INTEGER NOT NULL,
  kind          TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  duration_days INTEGER NOT NULL DEFAULT 0,
  sort          INTEGER NOT NULL DEFAULT 100,
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS payments (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  provider            TEXT NOT NULL DEFAULT 'yookassa',
  provider_payment_id TEXT UNIQUE,
  idempotence_key     TEXT UNIQUE NOT NULL,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  tariff_code         TEXT NOT NULL REFERENCES tariffs(code),
  amount_kopeks       INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'RUB',
  status              TEXT NOT NULL DEFAULT 'pending',
  confirmation_url    TEXT NOT NULL DEFAULT '',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at             TEXT,
  raw                 TEXT
);
CREATE INDEX IF NOT EXISTS payments_user_idx ON payments(user_id, id DESC);

CREATE TABLE IF NOT EXISTS entitlements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  payment_id INTEGER REFERENCES payments(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_payment_kind_idx ON entitlements(payment_id, kind);

CREATE TABLE IF NOT EXISTS ads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  slug          TEXT NOT NULL DEFAULT '',
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  price_kopeks  INTEGER NOT NULL DEFAULT 0,
  category      TEXT NOT NULL,
  city          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'moderation',
  boosted_until TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  published_at  TEXT,
  removed_at    TEXT
);
CREATE INDEX IF NOT EXISTS ads_feed_idx ON ads(status, category, city, published_at DESC);

CREATE TABLE IF NOT EXISTS ad_photos (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  url   TEXT NOT NULL,
  sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chats (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id      INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  buyer_id   INTEGER NOT NULL REFERENCES users(id),
  seller_id  INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ad_id, buyer_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id         INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL,
  body_translated TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  read_at         TEXT
);
CREATE INDEX IF NOT EXISTS messages_chat_idx ON messages(chat_id, id);

CREATE TABLE IF NOT EXISTS complaints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL,
  target_id   INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS blocks (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS moderation_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id   INTEGER,
  action     TEXT NOT NULL,
  target     TEXT NOT NULL,
  details    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO tariffs (code, title, description, price_kopeks, kind, quantity, duration_days, sort) VALUES
  ('extra_ad',  'Дополнительное объявление', 'Одно дополнительное активное объявление на 30 дней', 9900,  'ad_credit',    1, 30, 10),
  ('boost',     'Поднятие в ленте',          'Поднятие одного объявления на 7 дней',                4900,  'boost_credit', 1, 7,  20),
  ('pro_month', 'Подписка «Про»',            'До 20 активных объявлений и поднятия, 30 дней',       29900, 'pro',          1, 30, 30);
