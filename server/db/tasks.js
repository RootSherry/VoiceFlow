const { getDb } = require("./index");

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    recordingId: row.recording_id,
    type: row.type,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function upsertTask({ id, recordingId, type, status, error = null }) {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `
      INSERT INTO tasks (id, recording_id, type, status, error, created_at, updated_at)
      VALUES (@id, @recording_id, @type, @status, @error, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        recording_id = excluded.recording_id,
        type = excluded.type,
        status = excluded.status,
        error = excluded.error,
        updated_at = excluded.updated_at
    `
  ).run({
    id,
    recording_id: recordingId,
    type,
    status,
    error,
    created_at: now,
    updated_at: now
  });
  return getTask(id);
}

function setTaskStatus(id, status, error = null) {
  const db = getDb();
  const now = Date.now();
  db.prepare("UPDATE tasks SET status = ?, error = ?, updated_at = ? WHERE id = ?").run(status, error, now, id);
  return getTask(id);
}

function getTask(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  return mapRow(row);
}

function listTasks() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC").all();
  return rows.map(mapRow);
}

module.exports = { upsertTask, setTaskStatus, getTask, listTasks };

