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
  const paymentId = payload?.payment_id;
  if (!paymentId) {
    return jsonResponse({ error: "Invalid payment_id" }, 400);
  }

  const { data: purchase, error } = await supabaseAdmin
    .from("credit_purchases")
    .select("id, user_id, status, updated_at, approved_at")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  if (!purchase) {
    return jsonResponse({ error: "Payment not found" }, 404);
  }

  if (purchase.user_id !== auth.user.id) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const { data: wallet } = await supabaseAdmin
    .from("credit_wallets")
    .select("balance")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  return jsonResponse(
    {
      status: purchase.status,
      updated_at: purchase.updated_at,
      approved_at: purchase.approved_at,
      balance: wallet?.balance ?? null,
    },
    200
  );
});
