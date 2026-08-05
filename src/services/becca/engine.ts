// The engine: message in, answer out.
//
// Flow: resolve entities → understand (pick a capability) → check for
// ambiguity → run the capability → present the result.
//
// The confidence bands are load-bearing, not decoration:
//   high   → answer directly
//   medium → answer, but say the assumption out loud
//   low    → DON'T guess. Say she didn't catch it, offer ranked options.
//
// That last band is the whole point of building this before an LLM: Becca is
// honest about not understanding rather than confidently doing the wrong
// thing, and it's the exact seam a model later improves.

import type { ConfirmedBooking } from "../../types/booking";
import type {
  BeccaHat,
  CapabilityContext,
  CapabilityResult,
  ChatMessage,
  ChatSuggestion,
  EntityBag,
  PendingAction,
  PersonalContext,
  Understanding,
} from "./types";
import userLearningService from "../userLearningService";
import { resolveEntities } from "./entityResolver";
import { understand } from "./matcher";
import { capabilitiesFor, getCapability } from "./registry";
import { askChip, chip } from "./capabilities/shared";

export interface EngineInput {
  message: string;
  hat: BeccaHat;
  bookings: ConfirmedBooking[];
  userId?: string;
  /** Injected so date logic is deterministic and testable. */
  now?: Date;
}

/**
 * Writes awaiting confirmation, keyed by action id.
 *
 * Held in memory deliberately: a pending write must not survive an app
 * restart, and it expires as soon as it's used or superseded. The confirm
 * chip round-trips the id back through a normal message, so no extra
 * transport is needed between the screen and the engine.
 */
const pendingActions = new Map<
  string,
  { action: PendingAction; at: number; hat: BeccaHat; userId?: string }
>();

/**
 * A confirmation is only valid for the exchange it was offered in. Beyond
 * this the user has moved on, and running a write they asked about ten
 * minutes and six questions ago is not what they meant.
 */
const PENDING_ACTION_TTL_MS = 5 * 60 * 1000;

/**
 * Only one write is ever pending at a time. Offering a new one supersedes the
 * old, which is what the UI already implies — the previous confirm chips are
 * scrolled away and no longer the live question.
 */
function setPendingAction(
  action: PendingAction,
  hat: BeccaHat,
  userId?: string,
): void {
  pendingActions.clear();
  pendingActions.set(action.id, {
    action,
    at: Date.now(),
    hat,
    ...(userId ? { userId } : {}),
  });
}

/** Prefix that marks a message as a confirmation, not natural language. */
const CONFIRM_PREFIX = "__becca_confirm__:";

export function confirmToken(id: string): string {
  return `${CONFIRM_PREFIX}${id}`;
}

/** Backing out — of a pending write, or of the conversation generally. */
const DISMISSAL_RE =
  /^(never ?mind|nevermind|no thanks?|no ta|cancel that|forget it|leave it|not now|nothing|nah|no)\.?$/i;

