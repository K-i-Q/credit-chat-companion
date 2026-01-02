import { corsHeaders, jsonResponse, requireAdmin, supabaseAdmin } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  if (!supabaseAdmin) {
    return jsonResponse({ error: "Supabase admin client not configured" }, 500);
  }

  const payload = await req.json().catch(() => null);
  const userId = payload?.user_id;
  const role = payload?.role;
  if (!userId || (role !== "admin" && role !== "user")) {
    return jsonResponse({ error: "Invalid user_id or role" }, 400);
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert({ user_id: userId, role }, { onConflict: "user_id" });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true }, 200);
});
