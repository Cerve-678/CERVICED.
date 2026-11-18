// Database access: Provider listings, profiles and the personalised home feed.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { overridesFromDate } from "../../utils/dateUtils";
import { supabase } from "../../lib/supabase";
import type { DbProvider, DbProviderAvailability, DbProviderAvailabilityOverride, DbProviderAvailabilityWindow, DbProviderBlockedDate, LogoFraming, ProviderBookingMode, ProviderWithServices, PublicProviderSummary } from "../../types/database";
import { logger } from "../../utils/logger";
import { parseSearchQuery } from "../../utils/searchQuery";
import { BoundedTtlCache } from "../../utils/boundedTtlCache";
import { isProviderProfileUuid } from "../../utils/providerProfileDeepLink";
import { isReleaseTime } from "../../utils/bookingHorizon";
import { getSessionUser, sanitizeIlikeTerm } from "./account";
import { getUserBasicInfo } from "./users";

// ─────────────────────────────────────────────────────────
// PHASE 5.4 — PERSONALISED HOME FEED
// ─────────────────────────────────────────────────────────

/** Providers who joined in the last 30 days — "New on CERVICED" section */
export const PUBLIC_PROVIDER_SUMMARY_SELECT =
  "id, slug, display_name, service_category, service_categories, logo_url, logo_framing, location_text, service_locations, latitude, longitude, rating, review_count, price_tier, price_bands, business_type, walk_ins_welcome, group_bookings_available, vegan_cruelty_free, is_featured, created_at, booking_mode";

export async function getNewProviders(limit = 10): Promise<PublicProviderSummary[]> {
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("providers")
    .select(PUBLIC_PROVIDER_SUMMARY_SELECT)
    .eq("has_gone_live", true)
    .eq("is_active", true)
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicProviderSummary[];
}

