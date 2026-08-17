# Becca AI Integration Contract

Becca is deliberately **AI-optional**. Her deterministic capabilities remain
the source of truth for app data, navigation, and actions. An AI model is an
understanding upgrade: it helps map natural language to a capability when the
phrase matcher is not enough.

## Current flow

```text
User message
  → local entity resolution (bookings, provider, service, date, budget)
  → optional AI capability selection
  → deterministic matcher fallback
  → registered capability executes against real app data
  → structured reply + explicit actions
```

The AI is never in the execution path. It does not receive booking rows,
profile data, payment information, intake answers, or database credentials.

## What to implement

Implement `BeccaAIInterpreter` from
`src/services/becca/aiInterpreter.ts`, then register it once during app setup
with `configureBeccaAI()` from `src/services/becca/aiRuntime.ts`. BeccaScreen
will pick it up automatically for every new message.

The model receives only:

- the user's message;
- active hat (`client` or `provider`);
- the active hat's tool schema from `toToolSchema()`;
- names of locally resolved entity kinds, never their private values.

It must return only:

```ts
{ capabilityId: string | null, confidence?: number }
```

`capabilityId` must exactly match one tool name from the supplied schema.
Return `null` whenever the model is unsure.

## Non-negotiable safety rules

- Never let the model call Supabase, write SQL, or call app services.
- Never let it invent a provider, booking, appointment time, price, policy,
  health answer, or payment status.
- Never accept entities from the model. Entity resolution stays local and
  data-backed.
- Never expose client capability tools to the provider hat, or vice versa.
- Keep existing confirmation actions for every mutation.
- If the AI errors, times out, returns an unknown capability, or selects a
  capability whose required entity was not resolved, use the deterministic
  matcher automatically.

These checks are already enforced by `understandWithFallback()` in
`src/services/becca/engine.ts`.

## Minimal adapter shape

```ts
import type { BeccaAIInterpreter } from "./aiInterpreter";
import { configureBeccaAI } from "./aiRuntime";

export const interpreter: BeccaAIInterpreter = {
  async interpret(request) {
    // Send request.message + request.tools to the chosen model provider.
    // Instruct it to return exactly one tool/capability id or null.
    const output = await callModel(request);
    return {
      capabilityId: output.capabilityId ?? null,
      confidence: output.confidence,
    };
  },
};
```

Register it once in application setup:

```ts
configureBeccaAI(interpreter);
```

No interpreter means no behavioural regression: the deterministic matcher and
all existing reply/action fallbacks keep working exactly as they do today. An
interpreter that takes longer than 3.5 seconds also falls back automatically,
so a slow model can never leave the chat stuck on its waiting state.
