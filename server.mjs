// Local preview server (no dependencies) with the same /api/round as production.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateWords } from "./worker.js";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(projectDir, "public");

// .env keeps the key out of git; without it the app uses its built-in words.
try {
  const envText = fs.readFileSync(path.join(projectDir, ".env"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
} catch (error) {
  /* no .env: AI stays off, everything else works */
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 100000) req.destroy();
    });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

async function handleRound(req, res) {
  let payload = {};
  try {
    payload = JSON.parse((await readBody(req)) || "{}");
  } catch (error) {
    payload = {};
  }

  const headers = { "content-type": "application/json", "cache-control": "no-store", ...cors };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.writeHead(503, headers).end(JSON.stringify({ error: "ai_unavailable" }));
    return;
  }

  try {
    const { words, model } = await generateWords({ apiKey, count: payload.count, level: payload.level });
    res.writeHead(200, headers).end(JSON.stringify({ words, source: "ai", model }));
  } catch (error) {
    res.writeHead(502, headers).end(
      JSON.stringify({ error: "ai_failed", detail: String((error && error.message) || error) })
    );
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/api/round") {
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors).end();
      return;
    }
    await handleRound(req, res);
    return;
  }

  let filePath = path.join(root, decodeURIComponent(url.pathname));
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath)) filePath = path.join(root, "index.html");

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": types[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(data);
  });
});

const port = 4173;
server.listen(port, "127.0.0.1", () => {
  console.log(`Lingo preview on http://127.0.0.1:${port}`);
});