/** Top-rated providers — "Top Rated" section (≥3 reviews, rating ≥4.0) */
export async function getTopRatedProviders(limit = 10): Promise<PublicProviderSummary[]> {
  const { data, error } = await supabase
    .from("providers")
    .select(PUBLIC_PROVIDER_SUMMARY_SELECT)
    .eq("has_gone_live", true)
    .eq("is_active", true)
    .gte("review_count", 3)
    .gte("rating", 4.0)
    .order("rating", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicProviderSummary[];
}

/** Providers with the most bookings in the last 7 days — "Trending This Week".
 *  Ranking comes from the get_trending_providers() RPC, which is SECURITY
 *  DEFINER because it aggregates booking counts across every provider's
 *  bookings, and the owner-scoped RLS on `bookings` would otherwise restrict
 *  that per-caller. The RPC returns ids only, so rows are hydrated here in a
 *  single batched query and re-sorted back into the RPC's ranking order
 *  (a `.in()` filter does not preserve the order of the ids passed to it). */
export async function getTrendingProviders(limit = 10): Promise<PublicProviderSummary[]> {
  const { data: ranked, error: rankError } = await supabase.rpc(
    "get_trending_providers",
    { p_limit: limit },
  );
  if (rankError) throw new Error(rankError.message);

  const rankedIds: string[] = (ranked ?? []).map(
    (r: { provider_id: string }) => r.provider_id,
  );
  if (rankedIds.length === 0) return [];

  const { data, error } = await supabase
    .from("providers")
    .select(PUBLIC_PROVIDER_SUMMARY_SELECT)
    .in("id", rankedIds)
    .eq("has_gone_live", true)
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  const byId = new Map<string, PublicProviderSummary>(
    ((data ?? []) as PublicProviderSummary[]).map((p) => [p.id, p]),
  );
  return rankedIds
    .map((id: string) => byId.get(id))
    .filter((p): p is PublicProviderSummary => p !== undefined);
}

// ─────────────────────────────────────────────────────────
// PROVIDERS
// ─────────────────────────────────────────────────────────

// Generous safety-net cap — current provider counts are nowhere near this,
// so it changes nothing today, but keeps these queries from scanning/
// returning the entire table unbounded as the provider base grows.
export const DEFAULT_PROVIDER_QUERY_LIMIT = 200;
export const LIVE_SERVICE_DESCRIPTIONS_QUERY_LIMIT = 2000;
export const SPECIALITY_USES_QUERY_LIMIT = 2000;

// Same rationale, applied to a single provider's review list — no realistic
// profile needs to render more than this at once.
export const DEFAULT_REVIEWS_QUERY_LIMIT = 200;

// Safety-net cap for a single provider's lifetime booking history (Analytics'
// "All" range, MoM comparison, and 6-month chart all need full history, not
// the windowed default — but "full history" still needs a ceiling so a
// long-tenured, high-volume provider can't turn this into an unbounded scan).
export const DEFAULT_LIFETIME_BOOKINGS_QUERY_LIMIT = 2000;

/** Fetch all active providers, optionally filtered by service category */
export async function getProviders(
  category?: string,
  limit = DEFAULT_PROVIDER_QUERY_LIMIT,
  offset = 0,
): Promise<PublicProviderSummary[]> {
  let query = supabase
    .from("providers")
    .select(PUBLIC_PROVIDER_SUMMARY_SELECT)
    .eq("is_active", true)
    .eq("has_gone_live", true)
    // Unlike Explore's recommendation feed,
    // this is a plain browse/list, not a recommendation — a provider's own
    // business is allowed to appear here (see ownProviderIdExclusion).
    .order("is_featured", { ascending: false })
    .order("rating", { ascending: false });

  if (category && category !== "ALL") {
    // ANY of the provider's declared types, not just the headline one — a
    // lashes-and-brows business must appear under BROWS too. GIN-indexed
    // (providers_service_categories_gin), so this stays an index scan.
    query = query.overlaps("service_categories", [category]);
  }

  // Preserve the normal first-page request shape; only Home's deferred
  // catalogue extension needs a range after the first batch.
  query = offset > 0
    ? query.range(offset, offset + limit - 1)
    : query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Min/max active-service price per provider, batched into a single `.in()`
 * query rather than one query per provider — used by Becca's price-range
 * filtering (see `src/services/becca/`), which previously had no price data
 * to filter on at all and was a documented no-op. `DbProvider` itself
 * carries no price field (a provider can offer
 * many services at different prices), so this is intentionally a separate
 * lookup rather than something folded into getProviders().
 */
export async function getProviderPriceRanges(
  providerIds: string[],
): Promise<Map<string, { min: number; max: number }>> {
  const ranges = new Map<string, { min: number; max: number }>();
  if (providerIds.length === 0) return ranges;

  // Gated on the parent provider's own has_gone_live/is_active here (not
  // just left as an app-side convention every caller has to remember to
  // pre-filter for) — every caller so far happens to pass already-gated ids,
  // but that's a fragile, blind-trust shape (the exact pattern that caused
  // the users_public_profile_read PII leak; see security-audit-2026-08-02 in
  // auto-memory). providers!inner(...) + the .eq below mirrors the
  // provider-visibility-gating convention used elsewhere in this file.
  const { data, error } = await supabase
    .from("services")
    .select(
      "provider_id, price, price_max, providers!inner(has_gone_live, is_active)",
    )
    .eq("is_active", true)
    .eq("providers.has_gone_live", true)
    .eq("providers.is_active", true)
    .in("provider_id", providerIds);
  if (error) throw error;

  for (const row of data ?? []) {
    const high = row.price_max ?? row.price;
    const existing = ranges.get(row.provider_id);
    if (!existing) {
      ranges.set(row.provider_id, { min: row.price, max: high });
    } else {
      existing.min = Math.min(existing.min, row.price);
      existing.max = Math.max(existing.max, high);
    }
  }
  return ranges;
}

export interface FacetService {
  id: string;
  price: number | null;
  priceMax: number | null;
  audience: string | null;
  skinTones: string[];
}

export interface ProviderServiceFacets {
  /** £min–£max across the provider's active services. Absent when they have
   *  none priced. */
  priceRanges: Map<string, { min: number; max: number }>;
  /** Each provider's active services, one row per service, for the filters
   *  that must be judged on a single service (price, audience, skin tone —
   *  see src/utils/serviceFilterMatch.ts). Per-provider aggregates of those
   *  columns can't answer "does ONE service satisfy all of them", which is
   *  what let a provider pass "<£30" and "Women" on two different services. */
  services: Map<string, FacetService[]>;
  /** Free-text "speciality" haystack per provider, for the client Speciality
   *  filter's fuzzy match (src/utils/fuzzyMatch.ts). Unions three sources that
   *  each name what a provider is known for: their chosen business
   *  specialities (`provider_specialties`), every tag on their active services
   *  (`tags`/`technique_tags`/`outcome_tags`/`occasion_tags`/`trend_names`),
   *  and the service names themselves. The filter matches its chosen label
   *  against this set, so casing/spacing/spelling need not agree across the
   *  three. Absent means nothing to match. */
  specialityText: Map<string, Set<string>>;
  /** The same as specialityText minus service names: just the business
   *  specialities and service tags. What the Speciality filter may OFFER as
   *  extra options. A service name ("Knotless braids — medium") is fine to
   *  match against but reads as noise as a filter option. */
  specialityLabels: Map<string, Set<string>>;
  /** Just the business specialities the provider chose
   *  (`provider_specialties`), no service tags or names, in the order read.
   *  What the Search card underlines under the provider's name. */
  specialities: Map<string, string[]>;
}

/**
 * Price range, per-service filter data and speciality text for a set of
 * providers, in ONE services scan (plus the provider_specialties read beside it).
 *
 * getProviderPriceRanges and the former getProviderAudienceMatches asked the same table,
 * over the same provider ids, behind the same has_gone_live/is_active gate —
 * they differ only in which column they read. Search ran both, so a search
 * with the audience filter on paid two round trips for one table scan. Callers
 * that need both should use this; the two single-purpose functions remain for
 * callers that genuinely need only one.
 *
 * Returning the raw per-service rows rather than a pre-filtered match set is
 * deliberate: it lets a caller re-answer "does one of this provider's services
 * fit £30–£60 for men?" for any combination without going back to the network,
 * which is what makes toggling those filters free rather than another round trip.
 */
export async function getProviderServiceFacets(
  providerIds: string[],
): Promise<ProviderServiceFacets> {
  const priceRanges = new Map<string, { min: number; max: number }>();
  const services = new Map<string, FacetService[]>();
  const specialityText = new Map<string, Set<string>>();
  const specialityLabels = new Map<string, Set<string>>();
  const specialities = new Map<string, string[]>();
  if (providerIds.length === 0) {
    return { priceRanges, services, specialityText, specialityLabels, specialities };
  }

  const addTo = (map: Map<string, Set<string>>, providerId: string, value: string) => {
    const set = map.get(providerId) ?? new Set<string>();
    set.add(value);
    map.set(providerId, set);
  };
  // Matchable only (service names).
  const addSpeciality = (providerId: string, value: string | null | undefined) => {
    if (!value) return;
    addTo(specialityText, providerId, value);
  };
  // Matchable AND offerable as a filter option (specialities, tags).
  const addSpecialityLabel = (providerId: string, value: string | null | undefined) => {
    if (!value) return;
    addTo(specialityText, providerId, value);
    addTo(specialityLabels, providerId, value);
  };

  // The services scan and the provider_specialties scan are independent reads
  // over the same already-visibility-gated id set — run them together rather
  // than one after the other (see the Scalability "no sequential awaits" rule).
  // Both carry the same has_gone_live/is_active gate as the price/audience
  // functions this consolidates: the ids passed in are already the current
  // result set, but re-gating here keeps a hidden provider's data out even if a
  // caller ever passes an unfiltered id.
  const [servicesRes, specialtiesRes] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, provider_id, price, price_max, audience, skin_tones_suitable, name, tags, technique_tags, outcome_tags, occasion_tags, trend_names, providers!inner(has_gone_live, is_active)",
      )
      .eq("is_active", true)
      .eq("providers.has_gone_live", true)
      .eq("providers.is_active", true)
      .in("provider_id", providerIds),
    supabase
      .from("provider_specialties")
      .select("provider_id, specialty, providers!inner(has_gone_live, is_active)")
      .eq("providers.has_gone_live", true)
      .eq("providers.is_active", true)
      .in("provider_id", providerIds),
  ]);
  if (servicesRes.error) throw servicesRes.error;
  if (specialtiesRes.error) throw specialtiesRes.error;

  for (const row of servicesRes.data ?? []) {
    const providerId = row.provider_id as string;

    // A service with no price at all contributes an audience tag but must not
    // drag the range down to 0 — price is NOT NULL in practice, but a null
    // here would otherwise read as "free".
    if (row.price != null) {
      const high = row.price_max ?? row.price;
      const existing = priceRanges.get(providerId);
      if (!existing) {
        priceRanges.set(providerId, { min: row.price, max: high });
      } else {
        existing.min = Math.min(existing.min, row.price);
        existing.max = Math.max(existing.max, high);
      }
    }

    const own = services.get(providerId) ?? [];
    own.push({
      id: row.id as string,
      price: (row.price as number | null) ?? null,
      priceMax: (row.price_max as number | null) ?? null,
      audience: (row.audience as string | null) ?? null,
      skinTones: (row.skin_tones_suitable as string[] | null) ?? [],
    });
    services.set(providerId, own);

    // The service name plus every tag column feed the Speciality haystack.
    addSpeciality(providerId, row.name as string | null);
    for (const tag of [
      ...(row.tags ?? []),
      ...(row.technique_tags ?? []),
      ...(row.outcome_tags ?? []),
      ...(row.occasion_tags ?? []),
      ...(row.trend_names ?? []),
    ]) {
      addSpecialityLabel(providerId, tag as string);
    }
  }

  for (const row of specialtiesRes.data ?? []) {
    const providerId = row.provider_id as string;
    const specialty = (row.specialty as string | null)?.trim();
    addSpecialityLabel(providerId, specialty);
    if (!specialty) continue;
    const own = specialities.get(providerId) ?? [];
    if (!own.some(existing => existing.toLowerCase() === specialty.toLowerCase())) own.push(specialty);
    specialities.set(providerId, own);
  }

  return { priceRanges, services, specialityText, specialityLabels, specialities };
}

