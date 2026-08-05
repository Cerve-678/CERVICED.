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
  imageUri?: string;
  /**
   * Populated only by a vision model. Nothing writes this today — the image
   * picker in BeccaScreen accepts uploads that are never analysed. See
   * BECCA_CAPABILITIES.md §3.3.
   */
  imageAnalysis?: string;
}

/**
 * A suggestion's payload, keyed by action. Typed rather than `any` so a
 * capability can't emit a navigate chip with no screen, or a message chip
 * with no message — BeccaScreen reads exactly these fields.
 */
export type SuggestionData =
  | { screen: string; params?: Record<string, unknown>; message?: never }
  | { message: string; screen?: never; params?: never };

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
  run: () => Promise<string>;
}

export interface CapabilityResult {
  /** The answer, already written for a human. */
  text: string;
  /** Tappable follow-ups: navigate somewhere, or ask Becca something next. */
  suggestions?: ChatSuggestion[];
  /** Provider cards to render under the message. */
  providers?: Provider[];
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
  /** Runs the capability against real app data. */
  run: (ctx: CapabilityContext) => Promise<CapabilityResult>;
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
  /** Entities resolved on the previous turn, available for reuse. */
  entities: EntityBag;
  /** What Becca answered last, so "the first one" knows what list it means. */
  lastCapabilityId?: string;
  /** Providers Becca last showed, in display order — resolves "the first one". */
  lastProviders?: { slug: string; dbId?: string; displayName: string }[];
}

/** Everything a capability is allowed to read at run time. */
export interface CapabilityContext {
  entities: EntityBag;
  hat: BeccaHat;
  rawMessage: string;
  /** Bookings from BookingContext — already loaded, no refetch. */
  bookings: ConfirmedBooking[];
  /** Signed-in user id, when available. */
  userId?: string;
  /** Today, injected so date logic is testable and never reads the clock directly. */
  now: Date;
  /**
   * Learned preferences. Client hat only — a provider's own booking behaviour
   * as a client has no bearing on their business questions.
   */
  personal?: PersonalContext;
}
