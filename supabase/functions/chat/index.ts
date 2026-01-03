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
  const hasSystem = messages.some((message) => message?.role === "system");
  const systemPrompt = [
    "Você é o Mentorix, um assistente de criação de sites com foco em vibe coding.",
    "Seu objetivo é guiar o usuário a usar ferramentas prontas e entregar prompts prontos para colar nessas ferramentas,",
    "não ensinar programação nem gerar HTML/CSS/JS bruto (a menos que o usuário peça explicitamente por código).",
    "Colete as respostas do escopo antes de indicar qualquer ferramenta.",
    "Não liste caminhos ou ferramentas enquanto ainda faltarem respostas.",
    "Quando todas as respostas forem recebidas, aí sim indique 1 solução principal (e no máximo 1 alternativa).",
    "Nas perguntas de escopo, sempre inclua 'link na bio' como opção explícita de objetivo.",
    "Priorize ferramentas com geradores por prompt e fluxo simples (ex.: Wix ADI, Durable, Carrd, Notion, Shopify/Storefronts).",
    "Não afirme botões ou passos específicos sem o usuário confirmar o que está vendo na tela.",
    "Se houver dúvida sobre a interface atual, peça que o usuário descreva os botões visíveis ou mande print,",
    "ou ofereça uma alternativa que funcione sem depender de um botão específico.",
    "Sempre ofereça 2-3 caminhos curtos: criar conta, iniciar projeto, colar o prompt.",
    "Faça perguntas rápidas quando faltar contexto (objetivo, público, estilo, conteúdo, prazo).",
    "Responda em PT-BR, de forma objetiva e prática."
  ].join(" ");
  const requestBody = {
    model,
    messages: hasSystem ? messages : [{ role: "system", content: systemPrompt }, ...messages],
    stream: true,
  };

  const streamHeaders = {
    ...corsHeaders,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };

  const encoder = new TextEncoder();
  const sendEvent = (controller: ReadableStreamDefaultController, payload: Record<string, unknown>) => {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    controller.enqueue(encoder.encode(data));
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok || !response.body) {
          const errorBody = await response.json().catch(() => ({}));
          sendEvent(controller, {
            type: "error",
            message: errorBody?.error?.message || "OpenAI request failed",
          });
          controller.close();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const lines = part.split("\n");
            const dataLines = lines
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.replace(/^data:\s?/, ""));
            if (dataLines.length === 0) continue;
            const data = dataLines.join("\n").trim();
            if (!data) continue;
            if (data === "[DONE]") {
              sendEvent(controller, { type: "done" });
              controller.close();
              return;
            }
            let parsed: Record<string, unknown> | null = null;
            try {
              parsed = JSON.parse(data) as Record<string, unknown>;
            } catch (_error) {
              continue;
            }
            const delta = (parsed?.choices as Array<Record<string, unknown>> | undefined)?.[0]
              ?.delta as { content?: string } | undefined;
            if (delta?.content) {
              sendEvent(controller, { type: "delta", content: delta.content });
            }
          }
        }

        sendEvent(controller, { type: "done" });
        controller.close();
      } catch (_error) {
        sendEvent(controller, { type: "error", message: "Failed to reach OpenAI" });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: streamHeaders });
});
