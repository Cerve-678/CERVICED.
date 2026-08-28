// Runtime registration for Becca's optional AI interpreter.
//
// Keeping registration here means the chat screen never needs to know which
// model provider is in use. With no registration (the current state), Becca
// behaves deterministically exactly as before.

import type { BeccaAIInterpreter } from "./aiInterpreter";

let interpreter: BeccaAIInterpreter | undefined;

/** Register the app's AI routing adapter during application setup. */
export function configureBeccaAI(next: BeccaAIInterpreter | undefined): void {
  interpreter = next;
}

/** Used by BeccaScreen when a message is sent. */
export function getBeccaAIInterpreter(): BeccaAIInterpreter | undefined {
  return interpreter;
}
