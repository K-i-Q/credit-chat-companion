import fs from "fs";
import http from "http";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContents = fs.readFileSync(envPath, "utf8");
  envContents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
    if (!match) return;
    const key = match[1];
    let value = match[2] ?? "";
    value = value.replace(/^['"]|['"]$/g, "");
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

const PORT = Number(process.env.PORT || 3001);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(payload));
};

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": CORS_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname !== "/api/chat") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!OPENAI_API_KEY) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is not set on the server" });
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: "Invalid JSON payload" });
    return;
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (messages.length === 0) {
    sendJson(res, 400, { error: "Messages are required" });
    return;
  }

  const requestBody = {
    model: payload.model || OPENAI_MODEL,
    messages,
    temperature: typeof payload.temperature === "number" ? payload.temperature : 0.7,
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      sendJson(res, response.status, {
        error: data?.error?.message || "OpenAI request failed",
      });
      return;
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      sendJson(res, 502, { error: "Empty response from OpenAI" });
      return;
    }

    sendJson(res, 200, { reply, usage: data?.usage });
  } catch (error) {
    sendJson(res, 502, { error: "Failed to reach OpenAI" });
  }
});

server.listen(PORT, () => {
  console.log(`OpenAI proxy listening on http://localhost:${PORT}`);
});
