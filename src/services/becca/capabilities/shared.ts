// Shared builders for capability results.
//
// Centralised so every capability produces the same suggestion shape and the
// same currency formatting. The £ formatting in particular is not incidental:
// the previous implementation hardcoded `$` in a £ app.

import type { ChatSuggestion } from "../types";
import type { Provider } from "../../ProviderDataService";
import type { DbProvider } from "../../../types/database";
import { getProviderIdByDisplayName } from "../../databaseService";

/** GBP. This app is £ — never format money any other way. */
export function money(amount: number): string {
  return `£${amount.toFixed(2).replace(/\.00$/, "")}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Voice
//
// Becca's replies were uniformly flat — every answer a bare statement of
// fact, whether it was good news or a dead end. These helpers give her
// dynamic range: warmth when she's found something, honesty without gloom
// when she hasn't. Kept as small openers rather than rewritten sentences so
// each capability keeps owning its own facts; the helper only sets the tone.
//
/**
 * Opener for a genuinely good result — she found something worth showing.
 * Keep it direct. Phrases such as "Good timing" suggest Becca knows why the
 * user asked now, which she doesn't; the response should only claim the
 * result she actually found.
 */
export function goodNews(): string {
  return "Great —";
}

/**
 * Opener for an empty/negative result. Warm and matter-of-fact: acknowledges
 * the miss without apologising excessively or sounding defeated, because the
 * next line is almost always a suggestion for what to try instead.
 */
export function softMiss(): string {
  return "Hmm,";
}

/**
 * A small pill in a wrapped row — short, category-style choices.
 * Sends `message` back to Becca as if the user typed it.
 */
export function chip(id: string, text: string, message: string): ChatSuggestion {
  return { id, text, action: "message", data: { message }, display: "chip" };
}

/** A full-width action card that asks Becca a follow-up question. */
export function askChip(id: string, text: string, message: string): ChatSuggestion {
  return { id, text, action: "message", data: { message }, display: "action" };
}

/**
 * A navigation card. `screen` is a semantic key resolved by BeccaScreen's
 * nav map; `params` are forwarded so deep links land on the right record
 * rather than a bare screen.
 */
export function navChip(
  id: string,
  text: string,
  screen: string,
  params?: Record<string, unknown>,
): ChatSuggestion {
  return {
    id,
    text,
    action: "navigate",
    data: { screen, ...(params ? { params } : {}) },
    display: "action",
  };
}

/**
 * DbProvider → the Provider shape the recommendation cards render.
 *
 * This is the single mapper for Becca. Three divergent copies of this
 * conversion previously existed across the AI services; new code must use
 * this one rather than adding a fourth.
 */
export function providerFromDb(p: DbProvider): Provider {
  return {
    id: p.slug,
    name: p.display_name,
    service: p.service_category as Provider["service"],
    logo: p.logo_url ? { uri: p.logo_url } : null,
    ...(p.location_text != null ? { location: p.location_text } : {}),
  };
}

/**
 * A provider's UUID, resolving it from the display name when the reference
 * didn't carry one.
 *
 * A provider resolved from a pronoun ("are they any good?") or an ordinal
 * ("the first one") comes from the card list, which carries slug + name but
 * no UUID. Without this, every capability keyed on `dbId` silently failed on
 * exactly the phrasings conversation context was built to support.
 *
 * ONLY pass a display name that came from an already-gated source: the
 * conversation's `lastProviders` (populated exclusively from has_gone_live-
 * filtered queries) or the user's own bookings. `getProviderIdByDisplayName`
 * deliberately does NOT filter `has_gone_live` — it must still resolve a
 * provider who went un-live after you booked with them, so rebooking and
 * reviews keep working. Feeding it free-text user input would therefore let a
 * client probe for providers who were never published.
 */
export async function resolveProviderDbId(provider: {
  dbId?: string;
  displayName: string;
}): Promise<string | null> {
  if (provider.dbId) return provider.dbId;
  try {
    return await getProviderIdByDisplayName(provider.displayName);
  } catch {
    return null;
  }
}
