import fs from "fs";
import http from "http";
import path from "path";
import { createClient } from "@supabase/supabase-js";

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
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

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

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
};

const requireAdmin = async (req, res) => {
  if (!supabaseAdmin) {
    sendJson(res, 500, { error: "Supabase admin client not configured" });
    return null;
  }
  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: "Missing auth token" });
    return null;
  }
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    sendJson(res, 401, { error: "Invalid auth token" });
    return null;
  }
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (profileError) {
    sendJson(res, 500, { error: "Failed to read profile role" });
    return null;
  }
  if (profile?.role !== "admin") {
    sendJson(res, 403, { error: "Forbidden" });
    return null;
  }
  return { user: userData.user };
};

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

  if (url.pathname === "/api/admin/users") {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) {
      sendJson(res, 500, { error: error.message });
      return;
    }
    const users = data?.users || [];
    const userIds = users.map((user) => user.id);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, role, full_name")
      .in("user_id", userIds);

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    const payload = users.map((user) => ({
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      role: profileMap.get(user.id)?.role || "user",
      full_name: profileMap.get(user.id)?.full_name || null,
    }));

    sendJson(res, 200, { users: payload });
    return;
  }

  if (url.pathname === "/api/admin/role") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    const auth = await requireAdmin(req, res);
    if (!auth) return;

    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { error: "Invalid JSON payload" });
      return;
    }

    const { user_id: userId, role } = payload || {};
    if (!userId || (role !== "admin" && role !== "user")) {
      sendJson(res, 400, { error: "Invalid user_id or role" });
      return;
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert({ user_id: userId, role }, { onConflict: "user_id" });

    if (error) {
      sendJson(res, 500, { error: error.message });
      return;
    }

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
