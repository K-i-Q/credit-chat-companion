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
  const code = typeof payload?.code === "string" ? payload.code.trim().toLowerCase() : "";
  if (!code) {
    return jsonResponse({ error: "Invalid code" }, 400);
  }

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("invite_links")
    .select("id, credits, active, uses_count")
    .eq("code", code)
    .maybeSingle();

  if (inviteError || !invite || !invite.active) {
    return jsonResponse({ error: "Invite not found" }, 404);
  }

  const { error: redemptionError } = await supabaseAdmin
    .from("invite_redemptions")
    .insert({ invite_id: invite.id, user_id: auth.user.id });

  if (redemptionError?.code === "23505") {
    return jsonResponse({ ok: true, already_redeemed: true }, 200);
  }

  if (redemptionError) {
    return jsonResponse({ error: "Failed to redeem invite" }, 500);
  }

  const { data: walletRow } = await supabaseAdmin
    .from("credit_wallets")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!walletRow) {
    const { error: insertError } = await supabaseAdmin
      .from("credit_wallets")
      .insert({ user_id: auth.user.id, balance: 0 });
    if (insertError) {
      await supabaseAdmin
        .from("invite_redemptions")
        .delete()
        .eq("invite_id", invite.id)
        .eq("user_id", auth.user.id);
      return jsonResponse({ error: "Failed to create wallet" }, 500);
    }
  }

  const { data: topupData, error: topupError } = await supabaseAdmin.rpc("admin_topup_credits", {
    p_user_id: auth.user.id,
    p_amount: invite.credits,
    p_meta: { source: "invite", code },
  });

  if (topupError) {
    await supabaseAdmin
      .from("invite_redemptions")
      .delete()
      .eq("invite_id", invite.id)
      .eq("user_id", auth.user.id);
    return jsonResponse({ error: topupError.message }, 500);
  }

  await supabaseAdmin
    .from("invite_links")
    .update({ uses_count: invite.uses_count + 1, last_used_at: new Date().toISOString() })
    .eq("id", invite.id);

  const newBalance = Array.isArray(topupData) ? topupData[0]?.new_balance : topupData?.new_balance;
  return jsonResponse({ ok: true, new_balance: newBalance ?? null }, 200);
});