export async function respond(input: EngineInput): Promise<ChatMessage> {
  const now = input.now ?? new Date();
  const { message, hat, bookings, userId } = input;

  // A confirmation short-circuits everything: it's not natural language and
  // must never be re-parsed as an intent.
  if (message.startsWith(CONFIRM_PREFIX)) {
    return runPendingAction(message.slice(CONFIRM_PREFIX.length), hat, userId);
  }

  // Declining a pending write is a real answer, not a failure to understand —
  // routing "never mind" into the "didn't catch that" fallback made backing
  // out of a confirmation feel like Becca had lost the thread.
  if (DISMISSAL_RE.test(message.trim())) {
    pendingActions.clear();
    return message_(
      { content: "No problem — left as it is." },
      hat,
    );
  }

  let entities: EntityBag = {};
  try {
    entities = await resolveEntities(message, bookings, now);
  } catch {
    // Entity resolution touches the network for providers. If it fails we
    // still want a useful reply from phrase matching alone, rather than an
    // error bubbling into the chat.
    entities = {};
  }

  // Carry forward what the last turn established. "What about Saturday?"
  // means nothing on its own — it only works because the previous turn was
  // about nails. Anything this message resolved for itself always wins.
  entities = carryForward(entities, conversation);

  // "the first one" / "that one" — resolve an ordinal against the list Becca
  // last showed, before intent matching, so the reference behaves like a
  // named provider rather than an unmatched phrase.
  const referenced = resolveOrdinalReference(message, conversation);
  if (referenced && !entities.provider) {
    entities = { ...entities, provider: referenced };
  }

  const understanding = understand(message, entities, hat);

  // Ambiguity outranks everything: if we don't know WHICH booking or provider
  // they meant, answering about the wrong one is worse than asking.
  const ambiguityReply = buildAmbiguityReply(entities, hat);
  if (ambiguityReply) return ambiguityReply;

  if (understanding.confidence === "low" || !understanding.capabilityId) {
    return buildFallback(understanding, hat);
  }

  const capability = getCapability(understanding.capabilityId, hat);
  if (!capability) return buildFallback(understanding, hat);

  // A required entity that never resolved means we can't run the capability
  // honestly — ask for the missing piece instead of running it half-blind.
  const missing = (capability.needs ?? []).find(
    (n) => n.required && entities[n.kind as keyof EntityBag] == null,
  );
  if (missing) return buildMissingEntityReply(missing.kind, hat);

  // Client hat only: a provider's own habits as a client say nothing useful
  // about their business questions. Resolved once here rather than per
  // capability — it reads AsyncStorage and several capabilities want it.
  const personal = hat === "client" ? await loadPersonalContext() : undefined;

  const ctx: CapabilityContext = {
    entities,
    hat,
    rawMessage: message,
    bookings,
    now,
    ...(userId ? { userId } : {}),
    ...(personal ? { personal } : {}),
  };

  let result: CapabilityResult;
  try {
    result = await capability.run(ctx);
  } catch {
    // Capabilities call databaseService, which throws on error by contract.
    // Becca degrades to an honest failure rather than inventing an answer.
    return message_(
      {
        content:
          "I couldn't pull that up just now — something went wrong on my end. Try again in a moment?",
      },
      hat,
    );
  }

  // A write awaiting confirmation replaces the normal follow-ups entirely:
  // the only two things to do next are confirm it or don't, and offering
  // unrelated chips alongside a pending write invites a mis-tap.
  if (result.pendingAction) {
    const action = result.pendingAction;
    setPendingAction(action, hat, userId);
    return message_({
      content: result.text,
      suggestions: [
        {
          id: `confirm-${action.id}`,
          text: action.confirmLabel,
          action: "message",
          data: { message: confirmToken(action.id) },
          display: "action",
        },
        {
          id: `cancel-${action.id}`,
          text: "Not now",
          action: "message",
          data: { message: "never mind" },
          display: "action",
        },
      ],
    }, hat, { exactSuggestions: true });
  }

  // Medium confidence: state the assumption rather than let it pass silently.
  const assumption =
    understanding.confidence === "medium"
      ? result.assumption ?? buildAssumption(entities)
      : undefined;

  // Every reply ends with somewhere to go next. Capabilities that supply
  // their own (more specific) suggestions keep them; the rest fall back to
  // these, so a conversation can never dead-end with no options — which is
  // what happened whenever a capability simply forgot to return any.
  const offered =
    result.suggestions && result.suggestions.length > 0
      ? result.suggestions
      : defaultFollowUps(hat);

  // Don't offer back the thing the user just asked for. Chips send their
  // `message` verbatim, so a chip whose message matches what was just sent
  // is literally "ask me that again" — which is what made Becca look like
  // she was repeating herself even after an option had been selected.
  const justAsked = message.trim().toLowerCase();
  const deduped = offered.filter(
    (s) => s.data?.message?.trim().toLowerCase() !== justAsked,
  );
  // If filtering removed everything (the capability's only suggestion was the
  // question just asked), fall back to the generic set rather than leaving
  // the reply with no way forward.
  const suggestions = deduped.length > 0 ? deduped : defaultFollowUps(hat);

  return message_(
    {
      content: assumption ? `${assumption}\n\n${result.text}` : result.text,
      suggestions,
      ...(result.providers ? { providerRecommendations: result.providers } : {}),
    },
    hat,
  );
}

/**
 * Generic "what now?" options, used when a capability didn't supply its own.
 * Hat-specific because a provider and a client have entirely different next
 * steps — offering a client "Today's bookings" would be meaningless.
 */
function defaultFollowUps(hat: BeccaHat) {
  if (hat === "provider") {
    return [
      chip("d-today", "Today's bookings", "What's on today?"),
      chip("d-clients", "My clients", "Show my clients"),
      chip("d-help", "What else can you do?", "What can you help with?"),
    ];
  }
  return [
    chip("d-bookings", "My bookings", "Show my bookings"),
    chip("d-find", "Find someone", "Show me all services"),
    chip("d-help", "What else can you do?", "What can you help with?"),
  ];
}

