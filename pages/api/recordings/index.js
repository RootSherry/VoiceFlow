const fs = require("fs");
const path = require("path");
const formidable = require("formidable");
const { ensureDataDirs, getTmpDir, getUploadPathForId } = require("../../../server/paths");
const { recordingExists, createRecording, listRecordings, setRecordingError } = require("../../../server/db/recordings");
const { upsertTask, setTaskStatus } = require("../../../server/db/tasks");
const { getQueue } = require("../../../server/queue/voiceflowQueue");

function first(v) {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseJsonField(value, fallback) {
  try {
    if (value == null || value === "") return fallback;
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function validateId(id) {
  return typeof id === "string" && /^[a-f0-9-]{16,64}$/i.test(id);
}

function validateLevel(level) {
  return level === "asset" || level === "text" || level === "audio_only";
}

function validateScene(scene) {
  return scene === "meeting" || scene === "lecture" || scene === "interview" || scene === "idea";
}

async function handlePost(req, res) {
  ensureDataDirs();
  const maxBytes = Number.parseInt(process.env.UPLOAD_MAX_BYTES || "", 10) || 50 * 1024 * 1024;

  const form = formidable({
    multiples: false,
    maxFileSize: maxBytes,
    keepExtensions: true,
    uploadDir: getTmpDir(),
    filter: ({ mimetype }) => {
      if (!mimetype) return false;
      if (mimetype.startsWith("audio/")) return true;
      if (mimetype === "video/webm") return true;
      return false;
    }
  });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) {
        const message = err.code === "LIMIT_FILE_SIZE" ? `上传文件过大（最大 ${(maxBytes / 1024 / 1024).toFixed(0)}MB）` : err.message;
        res.status(400).json({ error: message });
        return;
      }

      const id = String(first(fields.id) || "");
      const title = String(first(fields.title) || "新实录资产");
      const level = String(first(fields.level) || "");
      const scene = String(first(fields.scene) || "");
      const createdAt = Number.parseInt(String(first(fields.createdAt) || Date.now()), 10);
      const duration = Number.parseInt(String(first(fields.duration) || 0), 10);
      const markers = parseJsonField(first(fields.markersJson), []);

      if (!validateId(id)) {
        res.status(400).json({ error: "参数错误：id 非法" });
        return;
      }
      if (!validateLevel(level)) {
        res.status(400).json({ error: "参数错误：level 非法" });
        return;
      }
      if (scene && !validateScene(scene)) {
        res.status(400).json({ error: "参数错误：scene 非法" });
        return;
      }
      if (recordingExists(id)) {
        res.status(409).json({ error: "记录已存在" });
        return;
      }

      const file = first(files.audio);
      if (!file || !file.filepath) {
        res.status(400).json({ error: "缺少音频文件字段 audio" });
        return;
      }

      const ext = path.extname(file.originalFilename || "") || ".webm";
      const finalPath = getUploadPathForId(id, ext.toLowerCase() === ".webm" ? ".webm" : ext);

      try {
        fs.renameSync(file.filepath, finalPath);
      } catch {
        fs.copyFileSync(file.filepath, finalPath);
        fs.unlinkSync(file.filepath);
      }

      const status = level === "audio_only" ? "Ready" : "Transcribing";

      const recording = createRecording({
        id,
        title,
        level,
        scene: scene || null,
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        duration: Number.isFinite(duration) ? duration : 0,
        audioPath: finalPath,
        status,
        markers
      });

      if (level !== "audio_only") {
        upsertTask({ id, recordingId: id, type: level === "asset" ? "transcribe+analyze" : "transcribe", status: "waiting" });
        try {
          const queue = getQueue();
          await queue.add("process-recording", { recordingId: id }, { jobId: id });
        } catch (e) {
          const msg = e?.message || "队列入队失败";
          setRecordingError(id, msg);
          setTaskStatus(id, "failed", msg);
          res.status(502).json({ error: msg });
          return;
        }
      }

      res.status(200).json({ recording });
    } catch (e) {
      res.status(500).json({ error: e?.message || "服务器错误" });
    }
  });
}

function handleGet(req, res) {
  const includeBody = String(req.query.includeBody || "") === "1";
  const recordings = listRecordings({ includeBody });
  res.status(200).json({ recordings });
}

async function handler(req, res) {
  if (req.method === "POST") return handlePost(req, res);
  if (req.method === "GET") return handleGet(req, res);
  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method Not Allowed" });
}

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false
  }
};
