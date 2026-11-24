// Becca's core contracts.
//
// This file is the seam an LLM eventually slots into. The deterministic
// understanding layer (intent matching + entity resolution) produces an
// `Understanding`; the engine takes that Understanding, picks a capability
// from the registry, and runs it. Swapping the parser for a model means
// producing an `Understanding` some other way — every other file here is
// unchanged. See BECCA_CAPABILITIES.md §3.1.

import type { Provider } from "../ProviderDataService";
import type { ConfirmedBooking } from "../../types/booking";
import type { AddToCartParams } from "../../contexts/CartContext";

// ==================== CHAT MESSAGE SHAPE ====================
// These types live here, with Becca, rather than in the service that happens
// to render them. Previously they were owned by enhancedAIChatService.ts,
// which meant deleting that file would have taken the chat UI's types with it.

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  suggestions?: ChatSuggestion[];
  providerRecommendations?: Provider[];
  /** Real portfolio work shown inline for style and inspiration requests. */
  inspiration?: BeccaInspiration[];
  /** The answer's own shape, when it has one. See BeccaAnswer. */
  answer?: BeccaAnswer;
  imageUri?: string;
  /**
   * Populated only by a vision model. Nothing writes this today — the image
   * picker in BeccaScreen accepts uploads that are never analysed. See
   * BECCA_CAPABILITIES.md §3.3.
   */
  imageAnalysis?: string;
  /**
   * What Becca understood this turn: the capability that answered, or null
   * when she didn't catch it (the honest fallback). Absent on replies that
   * weren't an attempt to understand (small talk, confirmations, "which one
   * did you mean"). Read by the miss log (missLog.ts); not saved with chats.
   */
  understood?: { capabilityId: string | null };
}

/**
 * How a reply is laid out around its text. The engine picks one from what
 * the capability returned (see chooseLayout in engine.ts):
 *  - `headline`: one number, rule or yes/no, shown big, with what was checked
 *    as small proof tags, then the text, then any card.
 *  - `stepsThenCard`: a real search. The steps tick off, fold into a "How I
 *    found these" line, then the text and the card.
 *  - `cardFirst`: a quick look-up. The card leads, the steps wait behind a
 *    "How I found this" line underneath.
 */
export type AnswerLayout = "headline" | "stepsThenCard" | "cardFirst";

export interface AnswerHeadline {
  /** The big part: "2 moves", "Yes", "3". Always a fact from the data. */
  value: string;
  /** What it means, in a few words: "per booking, with 48h notice". */
  label: string;
}

export interface AnswerCardRow {
  title: string;
  detail?: string;
  /** A short highlighted fact on the right: a price, a date. */
  tag?: string;
  /** Makes the row open that provider's profile, and shows their logo. */
  provider?: Provider;
  /** A price range drawn as a bar on the card's `scale`. */
  range?: { min: number; max: number };
  /** Draws this row's bar in the highlight colour: the cheapest, the busiest. */
  highlight?: boolean;
}

export interface AnswerCard {
  /** The band across the top, e.g. "VOLUME LASHES". */
  title: string;
  /** Small text on the right of the band, e.g. "3 matches". */
  meta?: string;
  rows?: AnswerCardRow[];
  /** Big-number tiles, e.g. 2 / moves per booking. */
  stats?: { value: string; label: string }[];
  footer?: string;
  /**
   * A ticket's date block on the left ("MON / 10 / NOV"), for a single
   * appointment. Replaces the band.
   */
  stamp?: { top: string; big: string; bottom: string };
  /** The shared scale every row's `range` is drawn on, with its axis labels. */
  scale?: { min: number; max: number; labels: string[] };
}

export interface BeccaAnswer {
  layout: AnswerLayout;
  headline?: AnswerHeadline;
  card?: AnswerCard;
  /**
   * What Becca actually did, past tense, with the real counts: "Searched 14
   * lash providers". Never a step that didn't run.
   */
  work?: string[];
}

/** A safe, client-visible slice of an Explore portfolio item. */
export interface BeccaInspiration {
  id: string;
  imageUrl: string;
  caption?: string;
  providerName: string;
  providerSlug: string;
  /** A short, visible reason this portfolio item belongs in Becca's selection. */
  whyItFits?: string;
}

