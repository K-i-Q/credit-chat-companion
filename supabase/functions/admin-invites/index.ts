import { corsHeaders, jsonResponse, requireAdmin, supabaseAdmin } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  if (!supabaseAdmin) {
    return jsonResponse({ error: "Supabase admin client not configured" }, 500);
  }

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin
      .from("invite_links")
      .select("id, code, credits, active, uses_count, created_at, last_used_at")
      .order("created_at", { ascending: false });
    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ invites: data || [] }, 200);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const payload = await req.json().catch(() => null);
  const credits = Number(payload?.credits);
  const rawCode = typeof payload?.code === "string" ? payload.code.trim() : "";
  const code = rawCode.toLowerCase();

  if (!Number.isInteger(credits) || credits <= 0) {
    return jsonResponse({ error: "Invalid credits" }, 400);
  }

  if (!code) {
    return jsonResponse({ error: "Code is required" }, 400);
  }

  if (!/^[a-z0-9_-]{4,32}$/.test(code)) {
    return jsonResponse({ error: "Invalid code format" }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from("invite_links")
    .insert({ code, credits, created_by: auth.user.id })
    .select("id, code, credits, active, uses_count, created_at, last_used_at")
    .single();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ invite: data }, 200);
});
