-- 0001_init.sql
-- 同人音楽配信プラットフォーム 初期スキーマ
-- D1 / SQLite。created_at は全テーブル UNIX秒 (INTEGER) で統一。

-- ① contents（頒布コンテンツ）
CREATE TABLE contents (
  id TEXT PRIMARY KEY,                          -- UUID
  title TEXT NOT NULL,
  jacket_object_key   TEXT NOT NULL,            -- R2: ジャケット画像のオブジェクトキー
  download_object_key TEXT,                     -- R2: 一括DL用zip（アップ前はNULL）
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- ② tracks（収録曲＝ストリーミング用の個別音源ファイル）
CREATE TABLE tracks (
  id TEXT PRIMARY KEY,                          -- UUID
  content_id TEXT NOT NULL REFERENCES contents(id),
  track_number INTEGER NOT NULL,               -- 曲順 (1, 2, 3...)
  title TEXT NOT NULL,
  r2_object_key TEXT NOT NULL,                  -- R2: 音源ファイルのオブジェクトキー
  UNIQUE (content_id, track_number)
);
CREATE INDEX idx_tracks_content ON tracks (content_id);

-- ③ batches（イベント単位の一括発行ロット）
CREATE TABLE batches (
  id TEXT PRIMARY KEY,                          -- UUID
  label TEXT NOT NULL,                          -- 例: "M3-2026春"
  content_id TEXT NOT NULL REFERENCES contents(id),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX idx_batches_content ON batches (content_id);

-- ④ licenses（ライセンスキー）
CREATE TABLE licenses (
  license_key TEXT PRIMARY KEY,                 -- A1B2-C3D4（PK=UNIQUE。衝突時はWorkersで再生成）
  content_id  TEXT NOT NULL REFERENCES contents(id),
  batch_id    TEXT REFERENCES batches(id),
  max_devices INTEGER NOT NULL DEFAULT 3,       -- 紐付け可能な最大デバイス数
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX idx_licenses_content ON licenses (content_id);
CREATE INDEX idx_licenses_batch   ON licenses (batch_id);

-- ⑤ devices（キー↔ブラウザの紐付け。本棚と3台制限の中核）
-- 1ブラウザ=1つの device_token (Cookie) を持ち、キー入力ごとに行が増える。
-- 本棚      = WHERE device_token = <自分のCookie>
-- 3台制限   = COUNT(*) WHERE license_key = ? <= licenses.max_devices
-- 認証解除  = 該当行を DELETE するだけ（枠はライブ集計のため自動的に空く）
CREATE TABLE devices (
  id TEXT PRIMARY KEY,                          -- UUID
  license_key  TEXT NOT NULL REFERENCES licenses(license_key),
  device_token TEXT NOT NULL,                   -- Cookieに保存するブラウザ識別子
  label        TEXT,                            -- 例: "Chrome on Windows"（UA等から自動生成・任意）
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_seen_at INTEGER,                         -- 最終利用日時（解除UIの判断材料）
  UNIQUE (license_key, device_token)
);
CREATE INDEX idx_devices_token   ON devices (device_token);
CREATE INDEX idx_devices_license ON devices (license_key);
