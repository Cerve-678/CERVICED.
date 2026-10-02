// Shared builders for capability results.
//
// Centralised so every capability produces the same suggestion shape and the
// same currency formatting. The £ formatting in particular is not incidental:
// the previous implementation hardcoded `$` in a £ app.

import type { ChatSuggestion } from "../types";
import type { Provider } from "../../ProviderDataService";
import type { DbProvider } from "../../../types/database";
import { getProviderIdByDisplayName } from "../../databaseService";
import { resolveClientLocation } from "../../clientLocationService";
import { getDistanceKm } from "../../../utils/distance";

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

// ──────────────────────────────────────────────────────────────────────────
// Proximity
//
// "who's near me", "any good nail techs nearby", "see who is near me top
// rated" — a location clause is a MODIFIER on an existing question, not a
// question of its own, so it lives here rather than being duplicated into
// every capability that can return a list of people.

/**
 * A request to rank by distance.
 *
 * Deliberately excludes a bare "local" and a bare "close" — "a local salon"
 * reads the same way, but "close" alone collides with closing times and
 * closed days, which providers and clients both ask about.
 */
export const NEAR_ME_RE =
  /\b(?:near(?:est)? me|near me|nearby|near by|closest(?: to me)?|close to me|close by|around me|in my area|local to me|my area)\b/i;

export interface ProximityResult<T> {
  /** Nearest first when `ranked`; otherwise the input order, untouched. */
  providers: T[];
  /** Distance was actually applied. False means we don't know where they are. */
  ranked: boolean;
  /**
   * One clause naming what the ranking is based on, to be stated in the
   * answer. Never null when the user asked to be near something: saying
   * nothing would let a plain list pass as a proximity-sorted one.
   */
  note: string;
}

/**
 * Ranks providers by how far they are from the client.
 *
 * Honest by construction, because there are three different answers here and
 * only one of them is "sorted by where you are":
 *
 *   • GPS         — a real position, so a real ranking.
 *   • saved city  — a centroid. Useful, and NOT where the client is standing,
 *                   so the reply says which city it used.
 *   • unknown     — permission refused or nothing saved. The list is returned
 *                   unranked and the reply says so, rather than presenting an
 *                   arbitrary order as "nearest".
 *
 * Providers with no geocoded position are kept, at the end. Dropping them
 * would silently hide live providers from a search that never promised to
 * exclude anyone — an empty-looking result the client cannot explain.
 */
export async function sortByProximity<
  T extends { latitude: number | null; longitude: number | null },
>(providers: T[]): Promise<ProximityResult<T>> {
  const location = await resolveClientLocation();
  const here = location.coords;

  if (!here) {
    return {
      providers,
      ranked: false,
      // Names where the city actually gets set: the location picker on Home
      // (HomeScreen's LocationModal, which writes STORAGE_KEYS.MANUAL_LOCATION
      // — the same value this resolver reads back). Not "in your profile":
      // there is no such control there, and sending someone to look for one
      // is worse than not offering a fix at all.
      note:
        "I don't know where you are yet — turn on location access, or pick your area from the location button on Home, and I can sort by distance.",
    };
  }

  const withDistance = providers
    .map((p) => ({
      p,
      km:
        p.latitude != null && p.longitude != null
          ? getDistanceKm(here.latitude, here.longitude, p.latitude, p.longitude)
          : null,
    }))
    // A provider with no position sorts last rather than being excluded.
    .sort((a, b) => {
      if (a.km == null) return b.km == null ? 0 : 1;
      if (b.km == null) return -1;
      return a.km - b.km;
    });

  return {
    providers: withDistance.map((entry) => entry.p),
    ranked: true,
    note:
      location.source === "saved-city" && location.cityLabel
        ? `Sorted by distance from **${location.cityLabel}**, the city on your profile.`
        : location.isCoarse
          ? "Sorted by distance, though your location is only approximate right now."
          : "Sorted by distance from you.",
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
