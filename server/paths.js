const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

function resolvePath(envValue, fallbackAbsolutePath) {
  if (!envValue) return fallbackAbsolutePath;
  return path.isAbsolute(envValue) ? envValue : path.resolve(projectRoot, envValue);
}

function getDataDir() {
  return resolvePath(process.env.DATA_DIR, path.join(projectRoot, "data"));
}

function getUploadsDir() {
  return path.join(getDataDir(), "uploads");
}

function getTmpDir() {
  return path.join(getDataDir(), "tmp");
}

function getSqlitePath() {
  return resolvePath(process.env.SQLITE_PATH, path.join(getDataDir(), "voiceflow.sqlite3"));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureDataDirs() {
  ensureDir(getDataDir());
  ensureDir(getUploadsDir());
  ensureDir(getTmpDir());
}

function getUploadPathForId(recordingId, ext = ".webm") {
  return path.join(getUploadsDir(), `${recordingId}${ext}`);
}

module.exports = {
  getDataDir,
  getUploadsDir,
  getTmpDir,
  getSqlitePath,
  ensureDataDirs,
  getUploadPathForId
};

