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
  ConversationContext,
  EntityBag,
  PendingAction,
  PersonalContext,
  Understanding,
} from "./types";
import { scoreToConfidence } from "./types";
import userLearningService from "../userLearningService";
import { resolveEntities } from "./entityResolver";
import { understand } from "./matcher";
import { capabilitiesFor, getCapability, toToolSchema } from "./registry";
import { askChip, chip } from "./capabilities/shared";
import type { BeccaAIInterpreter } from "./aiInterpreter";
import { isBeccaNavigationSuggestion } from "./navigationContract";

export interface EngineInput {
  message: string;
  hat: BeccaHat;
  bookings: ConfirmedBooking[];
  userId?: string;
  /** Injected so date logic is deterministic and testable. */
  now?: Date;
  /**
   * What the previous turn established. Pass back what the last `respond()`
   * returned as `context` — the engine is otherwise stateless, so without
   * this every follow-up ("what about Saturday?") arrives with no idea what
   * came before.
   */
  conversation?: ConversationContext;
  /**
   * Optional future AI router. It can select a registered capability only;
   * the deterministic matcher remains the fallback when it is absent, unsure
   * or invalid. See aiInterpreter.ts for the safety boundary.
   */
  interpreter?: BeccaAIInterpreter;
}

/**
 * A reply, plus the context to feed into the next turn.
 *
 * Returned rather than held in a module singleton: the screen owns the
 * conversation, and history-loading/new-chat have to be able to reset it.
 */
