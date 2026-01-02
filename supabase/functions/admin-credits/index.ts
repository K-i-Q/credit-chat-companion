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
  const amount = Number(payload?.amount);
  const userId = payload?.user_id;
  if (!userId || !Number.isInteger(amount) || amount <= 0) {
    return jsonResponse({ error: "Invalid user_id or amount" }, 400);
  }

  const { data: walletRow, error: walletError } = await supabaseAdmin
    .from("credit_wallets")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (walletError) {
    return jsonResponse({ error: "Failed to read wallet" }, 500);
  }

  if (!walletRow) {
    const { error: insertError } = await supabaseAdmin
      .from("credit_wallets")
      .insert({ user_id: userId, balance: 0 });
    if (insertError) {
      return jsonResponse({ error: "Failed to create wallet" }, 500);
    }
  }

  const { data, error } = await supabaseAdmin.rpc("admin_topup_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_meta: { source: "admin", by: auth.user.id },
  });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const newBalance = Array.isArray(data) ? data[0]?.new_balance : data?.new_balance;
  return jsonResponse({ ok: true, new_balance: newBalance ?? null }, 200);
});
