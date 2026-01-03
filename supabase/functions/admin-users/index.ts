import { corsHeaders, jsonResponse, requireAdmin, supabaseAdmin } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  if (!supabaseAdmin) {
    return jsonResponse({ error: "Supabase admin client not configured" }, 500);
  }

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const users = data?.users || [];
  const userIds = users.map((user) => user.id);
  if (userIds.length === 0) {
    return jsonResponse({ users: [] }, 200);
  }

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, role, full_name")
    .in("user_id", userIds);
  const { data: wallets } = await supabaseAdmin
    .from("credit_wallets")
    .select("user_id, balance")
    .in("user_id", userIds);
  const { data: referralCodes } = await supabaseAdmin
    .from("referral_codes")
    .select("user_id, code")
    .in("user_id", userIds);

  const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
  const walletMap = new Map((wallets || []).map((w) => [w.user_id, w]));
  const referralMap = new Map((referralCodes || []).map((r) => [r.user_id, r]));

  const payload = users.map((user) => ({
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    role: profileMap.get(user.id)?.role || "user",
    full_name: profileMap.get(user.id)?.full_name || null,
    balance: walletMap.get(user.id)?.balance ?? 0,
    referral_code: referralMap.get(user.id)?.code ?? null,
  }));

  return jsonResponse({ users: payload }, 200);
});
