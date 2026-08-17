// Optional AI-routing contract for Becca.
//
// An AI model may improve how Becca understands natural language, but it is
// never allowed to read the database, generate a query, invent an entity, or
// perform a mutation. It only selects one capability from the exact tool list
// already registered for the active hat. The engine validates that selection
// and runs the same deterministic capability code as the regex fallback.

import type { BeccaHat } from "./types";

export interface BeccaAITool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface BeccaAIInterpretationRequest {
  /** The user's message only — no bookings, profile data, or private records. */
  message: string;
  hat: BeccaHat;
  /** The capabilities the active hat is permitted to use. */
  tools: BeccaAITool[];
  /** Facts resolved locally from real app data; the model must not create more. */
  resolvedEntityKinds: string[];
}

export interface BeccaAIInterpretation {
  /** A capability id from `tools`, or null when the model is unsure. */
  capabilityId: string | null;
  /** Optional 0–1 routing confidence. Missing values are treated as medium. */
  confidence?: number;
}

/**
 * Implement this at the app boundary when an AI provider is introduced.
 *
 * Returning null, an invalid id, or throwing is deliberately safe: Becca
 * immediately falls back to the deterministic matcher. This makes AI an
 * enhancement, not a dependency for core app actions.
 */
export interface BeccaAIInterpreter {
  interpret(request: BeccaAIInterpretationRequest): Promise<BeccaAIInterpretation | null>;
}
