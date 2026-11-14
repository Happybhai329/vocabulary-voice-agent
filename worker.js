/* Serves the static app plus one AI route. The Gemini key lives in the Worker
   secret GEMINI_API_KEY and is never sent to the browser. Everything stays in
   this one module so the worker needs no bundler. */

const MODEL = "gemini-3.5-flash-lite";
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const WORD_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      word: { type: "STRING", description: "one English word, lowercase, no spaces" },
      definition: { type: "STRING", description: "at most 14 words, must not contain the word" },
      example: { type: "STRING", description: "one sentence with ___ where the word belongs" },
      hint: { type: "STRING", description: "short nudge that never contains the word" },
    },
    required: ["word", "definition", "example", "hint"],
    propertyOrdering: ["word", "definition", "example", "hint"],
  },
};

export function buildPrompt(count, level) {
  return [
    `Write ${count} distinct English vocabulary words at CEFR ${level} level,`,
    "the kind that matter for job interviews and workplace writing in India.",
    "Rules:",
    "- lowercase single words only, no proper nouns, no duplicates",
    "- the definition must be under 14 words and must NOT contain the word itself",
    "- the example is one natural sentence with ___ standing in for the word",
    '- the hint is a short nudge that never contains the word, e.g. "starts with R, like resilience"',
    "Return only the JSON array.",
  ].join("\n");
}

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function sanitizeWords(raw, count) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const words = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const word = clean(item.word, 24).toLowerCase();
    const definition = clean(item.definition, 140);
    const example = clean(item.example, 180);
    const hint = clean(item.hint, 90);
    if (!/^[a-z]{4,15}$/.test(word)) continue;
    if (seen.has(word)) continue;
    if (definition.length < 8 || definition.toLowerCase().includes(word)) continue;
    if (!example.includes("___") || example.length < 12) continue;
    if (hint.length < 4) continue;
    seen.add(word);
    words.push({ word, definition, example, hint });
    if (words.length >= count) break;
  }
  return words;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callModel(model, apiKey, prompt, signal) {
  const response = await fetch(ENDPOINT(model), {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    signal,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 1.1,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
        responseSchema: WORD_SCHEMA,
      },
    }),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 160);
    const error = new Error(`gemini_${response.status}`);
    error.status = response.status;
    error.detail = detail;
    throw error;
  }
  const data = await response.json();
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("empty_response");
  return JSON.parse(text);
}

export async function generateWords({ apiKey, count = 5, level = "B2", model = MODEL, timeoutMs = 9000 } = {}) {
  if (!apiKey) throw new Error("missing_api_key");
  const safeCount = Math.min(Math.max(Number(count) || 5, 3), 8);
  const prompt = buildPrompt(safeCount, level);
  const models = model === MODEL ? [MODEL, "gemini-flash-lite-latest"] : [model];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let lastError = new Error("no_attempt");
  try {
    for (const current of models) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const words = sanitizeWords(await callModel(current, apiKey, prompt, controller.signal), safeCount);
          if (words.length >= 3) return words;
          lastError = new Error("thin_response");
          break; // a second try on the same model rarely helps here
        } catch (error) {
          lastError = error;
          const retryable = error.status === 429 || error.status === 503 || error.status === 500;
          if (!retryable || controller.signal.aborted) break;
          await sleep(400);
        }
      }
    }
    throw lastError;
  } finally {
    clearTimeout(timer);
  }
}

const ALLOWED_ORIGINS = new Set([
  "https://vocabulary-voice-agent.onrender.com",
  "https://site-457749e5d12b4431903cd5fbbef590b7.freebuff.page",
]);

// Cheap guard so a public link can't burn the whole free quota.
const quota = { windowStart: 0, used: 0 };

function withinQuota() {
  const now = Date.now();
  if (now - quota.windowStart > 10 * 60 * 1000) {
    quota.windowStart = now;
    quota.used = 0;
  }
  if (quota.used >= 40) return false;
  quota.used += 1;
  return true;
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(extra || {}) },
  });
}

async function handleRound(request, env) {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const apiKey = env && env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "ai_unavailable" }, 503, cors);
  if (!withinQuota()) return json({ error: "quota_guard" }, 429, cors);

  let payload = {};
  try {
    payload = await request.json();
  } catch (error) {
    payload = {};
  }

  try {
    const words = await generateWords({ apiKey, count: payload.count, level: payload.level });
    return json({ words, source: "ai", model: MODEL }, 200, cors);
  } catch (error) {
    const detail = error && error.detail ? `${error.message}: ${error.detail}` : String((error && error.message) || error);
    return json({ error: "ai_failed", detail }, 502, cors);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/round") return handleRound(request, env);
    return env.ASSETS.fetch(request);
  },
};
