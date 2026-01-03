import { corsHeaders, jsonResponse, requireUser, supabaseAdmin } from "../_shared/utils.ts";

const buildCode = (userId: string) => {
  return `mx${userId.replace(/-/g, "").slice(0, 8).toLowerCase()}`;
};

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

  const userId = auth.user.id;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("referral_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    return jsonResponse({ error: existingError.message }, 500);
  }

  if (existing?.code) {
    return jsonResponse({ code: existing.code }, 200);
  }

  const code = buildCode(userId);
  const { error: insertError } = await supabaseAdmin
    .from("referral_codes")
    .insert({ user_id: userId, code });

  if (insertError) {
    return jsonResponse({ error: insertError.message }, 500);
  }

  return jsonResponse({ code }, 200);
});
