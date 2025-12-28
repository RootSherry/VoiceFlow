const fs = require("fs");
const path = require("path");

function normalizeBaseUrl(value) {
  const v = String(value || "").trim();
  if (!v) return "https://api.openai.com/v1";
  return v.endsWith("/") ? v.slice(0, -1) : v;
}

function getOpenAIBaseUrl() {
  return normalizeBaseUrl(process.env.OPENAI_BASE_URL || "");
}

function getOpenAIApiKey() {
  return process.env.OPENAI_API_KEY || "";
}

function getOpenAITranscribeModel() {
  return process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
}

function getOpenAIChatModel() {
  return process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
}

function guessAudioMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webm") return "audio/webm";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".mp4") return "audio/mp4";
  return "application/octet-stream";
}

async function readJsonOrText(res) {
  const text = await res.text().catch(() => "");
  try {
    return { data: text ? JSON.parse(text) : null, text };
  } catch {
    return { data: null, text };
  }
}

async function openaiFetch(endpointPath, init) {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) throw new Error("未配置 OPENAI_API_KEY");

  const baseUrl = getOpenAIBaseUrl();
  const url = `${baseUrl}${endpointPath.startsWith("/") ? "" : "/"}${endpointPath}`;

  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${apiKey}`);

  const res = await fetch(url, { ...init, headers });
  const { data, text } = await readJsonOrText(res);
  if (!res.ok) {
    const message =
      data?.error?.message ||
      data?.error ||
      data?.message ||
      (text ? text.slice(0, 200) : "") ||
      `HTTP ${res.status}`;
    throw new Error(`OpenAI HTTP ${res.status}: ${message}`);
  }
  return data;
}

async function transcribeAudioFile({ audioPath, language = "zh" }) {
  const model = getOpenAITranscribeModel();
  const mimeType = guessAudioMimeType(audioPath);
  const buf = fs.readFileSync(audioPath);

  const form = new FormData();
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("language", language);
  form.append("file", new Blob([buf], { type: mimeType }), path.basename(audioPath));

  const data = await openaiFetch("/audio/transcriptions", {
    method: "POST",
    body: form
  });

  const rawSegments = Array.isArray(data?.segments) ? data.segments : [];
  const text = typeof data?.text === "string" ? data.text : "";

  const segments = rawSegments
    .map((s, idx) => ({
      id: idx + 1,
      startTime: Number.isFinite(s?.start) ? s.start : 0,
      speaker: "我",
      text: String(s?.text || "").trim()
    }))
    .filter((s) => s.text.length > 0);

  if (segments.length) return { transcript: { segments }, text: segments.map((s) => s.text).join("\n") };
  if (text) return { transcript: { segments: [{ id: 1, startTime: 0, speaker: "我", text: text.trim() }] }, text: text.trim() };
  return { transcript: { segments: [] }, text: "" };
}

function extractJsonObject(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const m = /{[\s\S]*}/.exec(trimmed);
  return m ? m[0] : null;
}

async function analyzeText({ transcriptText, scene }) {
  const model = getOpenAIChatModel();

  const system = [
    "你是一个专业的中文会议/语音内容分析助手。",
    "要求：只输出 JSON，不要包含 Markdown 或多余文本。",
    "JSON 结构必须是：{ \"summary\": string, \"todoList\": string[] }",
    "summary 2-5 句；todoList 0-8 条。"
  ].join("\n");

  const sceneHint = scene ? `场景：${scene}` : "场景：未知";
  const user = [
    sceneHint,
    "",
    "请基于以下转写文本生成摘要与行动项（中文）：",
    transcriptText || ""
  ].join("\n");

  const data = await openaiFetch("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      response_format: { type: "json_object" }
    })
  });

  const content = data?.choices?.[0]?.message?.content;
  const jsonText = extractJsonObject(content);
  if (!jsonText) throw new Error("分析结果不是 JSON");
  const parsed = JSON.parse(jsonText);
  const summary = parsed?.summary ? String(parsed.summary).trim() : "";
  const todoList = Array.isArray(parsed?.todoList) ? parsed.todoList.map((t) => String(t).trim()).filter(Boolean) : [];
  return { summary, todoList };
}

module.exports = {
  getOpenAIBaseUrl,
  getOpenAIApiKey,
  getOpenAITranscribeModel,
  getOpenAIChatModel,
  transcribeAudioFile,
  analyzeText
};

