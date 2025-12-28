const fs = require("fs");
const path = require("path");
const { getAudioPath, updateRecording, setRecordingError, getRecording } = require("../db/recordings");
const { setTaskStatus, getTask } = require("../db/tasks");
const { generateJsonFromAudio, getGeminiApiKey } = require("../ai/gemini");

function buildSystemPrompt(scene) {
  const sceneHint = scene ? `场景：${scene}` : "场景：未知";
  return [
    "你是一个专业的中文语音转写与会议分析助手。",
    "要求：只输出 JSON，不要包含 Markdown 或多余文本。",
    "转写需要尽量还原口语表达，不要过度润色。",
    sceneHint
  ].join("\n");
}

function buildPrompt(level) {
  const base = [
    "请对音频进行处理并输出严格 JSON：",
    "字段约束：",
    "- transcript.segments: 数组，每项包含 { id:number, startTime:number, speaker?:string, text:string }",
    "- startTime 单位秒，允许近似",
    "- text 为中文",
    "如果无法识别某段，请用 text 填写“[无法识别]”。"
  ];

  if (level === "asset") {
    base.push(
      "同时生成 analysis：{ summary:string, todoList:string[] }，summary 2-5 句，todoList 0-8 条。"
    );
  }

  const schema = level === "asset"
    ? `输出 JSON 结构：{ "transcript": { "segments": [...] }, "analysis": { "summary": "...", "todoList": ["..."] } }`
    : `输出 JSON 结构：{ "transcript": { "segments": [...] } }`;

  base.push(schema);
  return base.join("\n");
}

function normalizeTranscript(raw) {
  const segments = Array.isArray(raw?.transcript?.segments) ? raw.transcript.segments : Array.isArray(raw?.segments) ? raw.segments : [];
  const normalized = segments
    .map((s, idx) => ({
      id: Number.isFinite(s?.id) ? s.id : idx + 1,
      startTime: Number.isFinite(s?.startTime) ? s.startTime : 0,
      speaker: s?.speaker ? String(s.speaker) : "我",
      text: String(s?.text || "").trim()
    }))
    .filter((s) => s.text.length > 0);
  return { segments: normalized };
}

function normalizeAnalysis(raw) {
  const analysis = raw?.analysis;
  if (!analysis) return null;
  const summary = analysis.summary ? String(analysis.summary).trim() : "";
  const todoList = Array.isArray(analysis.todoList) ? analysis.todoList.map((t) => String(t).trim()).filter(Boolean) : [];
  return { summary, todoList };
}

function fallbackResult(level) {
  const transcript = {
    segments: [
      { id: 1, startTime: 0, speaker: "我", text: "（未配置 AI Key，使用内置降级转写示例）" }
    ]
  };
  const analysis =
    level === "asset"
      ? {
          summary: "未配置 GEMINI_API_KEY，当前为降级示例输出。请在服务端配置后重新生成。",
          todoList: ["在服务器上配置 GEMINI_API_KEY", "重试该任务"]
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
    const audioBuf = fs.readFileSync(audioPath);
    const audioBase64 = audioBuf.toString("base64");
    const audioMimeType = path.extname(audioPath).toLowerCase() === ".webm" ? "audio/webm" : "application/octet-stream";

    let transcript;
    let analysis = null;

    if (!getGeminiApiKey()) {
      ({ transcript, analysis } = fallbackResult(rec.level));
    } else {
      const raw = await generateJsonFromAudio({
        prompt: buildPrompt(rec.level),
        system: buildSystemPrompt(rec.scene),
        audioBase64,
        audioMimeType
      });
      transcript = normalizeTranscript(raw);
      analysis = rec.level === "asset" ? normalizeAnalysis(raw) : null;
      if (!transcript.segments.length) {
        ({ transcript, analysis } = fallbackResult(rec.level));
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