/**
 * A suggestion's payload, keyed by action. Typed rather than `any` so a
 * capability can't emit a navigate chip with no screen, or a message chip
 * with no message — BeccaScreen reads exactly these fields.
 */
export type SuggestionData =
  | { screen: string; params?: Record<string, unknown>; message?: never }
  | {
    message: string;
    /**
     * A local, exact selection behind a message chip. This prevents a tap on
     * a displayed booking from being re-resolved as vague free text.
     */
    bookingId?: string;
    screen?: never;
    params?: never;
  };

export interface ChatSuggestion {
  id: string;
  text: string;
  action: "navigate" | "search" | "message";
  data?: SuggestionData;
  /** Image source for a provider logo or service icon. */
  icon?: number | { uri: string };
  serviceType?: string;
  /**
   * How BeccaScreen renders this: "action" (default) is a full-width
   * navigation-style card; "chip" is a small pill meant to sit in a wrapped
   * row alongside its siblings — used for short category-style choices.
   */
  display?: "action" | "chip";
}

/** Which hat Becca is wearing. Capabilities are gated on this. */
export type BeccaHat = "client" | "provider";

/**
 * How sure Becca is that she understood the message.
 *
 * - `high`   → answer directly.
 * - `medium` → answer, but state the assumption out loud.
 * - `low`    → don't guess. Say she didn't catch it and offer ranked options.
 *
 * The `low` band is deliberately a first-class outcome rather than a failure
 * path: it's what stops Becca confidently doing the wrong thing, and it's the
 * exact behaviour an LLM later improves rather than replaces.
 */
export type Confidence = "high" | "medium" | "low";

/**
 * Numeric score → band. Kept in one place so thresholds can't drift.
 *
 * Calibrated against the matcher's real range, not a notional 0–1: a phrase
 * match caps at 0.6 and entity evidence adds ~0.3, so a clean hit lands near
 * 0.5–0.9. Setting `high` any higher made confident, correct answers hedge
 * themselves with "assuming you meant…", which is worse than saying nothing.
 */
export const CONFIDENCE_THRESHOLDS = { high: 0.45, medium: 0.3 } as const;

