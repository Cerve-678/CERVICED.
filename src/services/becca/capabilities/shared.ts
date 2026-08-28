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
// The deterministic path leads with the answer, not a canned opener.
//
// `goodNews()` and `softMiss()` used to live here and were called at 35 sites
// across client.ts, but both had been reduced to `return ""` — so every
// template began with an empty interpolation and a stray space, and the code
// read as though a voice system existed when none did. They were deleted
// 2026-08-18 and their call sites inlined to lead with the real first word.
// Conversational warmth belongs to the AI presentation layer, not to a
// constant prefix on every reply.

/**
 * A small pill in a wrapped row — short, category-style choices.
 * Sends `message` back to Becca as if the user typed it.
 */
export function chip(id: string, text: string, message: string): ChatSuggestion {
  return { id, text, action: "message", data: { message }, display: "chip" };
}

/** A full-width action card that asks Becca a follow-up question. */
export function askChip(
  id: string,
  text: string,
  message: string,
  selection?: { bookingId?: string },
): ChatSuggestion {
  return {
    id,
    text,
    action: "message",
    data: { message, ...(selection?.bookingId ? { bookingId: selection.bookingId } : {}) },
    display: "action",
  };
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
export function providerFromDb(
  p: Pick<
    DbProvider,
    'slug' | 'display_name' | 'service_category' | 'logo_url' | 'location_text'
  >,
): Provider {
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
