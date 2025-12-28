const fs = require("fs");
const { getDb } = require("./index");

function safeJsonParse(value, fallback) {
  try {
    if (value == null) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    level: row.level,
    scene: row.scene,
    createdAt: row.created_at,
    duration: row.duration,
    status: row.status,
    isStarred: !!row.is_starred,
    markers: safeJsonParse(row.markers_json, []),
    transcript: safeJsonParse(row.transcript_json, { segments: [] }),
    analysis: safeJsonParse(row.analysis_json, null),
    audioBlobUrl: `/api/recordings/${row.id}/audio`
  };
}

function recordingExists(id) {
  const db = getDb();
  const row = db.prepare("SELECT 1 FROM recordings WHERE id = ?").get(id);
  return !!row;
}

function createRecording({
  id,
  title,
  level,
  scene,
  createdAt,
  duration,
  audioPath,
  status,
  markers,
  isStarred = false
}) {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `
      INSERT INTO recordings (
        id, title, level, scene, created_at, duration, audio_path, status,
        is_starred, markers_json, transcript_json, analysis_json, error, updated_at
      ) VALUES (
        @id, @title, @level, @scene, @created_at, @duration, @audio_path, @status,
        @is_starred, @markers_json, NULL, NULL, NULL, @updated_at
      )
    `
  ).run({
    id,
    title,
    level,
    scene: scene || null,
    created_at: createdAt || now,
    duration: Number.isFinite(duration) ? Math.max(0, Math.floor(duration)) : 0,
    audio_path: audioPath,
    status,
    is_starred: isStarred ? 1 : 0,
    markers_json: JSON.stringify(Array.isArray(markers) ? markers : []),
    updated_at: now
  });

  return getRecording(id);
}

function updateRecording(id, patch) {
  const db = getDb();
  const current = db.prepare("SELECT * FROM recordings WHERE id = ?").get(id);
  if (!current) return null;
  const now = Date.now();

  const next = {
    ...current,
    ...patch,
    updated_at: now
  };

  db.prepare(
    `
      UPDATE recordings
      SET
        title = @title,
        level = @level,
        scene = @scene,
        created_at = @created_at,
        duration = @duration,
        audio_path = @audio_path,
        status = @status,
        is_starred = @is_starred,
        markers_json = @markers_json,
        transcript_json = @transcript_json,
        analysis_json = @analysis_json,
        error = @error,
        updated_at = @updated_at
      WHERE id = @id
    `
  ).run({
    id: next.id,
    title: next.title,
    level: next.level,
    scene: next.scene,
    created_at: next.created_at,
    duration: next.duration,
    audio_path: next.audio_path,
    status: next.status,
    is_starred: next.is_starred,
    markers_json: next.markers_json,
    transcript_json: next.transcript_json,
    analysis_json: next.analysis_json,
    error: next.error,
    updated_at: next.updated_at
  });

  return getRecording(id);
}

function setRecordingError(id, errorMessage) {
  return updateRecording(id, { status: "Failed", error: String(errorMessage || "unknown") });
}

function getRecordingRow(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM recordings WHERE id = ?").get(id);
}

function getRecording(id) {
  return mapRow(getRecordingRow(id));
}

function listRecordings({ includeBody = false } = {}) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM recordings ORDER BY created_at DESC").all();
  if (includeBody) return rows.map(mapRow);
  return rows.map((r) => {
    const rec = mapRow(r);
    return {
      ...rec,
      transcript: rec.transcript ? { segments: [] } : { segments: [] }
    };
  });
}

function getAudioPath(id) {
  const row = getRecordingRow(id);
  if (!row) return null;
  return row.audio_path;
}

function deleteRecording(id) {
  const db = getDb();
  const row = getRecordingRow(id);
  if (!row) return false;
  try {
    fs.unlinkSync(row.audio_path);
  } catch {}
  db.prepare("DELETE FROM recordings WHERE id = ?").run(id);
  return true;
}

module.exports = {
  recordingExists,
  createRecording,
  updateRecording,
  setRecordingError,
  getRecording,
  listRecordings,
  getAudioPath,
  deleteRecording
};

