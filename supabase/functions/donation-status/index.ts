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

  const { data: donation, error } = await supabaseAdmin
    .from("donation_purchases")
    .select("id, user_id, status, updated_at, approved_at")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  if (!donation) {
    return jsonResponse({ error: "Payment not found" }, 404);
  }

  if (donation.user_id !== auth.user.id) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  return jsonResponse(
    {
      status: donation.status,
      updated_at: donation.updated_at,
      approved_at: donation.approved_at,
    },
    200
  );
});
