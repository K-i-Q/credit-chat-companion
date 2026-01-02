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
  const inviteId = payload?.invite_id;
  if (!inviteId) {
    return jsonResponse({ error: "Invalid invite_id" }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from("invite_links")
    .delete()
    .eq("id", inviteId)
    .select("id")
    .maybeSingle();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  if (!data) {
    return jsonResponse({ error: "Coupon not found" }, 404);
  }

  return jsonResponse({ ok: true }, 200);
});