/** Coarse near-term availability status for a provider, as surfaced on
 *  search/browse cards. NOT a booking gate — the real slot simulation in
 *  AvailabilityService owns anything that actually reserves time. */
export type ProviderAvailabilityStatus = "available" | "limited" | "none";

export interface ProviderAvailabilityInfo {
  status: ProviderAvailabilityStatus;
  /** At least one ordinarily bookable slot in the corresponding UK date. */
  availableToday: boolean;
  availableTomorrow: boolean;
  availableThisWeek: boolean;
  /**
   * Whether the provider's providers.hair_types_catered matches the
   * requested hair type, per the same empty-means-all rule as
   * matchesHairType() (src/utils/hairTypeMatch.ts) — reproduced server-side
   * in the get_providers_availability() RPC itself now. `true` for every
   * provider when no hairType was passed to getProvidersAvailability.
   */
  hairMatch: boolean;
}

/**
 * Batched near-term availability (and, optionally, hair-type match) for a
 * set of providers, keyed by slug, in a single query via the
 * get_providers_availability() SECURITY DEFINER RPC.
 *
 * The search grid needs one at-a-glance status per card; computing it the
 * per-provider way (AvailabilityService.getAvailabilitySummary, 5+ queries
 * each) across a 200-provider result set would be a textbook N+1. The RPC
 * rolls the whole set into one query and is has_gone_live/is_active gated
 * server-side, returning only a coarse status string (no booking details).
 *
 * hairType folds in what used to be a separate provider-table lookup
 * (getProviderHairTypeMatches, removed) — same rows, same visibility gate,
 * this RPC already scans them. The trade-off: toggling the hair-type filter
 * alone (result set unchanged) now re-runs this heavier availability
 * computation instead of a cheap table read, in exchange for the common case
 * (a new search) never paying for both round trips separately.
 *
 * A slug missing from the returned map = not publicly listed (gated out) or
 * no schedule at all; callers should treat an absent entry as unknown and
 * degrade gracefully rather than as "no availability".
 */
export async function getProvidersAvailability(
  slugs: string[],
  hairType?: string,
): Promise<Map<string, ProviderAvailabilityInfo>> {
  const result = new Map<string, ProviderAvailabilityInfo>();
  if (slugs.length === 0) return result;

  const { data, error } = await supabase.rpc("get_providers_availability", {
    p_slugs: slugs,
    p_hair_type: hairType ?? null,
  });
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as {
    slug: string;
    status: ProviderAvailabilityStatus;
    hair_match: boolean;
    available_today: boolean;
    available_tomorrow: boolean;
    available_this_week: boolean;
  }[]) {
    result.set(row.slug, {
      status: row.status,
      hairMatch: row.hair_match,
      availableToday: row.available_today,
      availableTomorrow: row.available_tomorrow,
      availableThisWeek: row.available_this_week,
    });
  }
  return result;
}

/** One matching service from search_services_ranked — only fields the
 *  public provider profile already shows (no address, nothing private). */
export interface ServiceSearchResult {
  serviceId: string;
  providerId: string;
  providerSlug: string;
  providerName: string;
  providerLogoUrl: string | null;
  providerLocation: string | null;
  /** Books on their own page (booking_mode 'external') — no price shown. */
  isLinkOnly: boolean;
  name: string;
  description: string | null;
  menuHeading: string | null;
  category: string | null;
  price: number | null;
  priceMax: number | null;
  durationMinutes: number | null;
  rank: number;
}

export interface MarketplaceSearchResult {
  providers: PublicProviderSummary[];
  services: ServiceSearchResult[];
  /** The query as the server read it after fixing typos ("frsnch tip" →
   *  "french tip"); null when nothing needed correcting. */
  correctedQuery: string | null;
}

interface RankedServiceRow {
  service_id: string;
  provider_id: string;
  provider_slug: string;
  provider_name: string;
  provider_logo_url: string | null;
  provider_location: string | null;
  booking_mode: string | null;
  service_name: string;
  service_description: string | null;
  menu_heading: string | null;
  service_category: string | null;
  price: number | null;
  price_max: number | null;
  duration_minutes: number | null;
  rank: number;
  corrected_query: string | null;
}

/** Services listed for a typed search. The RPC also caps each provider at 3. */
const SERVICE_SEARCH_LIMIT = 60;

/**
 * Search providers AND individual services from a plain-English query — e.g.
 * "hairstylist in south london", "almond nails, nail art in east manchester"
 * or a misspelt "frsnch tip". Parses out a trailing "in/near/around <place>"
 * as a location filter and the remainder as one or more service terms (split
 * on commas/"and").
 *
 * Providers come from four lookups run together: service name/description
 * substring, provider name/about/location substring, a detected category
 * keyword (e.g. "hairstylist" → HAIR, since generic words like that rarely
 * appear verbatim in a service name), and search_services_ranked — which
 * rewrites the query into words live services actually use (typos, words
 * joined or split differently, half-typed words), matches service names,
 * menu headings, tags, category words AND descriptions, and widens with its
 * own synonym map ("gel nails" → BIAB). Its services are returned as well, in
 * rank order. Relevance is graded by supabase/tests/service_search_eval.sql. Optionally filtered by an explicit service category chip.
 */