export interface EngineReply {
  message: ChatMessage;
  context: ConversationContext;
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

/** An AI routing enhancement must never leave a chat message waiting forever. */
const AI_INTERPRETER_TIMEOUT_MS = 3_500;

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

/**
 * Reuses last turn's entities for anything this message didn't resolve.
 *
 * Only fills gaps — a value the current message resolved always wins, so
 * "what about hair instead?" switches service rather than stubbornly keeping
 * nails. Bookings are deliberately NOT carried: they're specific enough that
 * a stale one silently answering a new question is worse than asking.
 */
function carryForward(
  current: EntityBag,
  prior: ConversationContext | undefined,
  hat: BeccaHat,
): EntityBag {
  if (!prior) return current;
  const p = prior.entities;
  // Provider hat carries nothing. Its capabilities are all about the
  // provider's OWN business ("what's on today", "my clients") and none take
  // a service/provider/money entity — carrying one only produces a spurious
  // "Assuming you meant nails, today —" on an answer that never used it.
  if (hat === "provider") return current;
  return {
    ...current,
    ...(current.service ? {} : p.service ? { service: p.service } : {}),
    ...(current.provider ? {} : p.provider ? { provider: p.provider } : {}),
    ...(current.money ? {} : p.money ? { money: p.money } : {}),
    // Date is NOT carried: "what about Saturday?" is precisely a request to
    // CHANGE the date, and a sticky one would make every later question
    // silently about the first day mentioned.
  };
}

/** A pronoun standing in for the provider under discussion. */
const PRONOUN_RE = /\b(they|them|their|theirs|she|her|hers|he|him|his|it)\b/i;

/** "the first one", "that one", "the second", "number 2". */
const ORDINALS: Record<string, number> = {
  first: 0, "1st": 0, one: 0,
  second: 1, "2nd": 1, two: 1,
  third: 2, "3rd": 2, three: 2,
  fourth: 3, "4th": 3, four: 3,
  fifth: 4, "5th": 4, five: 4,
  last: -1,
};

/**
 * Resolves "the first one" against the providers Becca last showed.
 *
 * Without this, every reference to a result Becca just displayed matched
 * nothing — the single most jarring break in a real conversation, because
 * the user is pointing at something visibly on screen.
 */
function resolveOrdinalReference(
  message: string,
  prior: ConversationContext | undefined,
): EntityBag["provider"] | undefined {
  const list = prior?.lastProviders;
  if (!list || list.length === 0) return undefined;

  const lower = message.toLowerCase();
  // Must look like a reference to a listed item, not a bare number in some
  // unrelated sentence ("under 50").
  if (!/\b(that|this|the|number|option|no\.?)\s*\w*\b|\bone\b/.test(lower)) {
    return undefined;
  }

  let index: number | undefined;
  for (const [word, i] of Object.entries(ORDINALS)) {
    if (new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`, "i").test(lower)) {
      index = i;
      break;
    }
  }
  // "number 2" / "option 3"
  const numbered = lower.match(/\b(?:number|option|no\.?)\s*(\d+)\b/);
  if (numbered?.[1]) index = parseInt(numbered[1], 10) - 1;

  // A bare "that one" with a single result is unambiguous.
  if (index === undefined && /\b(that|this)\s+one\b/.test(lower) && list.length === 1) {
    index = 0;
  }
  if (index === undefined) return undefined;

  const target = index === -1 ? list[list.length - 1] : list[index];
  if (!target) return undefined;

  return {
    kind: "provider",
    value: {
      slug: target.slug,
      ...(target.dbId ? { dbId: target.dbId } : {}),
      displayName: target.displayName,
    },
    confidence: 0.85,
    sourceText: message,
    label: target.displayName,
  };
}

/**
 * The conversational entry point: replies AND returns the context to pass
 * into the next turn. Prefer this over `respond()` — a caller that drops the
 * context gets an assistant that can't follow a conversation.
 */
export async function converse(input: EngineInput): Promise<EngineReply> {
  const reply = await respond(input);
  return { message: reply, context: lastContext };
}

/**
 * Context produced by the most recent `respond()` call.
 *
 * `respond` has many early returns (confirmations, dismissals, ambiguity,
 * fallbacks) and threading a return-tuple through all of them would obscure
 * the actual logic. This is written once per call and read immediately by
 * `converse`, which is the only supported way to read it.
 */
let lastContext: ConversationContext = { entities: {} };

export async function respond(input: EngineInput): Promise<ChatMessage> {
  const now = input.now ?? new Date();
  const { message, hat, bookings, userId, conversation } = input;

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

  // A short social turn should feel like a conversation, not an intent that
  // failed to parse. Keep this deliberately narrow: "hi, can you find nails?"
  // is a real request and must continue through the capability matcher.
  const socialReply = buildSocialReply(message, hat);
  if (socialReply) return socialReply;

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
  // Snapshot before merging prior context: the difference is exactly what was
  // carried, which is the only thing worth calling an assumption.
  const fromMessage = entities;
  entities = carryForward(entities, conversation, hat);

  // Seed the outgoing context from what we know NOW. Every early return below
  // (ambiguity, low confidence, a capability that threw) then still hands the
  // next turn the topic and the last shown list — losing them on a fallback
  // is what would make one unclear message reset the whole conversation.
  lastContext = {
    entities,
    ...(conversation?.lastCapabilityId
      ? { lastCapabilityId: conversation.lastCapabilityId }
      : {}),
    ...(conversation?.lastProviders
      ? { lastProviders: conversation.lastProviders }
      : {}),
  };

  // "the first one" / "that one" — resolve an ordinal against the list Becca
  // last showed, before intent matching, so the reference behaves like a
  // named provider rather than an unmatched phrase.
  const referenced = resolveOrdinalReference(message, conversation);
  if (referenced && !entities.provider) {
    entities = { ...entities, provider: referenced };
  }

  // "are THEY any good?", "how do i contact THEM?" — a pronoun standing in
  // for the single provider just discussed. Only when exactly one was shown:
  // with several, "they" is genuinely ambiguous and the capability's own
  // missing-entity prompt is the better answer.
  if (!entities.provider && PRONOUN_RE.test(message)) {
    const shown = conversation?.lastProviders ?? [];
    // Several shown: "they" is genuinely ambiguous. Ask which, rather than
    // silently answering about one of them — the same rule as everywhere
    // else in this engine. Without this the message falls through to a
    // capability that doesn't need a provider and answers the wrong question.
    if (shown.length > 1) {
      entities = {
        ...entities,
        ambiguous: [
          ...(entities.ambiguous ?? []),
          {
            kind: "provider",
            sourceText: message,
            candidates: shown.slice(0, 4).map((sp) => ({
              kind: "provider" as const,
              value: {
                slug: sp.slug,
                ...(sp.dbId ? { dbId: sp.dbId } : {}),
                displayName: sp.displayName,
              },
              confidence: 0.5,
              sourceText: message,
              label: sp.displayName,
            })),
          },
        ],
      };
    }
    const only = shown;
    if (only.length === 1 && only[0]) {
      entities = {
        ...entities,
        provider: {
          kind: "provider",
          value: {
            slug: only[0].slug,
            ...(only[0].dbId ? { dbId: only[0].dbId } : {}),
            displayName: only[0].displayName,
          },
          confidence: 0.8,
          sourceText: message,
          label: only[0].displayName,
        },
      };
    }
  }

  const understanding = await understandWithFallback(
    message,
    entities,
    hat,
    input.interpreter,
  );

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
      { title: "Unable to load that" },
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
    }, hat, { exactSuggestions: true, title: capability.describe });
  }

  // Medium confidence: state the assumption rather than let it pass silently.
  const assumption =
    understanding.confidence === "medium"
      ? result.assumption ?? buildAssumption(entities, result.text, fromMessage)
      : undefined;

  // Every reply ends with somewhere to go next. Capabilities that supply
  // their own (more specific) suggestions keep them; the rest fall back to
  // these, so a conversation can never dead-end with no options — which is
  // what happened whenever a capability simply forgot to return any.
  const offered =
    result.suggestions && result.suggestions.length > 0
      ? result.suggestions
      : defaultFollowUps(hat);

  // A capability must never produce a dead button. The shared contract is
  // also covered by tests, but filtering here keeps a malformed future
  // capability from reaching a user while development is in progress.
  const routable = offered.filter((suggestion) =>
    isBeccaNavigationSuggestion(hat, suggestion),
  );

  // Don't offer back the thing the user just asked for. Chips send their
  // `message` verbatim, so a chip whose message matches what was just sent
  // is literally "ask me that again" — which is what made Becca look like
  // she was repeating herself even after an option had been selected.
  const justAsked = message.trim().toLowerCase();
  const deduped = routable.filter(
    (s) => s.data?.message?.trim().toLowerCase() !== justAsked,
  );
  // If filtering removed everything (the capability's only suggestion was the
  // question just asked), fall back to the generic set rather than leaving
  // the reply with no way forward.
  const suggestions = deduped.length > 0 ? deduped : defaultFollowUps(hat);

  // Provider.id IS the slug (see providerFromDb); the card shape carries no
  // UUID. Capabilities that need one re-resolve it from the display name, so
  // a pronoun/ordinal reference still works for them.
  const shownProviders =
    result.providers && result.providers.length > 0
      ? result.providers.map((p) => ({ slug: p.id, displayName: p.name }))
      : (conversation?.lastProviders ?? []);

  // Hand the next turn everything it needs to resolve a follow-up: what was
  // being discussed, what was answered, and what was shown (so "the first
  // one" points at a real provider).
  lastContext = {
    entities,
    lastCapabilityId: capability.id,
    // A turn that shows no providers must NOT erase the list the user is
    // still looking at: "find nails" -> "any free Saturday?" -> "none" ->
    // "the first one" still refers to what's on screen. Only a turn showing
    // a NEW list replaces it.
    ...(shownProviders.length > 0 ? { lastProviders: shownProviders } : {}),
  };

  return message_(
    {
      content: assumption ? `${assumption}\n\n${result.text}` : result.text,
      suggestions,
      ...(result.providers ? { providerRecommendations: result.providers } : {}),
    },
    hat,
    { title: capability.describe },
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
 * Gives a future model one narrow job: choose an already-registered tool.
 *
 * Entity resolution happens first and capability execution happens after this
 * point, both locally. An unavailable or malformed model result therefore
 * cannot block Becca or grant a client/provider access to the other hat.
 */
async function understandWithFallback(
  message: string,
  entities: EntityBag,
  hat: BeccaHat,
  interpreter?: BeccaAIInterpreter,
): Promise<Understanding> {
  const fallback = understand(message, entities, hat);
  if (!interpreter) return fallback;

  try {
    const result = await interpretWithTimeout(interpreter, {
      message,
      hat,
      tools: toToolSchema(hat),
      resolvedEntityKinds: Object.entries(entities)
        .filter(([key, value]) => key !== "ambiguous" && value != null)
        .map(([key]) => key),
    });
    const selected = result?.capabilityId
      ? getCapability(result.capabilityId, hat)
      : undefined;
    if (!result?.capabilityId || !selected) {
      return fallback;
    }
    // A model cannot claim a missing required entity is present. If it picks
    // a capability that local resolution cannot support, trust the existing
    // deterministic ranking instead of steering the user to a dead end.
    if (selected.needs?.some(
      (need) => need.required && entities[need.kind as keyof EntityBag] == null,
    )) return fallback;

    // Clamp rather than trust a provider's schema adherence. A missing model
    // confidence is intentionally medium: the engine will name any carried
    // context assumption instead of silently pretending certainty.
    const score = Number.isFinite(result.confidence)
      ? Math.max(0, Math.min(1, result.confidence!))
      : 0.35;
    return {
      ...fallback,
      capabilityId: selected.id,
      confidence: scoreToConfidence(score),
      score,
      alternatives: fallback.alternatives.filter(
        (alternative) => alternative.capabilityId !== selected.id,
      ),
    };
  } catch {
    return fallback;
  }
}

/** Resolves null on timeout so the deterministic matcher can respond immediately. */
async function interpretWithTimeout(
  interpreter: BeccaAIInterpreter,
  request: Parameters<BeccaAIInterpreter["interpret"]>[0],
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      interpreter.interpret(request),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), AI_INTERPRETER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Handles complete, non-task social turns before intent matching.
 *
 * The registry's help capability intentionally recognises "hi" as a useful
 * first touch, but its full feature list is an awkward answer to a simple
 * greeting. Likewise, a "thanks" used to land in the generic uncertainty
 * fallback. These are response-quality cases, not capabilities: no data is
 * read and no app action is implied.
 */
function buildSocialReply(message: string, hat: BeccaHat): ChatMessage | null {
  const plain = message
    .trim()
    .toLowerCase()
    .replace(/[!?.]+$/g, "")
    .replace(/\s+/g, " ");

  if (/^(?:hi|hello|hey|hiya|morning|good morning|afternoon|good afternoon|evening|good evening|becca)$/.test(plain)) {
    return message_(
      {
        content:
          hat === "provider"
            ? "Hi — I’m here to help you stay on top of your business. What would you like to check?"
            : "Hi — what would you like help with today?",
        suggestions: defaultStarters(hat),
      },
      hat,
    );
  }

  if (/^(?:thanks|thank you|cheers|ta|perfect|great thanks)$/.test(plain)) {
    return message_(
      {
        content:
          hat === "provider"
            ? "You’re welcome. I’m here whenever you need a hand with the business."
            : "You’re welcome. I’m here whenever you need a hand.",
        suggestions: defaultFollowUps(hat),
      },
      hat,
    );
  }

  if (/^(?:bye|goodbye|see you|see ya|that'?s all)$/.test(plain)) {
    return message_(
      {
        content: "Speak soon — I’ll be right here when you need me.",
        suggestions: defaultStarters(hat),
      },
      hat,
    );
  }

  return null;
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
    { title: `Choose a ${noun}` },
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
    }, hat, { title: "Let’s find the right thing" });
  }

  return message_({
    content: "I'm not sure I follow — did you mean one of these?",
    suggestions: [
      ...options.map((c, i) => askChip(`alt-${i}`, c.describe, c.describe)),
      askChip("help", "Something else", "What can you do?"),
    ],
  }, hat, { title: "Let’s narrow it down" });
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
    }, hat, { title: "Choose a service" });
  }
  if (kind === "provider") {
    return message_({
      content: "Which provider did you mean?",
      suggestions: [askChip("saved", "My saved providers", "Show my saved providers")],
    }, hat, { title: "Choose a provider" });
  }
  return message_({
    content: "I didn't quite catch that — can you give me a bit more?",
    suggestions: defaultStarters(hat),
  }, hat, { title: "A little more detail" });
}

/** Names the assumption Becca acted on, so a medium-confidence answer is never silent. */
function buildAssumption(
  entities: EntityBag,
  answer: string,
  resolvedFromMessage: EntityBag,
): string | undefined {
  // Only entities CARRIED from an earlier turn are assumptions. Something the
  // user just typed is not an interpretation Becca made — saying "assuming
  // you meant today" back at someone who wrote "today" reads as not listening.
  const carried = <K extends keyof EntityBag>(k: K) =>
    entities[k] != null && resolvedFromMessage[k] == null;

  const parts: string[] = [];
  if (carried("booking")) parts.push(entities.booking!.label);
  else if (carried("provider")) parts.push(entities.provider!.label);
  if (carried("service") && !entities.booking) parts.push(entities.service!.label);
  if (carried("date")) parts.push(entities.date!.value.label);
  if (parts.length === 0) return undefined;

  // Don't restate what the answer already says. "Assuming you meant nails —
  // I found 2 nails providers" is noise; the assumption is only worth voicing
  // when the reply itself doesn't make the interpretation obvious.
  const lower = answer.toLowerCase();
  const unstated = parts.filter((p) => !lower.includes(p.toLowerCase()));
  if (unstated.length === 0) return undefined;

  return `Assuming you meant ${unstated.join(", ")} —`;
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
  options?: { exactSuggestions?: boolean; title?: string },
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
    content: formatForChat(parts.content, options?.title),
    suggestions,
  };
}

/**
 * Gives every capability result a visual takeaway before it reaches the UI.
 * Individual capabilities can provide their own `##` heading when they have
 * a more specific one (for example "Your next appointment"); otherwise the
 * capability's human-readable description becomes the bold heading. This
 * prevents a new or error-adjacent capability from quietly shipping as an
 * unstructured wall of prose.
 */
function formatForChat(content: string, title?: string): string {
  const trimmed = content.trim();
  if (!title || /^##\s+/m.test(trimmed)) return trimmed;

  // A plain, multi-sentence answer is difficult to scan in a chat bubble.
  // Treat its first sentence as the takeaway and the remaining sentences as
  // supporting points. This is intentionally conservative: authored lists,
  // paragraphs and inline markdown stay exactly as their capability supplied
  // them, so we never turn a booking's multi-line detail block into nonsense.
  if (!/\n|^(?:[-•])\s/m.test(trimmed)) {
    const sentences = splitChatSentences(trimmed);
    if (sentences.length >= 2) {
      const [takeaway, ...details] = sentences;
      return `## ${title}\n**${takeaway}**\n\n${details.map((detail) => `- ${detail}`).join("\n")}`;
    }
  }

  return `## ${title}\n${trimmed}`;
}

/** Splits prose without mistaking the decimal in a price such as £25.50 for a sentence break. */
function splitChatSentences(content: string): string[] {
  const sentences: string[] = [];
  let start = 0;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const previous = content[index - 1] ?? "";
    const next = content[index + 1] ?? "";
    const isDecimal = character === "." && /\d/.test(previous) && /\d/.test(next);
    if ((character === "." || character === "!" || character === "?") && !isDecimal) {
      // Consume an ellipsis or multiple exclamation marks as one ending.
      while (content[index + 1] === character) index += 1;
      const sentence = content.slice(start, index + 1).trim();
      if (sentence) sentences.push(sentence);
      start = index + 1;
    }
  }

  const remainder = content.slice(start).trim();
  if (remainder) sentences.push(remainder);
  return sentences;
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
