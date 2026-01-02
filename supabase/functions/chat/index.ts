import { corsHeaders, jsonResponse, requireUser } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const payload = await req.json().catch(() => null);
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  if (messages.length === 0) {
    return jsonResponse({ error: "Messages are required" }, 400);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "OPENAI_API_KEY is not set on the server" }, 500);
  }

  const model = payload?.model || Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
  const requestBody = { model, messages };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    if (!response.ok) {
      return jsonResponse(
        { error: data?.error?.message || "OpenAI request failed" },
        response.status
      );
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return jsonResponse({ error: "Empty response from OpenAI" }, 502);
    }

    return jsonResponse({ reply, usage: data?.usage }, 200);
  } catch (_error) {
    return jsonResponse({ error: "Failed to reach OpenAI" }, 502);
  }
});
