// Turns fragments of a message into real app objects.
//
// This is what Becca fundamentally lacked: she could match the WORD "nails"
// but couldn't resolve "Lola" to a provider, "my nail appointment" to a
// specific booking row, or "next Tuesday" to a date. Every resolver here
// returns a confidence score, and ambiguity (two equally-good matches) is a
// real result the engine asks about rather than silently picking a winner.

import type { ConfirmedBooking } from "../../types/booking";
import { BookingStatus } from "../../types/booking";
import { dateToYMD, formatShortDate, DAY_NAMES_FULL } from "../../utils/dateUtils";
import { searchProviders, getBookmarkedProviders } from "../databaseService";
import type {
  AmbiguousEntity,
  DateRef,
  EntityBag,
  MoneyRef,
  ProviderRef,
  ResolvedEntity,
  ServiceRef,
  TimeOfDayRef,
} from "./types";
import { SERVICE_CATALOGUE } from "./serviceCatalogue";

// ==================== SERVICE ====================

/**
 * Words naming WHO a service is for, rather than what it is.
 *
 * These override longest-keyword matching because they reframe the entire
 * request: "my son needs a haircut" is a KIDS booking, but "haircut" (7 chars)
 * is longer than "my son" (6), so pure longest-match resolved it to HAIR and
 * sent a parent to adult salon stylists. Audience is a different axis from
 * service type, so it can't be settled by comparing keyword lengths on one
 * scale — it has to win outright.
 *
 * Deliberately narrow: only unambiguous audience phrases. A bare "kid" or
 * "men" is already in the catalogue as an ordinary keyword and still resolves
 * normally when nothing else matches.
 */
