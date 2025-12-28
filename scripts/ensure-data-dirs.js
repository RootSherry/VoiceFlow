const { ensureDataDirs, getDataDir, getUploadsDir, getTmpDir, getSqlitePath } = require("../server/paths");

ensureDataDirs();

console.log("[voiceflow] DATA_DIR:", getDataDir());
console.log("[voiceflow] UPLOADS_DIR:", getUploadsDir());
console.log("[voiceflow] TMP_DIR:", getTmpDir());
console.log("[voiceflow] SQLITE_PATH:", getSqlitePath());

