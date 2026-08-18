// Mobile-side adapter for the secure `becca-ai` Edge Function.
// The NVIDIA key never enters this bundle. See BECCA_AI_INTEGRATION.md.
import { supabase } from "../../lib/supabase";
import type {
  BeccaAIComposition,
  BeccaAICompositionRequest,
  BeccaAIInterpretation,
  BeccaAIInterpretationRequest,
  BeccaAIInterpreter,
} from "./aiInterpreter";

function validInterpretation(data: unknown): BeccaAIInterpretation | null {
  if (!data || typeof data !== "object") return null;
  const value = data as { capabilityId?: unknown; confidence?: unknown };
  if (value.capabilityId !== null && typeof value.capabilityId !== "string") return null;
  return {
    capabilityId: value.capabilityId ?? null,
    ...(typeof value.confidence === "number" ? { confidence: value.confidence } : {}),
  };
}

function validComposition(data: unknown): BeccaAIComposition | null {
  if (!data || typeof data !== "object") return null;
  const value = data as { content?: unknown; leadIn?: unknown };
  return {
    ...(typeof value.content === "string" ? { content: value.content } : {}),
    ...(typeof value.leadIn === "string" ? { leadIn: value.leadIn } : {}),
  };
}

export const nvidiaBeccaInterpreter: BeccaAIInterpreter = {
  async interpret(request: BeccaAIInterpretationRequest): Promise<BeccaAIInterpretation | null> {
    try {
      const { data, error } = await supabase.functions.invoke("becca-ai", {
        body: {
          message: request.message,
          hat: request.hat,
          tools: request.tools,
          resolvedEntityKinds: request.resolvedEntityKinds,
        },
      });
      return error ? null : validInterpretation(data);
    } catch {
      return null;
    }
  },

  // Presentation only. The engine re-checks every figure in what comes back
  // against the deterministic answer (verifyComposition) and throws the whole
  // rewrite away on any mismatch, so a bad response costs formatting rather
  // than correctness.
  async compose(request: BeccaAICompositionRequest): Promise<BeccaAIComposition | null> {
    try {
      const { data, error } = await supabase.functions.invoke("becca-ai", {
        body: {
          mode: "compose",
          message: request.message,
          hat: request.hat,
          capabilityId: request.capabilityId,
          factualContent: request.factualContent,
        },
      });
      return error ? null : validComposition(data);
    } catch {
      return null;
    }
  },
};
