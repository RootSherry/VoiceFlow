const DEFAULT_MODEL = "gemini-2.5-flash-preview-09-2025";

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || "";
}

function getGeminiModel() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function callGeminiGenerateContent({ apiKey, model, prompt, system, audioBase64, audioMimeType, responseMimeType }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = {
    contents: [
      {
        parts: [{ text: prompt }, { inlineData: { mimeType: audioMimeType, data: audioBase64 } }]
      }
    ],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { responseMimeType: responseMimeType || "application/json" }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini 返回空内容");
  if ((responseMimeType || "application/json") === "application/json") {
    return JSON.parse(text);
  }
  return text;
}

async function generateJsonFromAudio({ prompt, system, audioBase64, audioMimeType = "audio/webm" }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("未配置 GEMINI_API_KEY");
  const model = getGeminiModel();

  const maxRetries = Number.parseInt(process.env.GEMINI_MAX_RETRIES || "5", 10) || 5;
  let delay = 1000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await callGeminiGenerateContent({
        apiKey,
        model,
        prompt,
        system,
        audioBase64,
        audioMimeType,
        responseMimeType: "application/json"
      });
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await sleep(delay);
      delay = Math.min(delay * 2, 15000);
    }
  }
}

module.exports = { getGeminiApiKey, getGeminiModel, generateJsonFromAudio };