export function scoreToConfidence(score: number): Confidence {
  if (score >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (score >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}

// ==================== ENTITIES ====================

export type EntityKind =
  | "provider"
  | "booking"
  | "service"
  | "date"
  | "money"
  | "timeOfDay";

/**
 * A resolved reference to a real app object.
 *
 * `value` is the resolved thing itself (a real booking row, a real provider),
 * never a string the user typed. `sourceText` keeps what they actually said so
 * Becca can quote it back when confirming an assumption.
 */
export interface ResolvedEntity<K extends EntityKind = EntityKind, V = unknown> {
  kind: K;
  value: V;
  /** 0–1. Below 1 means "probably this, worth confirming". */
  confidence: number;
  /** The fragment of the user's message this came from. */
  sourceText: string;
  /** Human label for confirming/disambiguating ("Gel Manicure, Wed 6th"). */
  label: string;
}

/**
 * Two or more equally-plausible matches for one reference.
 *
 * Ambiguity is a real result, not an error: "my nail appointment" with two
 * nail bookings on file should make Becca ask which one, not silently pick
 * the first.
 */
export interface AmbiguousEntity<K extends EntityKind = EntityKind> {
  kind: K;
  sourceText: string;
  candidates: ResolvedEntity<K>[];
}

/** Everything the resolver pulled out of one message. */
export interface EntityBag {
  provider?: ResolvedEntity<"provider", ProviderRef>;
  booking?: ResolvedEntity<"booking", ConfirmedBooking>;
  service?: ResolvedEntity<"service", ServiceRef>;
  date?: ResolvedEntity<"date", DateRef>;
  money?: ResolvedEntity<"money", MoneyRef>;
  timeOfDay?: ResolvedEntity<"timeOfDay", TimeOfDayRef>;
  /** Populated when a reference matched more than one real object. */
  ambiguous?: AmbiguousEntity[];
}

export interface ProviderRef {
  /** Slug — what navigation expects as `providerId`. */
  slug: string;
  /** Real UUID, when known. Needed for id-keyed queries. */
  dbId?: string;
  displayName: string;
}

export interface ServiceRef {
  /** Canonical category: NAILS, HAIR, LASHES, BROWS, MUA, AESTHETICS. */
  category: string;
  /** e.g. "gel manicure" — present when the user was specific. */
  specific?: string;
  /**
   * Detected from an audience phrase ("men's haircut", "for my daughter") —
   * mirrors services.audience. Set independently of whether the phrase also
   * drove `category` to MALE/KIDS (see AUDIENCE_OVERRIDES in
   * entityResolver.ts), so a HAIR provider's individual audience='men'
   * service can be preferred without discarding a resolved `specific`.
   */
  audience?: 'women' | 'men' | 'kids';
}

export interface DateRef {
  /** YYYY-MM-DD. */
  ymd: string;
  /** Inclusive end for ranges ("this weekend"). Equals `ymd` for single days. */
  endYmd: string;
  /** What they said: "tomorrow", "next Tuesday". */
  label: string;
}

/** Amounts are GBP. This app is £, never $ — see BECCA_CAPABILITIES.md §0. */
export interface MoneyRef {
  min?: number;
  max?: number;
}

export interface TimeOfDayRef {
  band: "morning" | "afternoon" | "evening";
  startHour: number;
  endHour: number;
}

// ==================== UNDERSTANDING ====================

/**
 * The parser's output: what Becca thinks the user wants.
 *
 * Produced today by deterministic matching; produced later by an LLM. The
 * engine consumes only this, so the swap is contained.
 */
export interface Understanding {
  /** Capability id, or null when nothing matched well enough. */
  capabilityId: string | null;
  entities: EntityBag;
  confidence: Confidence;
  /** Raw score before banding — useful for ranking rival interpretations. */
  score: number;
  /** Runner-up capabilities, best first. Offered as options on `low`. */
  alternatives: { capabilityId: string; score: number }[];
  /** The original message, verbatim. */
  rawMessage: string;
}

// ==================== CAPABILITIES ====================

/**
 * What a capability produces. Deliberately structured rather than a string:
 * the presentation layer decides wording, and an LLM can later re-phrase the
 * same data without the capability changing at all.
 */
/**
 * A write Becca is offering to perform, pending explicit confirmation.
 *
 * Becca never writes as a side effect of understanding a message: the
 * capability describes the action, the user taps to confirm, and only then
 * does `run` execute. That keeps a misread intent from mutating real data —
 * which matters most precisely where the parser is weakest.
 */
export interface PendingAction {
  /** Stable id, so the confirm chip round-trips back to the right action. */
  id: string;
  /** What will happen, in plain words. Shown on the confirmation. */
  describe: string;
  /** Label for the confirm button. */
  confirmLabel: string;
  /** Performs the write. Only ever called after explicit confirmation. */
  run: () => Promise<PendingActionDone>;
  /**
   * A second version of the same write, offered as its own button — "with
   * the add-ons" vs "without". Tapping either one confirms it, and running
   * one retires the other, so only one of the two can ever happen.
   */
  alternative?: { id: string; confirmLabel: string; run: () => Promise<PendingActionDone> };
}

/** What Becca says once a confirmed write has run, plus where to go next. */
export type PendingActionDone = string | { text: string; suggestions: ChatSuggestion[] };

export interface CapabilityResult {
  /** The answer, already written for a human. */
  text: string;
  /** Tappable follow-ups: navigate somewhere, or ask Becca something next. */
  suggestions?: ChatSuggestion[];
  /** Provider cards to render under the message. */
  providers?: Provider[];
  /** Portfolio imagery from Explore, only from live providers. */
  inspiration?: BeccaInspiration[];
  /** The answer as one big fact; makes the layout `headline`. */
  headline?: AnswerHeadline;
  /** The answer as a card. Replaces the provider strip when it lists providers. */
  card?: AnswerCard;
  /** The steps this run really took, with their real counts. */
  work?: string[];
  /** Names the layout outright, when the default rule (see chooseLayout) doesn't fit. */
  layout?: AnswerLayout;
  /** A write awaiting confirmation. The engine renders the confirm chips. */
  pendingAction?: PendingAction;
  /**
   * Set when the capability acted on a medium-confidence assumption. The
   * engine prefixes the reply with it so Becca never silently guesses.
   */
  assumption?: string;
}

/** What a capability needs resolved before it can run. */
export type EntityRequirement = {
  kind: EntityKind;
  /** When true, the engine asks for it rather than running the capability. */
  required: boolean;
};

/**
 * One thing Becca can do.
 *
 * This registry is the LLM's future tool schema, verbatim — `id`, `describe`
 * and `needs` map directly onto a tool definition. That's the whole reason
 * capabilities are declarative instead of branches in an if/else chain.
 */
export interface Capability {
  id: string;
  /** Which hat may use this. A provider can never reach a client capability. */
  hat: BeccaHat;
  /** One line, phrased as the user would ask it. Becomes the tool description. */
  describe: string;
  /**
   * Phrases that signal this capability. Matched with word-boundary awareness
   * by the matcher — not naive substring containment.
   */
  phrases: string[];
  /** Entities this capability consumes. */
  needs?: EntityRequirement[];
  /**
   * Optional veto, checked against the raw message before scoring.
   *
   * For the case where two capabilities share vocabulary but differ by a
   * modifier the phrase list can't express — "my services" (list them) vs
   * "edit my services" (open the editor). Returning false removes this
   * capability from contention entirely rather than merely lowering it.
   * Use sparingly: phrasing is the primary mechanism, this is the exception.
   */
  excludeWhen?: RegExp;
  /**
   * Provider hat only: true when this capability fits a link-only provider
   * (`providers.booking_mode = 'external'`), who takes bookings on their own
   * booking site rather than through CERVICED.
   *
   * Left unset means full-service only. A link-only pro has no CERVICED
   * bookings, price list, reviews, client list, forms, info packs,
   * automations or address release, so a capability answering from any of
   * those would answer about nothing. The engine reads this flag in one
   * place: an ask that resolves to an unfitting capability gets a plain
   * "that isn't part of your setup" reply and the capability never runs.
   * Ignored for the client hat and for full providers.
   */
  fitsLinkOnly?: boolean;
  /**
   * What Becca shows while this capability runs — one to three short steps,
   * each describing work `run` really does ("Reading Lola's deposit policy…"),
   * never a fact from the answer. Shown in order once the engine has decided
   * on this capability; see EngineInput.onProgress.
   */
  thinking: string[] | ((turn: ThinkingTurn) => string[]);
  /** Runs the capability against real app data. */
  run: (ctx: CapabilityContext) => Promise<CapabilityResult>;
}

/** What a capability's loading steps may read: the turn, before it runs. */
export interface ThinkingTurn {
  entities: EntityBag;
  /** The repaired ask — the same text the capability's `run` will see. */
  message: string;
}

/**
 * What Becca has learned about this user, from `userLearningService`.
 *
 * Resolved once per turn and passed down rather than fetched per capability —
 * it reads AsyncStorage, and several capabilities want the same answer.
 * Every field is optional: a brand-new user has no history, and personalising
 * off nothing is worse than not personalising at all.
 */
export interface PersonalContext {
  /** Category they book/browse most, e.g. "NAILS". */
  topCategory?: string;
  /** Their most-engaged categories, best first. */
  favouriteServices: string[];
  /** Style/vibe tags learned from what they view and book. */
  styleTags: string[];
  /** How much history this is based on — below ~3, don't claim to know them. */
  interactionCount: number;
}

/** True once there's enough history for personalisation to be honest. */
export function hasUsefulHistory(p: PersonalContext | undefined): boolean {
  return !!p && p.interactionCount >= 3;
}

/**
 * What the last turn established, carried into the next one.
 *
 * Becca previously resolved every message from scratch, so "what about
 * Saturday?" arrived with no idea nails had just been discussed and matched
 * nothing at all. This is the minimum state that makes a follow-up mean what
 * a person intends it to mean.
 *
 * Deliberately small: only entities and the last capability, never the whole
 * transcript. It's a carry-over for reference resolution, not a memory of the
 * conversation — that's an LLM's job (§3.1).
 */
export interface ConversationContext {
  /**
   * The hat that created this context. Context is account-role specific:
   * provider and client turns must never carry entities, result lists or
   * suggestion memory into one another after a hat switch.
   *
   * Optional for backwards-compatible restoration of older local sessions;
   * the engine treats an unstamped context as safe only for the current turn.
   */
  hat?: BeccaHat;
  /** Entities resolved on the previous turn, available for reuse. */
  entities: EntityBag;
  /** What Becca answered last, so "the first one" knows what list it means. */
  lastCapabilityId?: string;
  /** Provider setting just located, for "how do I change this?" follow-ups. */
  lastNavigationAsk?: string;
  /** The exact booking most recently discussed, for explicit follow-ups. */
  lastBooking?: NonNullable<EntityBag["booking"]>;
  /**
   * Providers Becca last showed, in display order — resolves "the first one".
   *
   * CLIENT HAT ONLY. Provider-hat capabilities list the provider's own
   * clients, bookings and waitlist entries, none of which are providers, so
   * this stays empty there and ordinal/pronoun references don't resolve.
   * Supporting "the first one" over a client list would need its own
   * `lastClients` field — deliberately not built, since every provider-hat
   * answer currently names who it means rather than returning a bare list.
   */
  lastProviders?: { slug: string; dbId?: string; displayName: string }[];
  /**
   * Question-chip messages already offered earlier in this conversation.
   *
   * Without this the engine only ever compared a chip against the message
   * JUST sent, so the same follow-ups ("What's on today?", "Find someone")
   * were re-offered turn after turn — the conversation visibly circled, and
   * a chip the user had already tapped and answered kept coming back as if
   * it were new. Held as the sent `message`, not the label, because that's
   * what identifies the destination: two chips worded differently that ask
   * the same question are the same suggestion.
   *
   * Bounded (see SUGGESTION_MEMORY) — a long conversation must not
   * eventually suppress every option and leave a reply with nothing to tap.
   */
  offeredSuggestions?: string[];
}

/**
 * How many recent question-chips to remember when filtering repeats.
 *
 * Deliberately a window rather than the whole conversation: re-offering
 * something from twenty turns ago is helpful, re-offering what was on screen
 * two turns ago is noise. Navigation chips are exempt from this entirely —
 * "View booking" SHOULD stay available on every booking answer.
 */
export const SUGGESTION_MEMORY = 12;

/** Everything a capability is allowed to read at run time. */
export interface CapabilityContext {
  entities: EntityBag;
  hat: BeccaHat;
  /**
   * The message as Becca parsed it — typos repaired, split words joined
   * (see askNormaliser). This is what the matcher scored, so a capability
   * testing its own modifiers reads the same text that routed the message
   * here. Case is preserved, but a repaired token is not: "BALAYAGE" is
   * corrected to lowercase "balayage" like any other spelling of the word.
   */
  rawMessage: string;
  /**
   * The user's keystrokes, untouched.
   *
   * Only for a capability that reads SHAPE rather than meaning — today that
   * is `discover.promocode`, which identifies a code by it being uppercase.
   * Normalisation is case-insensitive and substitutes lowercase, so a code
   * that happens to spell a beauty word ("BALAYAGE", "SHELLAC", "KERATIN")
   * arrives lowercased in `rawMessage` and stops looking like a code at all.
   * Prefer `rawMessage` everywhere else: it is the text Becca understood.
   */
  verbatimMessage: string;
  /** Bookings from BookingContext — already loaded, no refetch. */
  bookings: ConfirmedBooking[];
  /**
   * Client hat only: CartContext's addToCart, for a confirmed pendingAction
   * to call. Never call it from `run` itself — see PendingAction.
   */
  addToCart?: (item: AddToCartParams) => void;
  /** Signed-in user id, when available. */
  userId?: string;
  /**
   * Client hat only: Account → Your area (users.client_area), from
   * AuthContext. "Near me" answers measure from it when nothing was picked
   * on this phone — see planClientLocation.
   */
  clientArea?: string;
  /**
   * Provider hat only: the provider is link-only (takes bookings on their own
   * booking site). Only capabilities marked `fitsLinkOnly` ever run with this
   * set; they read it to keep their wording and follow-up chips to what a
   * link-only pro actually has.
   */
  linkOnly?: boolean;
  /** Today, injected so date logic is testable and never reads the clock directly. */
  now: Date;
  /**
   * Learned preferences. Client hat only — a provider's own booking behaviour
   * as a client has no bearing on their business questions.
   */
  personal?: PersonalContext;
}
