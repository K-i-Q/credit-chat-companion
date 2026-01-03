import { corsHeaders, jsonResponse, requireUser, supabaseAdmin } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  if (!supabaseAdmin) {
    return jsonResponse({ error: "Supabase admin client not configured" }, 500);
  }

  const payload = await req.json().catch(() => null);
  const rawCode = typeof payload?.code === "string" ? payload.code.trim().toLowerCase() : "";
  if (!rawCode) {
    return jsonResponse({ error: "Invalid code" }, 400);
  }

  const { data: referral, error: referralError } = await supabaseAdmin
    .from("referral_codes")
    .select("user_id, code")
    .eq("code", rawCode)
    .maybeSingle();

  if (referralError) {
    return jsonResponse({ error: referralError.message }, 500);
  }

  if (!referral) {
    return jsonResponse({ error: "Referral not found" }, 404);
  }

  if (referral.user_id === auth.user.id) {
    return jsonResponse({ error: "Cannot use your own code" }, 400);
  }

  const { error: insertError } = await supabaseAdmin
    .from("referral_redemptions")
    .insert({
      referrer_user_id: referral.user_id,
      referred_user_id: auth.user.id,
      code: referral.code,
    });

  if (insertError?.code === "23505") {
    return jsonResponse({ ok: true, already_redeemed: true }, 200);
  }

  if (insertError) {
    return jsonResponse({ error: insertError.message }, 500);
  }

  return jsonResponse({ ok: true }, 200);
});