export async function searchProvidersAndServices(
  query: string,
  category?: string,
  limit = DEFAULT_PROVIDER_QUERY_LIMIT,
): Promise<MarketplaceSearchResult> {
  const q = query.trim();
  if (!q) {
    return { providers: await getProviders(category, limit), services: [], correctedQuery: null };
  }
  const empty: MarketplaceSearchResult = { providers: [], services: [], correctedQuery: null };

  const parsed = parseSearchQuery(q);
  // Falls back to the whole query when no location preposition was found,
  // so a bare "south london" (no "in") still gets tried as free text below.
  const textTerms = (
    parsed.serviceTerms.length ? parsed.serviceTerms : (parsed.locationTerms.length ? parsed.locationTerms : [q])
  ).map(sanitizeIlikeTerm).filter(Boolean);
  const locationTerms = parsed.locationTerms.map(sanitizeIlikeTerm).filter(Boolean);
  if (!textTerms.length) return empty;

  const serviceOr = textTerms
    .map((t) => `name.ilike.%${t}%,description.ilike.%${t}%`)
    .join(",");
  // location_text is included here too (not just in the dedicated filter
  // below) so a query with no "in/near" preposition still matches on it.
  // A business name typed apart ("face by jen" for FacebyJen) only matches
  // with the spaces taken out.
  const compactTerms = textTerms
    .map((t) => t.replace(/\s+/g, ""))
    .filter((t, i) => t.length >= 5 && t !== textTerms[i]);
  const nameOr = [
    ...textTerms.map(
      (t) =>
        `display_name.ilike.%${t}%,about_text.ilike.%${t}%,location_text.ilike.%${t}%`,
    ),
    ...compactTerms.map((t) => `display_name.ilike.%${t}%`),
  ].join(",");

  // A detected category hint only broadens recall when the caller hasn't
  // already pinned a category via the chip filter — that's already narrower.
  const categoryHint =
    parsed.categoryHint && (!category || category === "ALL")
      ? parsed.categoryHint
      : null;

  // A location-only query ("near Manchester") has no service words to rank.
  const serviceText = parsed.serviceTerms.length ? parsed.serviceText : "";

  // None of these lookups depend on each other's result, so run them
  // together instead of waiting on one before starting the next.
  const [
    { data: serviceMatches, error: serviceError },
    { data: nameMatches, error: nameError },
    { data: categoryMatches, error: categoryError },
    { data: rankedServices, error: rankedError },
  ] = await Promise.all([
    // 1. Provider IDs where a service name or description matches
    supabase
      .from("services")
      .select("provider_id")
      .eq("is_active", true)
      .or(serviceOr)
      .limit(limit),
    // 2. Provider IDs where display_name, about_text, or location matches
    supabase
      .from("providers")
      .select("id")
      .eq("is_active", true)
      .or(nameOr)
      .limit(limit),
    // 3. Provider IDs in the detected category, if any
    categoryHint
      ? supabase
          .from("providers")
          .select("id")
          .eq("is_active", true)
          .overlaps("service_categories", [categoryHint])
          .limit(limit)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
    // 4. Ranked, typo-tolerant service matches (has_gone_live-gated in SQL)
    serviceText
      ? supabase.rpc("search_services_ranked", {
          p_query: serviceText,
          p_category: category && category !== "ALL" ? category : null,
          p_locations: locationTerms,
          p_limit: SERVICE_SEARCH_LIMIT,
          // "for £70" → only services at or under £70.
          p_max_price: parsed.maxPrice,
        })
      : Promise.resolve({ data: [] as RankedServiceRow[], error: null }),
  ]);

  if (serviceError || nameError || categoryError || rankedError) {
    throw serviceError || nameError || categoryError || rankedError;
  }

  const rankedRows = (rankedServices ?? []) as RankedServiceRow[];
  const services: ServiceSearchResult[] = rankedRows.map((r) => ({
    serviceId: r.service_id,
    providerId: r.provider_id,
    providerSlug: r.provider_slug,
    providerName: r.provider_name,
    providerLogoUrl: r.provider_logo_url,
    providerLocation: r.provider_location,
    isLinkOnly: r.booking_mode === "external",
    name: r.service_name,
    description: r.service_description,
    menuHeading: r.menu_heading,
    category: r.service_category,
    price: r.price,
    priceMax: r.price_max,
    durationMinutes: r.duration_minutes,
    rank: r.rank,
  }));
  const correctedQuery = rankedRows[0]?.corrected_query ?? null;

  const serviceIds = (serviceMatches ?? []).map(
    (r: { provider_id: string }) => r.provider_id,
  );
  const nameIds = (nameMatches ?? []).map((r: { id: string }) => r.id);
  const categoryIds = (categoryMatches ?? []).map((r: { id: string }) => r.id);
  // Rows arrive best-first, so the first rank seen per provider is its best.
  const bestServiceRank = new Map<string, number>();
  for (const s of services) {
    if (!bestServiceRank.has(s.providerId)) bestServiceRank.set(s.providerId, s.rank);
  }
  const allIds = [...new Set([...serviceIds, ...bestServiceRank.keys(), ...nameIds, ...categoryIds])];

  if (allIds.length === 0) return { ...empty, correctedQuery };

  // 5. Fetch those providers, applying the explicit location + category filters
  let providerQuery = supabase
    .from("providers")
    .select(PUBLIC_PROVIDER_SUMMARY_SELECT)
    .in("id", allIds)
    .eq("is_active", true)
    .eq("has_gone_live", true)
    // An explicit, typed search is not a recommendation — a provider's own
    // business is allowed to turn up when it actually matches the query
    // (see ownProviderIdExclusion).
    .order("is_featured", { ascending: false })
    .order("rating", { ascending: false })
    .limit(allIds.length);

  if (category && category !== "ALL") {
    providerQuery = providerQuery.overlaps("service_categories", [category]);
  }

  if (locationTerms.length) {
    providerQuery = providerQuery.or(
      locationTerms.map((t) => `location_text.ilike.%${t}%`).join(","),
    );
  }

  const { data, error } = await providerQuery;
  if (error) throw error;
  // Exact business names and matching services precede broad category recall.
  // Among service matches, the better-matching service ranks first; the
  // server's featured/rating order is the final tie-breaker.
  const serviceIdSet = new Set(serviceIds);
  const nameIdSet = new Set(nameIds);
  const normalizedQuery = parsed.serviceText.toLowerCase();
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const relevance = (provider: PublicProviderSummary): number => {
    const name = provider.display_name.toLowerCase();
    const compactName = name.replace(/\s+/g, "");
    if (normalizedQuery && (name === normalizedQuery || compactName === compactQuery)) return 4;
    if (normalizedQuery && (name.includes(normalizedQuery)
      || (compactQuery.length >= 5 && compactName.includes(compactQuery)))) return 3;
    const ranked = bestServiceRank.get(provider.id);
    if (ranked !== undefined) return 2 + Math.min(ranked, 1) * 0.5;
    if (serviceIdSet.has(provider.id)) return 2;
    if (nameIdSet.has(provider.id)) return 1;
    return 0;
  };
  // Location terms run most specific first ("hackney", then "London"), so
  // among equally relevant providers the one actually in the named place
  // comes before the rest of the city.
  const locationRank = (provider: PublicProviderSummary): number => {
    const where = (provider.location_text ?? "").toLowerCase();
    const at = locationTerms.findIndex((t) => where.includes(t.toLowerCase()));
    return at === -1 ? locationTerms.length : at;
  };
  const providers = ((data ?? []) as PublicProviderSummary[])
    .sort((a, b) => relevance(b) - relevance(a) || locationRank(a) - locationRank(b))
    .slice(0, limit);
  return { providers, services, correctedQuery };
}

