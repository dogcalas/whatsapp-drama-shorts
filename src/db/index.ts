import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_DB_PATH = process.env.DRAMA_DB_PATH ?? path.join(ROOT, "data", "drama.db");

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DEFAULT_DB_PATH), { recursive: true });
  _db = new Database(DEFAULT_DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
  return _db;
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      script_path     TEXT    NOT NULL,
      video_path      TEXT    NOT NULL,
      theme           TEXT    NOT NULL,
      language        TEXT    NOT NULL,
      title           TEXT    NOT NULL,
      hook            TEXT    NOT NULL,
      twist           TEXT    NOT NULL,
      total_messages  INTEGER NOT NULL,
      duration_s      INTEGER NOT NULL,
      created_at      INTEGER NOT NULL,
      platform        TEXT    NOT NULL,                -- 'youtube' | 'instagram'
      platform_id     TEXT,                            -- video id from the platform
      platform_url    TEXT,
      posted_at       INTEGER,
      upload_status   TEXT    NOT NULL DEFAULT 'pending', -- 'pending' | 'uploading' | 'live' | 'failed'
      upload_error    TEXT,
      UNIQUE (platform, platform_id)
    );

    CREATE INDEX IF NOT EXISTS idx_posts_platform_posted_at
      ON posts(platform, posted_at);
    CREATE INDEX IF NOT EXISTS idx_posts_theme
      ON posts(theme);

    CREATE TABLE IF NOT EXISTS metrics (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      fetched_at  INTEGER NOT NULL,
      views       INTEGER,
      likes       INTEGER,
      comments    INTEGER,
      shares      INTEGER,
      saves       INTEGER,
      reach       INTEGER,
      plays       INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_post_id_fetched_at
      ON metrics(post_id, fetched_at);

    CREATE TABLE IF NOT EXISTS trend_snapshots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      computed_at  INTEGER NOT NULL,
      window_days  INTEGER NOT NULL,
      data_json    TEXT    NOT NULL
    );
  `);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
