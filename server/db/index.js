const Database = require("better-sqlite3");
const { ensureDataDirs, getSqlitePath } = require("../paths");

let db;

function initSchema(database) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      level TEXT NOT NULL,
      scene TEXT,
      created_at INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      audio_path TEXT NOT NULL,
      status TEXT NOT NULL,
      is_starred INTEGER NOT NULL DEFAULT 0,
      markers_json TEXT,
      transcript_json TEXT,
      analysis_json TEXT,
      error TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON recordings(created_at DESC);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      recording_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(recording_id) REFERENCES recordings(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  `);
}

function getDb() {
  if (db) return db;
  ensureDataDirs();
  db = new Database(getSqlitePath());
  initSchema(db);
  return db;
}

module.exports = { getDb };