/**
 * First photo of each service, keyed by service id, for the service cards
 * Search scatters between its provider rows. search_services_ranked returns
 * no images, so this is one batched lookup over the ids already on screen.
 * Services without a photo are simply absent from the result.
 */
export async function getServiceCoverImages(serviceIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(serviceIds)].slice(0, SERVICE_SEARCH_LIMIT);
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from("services")
    .select("id, service_images!inner ( url, sort_order ), provider: providers!inner ( id )")
    .in("id", ids)
    .eq("is_active", true)
    .eq("provider.is_active", true)
    .eq("provider.has_gone_live", true)
    // Only the cover is needed, not the whole gallery for up to 60 services.
    .order("sort_order", { referencedTable: "service_images", ascending: true })
    .limit(1, { referencedTable: "service_images" })
    .limit(ids.length);
  if (error) throw error;

  const covers: Record<string, string> = {};
  for (const row of (data ?? []) as unknown as { id: string; service_images: { url: string }[] }[]) {
    const first = row.service_images[0];
    if (first?.url) covers[row.id] = first.url;
  }
  return covers;
}

/** Providers only — see searchProvidersAndServices. */
export async function searchProviders(
  query: string,
  category?: string,
  limit = DEFAULT_PROVIDER_QUERY_LIMIT,
): Promise<PublicProviderSummary[]> {
  return (await searchProvidersAndServices(query, category, limit)).providers;
}

/**
 * Log a search event to Supabase for analytics.
 * Fire-and-forget — never blocks the UI. Zero-result searches are the most
 * valuable signal: they show what clients want that no provider offers yet.
 */
export async function logSearchEvent(params: {
  query: string;
  categoryFilter?: string;
  resultsCount: number;
  userId?: string;
}): Promise<void> {
  try {
    await supabase.from("search_events").insert({
      query: params.query.trim().toLowerCase(),
      category_filter: params.categoryFilter ?? null,
      results_count: params.resultsCount,
      user_id: params.userId ?? null,
    });
  } catch {
    // Never let analytics logging break the search experience
  }
}

type ProviderProfileServiceJoin = Omit<
  ProviderWithServices["services"][number],
  "images" | "add_ons"
> & {
  service_images: ProviderWithServices["services"][number]["images"];
  service_add_ons: ProviderWithServices["services"][number]["add_ons"];
};

type ProviderProfileJoinRow = Omit<
  ProviderWithServices,
  "services" | "specialties" | "automation_settings"
> & {
  automation_schedule_release_day: number | null;
  automation_schedule_release_time: string | null;
  automation_waitlist_enabled: boolean | null;
  services: ProviderProfileServiceJoin[] | null;
  provider_specialties: ProviderWithServices["specialties"] | null;
};

type ProviderProfileCoreJoinRow = Omit<
  ProviderProfileJoinRow,
  "services" | "provider_specialties"
>;

// Kept separate from the nested catalogue selection so Provider Profile can
// paint its hero and business information without waiting for every service,
// image and add-on to cross the network.
const PROVIDER_PROFILE_PUBLIC_FIELDS = `
  id,
  slug,
  display_name,
  service_category,
  service_categories,
  custom_service_type,
  location_text,
  public_directions,
  profile_sections,
  about_text,
  logo_url,
  logo_framing,
  gradient,
  accent_color,
  background_image_url,
  profile_theme,
  brand_font,
  phone,
  email,
  instagram,
  website,
  tiktok,
  preferred_contact_methods,
  whatsapp_number,
  external_booking_url,
  booking_mode,
  rating,
  years_experience,
  is_verified,
  booking_policies,
  business_type,
  online_consultations_available,
  cancellation_notice_hours,
  automation_schedule_release_day:automation_settings->scheduleReleaseDay,
  automation_schedule_release_time:automation_settings->>scheduleReleaseTime,
  automation_waitlist_enabled:automation_settings->waitlistEnabled,
  accessibility_notes,
  languages_spoken,
  qualifications,
  is_insured_self_declared,
  dbs_checked_self_declared,
  team_size,
  walk_ins_welcome,
  group_bookings_available,
  vegan_cruelty_free,
  products_used,
  clientele,
  skin_tones_catered,
  preferred_payment_methods
`;

const PROVIDER_PROFILE_CACHE_TTL_MS = 60_000;
const PROVIDER_PROFILE_CACHE_MAX_ENTRIES = 50;
const PROVIDER_PROFILE_SERVICES_LIMIT = 200;
const PROVIDER_PROFILE_SPECIALTIES_LIMIT = 50;
const PROVIDER_PROFILE_IMAGES_PER_SERVICE_LIMIT = 20;
const PROVIDER_PROFILE_ADD_ONS_PER_SERVICE_LIMIT = 50;
const providerProfileCache = new BoundedTtlCache<
  string,
  ProviderWithServices | null
>(PROVIDER_PROFILE_CACHE_TTL_MS, PROVIDER_PROFILE_CACHE_MAX_ENTRIES);
const providerProfilePreviewCache = new BoundedTtlCache<
  string,
  ProviderWithServices | null
>(PROVIDER_PROFILE_CACHE_TTL_MS, PROVIDER_PROFILE_CACHE_MAX_ENTRIES);
const providerProfileRequests = new Map<
  string,
  Promise<ProviderWithServices | null>
>();
const providerProfilePreviewRequests = new Map<
  string,
  Promise<ProviderWithServices | null>
>();
const providerProfileRequestTokens = new Map<string, symbol>();

