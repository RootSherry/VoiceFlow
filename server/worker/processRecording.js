const fs = require("fs");
const { getAudioPath, updateRecording, setRecordingError, getRecording } = require("../db/recordings");
const { setTaskStatus, getTask } = require("../db/tasks");
const { analyzeText, transcribeAudioFile, getOpenAIApiKey } = require("../ai/openai");

function fallbackResult(level) {
  const transcript = {
    segments: [
      { id: 1, startTime: 0, speaker: "我", text: "（未配置 AI Key，使用内置降级转写示例）" }
    ]
  };
  const analysis =
    level === "asset"
      ? {
          summary: "未配置 OPENAI_API_KEY，当前为降级示例输出。请在服务端配置后重新生成。",
          todoList: ["在服务器上配置 OPENAI_API_KEY", "重试该任务"]
        }
      : null;
  return { transcript, analysis };
}

async function processRecordingJob({ recordingId }) {
  if (!recordingId) throw new Error("缺少 recordingId");
  const rec = getRecording(recordingId);
  if (!rec) throw new Error("录音记录不存在");

  const audioPath = getAudioPath(recordingId);
  if (!audioPath) throw new Error("音频文件路径不存在");
  if (!fs.existsSync(audioPath)) throw new Error("音频文件不存在");

  const task = getTask(recordingId);
  if (!task) {
    // 允许补写
    setTaskStatus(recordingId, "processing", null);
  } else {
    setTaskStatus(recordingId, "processing", null);
  }

  updateRecording(recordingId, { status: "Processing", error: null });

  try {
    let transcript;
    let analysis = null;

    if (!getOpenAIApiKey()) {
      ({ transcript, analysis } = fallbackResult(rec.level));
    } else {
      const tr = await transcribeAudioFile({ audioPath, language: "zh" });
      transcript = tr.transcript;
      if (!transcript?.segments?.length) ({ transcript, analysis } = fallbackResult(rec.level));

      if (rec.level === "asset") {
        analysis = await analyzeText({ transcriptText: tr.text, scene: rec.scene });
      }
    }

    updateRecording(recordingId, {
      status: "Ready",
      transcript_json: JSON.stringify(transcript),
      analysis_json: analysis ? JSON.stringify(analysis) : null,
      error: null
    });
    setTaskStatus(recordingId, "done", null);

    return { ok: true };
  } catch (err) {
    const message = err?.message || "unknown";
    setRecordingError(recordingId, message);
    setTaskStatus(recordingId, "failed", message);
    throw err;
  }
}

module.exports = { processRecordingJob };
