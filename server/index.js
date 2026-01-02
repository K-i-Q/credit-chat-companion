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
      const isDuplicate = error.code === "23505";
      sendJson(res, 500, { error: isDuplicate ? "Code already exists" : error.message });
      return;
    }
    const users = data?.users || [];
    const userIds = users.map((user) => user.id);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, role, full_name")
      .in("user_id", userIds);
    const { data: wallets } = await supabaseAdmin
      .from("credit_wallets")
      .select("user_id, balance")
      .in("user_id", userIds);

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    const walletMap = new Map((wallets || []).map((w) => [w.user_id, w]));
    const payload = users.map((user) => ({
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      role: profileMap.get(user.id)?.role || "user",
      full_name: profileMap.get(user.id)?.full_name || null,
      balance: walletMap.get(user.id)?.balance ?? 0,
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

  if (url.pathname === "/api/admin/credits") {
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

    const amount = Number(payload?.amount);
    const userId = payload?.user_id;
    if (!userId || !Number.isInteger(amount) || amount <= 0) {
      sendJson(res, 400, { error: "Invalid user_id or amount" });
      return;
    }

    if (!supabaseAdmin) {
      sendJson(res, 500, { error: "Supabase admin client not configured" });
      return;
    }

    const { data: walletRow, error: walletError } = await supabaseAdmin
      .from("credit_wallets")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (walletError) {
      sendJson(res, 500, { error: "Failed to read wallet" });
      return;
    }

    if (!walletRow) {
      const { error: insertError } = await supabaseAdmin
        .from("credit_wallets")
        .insert({ user_id: userId, balance: 0 });
      if (insertError) {
        sendJson(res, 500, { error: "Failed to create wallet" });
        return;
      }
    }

    const { data, error } = await supabaseAdmin.rpc("admin_topup_credits", {
      p_user_id: userId,
      p_amount: amount,
      p_meta: {
        source: "admin",
        by: auth.user.id,
      },
    });

    if (error) {
      sendJson(res, 500, { error: error.message });
      return;
    }

    const newBalance = Array.isArray(data) ? data[0]?.new_balance : data?.new_balance;
    sendJson(res, 200, { ok: true, new_balance: newBalance ?? null });
    return;
  }

  if (url.pathname === "/api/admin/users/delete") {
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

    const userId = payload?.user_id;
    if (!userId) {
      sendJson(res, 400, { error: "Invalid user_id" });
      return;
    }
    if (userId === auth.user.id) {
      sendJson(res, 400, { error: "Cannot delete your own account" });
      return;
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      sendJson(res, 500, { error: error.message });
      return;
    }

    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/admin/invites") {
    const auth = await requireAdmin(req, res);
    if (!auth) return;

    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("invite_links")
        .select("id, code, credits, active, uses_count, created_at, last_used_at")
        .order("created_at", { ascending: false });
      if (error) {
        sendJson(res, 500, { error: error.message });
        return;
      }
      sendJson(res, 200, { invites: data || [] });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { error: "Invalid JSON payload" });
      return;
    }

    const credits = Number(payload?.credits);
    const rawCode = typeof payload?.code === "string" ? payload.code.trim() : "";
    const providedCode = rawCode ? rawCode.toLowerCase() : "";
    if (!Number.isInteger(credits) || credits <= 0) {
      sendJson(res, 400, { error: "Invalid credits" });
      return;
    }

    if (!providedCode) {
      sendJson(res, 400, { error: "Code is required" });
      return;
    }

    if (!/^[a-z0-9_-]{4,32}$/.test(providedCode)) {
      sendJson(res, 400, { error: "Invalid code format" });
      return;
    }

    const code = providedCode;
    const { data, error } = await supabaseAdmin
      .from("invite_links")
      .insert({ code, credits, created_by: auth.user.id })
      .select("id, code, credits, active, uses_count, created_at, last_used_at")
      .single();

    if (error) {
      sendJson(res, 500, { error: error.message });
      return;
    }

    sendJson(res, 200, { invite: data });
    return;
  }

  if (url.pathname === "/api/invite/redeem") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    if (!supabaseAdmin) {
      sendJson(res, 500, { error: "Supabase admin client not configured" });
      return;
    }
    const token = getBearerToken(req);
    if (!token) {
      sendJson(res, 401, { error: "Missing auth token" });
      return;
    }
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { error: "Invalid JSON payload" });
      return;
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      sendJson(res, 401, { error: "Invalid auth token" });
      return;
    }

    const code = typeof payload?.code === "string" ? payload.code.trim().toLowerCase() : "";
    const metadataCode = userData.user.user_metadata?.invite_code;
    const resolvedCode =
      code || (typeof metadataCode === "string" ? metadataCode.trim().toLowerCase() : "");
    if (!resolvedCode) {
      sendJson(res, 400, { error: "Invalid code" });
      return;
    }

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("invite_links")
      .select("id, credits, active, uses_count")
      .eq("code", resolvedCode)
      .maybeSingle();

    if (inviteError || !invite || !invite.active) {
      sendJson(res, 404, { error: "Invite not found" });
      return;
    }

    const { error: redemptionError } = await supabaseAdmin
      .from("invite_redemptions")
      .insert({ invite_id: invite.id, user_id: userData.user.id });

    if (redemptionError?.code === "23505") {
      sendJson(res, 200, { ok: true, already_redeemed: true });
      return;
    }

    if (redemptionError) {
      sendJson(res, 500, { error: "Failed to redeem invite" });
      return;
    }

    const { data: walletRow } = await supabaseAdmin
      .from("credit_wallets")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!walletRow) {
      const { error: insertError } = await supabaseAdmin
        .from("credit_wallets")
        .insert({ user_id: userData.user.id, balance: 0 });
      if (insertError) {
        await supabaseAdmin
          .from("invite_redemptions")
          .delete()
          .eq("invite_id", invite.id)
          .eq("user_id", userData.user.id);
        sendJson(res, 500, { error: "Failed to create wallet" });
        return;
      }
    }

    const { data: topupData, error: topupError } = await supabaseAdmin.rpc("admin_topup_credits", {
      p_user_id: userData.user.id,
      p_amount: invite.credits,
      p_meta: { source: "invite", code: resolvedCode },
    });

    if (topupError) {
      await supabaseAdmin
        .from("invite_redemptions")
        .delete()
        .eq("invite_id", invite.id)
        .eq("user_id", userData.user.id);
      sendJson(res, 500, { error: topupError.message });
      return;
    }

    await supabaseAdmin
      .from("invite_links")
      .update({ uses_count: invite.uses_count + 1, last_used_at: new Date().toISOString() })
      .eq("id", invite.id);

    if (metadataCode) {
      await supabaseAdmin.auth.admin.updateUserById(userData.user.id, {
        user_metadata: { ...userData.user.user_metadata, invite_code: null },
      });
    }

    const newBalance = Array.isArray(topupData) ? topupData[0]?.new_balance : topupData?.new_balance;
    sendJson(res, 200, { ok: true, new_balance: newBalance ?? null });
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