function mapProviderProfileJoinRow(row: ProviderProfileJoinRow): ProviderWithServices {
  const {
    automation_schedule_release_day: scheduleReleaseDay,
    automation_schedule_release_time: scheduleReleaseTime,
    automation_waitlist_enabled: waitlistEnabled,
    services: joinedServices,
    provider_specialties: providerSpecialties,
    ...publicProvider
  } = row;
  const publicAutomationSettings =
    scheduleReleaseDay !== null || waitlistEnabled !== null
      ? {
          ...(scheduleReleaseDay !== null ? { scheduleReleaseDay } : {}),
          ...(isReleaseTime(scheduleReleaseTime) ? { scheduleReleaseTime } : {}),
          ...(waitlistEnabled !== null ? { waitlistEnabled } : {}),
        }
      : null;
  return {
    ...publicProvider,
    // Do not retain unrelated operational automation settings in the
    // process-wide public profile cache or expose them to client features.
    automation_settings: publicAutomationSettings,
    services: (joinedServices ?? [])
      .filter((service) => service.is_active)
      .sort((left, right) => left.sort_order - right.sort_order)
      .map(({ service_images, service_add_ons, ...service }) => ({
        ...service,
        images: service_images ?? [],
        // Cache only the public/active child shape. Owner RLS can return
        // inactive add-ons; allowing those into this process-wide cache
        // could expose them after an account switch even if the screen
        // mapper currently filters them again.
        add_ons: (service_add_ons ?? []).filter((addOn) => addOn.is_active),
      })),
    specialties: providerSpecialties ?? [],
  };
}

/**
 * The profile screen is opened with either key: the public slug (Explore,
 * Search, cart, QR codes) or the provider's UUID (notifications, the
 * booked-elsewhere list), because a notification row and a booking only store
 * the UUID. Matching on slug alone left every UUID caller on "Provider not
 * found" even for a live provider.
 */
function providerProfileKeyColumn(key: string): "id" | "slug" {
  return isProviderProfileUuid(key) ? "id" : "slug";
}

/**
 * Fetch the lightweight, public part of a provider profile. The full
 * catalogue remains a separate request so a client can see who they opened
 * before every service image and add-on has loaded.
 */
export async function getProviderProfilePreviewBySlug(
  slug: string,
  options: { forceRefresh?: boolean } = {},
): Promise<ProviderWithServices | null> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;

  if (!options.forceRefresh) {
    const fullProfile = providerProfileCache.get(normalizedSlug);
    if (fullProfile !== undefined) return fullProfile;
    const cached = providerProfilePreviewCache.get(normalizedSlug);
    if (cached !== undefined) return cached;
    const inFlight = providerProfilePreviewRequests.get(normalizedSlug);
    if (inFlight) return inFlight;
  }

  const request = (async (): Promise<ProviderWithServices | null> => {
    const { data, error } = await supabase
      .from("providers")
      .select(`${PROVIDER_PROFILE_PUBLIC_FIELDS}, hair_types_catered`)
      .eq(providerProfileKeyColumn(normalizedSlug), normalizedSlug)
      .eq("is_active", true)
      .eq("has_gone_live", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        providerProfilePreviewCache.set(normalizedSlug, null);
        return null;
      }
      throw error;
    }

    const profile = mapProviderProfileJoinRow({
      ...(data as ProviderProfileCoreJoinRow),
      services: [],
      provider_specialties: [],
    });
    providerProfilePreviewCache.set(normalizedSlug, profile);
    return profile;
  })();

  providerProfilePreviewRequests.set(normalizedSlug, request);
  try {
    return await request;
  } finally {
    if (providerProfilePreviewRequests.get(normalizedSlug) === request) {
      providerProfilePreviewRequests.delete(normalizedSlug);
    }
  }
}

/**
 * Fetch a single public provider profile by slug.
 *
 * The short in-memory TTL makes navigation prefetches useful without turning
 * this into a second source of truth. Concurrent callers share the same
 * promise, preventing Explore/Search/ProviderProfile from issuing duplicate
 * requests while a navigation transition is in flight.
 */
export async function getProviderBySlug(
  slug: string,
  options: { forceRefresh?: boolean } = {},
): Promise<ProviderWithServices | null> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;

  if (!options.forceRefresh) {
    const cached = providerProfileCache.get(normalizedSlug);
    if (cached !== undefined) return cached;
    const inFlight = providerProfileRequests.get(normalizedSlug);
    if (inFlight) return inFlight;
  }

  const requestToken = Symbol(normalizedSlug);
  providerProfileRequestTokens.set(normalizedSlug, requestToken);
  const request = (async (): Promise<ProviderWithServices | null> => {
    const { data, error } = await supabase
      .from("providers")
      .select(
        `
        ${PROVIDER_PROFILE_PUBLIC_FIELDS},
        hair_types_catered,
        services (
          id,
          service_category,
          category_name,
          category_description,
          name,
          description,
          price,
          duration_minutes,
          is_active,
          sort_order,
          is_pregnancy_safe,
          patch_test_required,
          min_age,
          contraindications,
          aftercare_notes,
          skin_tones_suitable,
          service_type,
          service_images ( id, url, sort_order, aspect_ratio ),
          service_add_ons ( id, name, price, description, is_active, extra_minutes )
        ),
        provider_specialties ( specialty )
      `,
      )
      .limit(PROVIDER_PROFILE_SERVICES_LIMIT, { referencedTable: "services" })
      .limit(PROVIDER_PROFILE_IMAGES_PER_SERVICE_LIMIT, {
        referencedTable: "services.service_images",
      })
      .limit(PROVIDER_PROFILE_ADD_ONS_PER_SERVICE_LIMIT, {
        referencedTable: "services.service_add_ons",
      })
      .limit(PROVIDER_PROFILE_SPECIALTIES_LIMIT, {
        referencedTable: "provider_specialties",
      })
      .eq("services.is_active", true)
      .eq("services.service_add_ons.is_active", true)
      .eq(providerProfileKeyColumn(normalizedSlug), normalizedSlug)
      .eq("is_active", true)
      .eq("has_gone_live", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        if (providerProfileRequestTokens.get(normalizedSlug) === requestToken) {
          providerProfileCache.set(normalizedSlug, null);
          providerProfilePreviewCache.set(normalizedSlug, null);
        }
        return null;
      }
      throw error;
    }

    const profile = mapProviderProfileJoinRow(
      data as unknown as ProviderProfileJoinRow,
    );
    if (providerProfileRequestTokens.get(normalizedSlug) === requestToken) {
      providerProfileCache.set(normalizedSlug, profile);
      providerProfilePreviewCache.set(normalizedSlug, profile);
    }
    return profile;
  })();

  providerProfileRequests.set(normalizedSlug, request);
  try {
    return await request;
  } finally {
    if (providerProfileRequests.get(normalizedSlug) === request) {
      providerProfileRequests.delete(normalizedSlug);
    }
    if (providerProfileRequestTokens.get(normalizedSlug) === requestToken) {
      providerProfileRequestTokens.delete(normalizedSlug);
    }
  }
}

/**
 * The profile already cached for this slug, read synchronously, so a screen
 * can draw it on its very first frame rather than a loading skeleton that is
 * swapped out a moment later. Undefined when nothing usable is cached (a
 * cached "not found" counts as nothing: the screen loads and says so itself).
 */
