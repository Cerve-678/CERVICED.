// Secure NVIDIA endpoint for Becca. Two narrow modes, never more.
//
// ROUTE (default): the model selects one of Becca's already-registered
// capability IDs. It never receives booking rows, profile data or payments.
//
// COMPOSE: the model rewrites the PRESENTATION of an answer the app has
// already built from verified data. It may restructure freely — headings,
// bullets, bold, tone — but every figure it emits is re-verified against the
// source by the app (verifyComposition in engine.ts) and the whole rewrite is
// discarded on any mismatch. So the model owns how an answer reads, never
// what it claims. In both modes the deterministic capability is what actually
// reads the database and builds the actions.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const MAX_MESSAGE_LENGTH = 1_000;
const MAX_TOOLS = 100;
// A deterministic answer is short by construction; anything far larger is not
// something this endpoint should be paying to reformat.
const MAX_COMPOSE_LENGTH = 4_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ClientTool = {
  name: string;
  description: string;
  input_schema?: unknown;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseModelJson(content: unknown): { capabilityId: string | null; confidence?: number } | null {
  if (typeof content !== "string") return null;
  const candidate = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(candidate) as { capabilityId?: unknown; confidence?: unknown };
    if (parsed.capabilityId !== null && typeof parsed.capabilityId !== "string") return null;
    return {
      capabilityId: parsed.capabilityId ?? null,
      ...(typeof parsed.confidence === "number" ? { confidence: parsed.confidence } : {}),
    };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const apiKey = Deno.env.get("NVIDIA_API_KEY");
  if (!apiKey) return json({ error: "Becca AI is not configured." }, 503);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "You must be signed in." }, 401);

  // Keep the caller authenticated even though the model has no database
  // access. Otherwise this endpoint becomes an anonymous proxy to the model.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "You must be signed in." }, 401);

  try {
    const body = await req.json();

    // ---- COMPOSE MODE ----------------------------------------------------
    if (body?.mode === "compose") {
      const factual = typeof body?.factualContent === "string" ? body.factualContent : "";
      const userMessage = typeof body?.message === "string" ? body.message.trim() : "";
      if (!factual || factual.length > MAX_COMPOSE_LENGTH || !userMessage) {
        return json({ error: "Invalid Becca compose request." }, 400);
      }

      const composeSystem = [
        "You rewrite one answer from a beauty-booking assistant so it reads well.",
        "",
        "ABSOLUTE RULE: every number, price, date, time and name in your rewrite",
        "must already appear in the source answer. Never introduce, adjust,",
        "round, total or infer a figure. If the source says GBP 40, you write",
        "GBP 40. Omitting detail is fine; inventing it is not. A rewrite that",
        "adds a figure is discarded entirely.",
        "",
        "Within that rule, own the presentation:",
        "- Use a short '## Heading' when the answer has a clear subject.",
        "- Use '- ' bullets for lists; keep them scannable, not paragraphs.",
        "- Use **bold** on the things the eye should land on first — names,",
        "  prices, dates — not on whole sentences.",
        "- Vary the opening. Do not start every answer the same way.",
        "- Warm, direct, British English. No filler, no restating the question,",
        "  no sign-off, no offering things the source did not mention.",
        "",
        "Return JSON only: {\"content\": \"<the rewritten answer>\"}.",
      ].join("\n");

      const composeResponse = await fetch(NVIDIA_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages: [
            { role: "system", content: composeSystem },
            { role: "user", content: `They asked: ${userMessage}\n\nSource answer:\n${factual}` },
          ],
          // Nemotron 3 Super's hosted endpoint documents temperature 1 with
          // top_p 0.95 for every mode. `reasoning_effort: "none"` is the
          // current public API field for disabling reasoning; the older
          // chat_template_kwargs payload was returning HTTP 400.
          temperature: 1,
          top_p: 0.95,
          max_tokens: 700,
          reasoning_effort: "none",
          stream: false,
        }),
      });
      if (!composeResponse.ok) {
        // Status-only diagnostics distinguish credentials, quota and
        // request-shape failures without recording prompts or factual data.
        console.error("[becca-ai] NVIDIA request failed", {
          mode: "compose",
          status: composeResponse.status,
          statusText: composeResponse.statusText,
        });
        return json({ error: "Becca AI is temporarily unavailable." }, 502);
      }

      const composePayload = await composeResponse.json();
      const raw = composePayload?.choices?.[0]?.message?.content;
      if (typeof raw !== "string") return json({});
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      try {
        const parsed = JSON.parse(cleaned) as { content?: unknown };
        return json(typeof parsed.content === "string" ? { content: parsed.content } : {});
      } catch {
        // The model answered in prose rather than JSON. That is still a usable
        // rewrite, and the app verifies it either way.
        return json({ content: cleaned });
      }
    }

    // ---- ROUTE MODE ------------------------------------------------------
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const hat = body?.hat === "provider" ? "provider" : body?.hat === "client" ? "client" : null;
    const tools = Array.isArray(body?.tools) ? body.tools as ClientTool[] : [];
    const resolvedEntityKinds = Array.isArray(body?.resolvedEntityKinds)
      ? body.resolvedEntityKinds.filter((value: unknown) => typeof value === "string").slice(0, 8)
      : [];

    if (!message || message.length > MAX_MESSAGE_LENGTH || !hat || tools.length === 0 || tools.length > MAX_TOOLS) {
      return json({ error: "Invalid Becca AI request." }, 400);
    }
    if (tools.some((tool) =>
      !tool || typeof tool.name !== "string" || !/^[a-z0-9._-]{1,80}$/i.test(tool.name) ||
      typeof tool.description !== "string" || tool.description.length > 300,
    )) return json({ error: "Invalid Becca AI tools." }, 400);

    const allowed = tools.map((tool) => ({ name: tool.name, description: tool.description }));
    const system = [
      "You route a beauty-booking assistant request to one approved capability.",
      "Return JSON only, with exactly capabilityId (an approved name or null) and confidence (0 to 1).",
      "Never answer the user, invent an action, infer missing facts, or return a capability outside the list.",
      `Active hat: ${hat}.`,
      `Locally resolved entity kinds: ${resolvedEntityKinds.join(", ") || "none"}.`,
      `Approved capabilities: ${JSON.stringify(allowed)}.`,
    ].join("\n");

    const nvidiaResponse = await fetch(NVIDIA_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: message },
        ],
        // Becca needs quick routing, not an exposed reasoning trace.
        temperature: 1,
        top_p: 0.95,
        max_tokens: 120,
        reasoning_effort: "none",
        stream: false,
      }),
    });
    if (!nvidiaResponse.ok) {
      // Status only — never log the user's message or tool payload.
      console.error("[becca-ai] NVIDIA request failed", {
        mode: "route",
        status: nvidiaResponse.status,
        statusText: nvidiaResponse.statusText,
      });
      return json({ error: "Becca AI is temporarily unavailable." }, 502);
    }

    const payload = await nvidiaResponse.json();
    const result = parseModelJson(payload?.choices?.[0]?.message?.content);
    if (!result || (result.capabilityId !== null && !allowed.some((tool) => tool.name === result.capabilityId))) {
      return json({ capabilityId: null });
    }
    return json(result);
  } catch {
    // The app's interpreter deliberately converts any failure to null, so its
    // deterministic matcher answers normally instead of surfacing this error.
    return json({ error: "Becca AI is temporarily unavailable." }, 502);
  }
});
