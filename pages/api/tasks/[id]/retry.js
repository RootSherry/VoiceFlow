const { getQueue } = require("../../../../server/queue/voiceflowQueue");
const { getRecording, updateRecording } = require("../../../../server/db/recordings");
const { upsertTask } = require("../../../../server/db/tasks");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const id = String(req.query.id || "");
  const rec = getRecording(id);
  if (!rec) {
    res.status(404).json({ error: "Not Found" });
    return;
  }
  if (rec.level === "audio_only") {
    res.status(400).json({ error: "audio_only 无需重试" });
    return;
  }

  upsertTask({ id, recordingId: id, type: rec.level === "asset" ? "transcribe+analyze" : "transcribe", status: "waiting", error: null });
  updateRecording(id, { status: "Transcribing", error: null });

  try {
    const queue = getQueue();
    await queue.add("process-recording", { recordingId: id }, { jobId: id });
  } catch (e) {
    const msg = e?.message || "队列入队失败";
    if (msg.includes("Job") && msg.includes("exists")) {
      res.status(200).json({ ok: true, duplicated: true });
      return;
    }
    res.status(502).json({ error: msg });
    return;
  }

  res.status(200).json({ ok: true });
};