/**
 * Executes a confirmed write.
 *
 * The action is removed from the map before running, so a double-tap on the
 * confirm chip can't perform the same write twice.
 */
async function runPendingAction(
  id: string,
  hat: BeccaHat,
  userId?: string,
): Promise<ChatMessage> {
  const entry = pendingActions.get(id);
  // Deleted before the expiry check as well as before running: an expired
  // entry is dead either way, and leaving it would let a second tap retry it.
  pendingActions.delete(id);

  if (!entry) {
    return message_({
      content: "That's no longer waiting on me — it may already be done.",
    });
  }
  // A write must execute only for the same signed-in user, in the same hat,
  // that it was offered to. The engine is a module singleton shared across
  // both hats and surviving a sign-out/sign-in within the same JS process, so
  // without both checks a confirm token — which is a plain string a user can
  // type by hand, with a guessable `bookmark-<uuid>` shape — could trigger a
  // write that was offered to somebody else's session.
  if (entry.hat !== hat || entry.userId !== userId) {
    return message_({
      content: "That's no longer waiting on me — it may already be done.",
    });
  }
  if (Date.now() - entry.at > PENDING_ACTION_TTL_MS) {
    return message_({
      content: "That one's gone stale — ask me again and I'll set it up fresh.",
    });
  }

  try {
    const confirmation = await entry.action.run();
    return message_({ content: confirmation });
  } catch {
    return message_({
      content: "That didn't go through — something went wrong on my end. Try again?",
    });
  }
}

/**
 * Reads what Becca has learned about this user.
 *
 * Never throws: personalisation is an enhancement, and a failed AsyncStorage
 * read must degrade to "no personalisation" rather than breaking the reply.
 * The three reads are independent, so they run together.
 */
async function loadPersonalContext(): Promise<PersonalContext | undefined> {
  try {
    const [topCategory, favouriteServices, tagContext, insights] =
      await Promise.all([
        userLearningService.getTopServiceCategory(),
        userLearningService.getFavoriteServices(3),
        userLearningService.getPersonalisedTagContext(),
        userLearningService.getUserInsights(),
      ]);

    // userLearningService doesn't expose its raw interaction counter, so
    // confidence is derived from how many distinct signals actually resolved.
    // A user Becca genuinely knows has several; a brand-new one has none —
    // which is the only distinction `hasUsefulHistory` needs to make.
    const signals =
      (topCategory ? 1 : 0) +
      favouriteServices.length +
      tagContext.topStyleTags.length +
      insights.topProviders.length +
      insights.totalBookings;

    return {
      ...(topCategory ? { topCategory } : {}),
      favouriteServices,
      styleTags: tagContext.topStyleTags,
      interactionCount: signals,
    };
  } catch {
    return undefined;
  }
}

// ==================== REPLY BUILDERS ====================

/** "Which one did you mean?" — one question per ambiguous reference. */
function buildAmbiguityReply(
  entities: EntityBag,
  hat: BeccaHat,
): ChatMessage | null {
  const amb = entities.ambiguous?.[0];
  if (!amb) return null;

  const noun = amb.kind === "booking" ? "booking" : "provider";
  return message_(
    {
      content: `I found a few matches — which ${noun} did you mean?`,
      suggestions: [
        ...amb.candidates.map((c, i) => chip(`amb-${i}`, c.label, c.label)),
        // Escape hatch: if none of the matches is right, the user would
        // otherwise be stuck choosing between wrong answers.
        askChip("amb-none", "None of these", "What can you help with?"),
      ],
    },
    hat,
  );
}

/**
 * The honest fallback.
 *
 * Never invents an answer and never silently picks the closest match. Says
 * plainly that she didn't catch it, then offers the best-scoring rival
 * interpretations — falling back to the hat's most useful starting points
 * when nothing scored at all.
 */
function buildFallback(u: Understanding, hat: BeccaHat): ChatMessage {
  const all = capabilitiesFor(hat);

  const ranked = u.alternatives.length > 0 || u.capabilityId
    ? [
        ...(u.capabilityId ? [{ capabilityId: u.capabilityId, score: u.score }] : []),
        ...u.alternatives,
      ]
    : [];

  const options = ranked
    .map((r) => all.find((c) => c.id === r.capabilityId))
    .filter((c): c is NonNullable<typeof c> => c != null)
    .slice(0, 3);

  if (options.length === 0) {
    return message_({
      content:
        "I didn't quite catch that. Here's what I can help with:",
      suggestions: defaultStarters(hat),
    });
  }

  return message_({
    content: "I'm not sure I follow — did you mean one of these?",
    suggestions: [
      ...options.map((c, i) => askChip(`alt-${i}`, c.describe, c.describe)),
      askChip("help", "Something else", "What can you do?"),
    ],
  });
}

