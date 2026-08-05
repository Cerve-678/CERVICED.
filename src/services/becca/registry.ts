// The capability registry.
//
// One declarative list of everything Becca can do. This is deliberately data
// rather than control flow, for two reasons:
//
//  1. "What can Becca do?" has an answer you can read, instead of being
//     implicit in a 900-line if/else chain.
//  2. It IS the LLM's tool schema. `toToolSchema()` below emits it directly,
//     so wiring a model in means swapping the parser — not rewriting the
//     assistant. See BECCA_CAPABILITIES.md §3.1.

import type { BeccaHat, Capability } from "./types";
import { CLIENT_CAPABILITIES } from "./capabilities/client";
import { PROVIDER_CAPABILITIES } from "./capabilities/provider";

const ALL: Capability[] = [...CLIENT_CAPABILITIES, ...PROVIDER_CAPABILITIES];

// Ids must be unique — a duplicate would make lookup order-dependent and
// silently shadow one capability with another. Cheap to assert at module load.
const seen = new Set<string>();
for (const c of ALL) {
  if (seen.has(c.id)) {
    throw new Error(`Duplicate Becca capability id: ${c.id}`);
  }
  seen.add(c.id);
}

/** Capabilities available to a given hat. A provider can never reach a client capability. */
export function capabilitiesFor(hat: BeccaHat): Capability[] {
  return ALL.filter((c) => c.hat === hat);
}

export function getCapability(id: string, hat: BeccaHat): Capability | undefined {
  return ALL.find((c) => c.id === id && c.hat === hat);
}

/**
 * The registry as an LLM tool schema.
 *
 * Not called by the deterministic path — it exists so the eventual model
 * integration has a single, always-current source for what Becca can do,
 * rather than a hand-maintained prompt that drifts from the code.
 */
export function toToolSchema(hat: BeccaHat): Array<{
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}> {
  return capabilitiesFor(hat).map((c) => {
    const properties: Record<string, { type: string; description: string }> = {};
    const required: string[] = [];

    for (const need of c.needs ?? []) {
      properties[need.kind] = {
        type: "string",
        description: ENTITY_DESCRIPTIONS[need.kind] ?? need.kind,
      };
      if (need.required) required.push(need.kind);
    }

    return {
      name: c.id,
      description: c.describe,
      input_schema: { type: "object" as const, properties, required },
    };
  });
}

const ENTITY_DESCRIPTIONS: Record<string, string> = {
  provider: "A provider's name, or 'my usual'.",
  booking: "Which booking the user means, e.g. 'my nail appointment'.",
  service: "Service category or specific service, e.g. 'gel manicure'.",
  date: "A day or range, e.g. 'tomorrow', 'this weekend'.",
  money: "A budget, in GBP, e.g. 'under £50'.",
  timeOfDay: "morning, afternoon or evening.",
};

export { ALL as ALL_CAPABILITIES };
