const fs = require("fs");
const path = require("path");
const { getAudioPath } = require("../../../../server/db/recordings");

function send404(res) {
  res.statusCode = 404;
  res.end("Not Found");
}

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("Method Not Allowed");
    return;
  }

  const id = String(req.query.id || "");
  const audioPath = getAudioPath(id);
  if (!audioPath) return send404(res);

  if (!fs.existsSync(audioPath)) return send404(res);

  const stat = fs.statSync(audioPath);
  const total = stat.size;
  const range = req.headers.range;
  const ext = path.extname(audioPath).toLowerCase();

  const contentType = ext === ".webm" ? "audio/webm" : "application/octet-stream";
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentType);

  if (!range) {
    res.setHeader("Content-Length", String(total));
    fs.createReadStream(audioPath).pipe(res);
    return;
  }

  const m = /^bytes=(\d+)-(\d+)?$/.exec(range);
  if (!m) {
    res.statusCode = 416;
    res.end();
    return;
  }

  const start = Number.parseInt(m[1], 10);
  const end = m[2] ? Number.parseInt(m[2], 10) : total - 1;
  const safeStart = Number.isFinite(start) ? start : 0;
  const safeEnd = Number.isFinite(end) ? Math.min(end, total - 1) : total - 1;

  if (safeStart >= total || safeEnd >= total) {
    res.statusCode = 416;
    res.end();
    return;
  }

  res.statusCode = 206;
  res.setHeader("Content-Range", `bytes ${safeStart}-${safeEnd}/${total}`);
  res.setHeader("Content-Length", String(safeEnd - safeStart + 1));
  fs.createReadStream(audioPath, { start: safeStart, end: safeEnd }).pipe(res);
};

