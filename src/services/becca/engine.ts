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
import { scoreToConfidence, SUGGESTION_MEMORY } from "./types";
import userLearningService from "../userLearningService";
import { resolveEntities } from "./entityResolver";
import { understand } from "./matcher";
import { capabilitiesFor, getCapability, toToolSchema } from "./registry";
import { askChip, chip, navChip } from "./capabilities/shared";
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
  /** Exact booking selected from a Becca action card, never free text. */
  selectedBookingId?: string;
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

// Everyday standalone questions must not inherit the previous booking or
// discovery topic. This guard also bypasses optional AI routing, so a simple
// clock question is always instant and deterministic.
const CURRENT_TIME_RE = /^(?:what(?:'s| is)|whats)\s+(?:the\s+)?time(?:\s+is\s+it)?[?!.]*$/i;
const BOOKING_DETAILS_RE = /\b(?:tell me more|more about|details?|break\s+down|what(?:'s| is).*(?:about|with))\b.*\b(?:booking|appointment|appt)\b/i;
// Natural follow-ups to an appointment answer. Unlike broad topic carry-over,
// these are explicitly booking-bound requests, so using the booking just
// discussed is clearer and safer than giving an account-wide generic answer.
const BOOKING_PREP_FOLLOW_UP_RE = /\b(?:prep|prepare|preparation|form|forms|intake|patch\s*test|aftercare|instructions?|what\s+(?:do|should|need).*(?:bring|do|know|fill))\b/i;

// Becca can help with beauty and booking context, but she is not a clinician.
// Keep this ahead of routing so a model, matcher, or future capability can
// never turn a symptom or diagnosis request into advice.
const MEDICAL_OR_DERMATOLOGY_RE = /\b(?:diagnos(?:e|is|ed|ing)|medical|dermatolog(?:y|ist|ical)|skin\s+(?:condition|rash|infection|reaction|disease)|eczema|psoriasis|acne|rosacea|fung(?:al|us)|allerg(?:y|ic)|swelling|burn(?:ing|ed)?|bleed(?:ing)?|hives|infection|medication|prescription|antibiotic|treat(?:ment|ing)|cure)\b/i;

// A provider often replies with the verb from the immediately preceding
// capacity answer — e.g. “set”, “set it”, or “yes, set that”. It is only
// meaningful in that one context, so route it there rather than sending a
// one-word message through the broad matcher and surfacing unrelated ideas.
const SET_DAILY_LIMIT_FOLLOW_UP_RE = /^(?:set(?:\s+(?:it|that|the\s+limit|limit|limt|lmit|mit))?|yes(?:\s+please)?|do\s+it)$/i;
// Unlike a bare “set”, this carries enough meaning to work after a restored
// chat too, where ephemeral capability context is intentionally unavailable.
const SET_DAILY_LIMIT_DIRECT_RE = /^set\s+(?:the\s+)?(?:limit|limt|lmit|mit)$/i;

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
  const { message, hat, bookings, userId, conversation, interpreter } = input;

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

  // This is a boundary, not a generic "out of scope" redirect: Becca remains
  // free to be conversational and helpful beyond booking tasks. She simply
  // must not present medical or dermatology guidance as an expert answer.
  if (MEDICAL_OR_DERMATOLOGY_RE.test(message)) {
    return message_(
      {
        content:
          "I can’t give medical or dermatology advice, or diagnose a skin concern. A qualified healthcare professional or dermatologist can give you the right guidance.",
      },
      hat,
    );
  }

  if (
    hat === "provider" &&
    (
      SET_DAILY_LIMIT_DIRECT_RE.test(message.trim()) ||
      (
        conversation?.lastCapabilityId === "pv.capacity" &&
        SET_DAILY_LIMIT_FOLLOW_UP_RE.test(message.trim())
      )
    )
  ) {
    // Preserve the active thread: the provider may use Back after changing
    // the setting and should land in the same capacity conversation.
    lastContext = conversation ?? { entities: {} };
    return message_(
      {
        content: "You can set it under Booking Rules — choose the maximum bookings per day.",
        suggestions: [navChip("booking-rules", "Set a daily limit", "bookingRules")],
      },
      hat,
      { title: "Set daily limit" },
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

  // A booking action card already names one real record. Preserve that exact
  // selection instead of asking the resolver to infer it again from the
  // chip's human-readable message (which can be ambiguous for repeat visits).
  if (input.selectedBookingId) {
    const selected = bookings.find((booking) => booking.id === input.selectedBookingId);
    if (selected) {
      entities = {
        ...entities,
        booking: {
          kind: "booking",
          value: selected,
          confidence: 1,
          sourceText: "selected booking",
          label: `${selected.serviceName} with ${selected.providerName}`,
        },
        ...(entities.ambiguous
          ? { ambiguous: entities.ambiguous.filter((entry) => entry.kind !== "booking") }
          : {}),
      };
    }
  }

  // Carry forward what the last turn established. "What about Saturday?"
  // means nothing on its own — it only works because the previous turn was
  // about nails. Anything this message resolved for itself always wins.
  // Snapshot before merging prior context: the difference is exactly what was
  // carried, which is the only thing worth calling an assumption.
  const fromMessage = entities;
  entities = carryForward(entities, conversation, hat);

  // Booking references are not carried by default (a stale appointment would
  // be dangerous), but an explicit "tell me more about that booking" is a
  // safe, unambiguous request to continue the booking just discussed.
  if (!entities.booking && hat === "client" && BOOKING_DETAILS_RE.test(message) && conversation?.lastBooking) {
    entities = {
      ...entities,
      booking: conversation.lastBooking,
      ...(entities.ambiguous
        ? { ambiguous: entities.ambiguous.filter((entry) => entry.kind !== "booking") }
        : {}),
    };
  }

  if (!entities.booking && hat === "client" && BOOKING_PREP_FOLLOW_UP_RE.test(message) && conversation?.lastBooking) {
    entities = {
      ...entities,
      booking: conversation.lastBooking,
      ...(entities.ambiguous
        ? { ambiguous: entities.ambiguous.filter((entry) => entry.kind !== "booking") }
        : {}),
    };
  }

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
    ...(entities.booking ? { lastBooking: entities.booking } : conversation?.lastBooking ? { lastBooking: conversation.lastBooking } : {}),
    // Carried, not dropped: an ambiguity or fallback turn that reset this
    // would let every previously-offered chip come straight back on the next
    // reply — exactly the circling this memory exists to stop.
    ...(conversation?.offeredSuggestions
      ? { offeredSuggestions: conversation.offeredSuggestions }
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

  // …and don't re-offer a question already put to the user EARLIER in this
  // conversation. Comparing only against the message just sent (above) still
  // let "What's on today?" reappear on turn 1, 3 and 5, so the pills visibly
  // circled and a question already asked and answered kept coming back.
  //
  // Navigation chips are deliberately exempt: "View booking" is a destination,
  // not a question, and it should stay available on every answer where it's
  // relevant. Only `message` chips — the ones that put words in the user's
  // mouth — are suppressed.
  const alreadyOffered = new Set(conversation?.offeredSuggestions ?? []);
  const isFresh = (s: ChatSuggestion) => {
    const msg = s.data?.message?.trim().toLowerCase();
    // Navigation chips carry no message and are never suppressed.
    return !msg || !alreadyOffered.has(msg);
  };
  const fresh = deduped.filter(isFresh);

  // When everything a capability offered has already been seen, TOP UP with
  // unseen alternatives rather than falling back to the stale set.
  //
  // Falling back to `deduped` here was the flaw in the first version of this:
  // it re-showed exactly the chips the memory had just rejected, so the
  // circling survived precisely in the case the memory existed to fix. A
  // capability typically offers only two or three follow-ups, so "all of them
  // seen" happens quickly in a real conversation.
  const suggestions =
    fresh.length > 0
      ? fresh
      : (() => {
        const unseen = discoveryChips(hat).filter(isFresh);
        // Last resort: everything worth suggesting has been offered recently.
        // Show the capability's own options rather than an empty reply — a
        // dead end is worse than a repeat.
        return unseen.length > 0 ? unseen.slice(0, 3) : deduped.length > 0 ? deduped : defaultFollowUps(hat);
      })();

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
    ...(entities.booking ? { lastBooking: entities.booking } : conversation?.lastBooking ? { lastBooking: conversation.lastBooking } : {}),
    // A turn that shows no providers must NOT erase the list the user is
    // still looking at: "find nails" -> "any free Saturday?" -> "none" ->
    // "the first one" still refers to what's on screen. Only a turn showing
    // a NEW list replaces it.
    ...(shownProviders.length > 0 ? { lastProviders: shownProviders } : {}),
    offeredSuggestions: rememberOffered(
      conversation?.offeredSuggestions,
      suggestions,
    ),
  };

  const factualContent = assumption ? `${assumption}\n\n${result.text}` : result.text;
  const content = await composeWithFallback(interpreter, {
    message,
    hat,
    capabilityId: capability.id,
    factualContent,
  });

  return message_(
    {
      content,
      suggestions,
      ...(result.providers ? { providerRecommendations: result.providers } : {}),
      ...(result.inspiration ? { inspiration: result.inspiration } : {}),
    },
    hat,
    { title: capability.describe },
  );
}

/**
 * A wider pool of genuinely useful questions, drawn from when a capability's
 * own follow-ups have all been offered recently.
 *
 * This is what stops the "top up" path from being a token gesture: without a
 * pool bigger than any one capability's two or three chips, a conversation
 * runs out of unseen options within a few turns and starts repeating again.
 * Ordered roughly by how often someone actually wants each one, since the
 * top-up takes the first few that haven't been seen.
 *
 * Every message here must match a real capability above the matcher's medium
 * threshold — a chip that lands in the "didn't catch that" fallback is worse
 * than no chip at all.
 */
function discoveryChips(hat: BeccaHat): ChatSuggestion[] {
  if (hat === "provider") {
    return [
      askChip("p-today", "What's on today?", "What's on today?"),
      askChip("p-week", "How's my week?", "How busy am I this week?"),
      askChip("p-gaps", "Where are my gaps?", "Where are my gaps this week?"),
      askChip("p-waitlist", "Who's on my waitlist?", "Who's on my waitlist?"),
      askChip("p-lapsed", "Who hasn't been back?", "Who hasn't been back in a while?"),
      askChip("p-forms", "Anyone missing a form?", "Who hasn't filled their form in?"),
      askChip("p-inbox", "Any unread messages?", "Any unread messages?"),
      askChip("p-reviews", "How are my reviews?", "How are my reviews?"),
      askChip("p-prices", "What do I charge?", "What do I charge?"),
      askChip("p-policies", "What are my policies?", "What's my cancellation policy?"),
      askChip("p-hours", "What are my hours?", "What are my working hours?"),
      askChip("p-capacity", "Am I near my cap?", "Am I full today?"),
    ];
  }
  return [
    askChip("c-next", "My next appointment", "When's my next appointment?"),
    askChip("c-bookings", "All my bookings", "Show all my bookings"),
    askChip("c-find", "Find someone", "Show me all services"),
    askChip("c-saved", "My saved providers", "Show my saved providers"),
    askChip("c-inspo", "Show me some looks", "Show me some inspiration"),
    askChip("c-top", "Who's best rated?", "Who are the best rated providers?"),
    askChip("c-offers", "Any offers on?", "Any offers on?"),
    askChip("c-prep", "How should I prep?", "How do I prepare for my appointment?"),
    askChip("c-rebook", "Rebook my last one", "Rebook my last appointment"),
    askChip("c-looks", "My saved looks", "Show my saved looks"),
    askChip("c-notifs", "Anything I've missed?", "Any notifications?"),
    askChip("c-profile", "My beauty profile", "Show my beauty profile"),
    askChip("c-help", "What else can you do?", "What can you help with?"),
  ];
}

/**
 * Adds this turn's question-chips to the rolling memory of what's been
 * offered, newest last, capped at SUGGESTION_MEMORY.
 *
 * Only `message` chips are recorded — navigation chips are never suppressed,
 * so remembering them would just crowd real entries out of the window.
 */
function rememberOffered(
  prior: string[] | undefined,
  offered: { data?: { message?: string } }[],
): string[] {
  const next = [...(prior ?? [])];
  for (const suggestion of offered) {
    const msg = suggestion.data?.message?.trim().toLowerCase();
    // Confirmation tokens are single-use plumbing, not questions the user
    // could be re-asked, so they'd only ever waste a slot in the window.
    if (!msg || msg.startsWith(CONFIRM_PREFIX)) continue;
    if (!next.includes(msg)) next.push(msg);
  }
  return next.slice(-SUGGESTION_MEMORY);
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
  if (hat === "client" && CURRENT_TIME_RE.test(message.trim())) {
    return {
      ...fallback,
      capabilityId: "meta.current_time",
      confidence: "high",
      score: 1,
      alternatives: [],
    };
  }
  if (hat === "client" && entities.booking && BOOKING_DETAILS_RE.test(message)) {
    return {
      ...fallback,
      capabilityId: "booking.details",
      confidence: "high",
      score: 1,
      alternatives: [],
    };
  }
  // A clear local match is already the safest, most precise answer. Letting
  // an external router replace it caused obvious requests such as "my next
  // appointment" to occasionally drift into an unrelated tool. AI is an
  // understanding assist for ambiguous language, not an override for known
  // app commands.
  if (fallback.confidence === "high" && fallback.capabilityId) return fallback;
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
 * Lets a model own how an answer READS without giving it authority over what
 * the answer SAYS.
 *
 * The model may restructure freely — headings, bullets, bold, sentence order,
 * tone. What it may not do is introduce a fact. Every number, price, date and
 * capitalised name in its rewrite must already appear in the deterministic
 * text; `verifyComposition` checks that token by token and discards the whole
 * rewrite on any mismatch.
 *
 * That's the guarantee worth having: a bad rewrite costs formatting, never
 * correctness. In an app where the next tap books an appointment and takes
 * money, "the model occasionally writes £45 when the row says £40" is not a
 * trade worth making for nicer prose.
 */
async function composeWithFallback(
  interpreter: BeccaAIInterpreter | undefined,
  request: {
    message: string;
    hat: BeccaHat;
    capabilityId: string;
    factualContent: string;
  },
): Promise<string> {
  if (!interpreter?.compose) return request.factualContent;
  try {
    const result = await Promise.race([
      interpreter.compose(request),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), AI_INTERPRETER_TIMEOUT_MS)),
    ]);

    // Full rewrite: allowed to be richer than the source, but never to assert
    // anything the source didn't.
    const rewritten = result?.content?.trim();
    if (rewritten && verifyComposition(rewritten, request.factualContent)) {
      return rewritten;
    }

    // Legacy lead-in path, for an interpreter that only implements the old
    // contract. Still deliberately narrow — it prepends to untouched facts.
    const leadIn = result?.leadIn?.trim();
    if (leadIn && isSafeLeadIn(leadIn)) {
      return `${leadIn}\n\n${request.factualContent}`;
    }
    return request.factualContent;
  } catch {
    return request.factualContent;
  }
}

/**
 * Digits, money and percentages — the tokens a wrong value would hide in.
 *
 * The trailing `(?<![.,])` matters: without it a sentence-final "£40." tokenises
 * as `£40.` and fails to match the source's `£40`, so a perfectly correct
 * rewrite gets thrown away for having punctuation. Internal separators are
 * still kept, so "1,200" and "2.30" stay whole.
 */
const NUMERIC_TOKEN_RE = /£?\d[\d,.]*(?<![.,])%?/g;

/**
 * True when every fact in `rewritten` is present in `source`.
 *
 * Two classes are checked, because they fail differently:
 *
 *  - NUMERIC tokens (prices, counts, times, dates, percentages) must match
 *    exactly. This is the class that costs money when wrong, and there is no
 *    such thing as an acceptable approximation of a price.
 *  - CAPITALISED words (provider names, service names, weekdays) must also
 *    appear in the source, so the model can't attribute a booking to the
 *    wrong person or move it to the wrong day. Sentence-initial words and a
 *    small set of ordinary openers are exempt, since a rewrite legitimately
 *    starts sentences in new places.
 *
 * Deliberately one-directional: the rewrite may OMIT source facts (a good
 * rewrite is often shorter) but may never ADD one.
 */
function verifyComposition(rewritten: string, source: string): boolean {
  // A rewrite that balloons is a sign the model started explaining rather
  // than presenting. Cheap structural guard before the token work.
  if (rewritten.length > source.length * 2 + 200) return false;

  const sourceNumbers = new Set(source.match(NUMERIC_TOKEN_RE) ?? []);
  for (const token of rewritten.match(NUMERIC_TOKEN_RE) ?? []) {
    if (!sourceNumbers.has(token)) return false;
  }

  const plain = (value: string) => value.replace(/[*_`#>-]/g, " ");
  const sourceWords = new Set(
    (plain(source).match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).map((w) => w.toLowerCase()),
  );

  // Blank the first word of every sentence, heading and list item BEFORE
  // stripping markdown. Two things matter here and both were bugs:
  //  - ORDER: strip markdown first and `## Coming up` becomes `   Coming up`,
  //    so "Coming" stops looking sentence-initial and an ordinary heading gets
  //    rejected as an invented name.
  //  - The `m` flag plus an explicit `\n` branch: markdown is line-oriented,
  //    so every new line is a sentence start. Without it only the very first
  //    line was exempt and every subsequent heading/bullet opener was treated
  //    as a factual claim.
  const midSentence = plain(
    rewritten.replace(/(^|[.!?:]\s*|\n)\s*(?:[#>*+-]+\s*)?(?:\*\*)?[A-Z][A-Za-z'’-]*/gm, " "),
  );
  for (const word of midSentence.match(/\b[A-Z][A-Za-z'’-]{1,}/g) ?? []) {
    if (COMMON_CAPITALS.has(word.toLowerCase())) continue;
    if (!sourceWords.has(word.toLowerCase())) return false;
  }
  return true;
}

/**
 * Capitalised words that carry no factual claim, so a rewrite may use them
 * even when the deterministic text didn't. Anything naming a person, service,
 * place or day is deliberately absent — those must come from the source.
 */
const COMMON_CAPITALS = new Set([
  "i", "i'm", "i've", "i'll", "you", "your", "we", "it", "that", "this",
  "here", "there", "becca", "ok", "okay", "yes", "no", "and", "but", "so",
]);

function isSafeLeadIn(value: string): boolean {
  // The legacy bridge prepends to untouched facts, so it stays narrow: no
  // digits or currency (facts), and no structure (it isn't the answer).
  // The full-rewrite path above is where bold, bullets and headings live now.
  return value.length <= 140
    && !/[\r\n£\d*•#]/.test(value)
    && value.split(/\s+/).filter(Boolean).length <= 22;
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
        "I’m not sure what you mean yet — could you tell me a little more?",
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
 * Capability-owned actions are deliberately not padded with generic starters.
 * A short, precise action set is more useful than three loosely related cards
 * that restart the conversation or make a completed choice look unfinished.
 */
function message_(
  parts: Omit<ChatMessage, "id" | "role" | "timestamp">,
  hat: BeccaHat = "client",
  // Confirmation prompts opt out of padding: the only valid next steps are
  // confirm or don't, and an unrelated third chip beside a pending WRITE is
  // an invitation to mis-tap.
  options?: { exactSuggestions?: boolean; title?: string },
): ChatMessage {
  const own = parts.suggestions ?? [];
  const suggestions = options?.exactSuggestions || own.length > 0
    ? own
    : defaultFollowUps(hat);
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
 * capability's human-readable description becomes the heading. It does not
 * rewrite the first sentence as a bold "takeaway": that made Becca echo the
 * user's request before progressing to the actual answer.
 */
function formatForChat(content: string, title?: string): string {
  const trimmed = capitaliseLeadingLetter(content.trim());
  if (!title || /^##\s+/m.test(trimmed)) return trimmed;

  return `## ${title}\n${trimmed}`;
}

/** Capitalise fallback templates after their optional voice prefix is removed. */
function capitaliseLeadingLetter(content: string): string {
  return content.replace(/^([a-z])/, (letter) => letter.toUpperCase());
}