function buildMissingEntityReply(kind: string, hat: BeccaHat): ChatMessage {
  if (kind === "service") {
    return message_({
      content: "What are you after?",
      suggestions: [
        chip("nails", "Nails", "Find nails"),
        chip("hair", "Hair", "Find hair"),
        chip("lashes", "Lashes", "Find lashes"),
        chip("brows", "Brows", "Find brows"),
        chip("mua", "Makeup", "Find makeup"),
        chip("aesthetics", "Aesthetics", "Find aesthetics"),
      ],
    });
  }
  if (kind === "provider") {
    return message_({
      content: "Which provider did you mean?",
      suggestions: [askChip("saved", "My saved providers", "Show my saved providers")],
    });
  }
  return message_({
    content: "I didn't quite catch that — can you give me a bit more?",
    suggestions: defaultStarters(hat),
  });
}

/** Names the assumption Becca acted on, so a medium-confidence answer is never silent. */
function buildAssumption(entities: EntityBag): string | undefined {
  const parts: string[] = [];
  if (entities.booking) parts.push(entities.booking.label);
  else if (entities.provider) parts.push(entities.provider.label);
  if (entities.service && !entities.booking) parts.push(entities.service.label);
  if (entities.date) parts.push(entities.date.value.label);
  if (parts.length === 0) return undefined;
  return `Assuming you meant ${parts.join(", ")} —`;
}

function defaultStarters(hat: BeccaHat) {
  return hat === "provider"
    ? [
        askChip("today", "What's on today?", "What's on today?"),
        askChip("week", "How's my week?", "How busy am I this week?"),
        askChip("help", "What can you do?", "What can you do?"),
      ]
    : [
        askChip("next", "My next appointment", "When's my next appointment?"),
        askChip("find", "Find someone", "Show me all services"),
        askChip("help", "What can you do?", "What can you do?"),
      ];
}

/**
 * Builds the ChatMessage envelope. Ids are unique per message, never
 * Date.now() alone.
 *
 * Also the single guarantee that EVERY reply carries quick actions. Enforcing
 * it here rather than at each call site is deliberate: suggestions were being
 * added per-return and kept getting missed — the error path and the ambiguity
 * reply both shipped with no options at all, leaving the user staring at a
 * message with nothing to tap. Since every reply is built through this
 * function, a dead end is now structurally impossible rather than something
 * each new capability has to remember.
 *
 * A single option is treated as barely better than none — "Browse everything"
 * on its own is a dead end wearing a button. So the capability's own
 * suggestions are topped up from the generic starters until there are at
 * least MIN_SUGGESTIONS, skipping any whose message duplicates one already
 * offered.
 */
const MIN_SUGGESTIONS = 3;

function message_(
  parts: Omit<ChatMessage, "id" | "role" | "timestamp">,
  hat: BeccaHat = "client",
  // Confirmation prompts opt out of padding: the only valid next steps are
  // confirm or don't, and an unrelated third chip beside a pending WRITE is
  // an invitation to mis-tap.
  options?: { exactSuggestions?: boolean },
): ChatMessage {
  const own = parts.suggestions ?? [];
  const suggestions =
    options?.exactSuggestions || own.length >= MIN_SUGGESTIONS
      ? own
      : topUp(own, hat);
  return {
    id: `becca-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role: "assistant",
    timestamp: new Date(),
    ...parts,
    suggestions,
  };
}

/**
 * Pads a short suggestion list out to MIN_SUGGESTIONS using the generic
 * starters, preserving the capability's own (more specific) options first so
 * the most relevant action stays the most prominent. De-duplicates on the
 * chip's `message`, since that — not the label — is what actually gets sent;
 * two chips worded differently but sending the same thing would look like a
 * choice and behave like a repeat.
 */
function topUp(own: ChatSuggestion[], hat: BeccaHat): ChatSuggestion[] {
  const seen = new Set(
    own.map((s) => s.data?.message?.trim().toLowerCase()).filter(Boolean),
  );
  const result = [...own];
  for (const candidate of defaultStarters(hat)) {
    if (result.length >= MIN_SUGGESTIONS) break;
    const key = candidate.data?.message?.trim().toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(candidate);
  }
  return result;
}