export function peekCachedProviderProfile(slug: string): ProviderWithServices | undefined {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return undefined;
  return providerProfileCache.get(normalizedSlug) ?? providerProfilePreviewCache.get(normalizedSlug) ?? undefined;
}

/**
 * Read a profile fresh and keep it cached, for a provider previewing their own
 * profile right after an edit (the cached copy can be up to a minute old).
 * Awaited before the preview opens, so the page draws straight away from the
 * fresh copy instead of flashing a skeleton. A request already in flight from
 * before the edit can't overwrite it (providerProfileRequestTokens).
 */
export async function refreshCachedProviderProfile(slug: string): Promise<void> {
  await getProviderBySlug(slug, { forceRefresh: true });
}

/** Warm the fast first-paint cache before a navigation transition completes. */
export function prefetchProviderBySlug(slug: string): void {
  void getProviderProfilePreviewBySlug(slug).catch((error: unknown) => {
    logger.warn("Provider profile prefetch failed:", error);
  });
}

export interface ProviderProfileViewerContext {
  userId: string;
  displayName: string;
  isOwnProvider: boolean;
  notificationsEnabled: boolean;
}

/**
 * Authenticated, viewer-specific state for a public profile. Kept separate
 * from the cacheable public payload so account ids and follow state can never
 * leak into a cross-user cache.
 */
export async function getProviderProfileViewerContext(
  providerId: string,
  /**
   * AuthContext resolves this once per session. When it has a settled answer,
   * reuse it instead of issuing another providers lookup for every profile a
   * client opens. `undefined` deliberately means unknown, not "owns none".
   */
  knownOwnedProviderId?: string | null,
): Promise<ProviderProfileViewerContext | null> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();
  if (authError) throw authError;
  if (!user) return null;

  const [userResult, ownerResult, followResult] = await Promise.all([
    supabase.from("users").select("name").eq("id", user.id).maybeSingle(),
    knownOwnedProviderId === undefined
      ? supabase
          .from("providers")
          .select("id")
          .eq("id", providerId)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({
          data: knownOwnedProviderId === providerId ? { id: providerId } : null,
          error: null,
        }),
    supabase
      .from("provider_follows")
      .select("notify_enabled")
      .eq("user_id", user.id)
      .eq("provider_id", providerId)
      .maybeSingle(),
  ]);

  if (userResult.error) throw userResult.error;
  if (ownerResult.error) throw ownerResult.error;
  if (followResult.error) throw followResult.error;

  return {
    userId: user.id,
    displayName: userResult.data?.name ?? "",
    isOwnProvider: !!ownerResult.data,
    notificationsEnabled: followResult.data?.notify_enabled ?? false,
  };
}

