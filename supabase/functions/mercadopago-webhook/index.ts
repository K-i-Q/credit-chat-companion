import { corsHeaders, jsonResponse, supabaseAdmin } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!supabaseAdmin) {
    return jsonResponse({ error: "Supabase admin client not configured" }, 500);
  }

  const payload = await req.json().catch(() => null);
  const url = new URL(req.url);
  const queryId = url.searchParams.get("data.id") || url.searchParams.get("id");
  const paymentId = payload?.data?.id || payload?.id || queryId;

  if (!paymentId) {
    return jsonResponse({ ok: true }, 200);
  }

  const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!accessToken) {
    return jsonResponse({ error: "MERCADOPAGO_ACCESS_TOKEN is not set" }, 500);
  }

  const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const mpData = await mpResponse.json().catch(() => null);
  if (!mpResponse.ok || !mpData) {
    return jsonResponse({ error: "Failed to fetch payment" }, 500);
  }

  const externalReference = mpData?.external_reference;
  if (!externalReference) {
    return jsonResponse({ ok: true }, 200);
  }

  const { data: purchase, error } = await supabaseAdmin
    .from("credit_purchases")
    .select("id, user_id, credits, amount_cents, status")
    .eq("id", externalReference)
    .maybeSingle();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const status = mpData?.status || "pending";
  const statusDetail = mpData?.status_detail ?? null;
  const providerPaymentId = mpData?.id?.toString() ?? null;
  const now = new Date().toISOString();

  if (purchase) {
    if (purchase.status === "approved") {
      return jsonResponse({ ok: true }, 200);
    }

    if (status === "approved") {
      const expectedAmount = purchase.amount_cents / 100;
      const amount = Number(mpData?.transaction_amount ?? 0);
      const currency = mpData?.currency_id || "BRL";

      if (currency !== "BRL" || Math.abs(amount - expectedAmount) > 0.01) {
        return jsonResponse({ error: "Payment amount mismatch" }, 400);
      }

      const { data: lockRow, error: lockError } = await supabaseAdmin
        .from("credit_purchases")
        .update({ status: "processing", updated_at: now })
        .eq("id", purchase.id)
        .eq("status", purchase.status)
        .select("id")
        .maybeSingle();

      if (lockError) {
        return jsonResponse({ error: lockError.message }, 500);
      }

      if (!lockRow) {
        return jsonResponse({ ok: true }, 200);
      }

      const { data: topupData, error: topupError } = await supabaseAdmin.rpc(
        "admin_topup_credits",
        {
          p_user_id: purchase.user_id,
          p_amount: purchase.credits,
          p_meta: { source: "pix", provider: "mercadopago", payment_id: providerPaymentId },
        }
      );

      if (topupError) {
        await supabaseAdmin
          .from("credit_purchases")
          .update({
            status: "failed",
            provider_payment_id: providerPaymentId,
            updated_at: now,
            metadata: {
              mp_status_detail: statusDetail,
            },
          })
          .eq("id", purchase.id);
        return jsonResponse({ error: topupError.message }, 500);
      }

      await supabaseAdmin
        .from("credit_purchases")
        .update({
          status,
          provider_payment_id: providerPaymentId,
          updated_at: now,
          approved_at: now,
          metadata: {
            mp_status_detail: statusDetail,
          },
        })
        .eq("id", purchase.id);

      if (purchase.credits >= 10) {
        const { data: redemption, error: redemptionError } = await supabaseAdmin
          .from("referral_redemptions")
          .select("id, referrer_user_id")
          .eq("referred_user_id", purchase.user_id)
          .is("rewarded_at", null)
          .maybeSingle();

        if (redemptionError) {
          return jsonResponse({ error: redemptionError.message }, 500);
        }

        if (redemption) {
          const { data: lockRow, error: lockError } = await supabaseAdmin
            .from("referral_redemptions")
            .update({ rewarded_at: now, purchase_id: purchase.id })
            .eq("id", redemption.id)
            .is("rewarded_at", null)
            .select("id, referrer_user_id")
            .maybeSingle();

          if (lockError) {
            return jsonResponse({ error: lockError.message }, 500);
          }

          if (lockRow) {
            const rewardMeta = {
              source: "referral",
              purchase_id: purchase.id,
              payment_id: providerPaymentId,
            };

            const { error: referredError } = await supabaseAdmin.rpc("admin_topup_credits", {
              p_user_id: purchase.user_id,
              p_amount: 10,
              p_meta: { ...rewardMeta, role: "referred" },
            });

            if (referredError) {
              return jsonResponse({ error: referredError.message }, 500);
            }

            const { error: referrerError } = await supabaseAdmin.rpc("admin_topup_credits", {
              p_user_id: lockRow.referrer_user_id,
              p_amount: 10,
              p_meta: { ...rewardMeta, role: "referrer" },
            });

            if (referrerError) {
              return jsonResponse({ error: referrerError.message }, 500);
            }
          }
        }
      }

      return jsonResponse({ ok: true, new_balance: topupData?.new_balance ?? null }, 200);
    }

    await supabaseAdmin
      .from("credit_purchases")
      .update({
        status,
        provider_payment_id: providerPaymentId,
        updated_at: now,
        metadata: {
          mp_status_detail: statusDetail,
        },
      })
      .eq("id", purchase.id);

    return jsonResponse({ ok: true }, 200);
  }

  const { data: donation, error: donationError } = await supabaseAdmin
    .from("donation_purchases")
    .select("id, user_id, amount_cents, status")
    .eq("id", externalReference)
    .maybeSingle();

  if (donationError) {
    return jsonResponse({ error: donationError.message }, 500);
  }

  if (!donation) {
    return jsonResponse({ ok: true }, 200);
  }

  if (donation.status === "approved") {
    return jsonResponse({ ok: true }, 200);
  }

  if (status === "approved") {
    const expectedAmount = donation.amount_cents / 100;
    const amount = Number(mpData?.transaction_amount ?? 0);
    const currency = mpData?.currency_id || "BRL";

    if (currency !== "BRL" || Math.abs(amount - expectedAmount) > 0.01) {
      return jsonResponse({ error: "Payment amount mismatch" }, 400);
    }

    const { data: lockRow, error: lockError } = await supabaseAdmin
      .from("donation_purchases")
      .update({ status: "processing", updated_at: now })
      .eq("id", donation.id)
      .eq("status", donation.status)
      .select("id")
      .maybeSingle();

    if (lockError) {
      return jsonResponse({ error: lockError.message }, 500);
    }

    if (!lockRow) {
      return jsonResponse({ ok: true }, 200);
    }

    await supabaseAdmin
      .from("donation_purchases")
      .update({
        status,
        provider_payment_id: providerPaymentId,
        updated_at: now,
        approved_at: now,
        metadata: {
          mp_status_detail: statusDetail,
        },
      })
      .eq("id", donation.id);

    return jsonResponse({ ok: true }, 200);
  }

  await supabaseAdmin
    .from("donation_purchases")
    .update({
      status,
      provider_payment_id: providerPaymentId,
      updated_at: now,
      metadata: {
        mp_status_detail: statusDetail,
      },
    })
    .eq("id", donation.id);

  return jsonResponse({ ok: true }, 200);
});
