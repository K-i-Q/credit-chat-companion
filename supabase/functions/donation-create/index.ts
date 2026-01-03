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
  const amount = Number(payload?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return jsonResponse({ error: "Invalid amount" }, 400);
  }

  const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!accessToken) {
    return jsonResponse({ error: "MERCADOPAGO_ACCESS_TOKEN is not set" }, 500);
  }

  let receiverName: string | null = null;
  try {
    const receiverResponse = await fetch("https://api.mercadopago.com/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const receiverData = await receiverResponse.json().catch(() => null);
    if (receiverResponse.ok && receiverData) {
      receiverName =
        receiverData.nickname ||
        [receiverData.first_name, receiverData.last_name].filter(Boolean).join(" ") ||
        receiverData.email ||
        null;
    }
  } catch (_error) {
    receiverName = null;
  }

  const paymentId = crypto.randomUUID();
  const amountCents = Math.round(amount * 100);
  const normalizedAmount = amountCents / 100;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const notificationUrl = supabaseUrl
    ? `${supabaseUrl}/functions/v1/mercadopago-webhook`
    : undefined;

  const paymentPayload = {
    transaction_amount: normalizedAmount,
    description: "Doacao para o projeto Mentorix",
    payment_method_id: "pix",
    payer: {
      email: auth.user.email ?? "no-reply@mentorix.ai",
    },
    external_reference: paymentId,
    metadata: {
      user_id: auth.user.id,
      amount_cents: amountCents,
      type: "donation",
    },
    notification_url: notificationUrl,
  };

  const response = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": paymentId,
    },
    body: JSON.stringify(paymentPayload),
  });

  const data = await response.json();
  if (!response.ok) {
    return jsonResponse(
      { error: data?.message || data?.error || "Mercado Pago request failed" },
      response.status
    );
  }

  const qrCode = data?.point_of_interaction?.transaction_data?.qr_code ?? null;
  const qrCodeBase64 = data?.point_of_interaction?.transaction_data?.qr_code_base64 ?? null;
  const ticketUrl = data?.point_of_interaction?.transaction_data?.ticket_url ?? null;

  const { error: insertError } = await supabaseAdmin
    .from("donation_purchases")
    .insert({
      id: paymentId,
      user_id: auth.user.id,
      amount_cents: amountCents,
      currency: "BRL",
      provider: "mercadopago",
      provider_payment_id: data?.id?.toString() ?? null,
      status: data?.status ?? "pending",
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      metadata: {
        mp_status_detail: data?.status_detail ?? null,
        receiver_name: receiverName,
      },
    });

  if (insertError) {
    return jsonResponse({ error: insertError.message }, 500);
  }

  return jsonResponse(
    {
      payment_id: paymentId,
      status: data?.status ?? "pending",
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      ticket_url: ticketUrl,
      receiver_name: receiverName,
    },
    200
  );
});