async function getProviderProfileForUserId(
  userId: string,
): Promise<DbProvider | null> {
  // A user should have exactly one provider profile, but duplicates have crept in
  // during the account churn. Never throw on 0 or >1 rows: prefer the active
  // profile, then the oldest (the original), so identity resolution is
  // deterministic instead of crashing provider mode.
  const { data, error } = await supabase
    .from("providers")
    .select("*")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/** Fetch the provider row that belongs to the currently logged-in user */
export async function getMyProviderProfile(): Promise<DbProvider | null> {
  const {
    data: { user },
    error,
  } = await getSessionUser();
  if (error) throw error;
  if (!user) return null;
  return getProviderProfileForUserId(user.id);
}

/**
 * Provider Home's first-paint data. The profile and every schedule collection
 * belong to the same provider row, so embed them in one PostgREST response
 * instead of starting five independent mobile requests during app launch.
 */
export async function getMyProviderHomeBundle(): Promise<{
  profile: DbProvider;
  availability: DbProviderAvailability[];
  blockedDates: DbProviderBlockedDate[];
  availabilityWindows: DbProviderAvailabilityWindow[];
  availabilityOverrides: DbProviderAvailabilityOverride[];
} | null> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();
  if (authError) throw authError;
  if (!user) return null;

  // No has_gone_live / is_active filter: the provider reading their own
  // record, the same exception as getProviderProfileForUserId.
  const { data, error } = await supabase
    .from("providers")
    .select(`
      *,
      provider_availability (*),
      provider_blocked_dates (*),
      provider_availability_windows (*),
      provider_availability_overrides (*)
    `)
    .eq("user_id", user.id)
    // Same bounds the standalone loaders apply: overrides only from a
    // fortnight back, and at most 500 blocked dates.
    .gte("provider_availability_overrides.availability_date", overridesFromDate())
    .order("blocked_date", { referencedTable: "provider_blocked_dates" })
    .limit(500, { referencedTable: "provider_blocked_dates" })
    // Same identity rule as getProviderProfileForUserId: active profile
    // first, then the oldest.
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as DbProvider & {
    provider_availability: DbProviderAvailability[] | null;
    provider_blocked_dates: DbProviderBlockedDate[] | null;
    provider_availability_windows: DbProviderAvailabilityWindow[] | null;
    provider_availability_overrides: DbProviderAvailabilityOverride[] | null;
  };
  const {
    provider_availability,
    provider_blocked_dates,
    provider_availability_windows,
    provider_availability_overrides,
    ...profile
  } = row;

  return {
    profile,
    availability: [...(provider_availability ?? [])].sort((a, b) => a.day_of_week - b.day_of_week),
    blockedDates: [...(provider_blocked_dates ?? [])].sort(
      (a, b) => a.blocked_date.localeCompare(b.blocked_date),
    ),
    availabilityWindows: [...(provider_availability_windows ?? [])].sort(
      (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
    ),
    availabilityOverrides: [...(provider_availability_overrides ?? [])]
      .sort(
        (a, b) => a.availability_date.localeCompare(b.availability_date)
          || (a.start_time ?? '').localeCompare(b.start_time ?? ''),
      ),
  };
}

/** Owner profile plus legacy auth metadata, resolved with one auth lookup. */
export async function getMyProviderProfileContext(): Promise<{
  userId: string;
  userMetadata: Record<string, unknown>;
  profile: DbProvider | null;
} | null> {
  const {
    data: { user },
    error,
  } = await getSessionUser();
  if (error) throw error;
  if (!user) return null;
  return {
    userId: user.id,
    userMetadata: user.user_metadata ?? {},
    profile: await getProviderProfileForUserId(user.id),
  };
}

/** Legacy auth metadata mirror used while older app versions remain active. */
export async function updateCurrentUserMetadata(
  data: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// PROVIDERS — additional reads
// ─────────────────────────────────────────────────────────

/** Fetch the provider's DB id for a given auth user id, or null if this user
 * owns no provider profile.
 *
 * No has_gone_live filter — provider reading their own record.
 *
 * Ordered and limited to exactly one row, matching getProviderProfileForUserId:
 * a user should own one provider profile, but duplicates have crept in during
 * the account churn, and a bare .maybeSingle() errors outright on more than one
 * row rather than picking. Both functions must resolve to the same row (active
 * first, then the oldest/original) or ownership checks disagree with the
 * profile actually loaded.
 *
 * The error is thrown rather than swallowed into a null. Silently reporting
 * "owns no provider profile" when the query in fact failed is indistinguishable
 * to every caller from the truth, and this answer now gates whether an account
 * is offered a Book button on its own profile.
 */
export async function getProviderIdForUserId(
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

/** The provider profile this user owns, plus who takes its bookings.
 *
 *  Before a link-only professional's providers row exists (it's created on
 *  their first profile save) the mode comes from their sign-up answer:
 *  users.external_booking_url is only ever written by sign-up Step 1's
 *  "I use my own booking link" switch. Once the row exists, its
 *  booking_mode column is the only answer. No has_gone_live filter — the
 *  user reading their own records. */
export async function getProviderOwnershipForUserId(userId: string): Promise<{
  providerId: string | null;
  bookingMode: ProviderBookingMode | null;
}> {
  const { data, error } = await supabase
    .from("providers")
    .select("id, booking_mode")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const row = data as { id: string; booking_mode: ProviderBookingMode } | null;
  if (row) return { providerId: row.id, bookingMode: row.booking_mode };

  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("role, external_booking_url")
    .eq("id", userId)
    .maybeSingle();
  if (userError) throw userError;
  const signup = userRow as { role: string | null; external_booking_url: string | null } | null;
  if (signup?.role !== "provider") return { providerId: null, bookingMode: null };
  return {
    providerId: null,
    bookingMode: signup.external_booking_url?.trim() ? "external" : "cerviced",
  };
}

/** A link-only provider becomes a full member: CERVICED takes their bookings
 *  from now on, their booking link is removed, and the go-live gate re-runs on
 *  the full checklist, so they're off Search until they finish it. One way.
 *  See 20261102190000_become_full_member.sql. */
export async function becomeFullMember(): Promise<void> {
  const { error } = await supabase.rpc("become_full_member");
  if (error) throw error;
}

/** Fetch branding fields for the provider owned by the given user (Branding screen).
 * No has_gone_live filter — provider reading their own record. */
export async function getProviderBrandingByUserId(userId: string): Promise<{
  id: string;
  gradient: string[] | null;
  accent_color: string | null;
  background_image_url: string | null;
  profile_theme: string | null;
  brand_font: string | null;
  logo_url: string | null;
} | null> {
  // The provider's own row, read by their own user id — Branding edits it, so
  // there's no has_gone_live filter. logo_url is read only so Custom can offer
  // colours from the logo.
  const { data, error } = await supabase
    .from("providers")
    .select("id, gradient, accent_color, background_image_url, profile_theme, brand_font, logo_url")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error) return null;
  return data as {
    id: string;
    gradient: string[] | null;
    accent_color: string | null;
    background_image_url: string | null;
    profile_theme: string | null;
    brand_font: string | null;
    logo_url: string | null;
  };
}

/** Current provider's branding without a screen-level auth round trip. */
export async function getMyProviderBranding(knownUserId?: string): Promise<
  | (NonNullable<Awaited<ReturnType<typeof getProviderBrandingByUserId>>> & {
      userId: string;
    })
  | null
> {
  let userId = knownUserId;
  if (!userId) {
    const {
      data: { user },
      error,
    } = await getSessionUser();
    if (error) throw error;
    userId = user?.id;
  }
  if (!userId) return null;
  const branding = await getProviderBrandingByUserId(userId);
  return branding ? { ...branding, userId } : null;
}

export interface ProviderAccountEditorInfo {
  userId: string;
  email: string;
  name: string;
  phone: string;
  dob: string;
  businessName: string;
}

/** Account editor bootstrap in one service-owned auth/data operation. */
export async function getMyProviderAccountEditorInfo(): Promise<ProviderAccountEditorInfo | null> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();
  if (authError) throw authError;
  if (!user) return null;
  const [basic, businessName] = await Promise.all([
    getUserBasicInfo(user.id),
    getProviderDisplayNameByUserId(user.id),
  ]);
  return {
    userId: user.id,
    email: user.email ?? "",
    name: basic?.name ?? "",
    phone: basic?.phone ?? "",
    dob: basic?.dob ?? "",
    businessName: businessName ?? "",
  };
}

/** Refresh token needed only for the device biometric credential vault. */
export async function getCurrentRefreshToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.refresh_token ?? null;
}

/** Fetch the display_name for the provider owned by a given user (settings / account screens).
 * No has_gone_live filter — provider reading their own record. */
export async function getProviderDisplayNameByUserId(
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("providers")
    .select("display_name")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as any)?.display_name ?? null;
}

/** Fetch the auth user_id that owns a specific provider — used to detect self-chat attempts.
 * No has_gone_live filter — identity resolution, not client discovery. */
export async function getProviderUserIdById(
  providerId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .maybeSingle();
  return (data as any)?.user_id ?? null;
}

/** A provider's current logo and how they framed it, for screens whose logo
 *  arrives without the framing (a booking's logo snapshot, a search RPC row,
 *  a cart item). */
export interface ProviderLogoFramingEntry {
  logoUrl: string | null;
  framing: LogoFraming | null;
}

/**
 * Current logo + framing for many providers in one query. Client-facing, so
 * live providers only; a provider who isn't live just gets no entry and the
 * caller draws its logo unframed.
 */
export async function getProviderLogoFramings(
  providerIds: string[],
): Promise<Record<string, ProviderLogoFramingEntry>> {
  const ids = [...new Set(providerIds)].filter(Boolean);
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from("providers")
    .select("id, logo_url, logo_framing")
    .in("id", ids)
    .eq("has_gone_live", true)
    .eq("is_active", true)
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);
  if (error) throw error;
  const out: Record<string, ProviderLogoFramingEntry> = {};
  for (const row of (data ?? []) as { id: string; logo_url: string | null; logo_framing: LogoFraming | null }[]) {
    out[row.id] = { logoUrl: row.logo_url, framing: row.logo_framing ?? null };
  }
  return out;
}

/** Fetch id, slug, and display_name for a provider by their DB id.
 * No has_gone_live filter — called from notification taps where the user already
 * has an existing booking relationship with this provider; filtering by has_gone_live
 * would break navigation for clients whose provider temporarily went unlive. */
export async function getProviderBasicById(
  providerId: string,
): Promise<{ id: string; slug: string; display_name: string } | null> {
  const { data } = await supabase
    .from("providers")
    .select("id, slug, display_name")
    .eq("id", providerId)
    .maybeSingle();
  return data as { id: string; slug: string; display_name: string } | null;
}