const AUDIENCE_OVERRIDES: { pattern: RegExp; category: string }[] = [
  { pattern: /\b(?:my (?:son|daughter|kid|child|little one)|for (?:my )?(?:kids?|children|a child)|toddler|childrens?|children's)\b/i, category: "KIDS" },
  { pattern: /\b(?:my (?:husband|boyfriend|partner|son)'?s? (?:hair|cut|beard)|for (?:my )?(?:husband|boyfriend)|mens?|men's|for men)\b/i, category: "MALE" },
];

/**
 * Longest keyword wins, so "gel manicure" beats a bare "manicure" and
 * resolves to the specific service rather than only the category. The old
 * implementation returned on first match in object order, which made results
 * depend on declaration order rather than specificity.
 *
 * An audience phrase (see above) overrides the category that longest-match
 * picked, while keeping the specific service when it belongs to that audience.
 */
export function resolveService(
  message: string,
): ResolvedEntity<"service", ServiceRef> | undefined {
  const lower = message.toLowerCase();
  let best: { kw: string; cat: string; specific?: string } | null = null;

  for (const [category, entries] of Object.entries(SERVICE_CATALOGUE)) {
    for (const entry of entries) {
      for (const kw of entry.keywords) {
        if (!containsPhrase(lower, kw)) continue;
        if (!best || kw.length > best.kw.length) {
          best = { kw, cat: category, ...(entry.specific ? { specific: entry.specific } : {}) };
        }
      }
    }
  }

  // "my son needs a haircut" — the audience decides the category, not the
  // longest service word. Applied after matching so a message with no service
  // word at all ("something for my son") still resolves to the category.
  const audience = AUDIENCE_OVERRIDES.find((a) => a.pattern.test(lower));
  if (audience && best?.cat !== audience.category) {
    // The specific service was matched under a DIFFERENT category ("haircut"
    // under HAIR), so it doesn't describe anything in the audience's own list.
    // Keep the category only — "kids haircut" is the honest resolution, and
    // claiming a specific that isn't in that category would search for a
    // service row that can't exist.
    best = { kw: audience.category.toLowerCase(), cat: audience.category };
  }

  if (!best) return undefined;

  const value: ServiceRef = best.specific
    ? { category: best.cat, specific: best.specific }
    : { category: best.cat };

  return {
    kind: "service",
    value,
    // A specific service named outright is a stronger signal than a bare
    // category word, which often appears incidentally ("my nails are a mess").
    confidence: best.specific ? 0.95 : 0.75,
    sourceText: best.kw,
    label: best.specific ?? best.cat.toLowerCase(),
  };
}

// ==================== MONEY (£, not $) ====================

/**
 * The old parser hardcoded `$` in both parsing and output, in a £ app.
 * Accepts £ or a bare number; "$" is tolerated on input only because people
 * type it out of habit — Becca always REPLIES in £.
 */
export function resolveMoney(
  message: string,
): ResolvedEntity<"money", MoneyRef> | undefined {
  const lower = message.toLowerCase();
  const cur = "[£$]?";

  const between = lower.match(
    new RegExp(`between\\s*${cur}(\\d+)\\s*(?:and|-|to)\\s*${cur}(\\d+)`),
  );
  if (between?.[1] && between[2]) {
    return money(
      { min: +between[1], max: +between[2] },
      between[0],
      `£${between[1]}–£${between[2]}`,
    );
  }

  const range = lower.match(new RegExp(`${cur}(\\d+)\\s*-\\s*${cur}(\\d+)`));
  if (range?.[1] && range[2]) {
    return money({ min: +range[1], max: +range[2] }, range[0], `£${range[1]}–£${range[2]}`);
  }

  const under = lower.match(
    new RegExp(`(?:under|below|less than|cheaper than|max|up to)\\s*${cur}(\\d+)`),
  );
  if (under?.[1]) return money({ max: +under[1] }, under[0], `under £${under[1]}`);

  const over = lower.match(
    new RegExp(`(?:over|above|more than|at least|from)\\s*${cur}(\\d+)`),
  );
  if (over?.[1]) return money({ min: +over[1] }, over[0], `over £${over[1]}`);

  // "around £40" → a ±25% band. People rarely mean exactly 40.
  const around = lower.match(new RegExp(`(?:around|about|roughly|~)\\s*${cur}(\\d+)`));
  if (around?.[1]) {
    const n = +around[1];
    return money(
      { min: Math.floor(n * 0.75), max: Math.ceil(n * 1.25) },
      around[0],
      `around £${n}`,
    );
  }

  return undefined;
}

function money(
  value: MoneyRef,
  sourceText: string,
  label: string,
): ResolvedEntity<"money", MoneyRef> {
  return { kind: "money", value, confidence: 0.9, sourceText, label };
}

// ==================== DATE ====================

/**
 * Resolves relative day language to a concrete YYYY-MM-DD range.
 *
 * `now` is injected rather than read from the clock so this is testable and
 * so a capability can't accidentally disagree with the engine about "today".
 * Ranges (weekend, "this week") carry an endYmd; single days repeat `ymd`.
 */
export function resolveDate(
  message: string,
  now: Date,
): ResolvedEntity<"date", DateRef> | undefined {
  const lower = message.toLowerCase();
  const day = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return d;
  };
  const single = (d: Date, label: string, src: string, conf = 0.95) =>
    dateEntity(dateToYMD(d), dateToYMD(d), label, src, conf);

  if (containsPhrase(lower, "today")) return single(now, "today", "today");
  if (containsPhrase(lower, "tomorrow")) return single(day(1), "tomorrow", "tomorrow");
  if (containsPhrase(lower, "tonight")) return single(now, "tonight", "tonight");

  // Weekend = upcoming Sat–Sun. On a Sunday, "this weekend" means today.
  if (containsPhrase(lower, "weekend")) {
    const dow = now.getDay();
    const sat = day(dow === 0 ? 0 : 6 - dow);
    const sun = day(dow === 0 ? 0 : 7 - dow);
    return dateEntity(
      dateToYMD(sat),
      dateToYMD(sun),
      "this weekend",
      "weekend",
      0.85,
    );
  }

  // Named weekday, optionally prefixed with this/next.
  for (let i = 0; i < DAY_NAMES_FULL.length; i++) {
    const name = (DAY_NAMES_FULL[i] ?? "").toLowerCase();
    if (!name || !containsPhrase(lower, name)) continue;

    const isNext = new RegExp(`next\\s+${name}`).test(lower);
    let delta = (i - now.getDay() + 7) % 7;
    // Bare weekday name meaning today is almost always the NEXT one.
    if (delta === 0) delta = 7;
    if (isNext && delta <= 7) delta += 7;

    return single(day(delta), isNext ? `next ${name}` : name, name, 0.85);
  }

  if (containsPhrase(lower, "this week")) {
    return dateEntity(dateToYMD(now), dateToYMD(day(6 - now.getDay())), "this week", "this week", 0.8);
  }
  if (containsPhrase(lower, "next week")) {
    const start = day(7 - now.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return dateEntity(dateToYMD(start), dateToYMD(end), "next week", "next week", 0.8);
  }

  return undefined;
}

function dateEntity(
  ymd: string,
  endYmd: string,
  label: string,
  sourceText: string,
  confidence: number,
): ResolvedEntity<"date", DateRef> {
  return {
    kind: "date",
    value: { ymd, endYmd, label },
    confidence,
    sourceText,
    label,
  };
}

// ==================== TIME OF DAY ====================

export function resolveTimeOfDay(
  message: string,
): ResolvedEntity<"timeOfDay", TimeOfDayRef> | undefined {
  const lower = message.toLowerCase();
  const bands: Record<TimeOfDayRef["band"], [number, number]> = {
    morning: [6, 12],
    afternoon: [12, 17],
    evening: [17, 22],
  };
  for (const [band, [startHour, endHour]] of Object.entries(bands)) {
    if (containsPhrase(lower, band)) {
      return {
        kind: "timeOfDay",
        value: { band: band as TimeOfDayRef["band"], startHour, endHour },
        confidence: 0.9,
        sourceText: band,
        label: band,
      };
    }
  }
  return undefined;
}

// ==================== BOOKING ====================

/**
 * Resolves "my nail appointment", "Friday's booking", "the one with Lola"
 * against bookings already in memory (no refetch).
 *
 * Returns candidates when several match equally well — the engine turns that
 * into a "which one?" question instead of guessing. Scoping to UPCOMING by
 * default is deliberate: "my nail appointment" almost always means the one
 * that hasn't happened yet.
 */
export function resolveBooking(
  message: string,
  bookings: ConfirmedBooking[],
  now: Date,
  hints: { service?: ServiceRef; date?: DateRef; providerName?: string },
): {
  resolved?: ResolvedEntity<"booking", ConfirmedBooking>;
  ambiguous?: AmbiguousEntity<"booking">;
} {
  const lower = message.toLowerCase();
  const upcoming = bookings
    .filter((b) => b.status === BookingStatus.UPCOMING)
    .sort((a, b) =>
      a.bookingDate === b.bookingDate
        ? a.bookingTime.localeCompare(b.bookingTime)
        : a.bookingDate.localeCompare(b.bookingDate),
    );
  if (upcoming.length === 0) return {};

  const scored = upcoming
    .map((b) => {
      let score = 0;
      if (hints.providerName && b.providerName.toLowerCase().includes(hints.providerName.toLowerCase())) {
        score += 0.5;
      }
      if (hints.service) {
        const hay = `${b.serviceName} ${b.providerService}`.toLowerCase();
        if (hints.service.specific && hay.includes(hints.service.specific.toLowerCase())) score += 0.45;
        else if (hay.includes(hints.service.category.toLowerCase())) score += 0.3;
      }
      if (hints.date && b.bookingDate >= hints.date.ymd && b.bookingDate <= hints.date.endYmd) {
        score += 0.4;
      }
      if (containsPhrase(lower, b.providerName.toLowerCase())) score += 0.5;
      return { booking: b, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const label = (b: ConfirmedBooking) =>
    `${b.serviceName} with ${b.providerName}, ${formatShortDate(b.bookingDate)}`;

  // "Next" is a real distinguishing instruction: the upcoming list is
  // chronological, so "my next appointment" always means its first record.
  // Only genuinely generic booking references need a chooser with several.
  if (scored.length === 0) {
    const next = /\bnext\b.*\b(booking|appointment|appt)\b|\b(booking|appointment|appt)\b.*\bnext\b/.test(lower);
    if (next) {
      const first = upcoming[0]!;
      return {
        resolved: {
          kind: "booking",
          value: first,
          confidence: 0.95,
          sourceText: "your next appointment",
          label: label(first),
        },
      };
    }

    const generic = /\b(my|next|upcoming|the)\b.*\b(booking|appointment|appt)\b/.test(lower);
    if (!generic) return {};

    const only = upcoming[0]!;
    if (upcoming.length === 1) {
      return {
        resolved: {
          kind: "booking",
          value: only,
          confidence: 0.9,
          sourceText: "your booking",
          label: label(only),
        },
      };
    }

    return {
      ambiguous: {
        kind: "booking",
        sourceText: message,
        candidates: upcoming.slice(0, 4).map((b) => ({
          kind: "booking" as const,
          value: b,
          confidence: 0.4,
          sourceText: message,
          label: label(b),
        })),
      },
    };
  }

  const top = scored[0]!;
  const rivals = scored.filter((s) => s.score >= top.score - 0.05);

  // A near-tie is genuine ambiguity — ask rather than pick.
  if (rivals.length > 1) {
    return {
      ambiguous: {
        kind: "booking",
        sourceText: message,
        candidates: rivals.slice(0, 4).map((r) => ({
          kind: "booking" as const,
          value: r.booking,
          confidence: r.score,
          sourceText: message,
          label: label(r.booking),
        })),
      },
    };
  }

  return {
    resolved: {
      kind: "booking",
      value: top.booking,
      confidence: Math.min(0.95, 0.55 + top.score),
      sourceText: message,
      label: label(top.booking),
    },
  };
}

// ==================== PROVIDER ====================

/**
 * Resolves a provider by name, or "my usual" / "the one I saw last".
 *
 * Goes through databaseService (never Supabase directly) so `has_gone_live`
 * gating stays server-enforced — searchProviders already applies it.
 */
export async function resolveProvider(
  message: string,
  bookings: ConfirmedBooking[],
): Promise<{
  resolved?: ResolvedEntity<"provider", ProviderRef>;
  ambiguous?: AmbiguousEntity<"provider">;
}> {
  const lower = message.toLowerCase();

  // "my usual" / "my regular" → most-booked provider in history.
  if (/\b(my usual|my regular|the usual|my go[- ]?to)\b/.test(lower)) {
    const counts = new Map<string, number>();
    for (const b of bookings) {
      counts.set(b.providerName, (counts.get(b.providerName) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const match = await lookupProviderByName(top[0]);
      if (match) {
        return {
          resolved: { ...match, confidence: 0.8, sourceText: "my usual", label: top[0] },
        };
      }
    }
    // Fall through: bookmarks are the next-best read of "my usual".
    try {
      const marks = await getBookmarkedProviders();
      const first = marks[0];
      if (marks.length === 1 && first) {
        return {
          resolved: {
            kind: "provider",
            value: { slug: first.slug, dbId: first.id, displayName: first.display_name },
            confidence: 0.7,
            sourceText: "my usual",
            label: first.display_name,
          },
        };
      }
    } catch {
      // Bookmarks are a nicety here; failing to read them shouldn't break
      // provider resolution overall.
    }
  }

  // Names already known from booking history — cheapest and most reliable.
  for (const b of bookings) {
    if (containsPhrase(lower, b.providerName.toLowerCase())) {
      const match = await lookupProviderByName(b.providerName);
      if (match) {
        return {
          resolved: { ...match, confidence: 0.9, sourceText: b.providerName, label: b.providerName },
        };
      }
    }
  }

  // Otherwise try a name search on capitalised words, skipping the sentence
  // opener so "Find Lola" doesn't search for "Find".
  const candidates = (message.match(/\b[A-Z][a-zA-Z'’&]{2,}\b/g) ?? []).filter(
    (w) => !SENTENCE_OPENERS.has(w.toLowerCase()),
  );
  for (const cand of candidates) {
    try {
      const rows = await searchProviders(cand);
      if (rows.length === 1 && rows[0]) {
        const r = rows[0];
        return {
          resolved: {
            kind: "provider",
            value: { slug: r.slug, dbId: r.id, displayName: r.display_name },
            confidence: 0.85,
            sourceText: cand,
            label: r.display_name,
          },
        };
      }
      if (rows.length > 1) {
        return {
          ambiguous: {
            kind: "provider",
            sourceText: cand,
            candidates: rows.slice(0, 4).map((r) => ({
              kind: "provider" as const,
              value: { slug: r.slug, dbId: r.id, displayName: r.display_name },
              confidence: 0.5,
              sourceText: cand,
              label: r.display_name,
            })),
          },
        };
      }
    } catch {
      // A failed name lookup just means "couldn't resolve a provider" — the
      // capability layer decides how to degrade, per the databaseService
      // contract that callers own degradation.
    }
  }

  return {};
}

async function lookupProviderByName(
  name: string,
): Promise<Omit<ResolvedEntity<"provider", ProviderRef>, "confidence" | "sourceText" | "label"> | null> {
  try {
    const rows = await searchProviders(name);
    const exact = rows.find(
      (r) => r.display_name.toLowerCase() === name.toLowerCase(),
    ) ?? rows[0];
    if (!exact) return null;
    return {
      kind: "provider",
      value: { slug: exact.slug, dbId: exact.id, displayName: exact.display_name },
    };
  } catch {
    return null;
  }
}

const SENTENCE_OPENERS = new Set([
  "find", "show", "book", "cancel", "when", "what", "where", "who", "how",
  "can", "could", "would", "i", "my", "is", "are", "do", "does", "the",
  "hi", "hey", "hello", "becca", "please", "help", "any", "give", "tell",
]);

// ==================== ORCHESTRATION ====================

/** Resolves every entity in one message. Ordering matters: service/date/provider feed booking resolution. */
export async function resolveEntities(
  message: string,
  bookings: ConfirmedBooking[],
  now: Date,
): Promise<EntityBag> {
  const service = resolveService(message);
  const date = resolveDate(message, now);
  const money = resolveMoney(message);
  const timeOfDay = resolveTimeOfDay(message);

  // Provider hits the network; everything above is pure. Run it once and
  // reuse the result for booking disambiguation.
  const providerResult = await resolveProvider(message, bookings);

  const bookingResult = resolveBooking(message, bookings, now, {
    ...(service ? { service: service.value } : {}),
    ...(date ? { date: date.value } : {}),
    ...(providerResult.resolved
      ? { providerName: providerResult.resolved.value.displayName }
      : {}),
  });

  const ambiguous: AmbiguousEntity[] = [];
  if (providerResult.ambiguous) ambiguous.push(providerResult.ambiguous);
  if (bookingResult.ambiguous) ambiguous.push(bookingResult.ambiguous);

  return {
    ...(service ? { service } : {}),
    ...(date ? { date } : {}),
    ...(money ? { money } : {}),
    ...(timeOfDay ? { timeOfDay } : {}),
    ...(providerResult.resolved ? { provider: providerResult.resolved } : {}),
    ...(bookingResult.resolved ? { booking: bookingResult.resolved } : {}),
    ...(ambiguous.length > 0 ? { ambiguous } : {}),
  };
}

// ==================== SHARED ====================

/**
 * Word-boundary-aware containment.
 *
 * Plain `.includes()` matched "mani" inside "manicure" and, worse, "tint"
 * inside "maintenance" — the kind of silent mismatch that made the old
 * matcher unpredictable. Multi-word phrases still match as a unit.
 */
export function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}
