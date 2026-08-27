import { supabase } from "../lib/supabase";
import { VENUE_PORTFOLIO_CATEGORY } from "../features/providers/venuePhotos";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type {
  DbProvider,
  DbBooking,
  DbUser,
  DbNotification,
  DbPromotion,
  DbService,
  ClientPromotion,
  PublicPromotionWithProvider,
  DbPortfolioItem,
  BookingWithAddOns,
  ProviderWithServices,
  PortfolioItemWithProvider,
  DiscoverServiceWithProvider,
  NotificationType,
  PublicReviewWithUser,
  PublicProviderSummary,
  ReviewWithUser,
  DbReview,
  DbEventPlan,
  DbEventTask,
  DbEventChecklistItem,
  DbBookingRescheduleRequest,
  DbProviderAvailability,
  DbProviderBlockedDate,
  DbProviderAvailabilityWindow,
  DbProviderAvailabilityOverride,
  BusinessType,
} from "../types/database";
import type { AddressReleasePolicy } from "../features/business-details/options";
import { logger } from "../utils/logger";
import {
  ADDRESS_PENDING_PLACEHOLDER,
  PHONE_PENDING_PLACEHOLDER,
} from "../types/booking";
import { parseSearchQuery } from "../utils/searchQuery";
import { BoundedTtlCache } from "../utils/boundedTtlCache";
import { matchesHairType } from "../utils/hairTypeMatch";
import { resolveDepositMode } from "../utils/depositPolicy";

export interface AuthSessionSummary {
  userId: string;
  email: string | null;
  refreshToken: string | null;
  userMetadata: Record<string, unknown>;
}

function summarizeAuthSession(session: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>): AuthSessionSummary {
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    refreshToken: session.refresh_token ?? null,
    userMetadata: session.user.user_metadata as Record<string, unknown>,
  };
}

export async function refreshAuthSession(refreshToken: string): Promise<void> {
  const { error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error) throw error;
}

export async function getCurrentAuthUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

export function setAuthAutoRefresh(active: boolean): void {
  if (active) supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
}

export function subscribeToAuthStateChanges(
  onChange: (event: AuthChangeEvent, session: Session | null) => void | Promise<void>,
): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(onChange);
  return () => subscription.unsubscribe();
}

export async function signOutCurrentSession(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function clearUserStorageFolder(
  bucket: string,
  userId: string,
): Promise<void> {
  const { data, error: listError } = await supabase.storage.from(bucket).list(userId);
  if (listError) throw listError;
  if (!data || data.length === 0) return;
  const { error } = await supabase.storage
    .from(bucket)
    .remove(data.map(file => `${userId}/${file.name}`));
  if (error) throw error;
}

export function subscribeToUserBookingChanges(
  userId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`user-bookings-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bookings",
        filter: `user_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export function subscribeToRescheduleRequestChanges(
  onChange: (row: DbBookingRescheduleRequest | null) => void,
): () => void {
  const channel = supabase
    .channel("reschedule-request-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "booking_reschedule_requests" },
      (payload) => onChange(
        payload.eventType === "DELETE"
          ? null
          : (payload.new as DbBookingRescheduleRequest),
      ),
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export interface NotificationInsertRow {
  id: string;
  title: string;
  message: string;
  type: string;
  booking_id: string | null;
  provider_id: string | null;
  recipient_role: "provider" | "client";
}

export function subscribeToNotificationInserts(
  userId: string,
  onInsert: (row: NotificationInsertRow) => void,
): () => void {
  const channel = supabase
    .channel(`notification-inserts-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      payload => onInsert(payload.new as NotificationInsertRow),
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<AuthSessionSummary> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error("Authentication succeeded without a session");
  return summarizeAuthSession(data.session);
}

export async function signInWithAppleIdToken(token: string): Promise<AuthSessionSummary> {
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "apple", token });
  if (error) throw error;
  if (!data.session) throw new Error("Authentication succeeded without a session");
  return summarizeAuthSession(data.session);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function verifyRecoveryOtp(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
  if (error) throw error;
}

export async function verifySignupOtp(
  email: string,
  token: string,
): Promise<AuthSessionSummary> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  if (!data.session) throw new Error("Verification succeeded without a session");
  return summarizeAuthSession(data.session);
}

export async function resendSignupOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) throw error;
}

export async function updateCurrentPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function updatePasswordAndSignOut(password: string): Promise<void> {
  await updateCurrentPassword(password);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function signUpWithEmail(params: {
  email: string;
  password: string;
  metadata: Record<string, unknown>;
}): Promise<{ hasIdentity: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: { data: params.metadata },
  });
  if (error) throw error;
  return { hasIdentity: (data.user?.identities?.length ?? 0) > 0 };
}

export async function removePortfolioStorageObject(path: string): Promise<void> {
  const { error } = await supabase.storage.from("portfolio").remove([path]);
  if (error) throw error;
}

export async function getCurrentUserStoredPushToken(): Promise<string | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) return null;
  const { data, error } = await supabase
    .from("users")
    .select("push_token")
    .eq("id", authData.user.id)
    .single();
  if (error) throw error;
  return data?.push_token ?? null;
}

export interface DevResetResult {
  ok?: boolean;
  error?: string;
  deleted?: {
    bookings?: number;
    reviews?: number;
    transactions?: number;
    notifications?: number;
    schedule_windows?: number;
    availability_days?: number;
    [key: string]: number | undefined;
  };
}

export async function runDevReset(
  kind: "client" | "provider_bookings" | "provider",
): Promise<DevResetResult> {
  const functionName = kind === "client"
    ? "dev_reset_client"
    : kind === "provider_bookings"
      ? "dev_reset_provider_bookings_only"
      : "dev_reset_provider";
  const { data, error } = await supabase.rpc(functionName);
  if (error) throw error;
  return (data ?? {}) as DevResetResult;
}

// Terms end up interpolated into a PostgREST `.or()` filter string — strip
// the characters that are structurally meaningful to that syntax (comma
// separates conditions, parens group them) so a term containing one can't
// break out of its intended ilike condition.
function sanitizeIlikeTerm(term: string): string {
  return term.replace(/[(),]/g, " ").trim();
}

/** Creates or completes the app profile after Supabase has verified the
 * account's email. Auth verification remains in the screen; database writes
 * stay behind this shared service boundary. */
export async function upsertVerifiedUserProfile(
  profile: { id: string } & Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .upsert(profile, { onConflict: "id" });
  if (error) throw error;
}

/** Persists client-profile fields for the signed-in account. */
export async function updateClientProfileFields(
  userId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  // Selecting the id back is what makes a no-op detectable: an UPDATE matching
  // zero rows is not a Postgres error, so without this a lost session (RLS
  // `auth.uid() = id` matching nothing) returned success having written nothing
  // — and addClientProfile would flip the account to the client hat locally
  // while the database still had no record of it, so the hat vanished on the
  // next launch.
  const { data, error } = await supabase
    .from("users")
    .update(fields)
    .eq("id", userId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(`updateClientProfileFields matched no row for user ${userId}`);
  }
}

export type AccountDeletionResult = {
  ok?: boolean;
  error?: string;
  full_account_deleted?: boolean;
};

export async function cancelAccountDeletionRequest(): Promise<AccountDeletionResult> {
  const { data, error } = await supabase.rpc("cancel_account_deletion");
  if (error) throw error;
  return (data ?? {}) as AccountDeletionResult;
}

export async function deleteClientAccountProfile(): Promise<AccountDeletionResult> {
  const { data, error } = await supabase.rpc("delete_client_profile");
  if (error) throw error;
  return (data ?? {}) as AccountDeletionResult;
}

export async function deleteProviderAccountProfile(): Promise<AccountDeletionResult> {
  const { data, error } = await supabase.rpc("delete_provider_profile");
  if (error) throw error;
  return (data ?? {}) as AccountDeletionResult;
}

/**
 * DATABASE SERVICE — SINGLE ACCESS POINT
 *
 * RULES:
 * 1. This is the ONLY file that may import the Supabase client and call .from().
 *    Screens import functions from here — they never touch supabase directly.
 * 2. Every client-facing provider query MUST include .eq('has_gone_live', true)
 *    unless the provider is reading their own record (document that exception).
 * 3. Functions throw on error — never swallow errors or return null on failure.
 * 4. All parameters and return types must be explicitly typed — no `any`.
 */

// ─────────────────────────────────────────────────────────
// PROVIDERS
// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────
// PHASE 5.4 — PERSONALISED HOME FEED
// ─────────────────────────────────────────────────────────

/** Providers who joined in the last 30 days — "New on CERVICED" section */
const PUBLIC_PROVIDER_SUMMARY_SELECT =
  "id, slug, display_name, service_category, logo_url, location_text, service_locations, latitude, longitude, rating, review_count, price_tier, business_type, walk_ins_welcome, group_bookings_available, vegan_cruelty_free, is_featured, created_at";

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
const DEFAULT_PROVIDER_QUERY_LIMIT = 200;

// Same rationale, applied to a single provider's review list — no realistic
// profile needs to render more than this at once.
const DEFAULT_REVIEWS_QUERY_LIMIT = 200;

// Safety-net cap for a single provider's lifetime booking history (Analytics'
// "All" range, MoM comparison, and 6-month chart all need full history, not
// the windowed default — but "full history" still needs a ceiling so a
// long-tenured, high-volume provider can't turn this into an unbounded scan).
const DEFAULT_LIFETIME_BOOKINGS_QUERY_LIMIT = 2000;

/** Fetch all active providers, optionally filtered by service category */
export async function getProviders(
  category?: string,
  limit = DEFAULT_PROVIDER_QUERY_LIMIT,
): Promise<PublicProviderSummary[]> {
  let query = supabase
    .from("providers")
    .select(PUBLIC_PROVIDER_SUMMARY_SELECT)
    .eq("is_active", true)
    .eq("has_gone_live", true)
    .order("is_featured", { ascending: false })
    .order("rating", { ascending: false })
    .limit(limit);

  if (category && category !== "ALL") {
    query = query.eq("service_category", category);
  }

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

/**
 * Provider ids catering to the given hair type, read from the provider-level
 * providers.hair_types_catered in a single `.in()` query.
 *
 * Deliberately the BROAD level: this answers "does this provider cater to 4C
 * hair at all", which is what the Search filter needs. The narrower
 * services.hair_types_suitable is the per-service refinement, surfaced once a
 * client opens a provider and picks a service — it is not consulted here, so
 * a provider isn't filtered out of search by one unlabelled service.
 *
 * An empty/null hair_types_catered means "caters to all" and matches every
 * requested type, so a provider who hasn't filled it in is never wrongly
 * excluded. That also means the filter only genuinely narrows once providers
 * populate the field (see ServicesPricingScreen, where it's edited).
 */
export async function getProviderHairTypeMatches(
  providerIds: string[],
  hairType: string,
): Promise<Set<string>> {
  const matches = new Set<string>();
  if (providerIds.length === 0) return matches;

  const { data, error } = await supabase
    .from("providers")
    .select("id, hair_types_catered")
    .eq("has_gone_live", true)
    .eq("is_active", true)
    .in("id", providerIds);
  if (error) throw error;

  for (const row of data ?? []) {
    if (matchesHairType(row.hair_types_catered, hairType)) {
      matches.add(row.id);
    }
  }
  return matches;
}

/** Coarse near-term availability status for a provider, as surfaced on
 *  search/browse cards. NOT a booking gate — the real slot simulation in
 *  AvailabilityService owns anything that actually reserves time. */
export type ProviderAvailabilityStatus = "available" | "limited" | "none";

/**
 * Batched near-term availability for a set of providers, keyed by slug, in a
 * single query via the get_providers_availability() SECURITY DEFINER RPC.
 *
 * The search grid needs one at-a-glance status per card; computing it the
 * per-provider way (AvailabilityService.getAvailabilitySummary, 5+ queries
 * each) across a 200-provider result set would be a textbook N+1. The RPC
 * rolls the whole set into one query and is has_gone_live/is_active gated
 * server-side, returning only a coarse status string (no booking details).
 *
 * A slug missing from the returned map = not publicly listed (gated out) or
 * no schedule at all; callers should treat an absent entry as unknown and
 * degrade gracefully rather than as "no availability".
 */
export async function getProvidersAvailability(
  slugs: string[],
): Promise<Map<string, ProviderAvailabilityStatus>> {
  const result = new Map<string, ProviderAvailabilityStatus>();
  if (slugs.length === 0) return result;

  const { data, error } = await supabase.rpc("get_providers_availability", {
    p_slugs: slugs,
  });
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as {
    slug: string;
    status: ProviderAvailabilityStatus;
  }[]) {
    result.set(row.slug, row.status);
  }
  return result;
}

/**
 * Search providers from a plain-English query — e.g. "hairstylist in south
 * london" or "almond nails, nail art in east manchester". Parses out a
 * trailing "in/near/around <place>" as a location filter and the remainder
 * as one or more service terms (split on commas/"and"), matched against
 * service names/descriptions and provider display name/about text/location.
 * A detected category keyword (e.g. "hairstylist" → HAIR) additionally
 * broadens the result to the whole category, since generic words like that
 * rarely appear verbatim in a service name. Optionally further filtered by
 * an explicit service category chip.
 */
export async function searchProviders(
  query: string,
  category?: string,
  limit = DEFAULT_PROVIDER_QUERY_LIMIT,
): Promise<PublicProviderSummary[]> {
  const q = query.trim();
  if (!q) return getProviders(category, limit);

  const parsed = parseSearchQuery(q);
  // Falls back to the whole query when no location preposition was found,
  // so a bare "south london" (no "in") still gets tried as free text below.
  const textTerms = (
    parsed.serviceTerms.length ? parsed.serviceTerms : [q]
  ).map(sanitizeIlikeTerm);
  const locationTerms = parsed.locationTerms.map(sanitizeIlikeTerm);

  const serviceOr = textTerms
    .map((t) => `name.ilike.%${t}%,description.ilike.%${t}%`)
    .join(",");
  // location_text is included here too (not just in the dedicated filter
  // below) so a query with no "in/near" preposition still matches on it.
  const nameOr = textTerms
    .map(
      (t) =>
        `display_name.ilike.%${t}%,about_text.ilike.%${t}%,location_text.ilike.%${t}%`,
    )
    .join(",");

  // A detected category hint only broadens recall when the caller hasn't
  // already pinned a category via the chip filter — that's already narrower.
  const categoryHint =
    parsed.categoryHint && (!category || category === "ALL")
      ? parsed.categoryHint
      : null;

  // None of these three lookups depend on each other's result, so run them
  // together instead of waiting on one before starting the next.
  const [
    { data: serviceMatches },
    { data: nameMatches },
    { data: categoryMatches },
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
          .eq("service_category", categoryHint)
          .limit(limit)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
  ]);

  const serviceIds = (serviceMatches ?? []).map(
    (r: { provider_id: string }) => r.provider_id,
  );
  const nameIds = (nameMatches ?? []).map((r: { id: string }) => r.id);
  const categoryIds = (categoryMatches ?? []).map((r: { id: string }) => r.id);
  const allIds = [...new Set([...serviceIds, ...nameIds, ...categoryIds])];

  if (allIds.length === 0) return [];

  // 4. Fetch those providers, applying the explicit location + category filters
  let providerQuery = supabase
    .from("providers")
    .select(PUBLIC_PROVIDER_SUMMARY_SELECT)
    .in("id", allIds)
    .eq("is_active", true)
    .eq("has_gone_live", true)
    .order("is_featured", { ascending: false })
    .order("rating", { ascending: false })
    .limit(limit);

  if (category && category !== "ALL") {
    providerQuery = providerQuery.eq("service_category", category);
  }

  if (locationTerms.length) {
    providerQuery = providerQuery.or(
      locationTerms.map((t) => `location_text.ilike.%${t}%`).join(","),
    );
  }

  const { data, error } = await providerQuery;
  if (error) throw error;
  return (data ?? []) as PublicProviderSummary[];
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
  automation_waitlist_enabled: boolean | null;
  services: ProviderProfileServiceJoin[] | null;
  provider_specialties: ProviderWithServices["specialties"] | null;
};

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
const providerProfileRequests = new Map<
  string,
  Promise<ProviderWithServices | null>
>();
const providerProfileRequestTokens = new Map<string, symbol>();

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
        id,
        slug,
        display_name,
        service_category,
        custom_service_type,
        location_text,
        about_text,
        logo_url,
        gradient,
        accent_color,
        background_image_url,
        profile_theme,
        phone,
        email,
        instagram,
        website,
        preferred_contact_methods,
        whatsapp_number,
        external_booking_url,
        rating,
        years_experience,
        is_verified,
        booking_policies,
        business_type,
        online_consultations_available,
        cancellation_notice_hours,
        automation_schedule_release_day:automation_settings->scheduleReleaseDay,
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
        travel_radius,
        products_used,
        hair_types_catered,
        services (
          id,
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
          service_type,
          service_images ( id, url, sort_order, aspect_ratio ),
          service_add_ons ( id, name, price, description, is_active )
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
      .eq("slug", normalizedSlug)
      .eq("is_active", true)
      .eq("has_gone_live", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        if (providerProfileRequestTokens.get(normalizedSlug) === requestToken) {
          providerProfileCache.set(normalizedSlug, null);
        }
        return null;
      }
      throw error;
    }

    const row = data as unknown as ProviderProfileJoinRow;
    const {
      automation_schedule_release_day: scheduleReleaseDay,
      automation_waitlist_enabled: waitlistEnabled,
      services: joinedServices,
      provider_specialties: providerSpecialties,
      ...publicProvider
    } = row;
    const publicAutomationSettings =
      scheduleReleaseDay !== null || waitlistEnabled !== null
        ? {
            ...(scheduleReleaseDay !== null ? { scheduleReleaseDay } : {}),
            ...(waitlistEnabled !== null ? { waitlistEnabled } : {}),
          }
        : null;
    const profile: ProviderWithServices = {
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
    if (providerProfileRequestTokens.get(normalizedSlug) === requestToken) {
      providerProfileCache.set(normalizedSlug, profile);
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

/** Warm the bounded profile cache before a navigation transition completes. */
export function prefetchProviderBySlug(slug: string): void {
  void getProviderBySlug(slug).catch((error: unknown) => {
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
): Promise<ProviderProfileViewerContext | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) return null;

  const [userResult, ownerResult, followResult] = await Promise.all([
    supabase.from("users").select("name").eq("id", user.id).maybeSingle(),
    supabase
      .from("providers")
      .select("id")
      .eq("id", providerId)
      .eq("user_id", user.id)
      .maybeSingle(),
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
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) return null;
  return getProviderProfileForUserId(user.id);
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
  } = await supabase.auth.getUser();
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
// PORTFOLIO
// ─────────────────────────────────────────────────────────

/** Fetch one provider's portfolio items (client work gallery), newest first */
export async function getProviderPortfolio(
  providerId: string,
): Promise<DbPortfolioItem[]> {
  const { data, error } = await supabase
    .from("portfolio_items")
    .select(
      "id, provider_id, service_id, image_url, caption, category, tags, price, aspect_ratio, is_featured, created_at, vibe_tags, occasion_tags, trend_names, hair_type_shown, skin_tone_shown",
    )
    .eq("provider_id", providerId)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw error;
  return (data ?? []) as DbPortfolioItem[];
}

/**
 * Add a portfolio item for a provider (image already uploaded to storage).
 * Stamps `category` from the provider's own service_category at insert
 * time — portfolio photos never had a per-photo category picker in the
 * upload UI, so without this every row landed with category = NULL, which
 * made it invisible to every Explore category-filter tab (NULL never
 * matches a Postgres `.eq()`) despite still showing under "All".
 */
export async function addPortfolioItem(
  providerId: string,
  imageUrl: string,
  aspectRatio: number = 1,
  category?: string,
): Promise<DbPortfolioItem> {
  let resolvedCategory = category;
  if (!resolvedCategory) {
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("service_category")
      .eq("id", providerId)
      .single();
    if (providerError) throw providerError;
    resolvedCategory = provider.service_category;
  }

  const { data, error } = await supabase
    .from("portfolio_items")
    .insert({
      provider_id: providerId,
      image_url: imageUrl,
      aspect_ratio: aspectRatio,
      category: resolvedCategory,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as DbPortfolioItem;
}

/** Delete a portfolio item by id */
export async function deletePortfolioItem(id: string): Promise<void> {
  const { error } = await supabase
    .from("portfolio_items")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Fetch portfolio items, optionally filtered by category */
export async function getPortfolioItems(
  category?: string,
): Promise<PortfolioItemWithProvider[]> {
  // !inner + provider.has_gone_live excludes portfolio items belonging to a
  // provider who hasn't published a schedule yet — they shouldn't surface
  // anywhere client-facing, not just in browse/search/profile.
  let query = supabase
    .from("portfolio_items")
    .select(
      `
      *,
      provider: providers!inner ( id, slug, display_name, service_category, logo_url, rating, review_count )
    `,
    )
    .eq("provider.is_active", true)
    .eq("provider.has_gone_live", true)
    // Venue/workspace shots are excluded from Explore's discovery feed and
    // Becca's inspiration search. getProviderPortfolio() (the provider
    // profile's own Portfolio grid) is deliberately NOT filtered — that is
    // where these are meant to be seen. Written as an OR with is-null rather
    // than a plain .neq(): in SQL `category <> 'venue'` is NULL (not true)
    // for a NULL category, so a bare .neq would silently drop the legacy
    // category-less rows mapDbPortfolioItem still has a fallback for.
    .or(`category.is.null,category.neq.${VENUE_PORTFOLIO_CATEGORY}`)
    .order("created_at", { ascending: false });

  if (category && category !== "All") {
    query = query.eq("category", category.toUpperCase());
  }

  const { data, error } = await query.limit(DEFAULT_PROVIDER_QUERY_LIMIT);
  if (error) throw error;
  return (data ?? []) as PortfolioItemWithProvider[];
}

/** Search portfolio by text (caption, tags, provider name) */
export async function searchPortfolio(
  query: string,
): Promise<PortfolioItemWithProvider[]> {
  const { data, error } = await supabase
    .from("portfolio_items")
    .select(
      `
      *,
      provider: providers!inner ( id, slug, display_name, service_category, logo_url, rating, review_count )
    `,
    )
    .eq("provider.is_active", true)
    .eq("provider.has_gone_live", true)
    // Same exclusion as getPortfolioItems — this is the text-search half of
    // the same discovery/inspiration surface. A second .or() is a separate
    // top-level condition ANDed with the caption/tags one below, not a
    // replacement for it.
    .or(`category.is.null,category.neq.${VENUE_PORTFOLIO_CATEGORY}`)
    .or(`caption.ilike.%${query}%,tags.cs.{${query}}`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as PortfolioItemWithProvider[];
}

/**
 * Fetch providers that have a cover photo, for the mixed Explore discovery
 * feed — mirrors getProviders' has_gone_live/is_active gating but requires
 * an image, since this powers a visual grid rather than a list.
 */
export async function getDiscoverProviders(
  category?: string,
  limit = 40,
): Promise<DbProvider[]> {
  let query = supabase
    .from("providers")
    .select("*")
    .eq("is_active", true)
    .eq("has_gone_live", true)
    .not("background_image_url", "is", null)
    .order("is_featured", { ascending: false })
    .order("rating", { ascending: false })
    .limit(limit);

  if (category && category !== "All") {
    query = query.eq("service_category", category.toUpperCase());
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch unclaimed (is_claimed = false, source = 'scraped') provider rows for
 * the mixed Explore discovery feed, so a "ready to claim" business can be
 * discovered by browsing rather than only via the pre-signup claim search
 * (searchUnclaimedProviders). Deliberately bypasses has_gone_live/is_active —
 * unclaimed rows are always has_gone_live = false by construction (never
 * onboarded) — same is_claimed = false gate as searchUnclaimedProviders,
 * see that function's comment for why that's the correct safety boundary
 * here, not RLS. Narrow select: unclaimed rows have no services/availability/
 * rating/theme, so callers must render a reduced card/profile, never the
 * full live-provider UI.
 */
export interface DiscoverUnclaimedProvider {
  id: string;
  slug: string;
  display_name: string;
  service_category: string;
  location_text: string | null;
  logo_url: string | null;
  about_text: string | null;
  instagram: string | null;
  website: string | null;
}

export async function getDiscoverUnclaimedProviders(
  category?: string,
  limit = 20,
): Promise<DiscoverUnclaimedProvider[]> {
  let query = supabase
    .from("providers")
    .select(
      "id, slug, display_name, service_category, location_text, logo_url, about_text, instagram, website",
    )
    .eq("is_claimed", false)
    .order("scraped_at", { ascending: false })
    .limit(limit);

  if (category && category !== "All") {
    query = query.eq("service_category", category.toUpperCase());
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch services that have at least one photo, with provider info, for the
 * mixed Explore discovery feed. The !inner join on service_images excludes
 * services with no photo.
 */
export async function getDiscoverServices(
  category?: string,
  limit = 40,
): Promise<DiscoverServiceWithProvider[]> {
  let query = supabase
    .from("services")
    .select(
      `
      id, provider_id, name, description, price,
      service_images!inner ( url, sort_order, aspect_ratio ),
      provider: providers!inner ( id, slug, display_name, service_category, logo_url, rating, review_count )
    `,
    )
    .eq("is_active", true)
    .eq("provider.is_active", true)
    .eq("provider.has_gone_live", true)
    .limit(limit);

  if (category && category !== "All") {
    query = query.eq("provider.service_category", category.toUpperCase());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as DiscoverServiceWithProvider[];
}

/**
 * Resolve the user's saved/"hearted" IDs (from `useBookmarkStore.savedPortfolioIds`,
 * a mix of raw portfolio_item ids and `provider-<id>`/`service-<id>` prefixed ids
 * from the mixed discovery feed) into full rows, batched by kind — no N+1.
 * Powers the Explore screen's Favourites tab.
 */
export async function getSavedPortfolioDetails(ids: string[]): Promise<{
  portfolioItems: PortfolioItemWithProvider[];
  providers: DbProvider[];
  services: DiscoverServiceWithProvider[];
}> {
  const providerIds = ids
    .filter((id) => id.startsWith("provider-"))
    .map((id) => id.slice("provider-".length));
  // service ids carry a per-image suffix (`service-<id>__<imageIndex>`, one
  // id per carousel photo — see mapDbServiceToCards) so multiple saved ids
  // can point at the same underlying service; strip the suffix and dedupe
  // before querying, one row per service regardless of how many of its
  // photos were saved.
  const serviceIds = [
    ...new Set(
      ids
        .filter((id) => id.startsWith("service-"))
        .map((id) => id.slice("service-".length).replace(/__\d+$/, "")),
    ),
  ];
  const portfolioIds = ids.filter(
    (id) => !id.startsWith("provider-") && !id.startsWith("service-"),
  );

  const [portfolioResult, providerResult, serviceResult] = await Promise.all([
    portfolioIds.length > 0
      ? supabase
          .from("portfolio_items")
          .select(
            `
            *,
            provider: providers!inner ( id, slug, display_name, service_category, logo_url, rating, review_count )
          `,
          )
          .in("id", portfolioIds)
          .eq("provider.is_active", true)
          .eq("provider.has_gone_live", true)
          // Same venue exclusion as getPortfolioItems: this is the Favourites
          // tab of the same Explore feed, so a legacy saved id pointing at a
          // venue shot must not put one back into a browse surface it can no
          // longer be discovered in.
          .or(`category.is.null,category.neq.${VENUE_PORTFOLIO_CATEGORY}`)
      : Promise.resolve({ data: [], error: null }),
    providerIds.length > 0
      ? supabase
          .from("providers")
          .select("*")
          .in("id", providerIds)
          .eq("is_active", true)
          .eq("has_gone_live", true)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length > 0
      ? supabase
          .from("services")
          .select(
            `
            id, provider_id, name, description, price,
            service_images ( url, sort_order ),
            provider: providers!inner ( id, slug, display_name, service_category, logo_url, rating, review_count )
          `,
          )
          .in("id", serviceIds)
          .eq("is_active", true)
          .eq("provider.is_active", true)
          .eq("provider.has_gone_live", true)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (portfolioResult.error) throw portfolioResult.error;
  if (providerResult.error) throw providerResult.error;
  if (serviceResult.error) throw serviceResult.error;

  return {
    portfolioItems: (portfolioResult.data ?? []) as PortfolioItemWithProvider[],
    providers: (providerResult.data ?? []) as DbProvider[],
    services: (serviceResult.data ??
      []) as unknown as DiscoverServiceWithProvider[],
  };
}

// ─────────────────────────────────────────────────────────
// PROMOTIONS
// ─────────────────────────────────────────────────────────

/** Fetch active, non-expired promotions with provider info. Optionally filter by service category. */
export async function getActivePromotions(
  category?: string,
): Promise<PublicPromotionWithProvider[]> {
  let query = supabase
    .from("promotions")
    .select(
      "id, provider_id, title, description, discount_text, discount_percent, discount_amount, service_category, service_ids, promo_code, valid_from, valid_until, is_active, image_url, created_at, providers!inner(display_name, logo_url, slug)",
    )
    .eq("providers.is_active", true)
    .eq("providers.has_gone_live", true)
    .eq("is_active", true)
    .gte("valid_until", new Date().toISOString().split("T")[0])
    .order("created_at", { ascending: false })
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);

  if (category && category !== "ALL") {
    query = query.eq("service_category", category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as PublicPromotionWithProvider[];
}

/** Provider ids with a live offer, for lightweight badges on provider cards. */
export async function getProviderIdsWithActivePromotions(): Promise<string[]> {
  const { data, error } = await supabase
    .from("promotions")
    .select("provider_id, providers!inner(id)")
    .eq("providers.is_active", true)
    .eq("providers.has_gone_live", true)
    .eq("is_active", true)
    .gte("valid_until", new Date().toISOString().split("T")[0])
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.provider_id))];
}

/** Fetch active, non-expired promotions for a specific provider UUID (client-facing) */
export async function getProviderActivePromotions(
  providerDbId: string,
): Promise<ClientPromotion[]> {
  const { data, error } = await supabase
    .from("promotions")
    .select(
      "id, provider_id, title, description, discount_text, discount_percent, discount_amount, service_category, service_ids, promo_code, valid_from, valid_until, is_active, image_url, created_at",
    )
    .eq("provider_id", providerDbId)
    .eq("is_active", true)
    .gte("valid_until", new Date().toISOString().split("T")[0])
    .order("valid_from", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as ClientPromotion[];
}

/** Fetch all promotions belonging to the currently signed-in provider */
export async function getMyPromotions(): Promise<DbPromotion[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!provider) return [];

  const { data, error } = await supabase
    .from("promotions")
    .select(
      "id, provider_id, title, description, discount_text, discount_percent, discount_amount, service_category, service_ids, promo_code, valid_from, valid_until, is_active, image_url, scheduled_notify_at, notify_sent_at, created_at",
    )
    .eq("provider_id", provider.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return data ?? [];
}

export interface UpsertPromotionInput {
  id?: string;
  title: string;
  description?: string;
  discount_text?: string;
  discount_percent?: number;
  discount_amount?: number;
  service_category?: string;
  service_ids?: string[] | null;
  promo_code?: string | null;
  valid_from: string;
  valid_until: string;
  is_active?: boolean;
  image_url?: string | null;
  scheduled_notify_at?: string | null;
  notify_sent_at?: string | null;
}

/** Create or update a promotion for the currently signed-in provider */
export async function upsertPromotion(
  input: UpsertPromotionInput,
): Promise<DbPromotion> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!provider) throw new Error("No provider profile found");

  const row = {
    ...input,
    provider_id: provider.id,
    is_active: input.is_active ?? true,
  };

  const { data, error } = await supabase
    .from("promotions")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;
  return data as DbPromotion;
}

/** Toggle the is_active flag on a promotion */
export async function togglePromotion(
  id: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("promotions")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw error;
}

/** Permanently delete a promotion */
export async function deletePromotion(id: string): Promise<void> {
  const { error } = await supabase.from("promotions").delete().eq("id", id);
  if (error) throw error;
}

/** Partial update — only the fields provided are changed, no full replace */
export async function patchPromotion(
  id: string,
  patch: Partial<UpsertPromotionInput>,
): Promise<void> {
  const { error } = await supabase
    .from("promotions")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

/** Fetch active services for the currently signed-in provider */
export async function getMyProviderServices(): Promise<
  import("../types/database").DbService[]
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!provider) return [];

  const { data, error } = await supabase
    .from("services")
    .select(
      "id, provider_id, category_name, category_description, name, description, price, price_max, duration_minutes, buffer_before_mins, buffer_after_mins, is_active, sort_order, created_at, tags, technique_tags, outcome_tags, occasion_tags, trend_names, is_pregnancy_safe, patch_test_required, min_age, contraindications, hair_types_suitable, aftercare_notes, service_type, service_add_ons ( id, service_id, name, price, description, is_active )",
    )
    .eq("provider_id", provider.id)
    .eq("is_active", true)
    .eq("service_add_ons.is_active", true)
    .order("sort_order", { ascending: true })
    .limit(200)
    .limit(50, { referencedTable: "service_add_ons" });

  if (error) throw error;
  return (data ?? []).map((s: any) => ({
    ...s,
    add_ons: (s.service_add_ons ?? []).filter((a: any) => a.is_active),
  }));
}

// ─────────────────────────────────────────────────────────
// SERVICE CATALOGUE — the owner's own read/write
// ─────────────────────────────────────────────────────────
//
// Until now the only way to change a service was replaceProviderServiceCatalog
// (replace_provider_services), which rewrites a provider's WHOLE catalogue from
// InfoRegScreen's one-shot document save — and that save also re-geocodes their
// address and re-uploads their logo. Editing one price meant reposting
// everything. These four are the per-row alternative, so the My Services tab
// can manage the catalogue directly.
//
// All of them rely on the `services_owner_all` RLS policy (FOR ALL, USING
// provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid())), which
// is what scopes them to the caller's own rows. There is deliberately no
// provider_id parameter on the by-id functions: passing one would imply this
// code is the boundary, and it isn't — the database is.

/** Everything the owner needs to see in their catalogue, INCLUDING hidden
 *  rows. Deliberately not getMyProviderServices, which filters
 *  `is_active = true` for booking purposes — a manager that hid inactive
 *  services would give a provider no way to bring one back. */
export async function getMyServiceCatalogue(knownProviderId?: string): Promise<{
  providerId: string | null;
  services: DbService[];
}> {
  // Callers holding their own provider row pass its id rather than making
  // this re-resolve the same row from the auth session.
  let providerId = knownProviderId;
  if (!providerId) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error("Not authenticated");

    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (providerError) throw providerError;
    if (!provider) return { providerId: null, services: [] };
    providerId = provider.id as string;
  }

  const { data, error } = await supabase
    .from("services")
    .select(
      "id, provider_id, category_name, category_description, name, description, price, price_max, duration_minutes, buffer_before_mins, buffer_after_mins, is_active, sort_order, created_at, tags, technique_tags, outcome_tags, occasion_tags, trend_names, is_pregnancy_safe, patch_test_required, min_age, contraindications, hair_types_suitable, aftercare_notes, service_type",
    )
    .eq("provider_id", providerId)
    .order("category_name", { ascending: true })
    .order("sort_order", { ascending: true })
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);
  if (error) throw error;

  return { providerId, services: (data ?? []) as DbService[] };
}

/** The fields the My Services manager can set. Everything else on a service
 *  row (safety flags, tags, buffers, add-ons) is still owned by the fuller
 *  editor — this is the day-to-day set, not a second way to write all of it. */
export interface MyServiceDraft {
  name: string;
  price: number;
  durationMinutes: number;
  description: string | null;
}

export async function createMyService(
  providerId: string,
  categoryName: string,
  draft: MyServiceDraft,
): Promise<DbService> {
  // Appended, not inserted at the top: sort_order drives the client-facing
  // order, so a new service must not silently jump ahead of the ones a
  // provider already arranged.
  const { data: last, error: lastError } = await supabase
    .from("services")
    .select("sort_order")
    .eq("provider_id", providerId)
    .eq("category_name", categoryName)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;

  const { data, error } = await supabase
    .from("services")
    .insert({
      provider_id: providerId,
      category_name: categoryName,
      name: draft.name,
      description: draft.description,
      price: draft.price,
      duration_minutes: draft.durationMinutes,
      sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1,
      is_active: true,
    })
    .select("id, provider_id, category_name, category_description, name, description, price, price_max, duration_minutes, buffer_before_mins, buffer_after_mins, is_active, sort_order, created_at, tags, technique_tags, outcome_tags, occasion_tags, trend_names, is_pregnancy_safe, patch_test_required, min_age, contraindications, hair_types_suitable, aftercare_notes, service_type")
    .single();
  if (error) throw error;
  return data as DbService;
}

export async function updateMyService(
  serviceId: string,
  draft: MyServiceDraft,
): Promise<DbService> {
  const { data, error } = await supabase
    .from("services")
    .update({
      name: draft.name,
      description: draft.description,
      price: draft.price,
      duration_minutes: draft.durationMinutes,
    })
    .eq("id", serviceId)
    .select("id, provider_id, category_name, category_description, name, description, price, price_max, duration_minutes, buffer_before_mins, buffer_after_mins, is_active, sort_order, created_at, tags, technique_tags, outcome_tags, occasion_tags, trend_names, is_pregnancy_safe, patch_test_required, min_age, contraindications, hair_types_suitable, aftercare_notes, service_type")
    .single();
  if (error) throw error;
  return data as DbService;
}

/**
 * Hide or show a service. This is the manager's destructive-looking action on
 * purpose — there is no deleteMyService.
 *
 * A service row is referenced by every booking ever made from it
 * (bookings_service_id_fkey), so deleting one either fails on the constraint
 * or, worse, would orphan a provider's own history. `is_active = false` is
 * already what the client-facing `services_public_read` policy filters on, so
 * hiding genuinely removes it from sale without destroying the record.
 */
export async function setMyServiceActive(
  serviceId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("services")
    .update({ is_active: isActive })
    .eq("id", serviceId);
  if (error) throw error;
}

/** Promotion manager core data with one auth/provider identity resolution. */
export async function getMyPromotionManagerCore(): Promise<{
  promotions: DbPromotion[];
  services: DbService[];
}> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error("Not authenticated");
  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (providerError) throw providerError;
  if (!provider) return { promotions: [], services: [] };

  const [promotionResult, serviceResult] = await Promise.all([
    supabase
      .from("promotions")
      .select(
        "id, provider_id, title, description, discount_text, discount_percent, discount_amount, service_category, service_ids, promo_code, valid_from, valid_until, is_active, image_url, scheduled_notify_at, notify_sent_at, created_at",
      )
      .eq("provider_id", provider.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("services")
      .select(
        "id, provider_id, category_name, category_description, name, description, price, price_max, duration_minutes, buffer_before_mins, buffer_after_mins, is_active, sort_order, created_at, tags, technique_tags, outcome_tags, occasion_tags, trend_names, is_pregnancy_safe, patch_test_required, min_age, contraindications, hair_types_suitable, aftercare_notes, service_type, service_add_ons ( id, service_id, name, price, description, is_active )",
      )
      .eq("provider_id", provider.id)
      .eq("is_active", true)
      .eq("service_add_ons.is_active", true)
      .order("sort_order", { ascending: true })
      .limit(200)
      .limit(50, { referencedTable: "service_add_ons" }),
  ]);
  if (promotionResult.error) throw promotionResult.error;
  if (serviceResult.error) throw serviceResult.error;
  return {
    promotions: (promotionResult.data ?? []) as DbPromotion[],
    services: (serviceResult.data ?? []).map((service) => ({
      ...service,
      add_ons: service.service_add_ons ?? [],
    })) as DbService[],
  };
}

/** Server-owned checkout intent. The app sends only the appointment choices;
 * the RPC reads current service and add-on prices, validates availability and
 * creates the short-lived reservation atomically. */
export type CheckoutIntentItem = {
  provider_id: string;
  service_id: string;
  booking_date: string;
  booking_time: string;
  add_on_ids?: string[];
  use_deposit?: boolean;
  notes?: string;
  // Required true when the service has patch_test_required or
  // is_pregnancy_safe=false — prepare_checkout rejects the item otherwise.
  // See supabase/migrations/20260817085443_safety_acknowledgement_checkout.sql.
  safety_ack?: boolean;
  // This appointment is a request for a time the provider's own scheduling
  // rules exclude. enforce_booking_bookability() decides whether that
  // provider permits it at all; neither claim_cart_booking_slots() nor
  // finalize_checkout() ever auto-confirms one, whatever the provider's
  // auto_accept_bookings says.
  // emergency_ack must be true whenever emergency is — prepare_checkout
  // rejects the item otherwise, the same shape as safety_ack above. See
  // supabase/migrations/20260821143821_emergency_booking_requests.sql.
  emergency?: boolean;
  emergency_ack?: boolean;
};

export type PreparedCheckout = {
  checkoutBatchId: string;
  amountDue: number;
  expiresAt: string;
};

export async function prepareCheckout(
  items: CheckoutIntentItem[],
): Promise<PreparedCheckout> {
  const { data, error } = await supabase.rpc("prepare_checkout", {
    p_items: items,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.checkout_batch_id || !row.expires_at) {
    throw new Error("Checkout could not be prepared. Please try again.");
  }
  // prepare_checkout returns its subtotal as it creates the holds. The
  // database then applies the (full-payment-only) platform fee atomically,
  // so read the final client-owned batch rather than trusting the RPC echo.
  const { data: batch, error: batchError } = await supabase
    .from("checkout_batches")
    .select("amount_due, expires_at")
    .eq("id", row.checkout_batch_id)
    .single();
  if (batchError || !batch)
    throw new Error("Checkout could not be priced. Please try again.");
  return {
    checkoutBatchId: row.checkout_batch_id,
    amountDue: Number(batch.amount_due),
    expiresAt: batch.expires_at,
  };
}

/** Immediately releases a prepared server checkout when the user backs out. */
export async function cancelCheckout(checkoutBatchId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_checkout", {
    p_checkout_batch_id: checkoutBatchId,
  });
  if (error) throw error;
}

/** Creates a confirmed, unpaid appointment for one of this provider's existing
 * app clients. The database performs the provider ownership, service, hours,
 * capacity and overlap checks in one transaction. */
export async function providerCreateManualBooking(input: {
  clientUserId: string;
  serviceId: string;
  bookingDate: string;
  bookingTime: string;
  notes?: string;
  addOnIds?: string[];
  // Required true when the service has patch_test_required or
  // is_pregnancy_safe=false — the RPC rejects the insert otherwise. See
  // supabase/migrations/20260817085443_safety_acknowledgement_checkout.sql.
  safetyAck?: boolean;
  // Provider has seen and confirmed a scheduling-POLICY warning (booking
  // window, minimum notice, or a date they'd marked blocked) and wants to
  // proceed anyway. Does NOT bypass a genuinely taken slot or a same-day
  // time that has already passed — those stay hard errors regardless. See
  // supabase/migrations/20260817150000_manual_booking_scheduling_policy_override.sql.
  overrideScheduling?: boolean;
  // Extra minutes blocked out on top of the service's own duration (e.g.
  // "this client's hair is extra thick, +30 min") — extends end_time only,
  // never billing. 0-240, clamped/rejected server-side. See
  // supabase/migrations/20260817160000_manual_booking_extra_minutes.sql.
  extraMinutes?: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc("provider_create_manual_booking", {
    p_client_user_id: input.clientUserId,
    p_service_id: input.serviceId,
    p_booking_date: input.bookingDate,
    p_booking_time: input.bookingTime,
    p_notes: input.notes?.trim() || null,
    p_add_on_ids: input.addOnIds ?? [],
    p_safety_ack: input.safetyAck ?? false,
    p_override_scheduling: input.overrideScheduling ?? false,
    p_extra_minutes: input.extraMinutes ?? 0,
  });
  if (error) throw error;
  if (!data) throw new Error("Booking could not be created. Please try again.");
  return data as string;
}

/** Claim a promotion's scheduled notification. Returns false when another
 *  sender (the scheduled-promotion cron job) already claimed it — callers
 *  must claim BEFORE sending so clients never get the blast twice. */
export async function markScheduledNotifSent(
  promoId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("promotions")
    .update({ notify_sent_at: new Date().toISOString() })
    .eq("id", promoId)
    .is("notify_sent_at", null)
    .select("id");
  return (data ?? []).length > 0;
}

/** Get all unique clients who have booked this provider, with stats */
/** Booking rows scanned when aggregating a provider's clientele. */
const CLIENTELE_BOOKING_SCAN_LIMIT = 2000;

export async function getProviderClientele(): Promise<
  import("../types/database").ClienteleMember[]
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!provider) return [];

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "user_id, customer_name, customer_email, booking_date, base_price, add_ons_total",
    )
    .eq("provider_id", provider.id)
    .in("status", ["completed", "confirmed"])
    // A provider is not their own client. Self-bookings are blocked at the DB
    // now, but rows created before that guard existed still sit in bookings —
    // and left in, they surface a card whose every action is either a no-op or
    // a server rejection (get_or_create_provider_conversation raises
    // self_conversation_not_allowed), plus they'd receive their own
    // announcements and rebook nudges.
    .neq("user_id", user.id)
    .order("booking_date", { ascending: false })
    // Rows here are aggregated into unique clients below, so this caps the
    // booking history scanned, not the clientele size. Ordered newest-first,
    // so a very long-running provider's oldest bookings fall outside the
    // window rather than recent clients going missing.
    .limit(CLIENTELE_BOOKING_SCAN_LIMIT);

  if (error) throw error;
  if (!data) return [];

  const map = new Map<string, import("../types/database").ClienteleMember>();
  for (const b of data) {
    const spent = (b.base_price ?? 0) + (b.add_ons_total ?? 0);
    const existing = map.get(b.user_id);
    if (existing) {
      existing.booking_count++;
      existing.total_spent += spent;
    } else {
      map.set(b.user_id, {
        user_id: b.user_id,
        customer_name: b.customer_name ?? "Unknown",
        customer_email: b.customer_email ?? "",
        booking_count: 1,
        last_booking_date: b.booking_date,
        total_spent: spent,
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.booking_count - a.booking_count,
  );
}

/** All bookings for a specific client with the current provider */
export async function getClientBookingHistory(
  clientUserId: string,
): Promise<import("../types/database").DbBooking[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!provider) return [];

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("provider_id", provider.id)
    .eq("user_id", clientUserId)
    .neq("status", "on_hold")
    .order("booking_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export interface ClientReliabilityStats {
  noShowCount: number;
  lateCancelCount: number;
}

/** No-show / late-cancellation history for a specific client against the
 *  CALLING provider only. Reads client_provider_reliability, a counter
 *  table incremented server-side by cancel_own_booking() (late_cancel_count)
 *  and provider_update_booking_status() (no_show_count) — never written by
 *  app code (see supabase/fix_client_reliability_tracking.sql for the exact
 *  "late cancellation" definition used, and RLS scopes rows to the calling
 *  provider's own, so passing another provider's id here simply returns no
 *  row rather than leaking their data).
 *
 *  Provider id is intentionally re-derived from the authenticated caller
 *  (like getClientBookingHistory above), not trusted from a parameter,
 *  matching every other provider-scoped read in this file. */
export async function getClientReliabilityStats(
  clientUserId: string,
): Promise<ClientReliabilityStats> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!provider) return { noShowCount: 0, lateCancelCount: 0 };

  const { data, error } = await supabase
    .from("client_provider_reliability")
    .select("no_show_count, late_cancel_count")
    .eq("provider_id", provider.id)
    .eq("client_user_id", clientUserId)
    .maybeSingle();

  if (error) throw error;
  return {
    noShowCount: (data as any)?.no_show_count ?? 0,
    lateCancelCount: (data as any)?.late_cancel_count ?? 0,
  };
}

/** Batched reliability stats for every client in a list, scoped to the
 *  CALLING provider only — single `.in()` query, not a per-client loop (see
 *  CLAUDE.md's no-N+1 rule; this exists specifically so
 *  ProviderClienteleScreen's client list can show a reliability badge per
 *  card without one request per card). Returns a map keyed by
 *  client_user_id; clients absent from the map have no no-show/late-cancel
 *  history (zero, not missing data). */
export async function getClientReliabilityStatsBatch(
  clientUserIds: string[],
): Promise<Record<string, ClientReliabilityStats>> {
  if (clientUserIds.length === 0) return {};
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!provider) return {};

  const { data, error } = await supabase
    .from("client_provider_reliability")
    .select("client_user_id, no_show_count, late_cancel_count")
    .eq("provider_id", provider.id)
    .in("client_user_id", clientUserIds);

  if (error) throw error;

  const map: Record<string, ClientReliabilityStats> = {};
  for (const row of data ?? []) {
    map[(row as any).client_user_id] = {
      noShowCount: (row as any).no_show_count ?? 0,
      lateCancelCount: (row as any).late_cancel_count ?? 0,
    };
  }
  return map;
}

/** Send a rebook nudge notification to a specific client */
export async function sendRebookPrompt(
  userId: string,
  providerName: string,
): Promise<void> {
  await sendProviderClientNotifications({
    recipientUserIds: [userId],
    type: "booking_reminder",
    title: `${providerName} misses you!`,
    message: "It's been a while — book your next appointment now.",
    isActionable: true,
  });
}

type ProviderClientNotificationInput = {
  recipientUserIds: string[];
  type: NotificationType;
  title: string;
  message: string;
  priority?: "high" | "medium" | "low";
  isActionable?: boolean;
  bookingId?: string;
  metadata?: Record<string, unknown>;
};

/** Delivers provider-to-client notifications only after the database verifies
 * the provider owns a booking, follow, bookmark, or waitlist relationship. */
async function sendProviderClientNotifications(
  input: ProviderClientNotificationInput,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "send_provider_client_notifications",
    {
      p_recipient_user_ids: input.recipientUserIds,
      p_type: input.type,
      p_title: input.title,
      p_message: input.message,
      p_priority: input.priority ?? "medium",
      p_is_actionable: input.isActionable ?? false,
      p_booking_id: input.bookingId ?? null,
      p_metadata: input.metadata ?? {},
    },
  );
  if (error) throw error;
  return data ?? 0;
}

/** Send in-app promotion notifications to a provider's clients */
export async function sendPromotionNotificationsToClients(
  promotion: import("../types/database").DbPromotion,
  audience: "all" | "repeat" | "bookmarked" | "interested",
): Promise<{ sent: number }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: provider } = await supabase
    .from("providers")
    .select("id, display_name")
    .eq("user_id", user.id)
    .single();

  if (!provider) throw new Error("No provider profile");

  let userIds: string[] = [];

  if (audience === "interested") {
    // This provider's own audience: bookmarked, followed, or previously
    // booked THIS provider. Never reaches other providers' clients, even
    // ones into the same service category — promotions stay per-provider.
    // See supabase/promotion_interest_targeting.sql for the definition.
    const { data, error } = await supabase.rpc("get_promotion_audience", {
      p_promotion_id: promotion.id,
    });
    if (error) throw error;
    userIds = (data ?? []).map((r: any) => r.user_id);
  } else if (audience === "bookmarked") {
    const { data } = await supabase
      .from("bookmarks")
      .select("user_id")
      .eq("provider_id", provider.id);
    userIds = (data ?? []).map((r: any) => r.user_id);
  } else {
    const { data } = await supabase
      .from("bookings")
      .select("user_id")
      .eq("provider_id", provider.id)
      .in("status", ["completed", "confirmed"]);

    const rows = data ?? [];

    if (audience === "repeat") {
      const counts = new Map<string, number>();
      for (const r of rows)
        counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
      userIds = [...counts.entries()]
        .filter(([, n]) => n >= 2)
        .map(([id]) => id);
    } else {
      userIds = [...new Set(rows.map((r: any) => r.user_id))];
    }
  }

  if (userIds.length === 0) return { sent: 0 };

  const badge =
    promotion.discount_text ??
    (promotion.discount_percent
      ? `${promotion.discount_percent}% OFF`
      : promotion.discount_amount
        ? `£${promotion.discount_amount} OFF`
        : "Special Offer");

  const sent = await sendProviderClientNotifications({
    recipientUserIds: userIds,
    type: "promotion",
    title: `${badge} — ${provider.display_name ?? "Your provider"}`,
    message: promotion.title,
  });
  return { sent };
}

/** Send a promotion notification to a single specific client */
export async function sendPromoToClient(
  promotion: import("../types/database").DbPromotion,
  userId: string,
): Promise<void> {
  const badge =
    promotion.discount_text ??
    (promotion.discount_percent
      ? `${promotion.discount_percent}% OFF`
      : promotion.discount_amount
        ? `£${promotion.discount_amount} OFF`
        : "Special Offer");

  const baseMsg = promotion.description ?? promotion.title;
  const message = promotion.promo_code
    ? `${baseMsg} — Use code: ${promotion.promo_code}`
    : baseMsg;

  await sendProviderClientNotifications({
    recipientUserIds: [userId],
    type: "promotion",
    title: `${badge} — ${promotion.title}`,
    message,
    isActionable: true,
    metadata: {
      promo_id: promotion.id,
      ...(promotion.promo_code ? { promo_code: promotion.promo_code } : {}),
    },
  });
}

/** Broadcast an announcement to a pre-filtered list of client user IDs */
export async function sendAnnouncement(
  title: string,
  body: string,
  clientIds: string[],
): Promise<{ sent: number }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: provider } = await supabase
    .from("providers")
    .select("id, display_name")
    .eq("user_id", user.id)
    .single();

  if (!provider) throw new Error("No provider profile");
  if (clientIds.length === 0) return { sent: 0 };

  const providerName = (provider as any).display_name ?? "Your provider";
  // 'announcement' (not 'provider_message') — provider_message is a
  // provider-only type that NotificationsScreen hides in client mode,
  // so announcements sent under it were invisible to clients.
  const sent = await sendProviderClientNotifications({
    recipientUserIds: clientIds,
    type: "announcement",
    title: `${providerName} — ${title}`,
    message: body,
  });
  return { sent };
}

/** Queues an announcement to send at a future date/time. Delivered by the
 * process_scheduled_announcements() cron job (supabase/migrations/
 * 20260815101138_scheduled_announcements.sql), not by this app, so it still
 * fires if the provider's device is offline or the app is closed. */
export async function queueScheduledAnnouncement(
  title: string,
  body: string,
  clientIds: string[],
  scheduledFor: Date,
): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc("queue_scheduled_announcement", {
    p_title: title,
    p_body: body,
    p_recipient_ids: clientIds,
    p_scheduled_for: scheduledFor.toISOString(),
  });
  if (error) throw error;
  return { id: data as string };
}

/** Cancels a not-yet-sent scheduled announcement. Returns false (not an
 * error) if it already went out. */
export async function cancelScheduledAnnouncement(
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("cancel_scheduled_announcement", {
    p_id: id,
  });
  if (error) throw error;
  return data as boolean;
}

// ─────────────────────────────────────────────────────────
// BOOKMARKS
// ─────────────────────────────────────────────────────────

/** Fetch all providers bookmarked by the current user */
export async function getBookmarkedProviders(): Promise<PublicProviderSummary[]> {
  const { data, error } = await supabase
    .from("bookmarks")
    .select(`provider: providers!inner (${PUBLIC_PROVIDER_SUMMARY_SELECT})`)
    .eq("provider.has_gone_live", true)
    .eq("provider.is_active", true)
    .order("created_at", { ascending: false })
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);

  if (error) throw error;
  return (data ?? [])
    .map((row) => row.provider)
    .filter(Boolean) as unknown as PublicProviderSummary[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: string) => UUID_RE.test(id);

/** Add a bookmark */
export async function addBookmark(providerId: string): Promise<void> {
  if (!isUuid(providerId)) return; // static/demo provider — local store only

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("bookmarks")
    .insert({ user_id: user.id, provider_id: providerId });

  if (error && error.code !== "23505") throw error; // ignore duplicate
}

/** Remove a bookmark */
export async function removeBookmark(providerId: string): Promise<void> {
  if (!isUuid(providerId)) return; // static/demo provider — local store only

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("user_id", user.id)
    .eq("provider_id", providerId);

  if (error) throw error;
}

/** Check if a specific provider is bookmarked */
export async function isProviderBookmarked(
  providerId: string,
): Promise<boolean> {
  if (!isUuid(providerId)) return false; // static/demo provider

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("bookmarks")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider_id", providerId)
    .single();

  return !!data;
}

// ─────────────────────────────────────────────────────────
// BOOKINGS — Consumer side
// ─────────────────────────────────────────────────────────

/** Direct by-id fetch, bypassing client_bookings — that view deliberately
 *  excludes 'on_hold' rows from the normal bookings list (see
 *  waitlist_holds.sql) so a not-yet-claimed waitlist hold never shows up as
 *  a phantom appointment. This is the one legitimate reason to fetch one
 *  anyway: the client tapped a waitlist_slot_available notification and
 *  needs to see the specific held slot to confirm or decline it. RLS
 *  (bookings_user_select) already scopes this to the caller's own rows. */
// BookingWithAddOns' status field is typed as the client-side BookingStatus
// enum (only meaningful after mapDbBookingToConfirmed), which has no
// 'on_hold' member and doesn't even include 'confirmed' — this fetch
// bypasses that mapping entirely, so the field really is the raw DB string.
export type RawBooking = Omit<BookingWithAddOns, "status"> & { status: string };

export async function getBookingById(
  bookingId: string,
): Promise<RawBooking | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw error;
  return data as RawBooking | null;
}

/**
 * Fetch the current user's bookings within a bounded recent window (default
 * 90 days back) plus everything upcoming — an unbounded `select('*')` over a
 * user's entire booking history doesn't scale as accounts age. Older bookings
 * remain reachable via getOlderBookings() for a "load more" affordance rather
 * than being fetched eagerly on every screen load.
 */
export async function getMyBookings(
  sinceDaysAgo = 90,
): Promise<BookingWithAddOns[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - sinceDaysAgo);
  const cutoffDate = cutoff.toISOString().split("T")[0];

  // Read from client_bookings (not the base table): a security-invoker view
  // that masks the provider address until the release policy allows it, so the
  // address is enforced server-side rather than hidden by the UI. The view has
  // no user_id filter of its own — it relies on bookings' RLS, which has TWO
  // permissive SELECT policies (client side: user_id = auth.uid(); provider
  // side: provider_id IN caller's own providers) that Postgres ORs together.
  // For a dual-hat account, an unfiltered read here returns both sides — this
  // is "my bookings as a client" specifically, so filter to that explicitly.
  const { data, error } = await supabase
    .from("client_bookings")
    .select("*")
    .eq("user_id", user.id)
    .gte("booking_date", cutoffDate)
    .order("booking_date", { ascending: false })
    .order("booking_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/** One appointment the signed-in client already has, as the cart needs it:
 *  when it is, and who it's with. No address, no money, no ids — this answers
 *  "am I already busy then?" and nothing else. */
export interface ClientBookedSpan {
  booking_date: string;
  booking_time: string;
  end_time: string | null;
  provider_name_snapshot: string | null;
  service_name_snapshot: string | null;
}

/**
 * The client's own upcoming appointments across ALL providers, for checking
 * whether a new booking would double-book the client themselves.
 *
 * Nothing else in the app asks this question. bookings_no_overlap keys on
 * provider_id, so it stops a PROVIDER being in two places at once and says
 * nothing about the client. AvailabilityService checks whether the provider is
 * free. The cart's own cross-check compares two items only when they share a
 * provider. So a client could book two different providers for the same hour
 * and no layer objected — they would find out on the day.
 *
 * Deliberately date-bounded and capped: this runs on every checkout
 * validation, and an unbounded read of a client's whole history to answer a
 * question about next week is the same mistake DEFAULT_PROVIDER_QUERY_LIMIT
 * exists to prevent.
 */
export async function getMyUpcomingBookedSpans(
  fromDate: string,
  toDate: string,
  limit = 200,
): Promise<ClientBookedSpan[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("client_bookings") // gated view, client-side only — see getMyBookings
    .select(
      "booking_date, booking_time, end_time, provider_name_snapshot, service_name_snapshot",
    )
    .eq("user_id", user.id)
    // Cancelled and no-showed appointments free the client up again, exactly
    // as they free the provider's slot in bookings_no_overlap's own WHERE.
    .not("status", "in", '("cancelled","no_show")')
    .gte("booking_date", fromDate)
    .lte("booking_date", toDate)
    .order("booking_date", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ClientBookedSpan[];
}

/**
 * Page further back than getMyBookings()'s default window. `beforeDate` should
 * be the oldest `booking_date` already loaded (YYYY-MM-DD) — since the initial
 * window always fetches full days (`gte`), paging with `lt` on that boundary
 * can't skip or duplicate same-day bookings.
 */
export async function getOlderBookings(
  beforeDate: string,
  limit = 30,
): Promise<BookingWithAddOns[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("client_bookings") // gated view, client-side only — see getMyBookings
    .select("*")
    .eq("user_id", user.id)
    .lt("booking_date", beforeDate)
    .order("booking_date", { ascending: false })
    .order("booking_time", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/**
 * Look up a provider's UUID by display_name (used at checkout to get provider_id).
 *
 * Deliberately NOT filtered on `has_gone_live` — the documented exception to
 * that rule. Every caller resolves a provider the user is already tied to via
 * their own booking (rebooking, reviews, reschedules), and a provider can go
 * un-live after being booked; gating here would break those flows for a
 * booking the client legitimately holds.
 *
 * The safety property is therefore the CALLER's: only pass a name sourced from
 * the user's own bookings, or from an already-gated query result. Never pass
 * free-text user input — that would turn this into a probe for unpublished
 * providers. See `resolveProviderDbId` in becca/capabilities/shared.ts.
 */
export async function getProviderIdByDisplayName(
  name: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("providers")
    .select("id")
    .ilike("display_name", name)
    .eq("is_active", true)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

/**
 * Check whether another active booking already occupies this exact slot.
 * Mirrors the bookings_no_double_book_idx partial unique index — the index is
 * the hard guarantee; this is the friendly pre-check so the user gets a clear
 * "slot taken" message instead of a failed insert.
 */
export async function isSlotTaken(
  providerId: string,
  bookingDate: string,
  bookingTime24: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("provider_id", providerId)
    .eq("booking_date", bookingDate)
    .eq("booking_time", bookingTime24)
    .not("status", "in", "(cancelled,no_show)")
    .limit(1);
  if (error) return false; // fail open — the unique index is the backstop
  return (data?.length ?? 0) > 0;
}

/**
 * Batched form of isSlotTaken for multiple (providerId, date, time) triples —
 * one query for every unique (provider, date) pair rather than one per slot,
 * with the exact-time match done client-side against that day's bookings.
 * Keyed by `${providerId}|${date}|${time24}`.
 */
export async function getSlotsTaken(
  slots: { providerId: string; date: string; time24: string }[],
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  if (slots.length === 0) return result;

  const uniqueDates = [...new Set(slots.map((s) => s.date))];
  const uniqueProviderIds = [...new Set(slots.map((s) => s.providerId))];

  const { data, error } = await supabase
    .from("bookings")
    .select("provider_id, booking_date, booking_time")
    .in("provider_id", uniqueProviderIds)
    .in("booking_date", uniqueDates)
    .not("status", "in", '("cancelled","no_show")');

  const taken = new Set(
    (data ?? []).map(
      (row: any) =>
        `${row.provider_id}|${row.booking_date}|${row.booking_time}`,
    ),
  );
  for (const { providerId, date, time24 } of slots) {
    const key = `${providerId}|${date}|${time24}`;
    // fail open on error — the DB's unique index is the real backstop
    result[key] = error ? false : taken.has(key);
  }
  return result;
}

// ─────────────────────────────────────────────────────────
// CART CHECKOUT SLOT HOLDS
// ─────────────────────────────────────────────────────────

/** Minimal per-item shape hold_cart_booking_slots() needs to reserve a
 *  slot — just enough for the existing bookability/overlap triggers to
 *  evaluate it exactly as they would a real booking. */
export interface CartHoldItem {
  provider_id: string;
  service_id: string | null;
  booking_date: string;
  booking_time: string;
  end_time: string;
  /** True when the client accepted the out-of-hours confirmation for this
   *  time. Must be set HERE rather than at claim time: the hold is the insert
   *  enforce_booking_bookability() fires on, so without it the trigger
   *  rejects the very time the provider opted into accepting. */
  is_emergency_request?: boolean;
  /** The client ticked "I agree" to CERVICED's Terms and this provider's
   *  cancellation policy. Asserted here, pre-payment, because that is where
   *  the server records it — hold_cart_booking_slots() rejects the whole
   *  batch without it and stamps policy_accepted_at from the DB clock. The
   *  app never sends a timestamp: an unverifiable client clock is what let a
   *  retry write the previous attempt's time over the real one. */
  policy_accepted: boolean;
  /** The same checkbox, reported separately because the server checks it
   *  against a different fact — whether THIS service demands a patch test or
   *  is flagged unsafe in pregnancy. The requirement is derived server-side
   *  from the service row; this only reports that the person acknowledged it. */
  safety_ack: boolean;
}

/** Reserve every cart item's slot as an on_hold booking row, all-or-
 *  nothing, right when the user commits to payment (taps "Confirm & Pay")
 *  — before the payment sheet opens. See
 *  supabase/fix_cart_checkout_slot_hold.sql. Any bookability/overlap
 *  failure on any item throws and none of the batch is held. */
export async function holdCartBookingSlots(
  holdBatchId: string,
  items: CartHoldItem[],
): Promise<void> {
  const { error } = await supabase.rpc("hold_cart_booking_slots", {
    p_hold_batch_id: holdBatchId,
    p_items: items,
  });
  if (error) throw error;
}

/** Full per-item payload claim_cart_booking_slots() writes onto a held row
 *  when payment succeeds — this is the complete booking row, since the claim
 *  is now the only way a client booking reaches the table. */
export type CartClaimItem = Omit<
  DbBooking,
  | "id"
  | "user_id"
  | "status"
  | "created_at"
  | "updated_at"
  | "address_released_at"
  | "occasion_type"
  | "style_request"
  | "reference_image_url"
  // Written by hold_cart_booking_slots when the row is first held — that's
  // where enforce_booking_bookability() fires, so it has to be set by then.
  // The claim leaves both columns alone rather than re-sending them.
  | "is_emergency_request"
  | "emergency_ack_at"
  // Same reasoning, different reason: these record consent given BEFORE
  // payment, so the hold is both when they're true and the last point a
  // rejection is still free. Re-sending policy_accepted_at from the client
  // at claim time is exactly how a second checkout attempt used to overwrite
  // a correct timestamp with the first attempt's stale one.
  | "policy_accepted_at"
  | "safety_ack_required"
  | "safety_ack_at"
>;

/** One claimed slot's identity + the real booking id it now maps to. */
export interface CartClaimResult {
  provider_id: string;
  booking_date: string;
  booking_time: string;
  booking_id: string;
}

/** Convert this batch's still-live held rows into real bookings in place.
 *  Items with no matching live hold (expired, or never held) are simply
 *  absent from the result; this never throws on a partial or empty match.
 *  There is no fallback insert — clients have no INSERT policy on bookings,
 *  so an absent item means that booking did not happen and the caller must
 *  report it as failed. */
export async function claimCartBookingSlots(
  holdBatchId: string,
  items: (CartClaimItem & {
    provider_id: string;
    booking_date: string;
    booking_time: string;
  })[],
): Promise<CartClaimResult[]> {
  const { data, error } = await supabase.rpc("claim_cart_booking_slots", {
    p_hold_batch_id: holdBatchId,
    p_items: items,
  });
  if (error) throw error;
  return (data ?? []) as CartClaimResult[];
}

/** Best-effort immediate release when the user backs out of payment
 *  (close button, booking failure, Stripe Payment Sheet 'Canceled'). Not
 *  the source of truth for cleanup — expire_cart_holds() cron sweep is —
 *  this just frees the slot sooner than the 10-minute TTL. Callers should
 *  catch-and-log, never let a release failure surface as a user error. */
export async function releaseCartBookingSlots(
  holdBatchId: string,
): Promise<void> {
  const { error } = await supabase.rpc("release_cart_booking_slots", {
    p_hold_batch_id: holdBatchId,
  });
  if (error) throw error;
}

// createBooking() was deleted here on 2026-08-20. It did a direct client
// INSERT into public.bookings, which no RLS policy has permitted since
// 20260810180302_revoke_legacy_client_booking_writes — the only INSERT
// policy is bookings_provider_insert. Its last caller was BookingContext's
// post-payment fallback, which could therefore only ever produce an RLS
// error; that path now reports the item as unbookable instead. Client
// bookings go exclusively through hold_cart_booking_slots +
// claim_cart_booking_slots; provider-side manual bookings go through
// provider_create_manual_booking / insertDirectBooking.

/** Update booking status (provider-side confirm/start/complete/no-show — cancel
 *  goes through cancelOwnBooking/providerCancelOwnBooking instead). Routed
 *  through a SECURITY DEFINER RPC that can only touch the status column — see
 *  fix_bookings_provider_update_bypass.sql. */
export async function updateBookingStatus(
  bookingId: string,
  status: DbBooking["status"],
): Promise<void> {
  const { error } = await supabase.rpc("provider_update_booking_status", {
    p_booking_id: bookingId,
    p_status: status,
  });

  if (error) throw error;
}

/** Patch group-booking metadata on already-created bookings — used to
 *  reconcile is_group_booking/group_booking_id/group_booking_count after a
 *  multi-service checkout partially fails, since those fields are stamped
 *  from the original cart size before any item's outcome is known. */
export async function updateBookingGroupInfo(
  bookingIds: string[],
  groupInfo: {
    is_group_booking: boolean;
    group_booking_id: string | null;
    group_booking_count: number;
  },
): Promise<void> {
  if (bookingIds.length === 0) return;
  const { error } = await supabase
    .from("bookings")
    .update(groupInfo)
    .in("id", bookingIds);
  if (error) throw error;
}

/** Cancel a booking as its client owner. Routed through cancel_own_booking()
 *  so the provider's cancellation_notice_hours is enforced server-side —
 *  a plain .update({status:'cancelled'}) has no notice-window check at all
 *  (see supabase/booking_rules_server_enforcement.sql). */
export async function cancelOwnBooking(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_own_booking", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

/** Reverse of the provider's no_show action: lets a CLIENT mark a booking as
 *  the PROVIDER not having shown up. Routed through client_mark_provider_
 *  no_show() (SECURITY DEFINER RPC) which enforces the same guardrails
 *  philosophy as provider_update_booking_status()'s no_show branch —
 *  same calendar day, appointment start time passed, terminal-state check,
 *  no active reschedule request — server-side. See
 *  supabase/fix_provider_no_show_status.sql. The provider is notified by
 *  handle_booking_status_change() (DB trigger owns this, no app-side
 *  duplicate insert). */
export async function markProviderNoShow(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("client_mark_provider_no_show", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

/**
 * Dispute a no-show recorded against you — in either direction. A client
 * disputes a 'no_show'; a provider disputes a 'provider_no_show'.
 *
 * dispute_no_show() (SECURITY DEFINER, migration 20260827154500) derives WHO
 * is disputing from auth.uid() against the booking and refuses anyone who
 * isn't the accused party, so the hat this is called from is not what makes
 * it safe. It also enforces the dispute window, refuses a second dispute, and
 * notifies the other party — no app-side notification insert.
 *
 * This records a disagreement. It does NOT reverse the status and nothing in
 * the app adjudicates it; what it does change is that the no-show stops on
 * its way to becoming a permanent reliability count (see
 * settle_no_show_reliability). Callers should file the support ticket too —
 * that is the only route by which a human ever sees it.
 */
export async function disputeNoShow(
  bookingId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc("dispute_no_show", {
    p_booking_id: bookingId,
    p_reason: reason,
  });
  if (error) throw error;
}

/** Cancel a booking as its owning provider. Routed through
 *  provider_cancel_own_booking() to verify ownership server-side (no notice
 *  window — providers can cancel any time, same as before). */
export async function providerCancelOwnBooking(
  bookingId: string,
): Promise<void> {
  const { error } = await supabase.rpc("provider_cancel_own_booking", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

/** Confirm/start/complete/no-show ALL of the calling provider's own sibling
 *  rows in a group booking at once (see fix_group_booking_atomic_actions.sql)
 *  — a client's group of services from one provider should never show mixed
 *  status. The RPC is all-or-nothing: if even one sibling can't legally make
 *  this transition (wrong current status, or before the appointment start
 *  time for no_show/completed), it throws and NOTHING changes — callers
 *  should show the thrown message directly, it already names which booking
 *  blocked it. Returns every updated booking's id so the caller can update
 *  local state for all of them, not just the one that was open. Never call
 *  this for a booking with no group_booking_id — use updateBookingStatus. */
export async function updateGroupBookingStatus(
  groupBookingId: string,
  status: DbBooking["status"],
): Promise<{ bookingId: string; newStatus: string }[]> {
  const { data, error } = await supabase.rpc(
    "provider_update_group_booking_status",
    {
      p_group_booking_id: groupBookingId,
      p_status: status,
    },
  );
  if (error) throw error;
  return (data ?? []).map(
    (row: { booking_id: string; new_status: string }) => ({
      bookingId: row.booking_id,
      newStatus: row.new_status,
    }),
  );
}

/** Cancel ALL of the calling provider's own sibling rows in a group booking
 *  at once. Same all-or-nothing semantics as updateGroupBookingStatus — see
 *  fix_group_booking_atomic_actions.sql. Never call this for a booking with
 *  no group_booking_id — use providerCancelOwnBooking. */
export async function providerCancelGroupBooking(
  groupBookingId: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("provider_cancel_group_booking", {
    p_group_booking_id: groupBookingId,
  });
  if (error) throw error;
  return (data ?? []).map((row: { booking_id: string }) => row.booking_id);
}

// ─────────────────────────────────────────────────────────
// BOOKINGS — Provider side
// ─────────────────────────────────────────────────────────

/**
 * Fetch the current provider's bookings within a bounded recent window
 * (default 90 days back, mirroring getMyBookings()) plus everything
 * upcoming — an unbounded `select('*')` over a provider's entire booking
 * history doesn't scale as accounts age. Pass a larger `sinceDaysAgo` (or
 * `Infinity`) for callers that genuinely need full lifetime history (e.g.
 * ProviderAnalyticsScreen's "All" range); everything else should rely on
 * the default. Older bookings beyond the window remain reachable via
 * getOlderProviderBookings() for a "load more" affordance.
 */
export async function getProviderBookings(
  sinceDaysAgo = 90,
): Promise<BookingWithAddOns[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];

  let query = supabase
    .from("bookings")
    .select(
      `
      *,
      add_ons: booking_add_ons ( * )
    `,
    )
    .eq("provider_id", provider.id)
    // A not-yet-claimed waitlist hold isn't a real appointment yet — it
    // surfaces in the Waitlist tab instead (see getProviderWaitlist).
    .neq("status", "on_hold");

  if (Number.isFinite(sinceDaysAgo)) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - sinceDaysAgo);
    query = query.gte("booking_date", cutoff.toISOString().split("T")[0]);
  }

  const { data, error } = await query
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true })
    .limit(DEFAULT_LIFETIME_BOOKINGS_QUERY_LIMIT);

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/** Subscribe to booking changes for one provider; caller owns the cleanup. */
export function subscribeToProviderBookingChanges(
  providerId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`provider-bookings-${providerId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bookings",
        filter: `provider_id=eq.${providerId}`,
      },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export interface ProviderBookingLiveUpdate {
  booking_date?: string;
  booking_time?: string;
  end_time?: string | null;
  status?: string;
}

/** Realtime detail updates for one booking and its reschedule request. */
export function subscribeToProviderBookingDetailChanges(
  bookingId: string,
  callbacks: {
    onReschedule: (row: DbBookingRescheduleRequest | null) => void;
    onBookingUpdate: (row: ProviderBookingLiveUpdate) => void;
  },
): () => void {
  const channel = supabase
    .channel(`provider-booking-detail-${bookingId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "booking_reschedule_requests",
        filter: `booking_id=eq.${bookingId}`,
      },
      (payload) => callbacks.onReschedule(
        payload.eventType === "DELETE"
          ? null
          : (payload.new as DbBookingRescheduleRequest),
      ),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "bookings",
        filter: `id=eq.${bookingId}`,
      },
      (payload) => callbacks.onBookingUpdate(
        payload.new as ProviderBookingLiveUpdate,
      ),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Page further back than getProviderBookings()'s default window. `beforeDate`
 * should be the oldest `booking_date` already loaded (YYYY-MM-DD) — since the
 * initial window always fetches full days (`gte`), paging with `lt` on that
 * boundary can't skip or duplicate same-day bookings. Mirrors getOlderBookings()
 * on the client side.
 */
export async function getOlderProviderBookings(
  beforeDate: string,
  limit = 30,
): Promise<BookingWithAddOns[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];

  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      add_ons: booking_add_ons ( * )
    `,
    )
    .eq("provider_id", provider.id)
    .neq("status", "on_hold")
    .lt("booking_date", beforeDate)
    .order("booking_date", { ascending: false })
    .order("booking_time", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/**
 * Every booking sharing a group_booking_id, scoped to the CURRENT provider's
 * own rows only — a group booking can span multiple providers (each booked
 * separately in one client checkout), and a provider must never see another
 * provider's services within the same client group, only their own. RLS
 * (bookings_provider_read) already enforces this server-side; the explicit
 * .eq('provider_id', ...) here just makes the boundary visible in the query
 * itself rather than relying on RLS alone to narrow it.
 */
export async function getGroupBookingSiblings(
  groupBookingId: string,
): Promise<BookingWithAddOns[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];

  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      add_ons: booking_add_ons ( * )
    `,
    )
    .eq("group_booking_id", groupBookingId)
    .eq("provider_id", provider.id)
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/** A provider_conversations row joined with the client's basic profile info */
export interface ProviderConversationWithClient {
  id: string;
  provider_id: string;
  user_id: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count_user: number;
  unread_count_provider: number;
  created_at: string;
  updated_at: string;
  client: { id: string; name: string; avatar_url: string | null } | null;
}

/** Fetch all conversations for the current provider, most recently updated first */
export async function getProviderConversations(): Promise<
  ProviderConversationWithClient[]
> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];

  const { data, error } = await supabase
    .from("provider_conversations")
    .select(
      "id, provider_id, user_id, last_message, last_message_at, unread_count_user, unread_count_provider, created_at, updated_at",
    )
    .eq("provider_id", provider.id)
    .order("updated_at", { ascending: false })
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);

  if (error) throw error;
  const conversations = (data ?? []) as Omit<
    ProviderConversationWithClient,
    "client"
  >[];
  if (conversations.length === 0) return [];

  // Client name/avatar via the same batched RPC as getProviderReviews — see
  // fix_users_table_pii_leak.sql for why this isn't an embedded users join.
  const userIds = [...new Set(conversations.map((c) => c.user_id))];
  const { data: profiles, error: profilesError } = await supabase.rpc(
    "get_user_public_profiles",
    { p_user_ids: userIds },
  );
  if (profilesError) throw profilesError;
  const profileById = new Map<
    string,
    { id: string; name: string; avatar_url: string | null }
  >(
    (profiles ?? []).map((p: any) => [
      p.id,
      { id: p.id, name: p.name, avatar_url: p.avatar_url },
    ]),
  );

  return conversations.map(
    (c): ProviderConversationWithClient => ({
      ...c,
      client: profileById.get(c.user_id) ?? null,
    }),
  );
}

/** Count unread provider conversations without hydrating conversation rows. */
export async function getProviderUnreadConversationCount(): Promise<number> {
  const provider = await getMyProviderProfile();
  if (!provider) return 0;
  const { count, error } = await supabase
    .from("provider_conversations")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", provider.id)
    .gt("unread_count_provider", 0);
  if (error) throw error;
  return count ?? 0;
}

/** A provider_conversations row joined with the provider's public info */
export interface UserConversationWithProvider {
  id: string;
  provider_id: string;
  user_id: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count_user: number;
  unread_count_provider: number;
  created_at: string;
  updated_at: string;
  provider: {
    id: string;
    slug: string;
    display_name: string;
    logo_url: string | null;
  } | null;
}

/** Fetch all conversations for the current client user, most recently updated first */
export async function getUserConversations(): Promise<
  UserConversationWithProvider[]
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("provider_conversations")
    .select(
      "id, provider_id, user_id, last_message, last_message_at, unread_count_user, unread_count_provider, created_at, updated_at, provider: providers ( id, slug, display_name, logo_url )",
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);

  if (error) throw error;
  return (data ?? []) as unknown as UserConversationWithProvider[];
}

/** Subscribe only to one client's conversation rows. */
export function subscribeToUserConversationChanges(
  userId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`user-conversations-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "provider_conversations",
        filter: `user_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Fetch bookings for a provider on a specific date */
export async function getProviderBookingsByDate(
  providerId: string,
  date: string,
): Promise<BookingWithAddOns[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      add_ons: booking_add_ons ( * )
    `,
    )
    .eq("provider_id", providerId)
    .eq("booking_date", date)
    .not("status", "in", '("cancelled","on_hold")')
    .order("booking_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/** Bookings across an inclusive date range — one query instead of one per day. */
export async function getProviderBookingsByDateRange(
  providerId: string,
  startDate: string,
  endDate: string,
  limit = DEFAULT_PROVIDER_QUERY_LIMIT,
): Promise<BookingWithAddOns[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      add_ons: booking_add_ons ( * )
    `,
    )
    .eq("provider_id", providerId)
    .gte("booking_date", startDate)
    .lte("booking_date", endDate)
    .not("status", "in", '("cancelled","on_hold")')
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

// ─────────────────────────────────────────────────────────
// WAITLIST
// ─────────────────────────────────────────────────────────

export interface WaitlistEntry {
  id: string;
  provider_id: string;
  user_id: string;
  service_id: string | null;
  service_name_snapshot: string;
  provider_name_snapshot: string;
  user_name_snapshot: string | null;
  // [0] = range start, [1] = range end (absent = open-ended). NULL = any date.
  preferred_dates: string[] | null;
  notes: string | null;
  status: "waiting" | "notified" | "booked" | "expired" | "cancelled";
  position: number;
  created_at: string;
  notified_at: string | null;
  expires_at: string;
}

export interface JoinWaitlistParams {
  providerId: string;
  userId: string;
  serviceId: string | null;
  serviceNameSnapshot: string;
  providerNameSnapshot: string;
  userNameSnapshot?: string;
  preferredDates?: string[];
  notes?: string;
}

/** Join a provider's waitlist. Removes any stale row for the same
 *  provider+service first so re-joining always works. */
export async function joinWaitlist(
  params: JoinWaitlistParams,
): Promise<WaitlistEntry> {
  const staleQuery = supabase
    .from("provider_waitlist")
    .delete()
    .eq("provider_id", params.providerId)
    .eq("user_id", params.userId);
  if (params.serviceId) {
    await staleQuery.eq("service_id", params.serviceId);
  } else {
    await staleQuery.is("service_id", null);
  }

  const { data, error } = await supabase
    .from("provider_waitlist")
    .insert({
      provider_id: params.providerId,
      user_id: params.userId,
      service_id: params.serviceId,
      service_name_snapshot: params.serviceNameSnapshot,
      provider_name_snapshot: params.providerNameSnapshot,
      user_name_snapshot: params.userNameSnapshot ?? null,
      preferred_dates: params.preferredDates ?? null,
      notes: params.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as WaitlistEntry;
}

export async function leaveWaitlist(entryId: string): Promise<void> {
  const { error } = await supabase
    .from("provider_waitlist")
    .delete()
    .eq("id", entryId);
  if (error) throw error;
}

export async function getUserWaitlistEntries(
  userId: string,
): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase
    .from("provider_waitlist")
    .select("*")
    .eq("user_id", userId)
    .not("status", "in", '("cancelled","booked")')
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WaitlistEntry[];
}

export async function getProviderWaitlist(
  providerId: string,
): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase
    .from("provider_waitlist")
    .select("*")
    .eq("provider_id", providerId)
    .not("status", "in", '("cancelled","booked","expired")')
    .order("service_id", { ascending: true })
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WaitlistEntry[];
}

/** Provider's manual "Schedule & Invite" — the caller already inserted a
 *  real booking for this entry (see ProviderBookingHistoryScreen's
 *  handleConfirmInvite), so this just reflects that in the waitlist row and
 *  tells the client. Distinct from the automatic waitlist_holds.sql flow
 *  (invite_next_waitlist_entry/claim_waitlist_hold), which reserves a slot
 *  rather than booking it outright — a provider hand-picking someone here
 *  isn't racing the general public the way an automatic cancellation-
 *  triggered invite is, so there's nothing to hold. */
export async function inviteFromWaitlist(entry: WaitlistEntry): Promise<void> {
  const { error } = await supabase
    .from("provider_waitlist")
    .update({ status: "booked", notified_at: new Date().toISOString() })
    .eq("id", entry.id);
  if (error) throw error;

  await sendProviderClientNotifications({
    recipientUserIds: [entry.user_id],
    type: "waitlist_slot_available",
    title: "A slot opened up!",
    message: `${entry.service_name_snapshot} with ${entry.provider_name_snapshot} — booked for you, check your bookings.`,
    priority: "high",
    isActionable: true,
  });
}

/** Confirm a time-boxed waitlist hold (see waitlist_holds.sql) — turns the
 *  'on_hold' booking into a real pending/confirmed one. Throws if the hold
 *  already expired or isn't this user's. */
export async function claimWaitlistHold(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("claim_waitlist_hold", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

/** Explicitly give up a waitlist hold — cascades to the next matching
 *  candidate immediately rather than making them wait out the full window. */
export async function declineWaitlistHold(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("decline_waitlist_hold", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────

/** Fetch all notifications for the current user */
export async function getMyNotifications(
  role: "provider" | "client",
): Promise<DbNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, user_id, type, title, message, priority, is_read, is_actionable, booking_id, provider_id, metadata, created_at, recipient_role",
    )
    .eq("recipient_role", role)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return data ?? [];
}

/** Realtime notification changes for one authenticated user. */
export function subscribeToNotificationChanges(
  userId: string,
  onInsert: (notification: DbNotification) => void,
  onUpdate: (notification: DbNotification) => void,
): () => void {
  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onInsert(payload.new as DbNotification),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onUpdate(payload.new as DbNotification),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Mark a notification as read. Routed through a SECURITY DEFINER RPC that can
 *  only touch is_read — see fix_notifications_update_bypass.sql. */
export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });

  if (error) throw error;
}

/** Mark all notifications as read */
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw error;
}

/** Notify the provider for a booking owned by the signed-in client. */
export async function insertProviderNotification(params: {
  provider_id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority?: "high" | "medium" | "low";
  is_actionable?: boolean;
  booking_id?: string;
}): Promise<void> {
  if (!params.booking_id) {
    throw new Error("A booking is required when notifying a provider");
  }

  const { error } = await supabase.rpc(
    "send_client_provider_booking_notification",
    {
      p_booking_id: params.booking_id,
      p_type: params.type,
      p_title: params.title,
      p_message: params.message,
      p_priority: params.priority ?? "medium",
      p_is_actionable: params.is_actionable ?? false,
      p_metadata: {},
    },
  );
  if (error) {
    // Surface the failure — callers decide whether it's fatal. Swallowing it
    // here is how RLS-blocked inserts went unnoticed.
    logger.warn("[insertProviderNotification] insert failed:", error.message);
    throw error;
  }
}

/** Count unread notifications for the given recipient role */
export async function getUnreadNotificationCount(
  role: "provider" | "client",
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false)
    .eq("recipient_role", role);

  if (error) return 0;
  return count ?? 0;
}

// ─────────────────────────────────────────────────────────
// REVIEWS
// ─────────────────────────────────────────────────────────

/** Fetch reviews for a provider */
export async function getProviderReviews(
  providerId: string,
  options: { limit?: number } = {},
): Promise<PublicReviewWithUser[]> {
  const limit = Math.min(
    Math.max(Math.trunc(options.limit ?? DEFAULT_REVIEWS_QUERY_LIMIT), 1),
    DEFAULT_REVIEWS_QUERY_LIMIT,
  );
  const { data, error } = await supabase
    .from("reviews")
    .select("id, user_id, provider_id, rating, comment, created_at")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  const reviews = (data ?? []) as Pick<
    DbReview,
    "id" | "user_id" | "provider_id" | "rating" | "comment" | "created_at"
  >[];
  if (reviews.length === 0) return [];

  // Reviewer name/avatar comes from a SECURITY DEFINER RPC, not an embedded
  // join on the users table — that join relied on a blanket read policy on
  // users that also exposed health data to anyone (see
  // fix_users_table_pii_leak.sql). Batched into one call, not per-row.
  const userIds = [...new Set(reviews.map((r) => r.user_id))];
  const { data: profiles, error: profilesError } = await supabase.rpc(
    "get_user_public_profiles",
    {
      p_user_ids: userIds,
    },
  );
  if (profilesError) throw profilesError;
  const profileById = new Map<string, Pick<DbUser, "name" | "avatar_url">>(
    (profiles ?? []).map(
      (profile: {
        id: string;
        name: string | null;
        avatar_url: string | null;
      }) => [
        profile.id,
        { name: profile.name ?? "", avatar_url: profile.avatar_url },
      ],
    ),
  );

  return reviews.map((r) => ({
    ...r,
    user: profileById.get(r.user_id) ?? { name: "", avatar_url: null },
  })) as PublicReviewWithUser[];
}

/** Fetch reviews for the currently authenticated provider */
export async function getMyProviderReviews(): Promise<ReviewWithUser[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("provider_id", provider.id)
    .order("created_at", { ascending: false })
    .limit(DEFAULT_REVIEWS_QUERY_LIMIT);
  if (error) throw error;
  const reviews = (data ?? []) as DbReview[];
  if (reviews.length === 0) return [];

  const userIds = [...new Set(reviews.map((review) => review.user_id))];
  const { data: profiles, error: profilesError } = await supabase.rpc(
    "get_user_public_profiles",
    { p_user_ids: userIds },
  );
  if (profilesError) throw profilesError;
  const profileById = new Map<string, Pick<DbUser, "name" | "avatar_url">>(
    (profiles ?? []).map(
      (profile: {
        id: string;
        name: string | null;
        avatar_url: string | null;
      }) => [
        profile.id,
        { name: profile.name ?? "", avatar_url: profile.avatar_url },
      ],
    ),
  );
  return reviews.map((review) => ({
    ...review,
    user: profileById.get(review.user_id) ?? { name: "", avatar_url: null },
  }));
}

/** Submit a review for a completed booking */
export async function submitReview(review: {
  booking_id: string;
  provider_id: string;
  service_id: string | null;
  user_id: string;
  rating: number;
  comment?: string;
  tip_amount?: number;
}): Promise<DbReview> {
  const { data, error } = await supabase
    .from("reviews")
    .insert(review)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Check if current user has already reviewed a booking */
export async function hasReviewedBooking(bookingId: string): Promise<boolean> {
  // maybeSingle, not single: "no review yet" is the normal case and single()
  // treats it as a PGRST116 error. This is called on every booking-detail mount.
  const { data } = await supabase
    .from("reviews")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  return !!data;
}

/** The tip recorded against a booking, or null when there's no review/tip yet. */
export async function getBookingTip(bookingId: string): Promise<number | null> {
  const { data } = await supabase
    .from("reviews")
    .select("tip_amount")
    .eq("booking_id", bookingId)
    .maybeSingle();
  const tip = (data as { tip_amount?: number | null } | null)?.tip_amount;
  return tip == null ? null : Number(tip);
}

/**
 * Record a tip against a booking's review.
 *
 * Tips live on the reviews row (reviews.tip_amount) — that table has
 * UNIQUE(booking_id) and a NOT NULL rating, so a tip cannot exist without a
 * review. Returns false when there is no review to attach to, so the caller can
 * ask the client to rate first rather than dropping the tip silently (which is
 * what the UI did before: it only ever set local state).
 *
 * NOTE: this records the AMOUNT only. No payment provider is wired up for tips,
 * so no money moves — the copy shown to the client must not claim otherwise.
 */
export async function setBookingTip(
  bookingId: string,
  tipAmount: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("reviews")
    .update({ tip_amount: tipAmount })
    .eq("booking_id", bookingId)
    .select("id");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// ─────────────────────────────────────────────────────────
// EVENT PLANS (My Plans)
// ─────────────────────────────────────────────────────────

/** Fetch all event plans for the current user */
export async function getMyEventPlans(): Promise<DbEventPlan[]> {
  const { data, error } = await supabase
    .from("event_plans")
    .select("*")
    .order("event_date", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Fetch tasks and checklist for an event plan */
export async function getEventPlanDetails(eventPlanId: string): Promise<{
  tasks: DbEventTask[];
  checklist: DbEventChecklistItem[];
}> {
  const [tasksResult, checklistResult] = await Promise.all([
    supabase
      .from("event_tasks")
      .select("*")
      .eq("event_plan_id", eventPlanId)
      .order("sort_order"),
    supabase
      .from("event_checklist_items")
      .select("*")
      .eq("event_plan_id", eventPlanId)
      .order("sort_order"),
  ]);

  if (tasksResult.error) throw tasksResult.error;
  if (checklistResult.error) throw checklistResult.error;

  return {
    tasks: tasksResult.data ?? [],
    checklist: checklistResult.data ?? [],
  };
}

// ─────────────────────────────────────────────────────────
// AVAILABILITY
// ─────────────────────────────────────────────────────────

export async function resolveActiveProviderIdByDisplayName(
  displayName: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("id")
    .ilike("display_name", displayName)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function getAvailabilityWeeklyScheduleRows(providerId: string): Promise<{
  windowRows: { day_of_week: number; start_time: string; end_time: string }[];
  legacyRows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean }[];
}> {
  const [windows, legacy] = await Promise.all([
    supabase
      .from("provider_availability_windows")
      .select("day_of_week, start_time, end_time")
      .eq("provider_id", providerId)
      .order("start_time"),
    supabase
      .from("provider_availability")
      .select("day_of_week, open_time, close_time, is_closed")
      .eq("provider_id", providerId),
  ]);
  if (windows.error) throw windows.error;
  if (legacy.error) throw legacy.error;
  return { windowRows: windows.data ?? [], legacyRows: legacy.data ?? [] };
}

export async function getAvailabilityServiceBufferRows(serviceIds: string[]): Promise<{
  id: string;
  buffer_before_mins: number | null;
  buffer_after_mins: number | null;
}[]> {
  if (serviceIds.length === 0) return [];
  const { data, error } = await supabase
    .from("services")
    .select("id, buffer_before_mins, buffer_after_mins")
    .in("id", serviceIds);
  if (error) throw error;
  return data ?? [];
}

/** Which of these service ids a client can still actually book.
 *
 *  One query answers three different ways a cart item can go stale, because
 *  the `services_public_read` RLS policy already encodes all of them: the row
 *  is returned only when `is_active = true` AND its provider is both
 *  `has_gone_live` and `is_active`. So an id missing from the result has been
 *  deleted, withdrawn by its provider, or belongs to a provider who
 *  unpublished — and none of those are worth telling a client apart.
 *
 *  Ids that were never valid UUIDs are the caller's problem to filter; this
 *  returns exactly what the database confirmed, never a permissive default. */
export async function getBookableServiceIds(serviceIds: string[]): Promise<Set<string>> {
  if (serviceIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("services")
    .select("id")
    .in("id", serviceIds);
  if (error) throw error;
  return new Set((data ?? []).map((row: { id: string }) => row.id));
}

export async function getAvailabilityNoticeSettings(providerId: string): Promise<{
  min_booking_notice_hrs: number;
  display_name: string | null;
} | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("min_booking_notice_hrs, display_name")
    .eq("id", providerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The emergency-request opt-ins plus the provider's chosen request window.
 *  Listed once because two call sites read it and they must not drift. */
const EMERGENCY_POLICY_COLUMNS =
  "allow_out_of_hours_requests, allow_blocked_date_requests, allow_short_notice_requests, allow_beyond_window_requests, request_window_before_mins, request_window_after_mins";

/** One provider row, selecting exactly the columns asked for. */
async function selectProviderColumns(
  providerId: string,
  columns: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("providers")
    .select(columns)
    .eq("id", providerId)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

export async function getAvailabilityEmergencyPolicyRow(providerId: string): Promise<Record<string, unknown> | null> {
  return selectProviderColumns(providerId, EMERGENCY_POLICY_COLUMNS);
}

export interface AvailabilityProviderSettingsRow {
  booking_window_days: number;
  slot_interval_mins: number;
  buffer_mins: number;
  min_booking_notice_hrs: number;
  allow_out_of_hours_requests: boolean;
  allow_blocked_date_requests: boolean;
  allow_short_notice_requests: boolean;
  allow_beyond_window_requests: boolean;
  /** NULL = any time. See providers.request_window_before_mins. */
  request_window_before_mins: number | null;
  request_window_after_mins: number | null;
}

/** A provider's scheduling settings + weekly hours, which every single-day
 *  availability lookup needs and none of them change.
 *
 *  Opening the booking sheet asks for one week — seven independent day
 *  lookups — and each one was re-reading this same settings row and the same
 *  seven schedule rows, so a week cost fourteen queries that returned
 *  identical data. Short TTL because a provider editing their own hours in
 *  another session should see it within seconds, and in-flight de-duping so
 *  the seven parallel day lookups that start together share ONE request
 *  rather than all missing an empty cache at once. */
const AVAILABILITY_CORE_CACHE_TTL_MS = 15_000;
const AVAILABILITY_CORE_CACHE_MAX_ENTRIES = 40;

type AvailabilityProviderCore = {
  settings: AvailabilityProviderSettingsRow | null;
  windowRows: { day_of_week: number; start_time: string; end_time: string }[];
  legacyRows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean }[];
};

const availabilityCoreCache = new BoundedTtlCache<string, AvailabilityProviderCore>(
  AVAILABILITY_CORE_CACHE_TTL_MS,
  AVAILABILITY_CORE_CACHE_MAX_ENTRIES,
);
const availabilityCoreRequests = new Map<string, Promise<AvailabilityProviderCore>>();

export async function getAvailabilityProviderCore(providerId: string): Promise<AvailabilityProviderCore> {
  const cached = availabilityCoreCache.get(providerId);
  if (cached) return cached;
  const inFlight = availabilityCoreRequests.get(providerId);
  if (inFlight) return inFlight;

  const request = fetchAvailabilityProviderCore(providerId)
    .then(core => {
      availabilityCoreCache.set(providerId, core);
      return core;
    })
    .finally(() => {
      availabilityCoreRequests.delete(providerId);
    });
  availabilityCoreRequests.set(providerId, request);
  return request;
}

/** Drop the cached hours for one provider. Call after writing their schedule,
 *  so the picker doesn't keep serving the old week for the rest of the TTL. */
export function invalidateAvailabilityProviderCore(providerId: string): void {
  availabilityCoreCache.delete(providerId);
  availabilityCoreRequests.delete(providerId);
}

async function fetchAvailabilityProviderCore(providerId: string): Promise<{
  settings: AvailabilityProviderSettingsRow | null;
  windowRows: { day_of_week: number; start_time: string; end_time: string }[];
  legacyRows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean }[];
}> {
  const baseColumns = "booking_window_days, slot_interval_mins, buffer_mins, min_booking_notice_hrs";
  const [settingsRow, weeklyRows] = await Promise.all([
    selectProviderColumns(providerId, `${baseColumns}, ${EMERGENCY_POLICY_COLUMNS}`),
    getAvailabilityWeeklyScheduleRows(providerId),
  ]);
  return {
    settings: settingsRow as AvailabilityProviderSettingsRow | null,
    ...weeklyRows,
  };
}

export async function getAvailabilityDateExceptions(
  providerId: string,
  fromDate: string,
  toDate: string,
): Promise<{
  blockedDates: string[];
  overrides: {
    availability_date: string;
    is_closed: boolean;
    start_time: string | null;
    end_time: string | null;
  }[];
}> {
  const [blocked, overrides] = await Promise.all([
    supabase
      .from("provider_blocked_dates")
      .select("blocked_date")
      .eq("provider_id", providerId)
      .gte("blocked_date", fromDate)
      .lte("blocked_date", toDate),
    supabase
      .from("provider_availability_overrides")
      .select("availability_date, is_closed, start_time, end_time")
      .eq("provider_id", providerId)
      .gte("availability_date", fromDate)
      .lte("availability_date", toDate)
      .order("start_time"),
  ]);
  if (blocked.error) throw blocked.error;
  if (overrides.error) throw overrides.error;
  return {
    blockedDates: (blocked.data ?? []).map(row => row.blocked_date),
    overrides: overrides.data ?? [],
  };
}

/**
 * All provider-owned scheduling data needed to evaluate one calendar date.
 * Keeping this projection here preserves the database boundary while letting
 * AvailabilityService evaluate rules without a chain of screen-time queries.
 */
export async function getAvailabilityDateBundle(
  providerId: string,
  date: string,
  serviceId?: string,
): Promise<{
  settings: AvailabilityProviderSettingsRow | null;
  windowRows: { day_of_week: number; start_time: string; end_time: string }[];
  legacyRows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean }[];
  isBlocked: boolean;
  overrides: {
    availability_date: string;
    is_closed: boolean;
    start_time: string | null;
    end_time: string | null;
  }[];
  serviceBuffer: {
    id: string;
    buffer_before_mins: number | null;
    buffer_after_mins: number | null;
  } | null;
}> {
  const [core, exceptions, serviceBuffers] = await Promise.all([
    getAvailabilityProviderCore(providerId),
    getAvailabilityDateExceptions(providerId, date, date),
    serviceId ? getAvailabilityServiceBufferRows([serviceId]) : Promise.resolve([]),
  ]);
  return {
    ...core,
    isBlocked: exceptions.blockedDates.includes(date),
    overrides: exceptions.overrides,
    serviceBuffer: serviceBuffers[0] ?? null,
  };
}

export async function getProviderBookingWindowDays(providerId: string): Promise<number> {
  const { data, error } = await supabase
    .from("providers")
    .select("booking_window_days")
    .eq("id", providerId)
    .maybeSingle();
  if (error) throw error;
  return data?.booking_window_days ?? 60;
}

export interface ProviderBusySpan {
  booking_date: string; // 'YYYY-MM-DD'
  busy_start: string; // 'HH:MM:SS'
  busy_end: string;
}

/**
 * Buffer-padded busy spans for a provider over a date range, via the
 * get_provider_busy_spans SECURITY DEFINER RPC.
 *
 * Reading `bookings` directly does NOT work from a client session: RLS grants
 * SELECT only to the booking's own client and to the owning provider, so a
 * client browsing another provider gets zero rows — indistinguishable from
 * "nothing is booked", which is why the slot picker used to offer taken slots
 * as free. The RPC returns only date/start/end (no booking id, user, service
 * or price), so availability can be accurate without exposing a table that
 * holds client PII.
 *
 * Requires supabase/provider_busy_spans_rpc.sql to be deployed.
 */
export async function getProviderBusySpans(
  providerId: string,
  fromDate: string,
  toDate: string,
): Promise<ProviderBusySpan[]> {
  const { data, error } = await supabase.rpc("get_provider_busy_spans", {
    p_provider_id: providerId,
    p_from_date: fromDate,
    p_to_date: toDate,
  });
  if (error) throw error;
  return (data ?? []) as ProviderBusySpan[];
}

// ─────────────────────────────────────────────────────────
// RESCHEDULE REQUESTS
// ─────────────────────────────────────────────────────────

/** Client requests a reschedule. Routed through request_reschedule_own_booking()
 *  so the 24h anti-spam cooldown, the provider's maxReschedules cap, and the
 *  provider's reschedule notice window are all enforced server-side — upsert
 *  above has none of that, it's a plain unconditional write. */
export async function requestRescheduleOwnBooking(
  bookingId: string,
  preferredDates: string[],
): Promise<void> {
  const { error } = await supabase.rpc("request_reschedule_own_booking", {
    p_booking_id: bookingId,
    p_preferred_dates: preferredDates,
  });
  if (error) throw error;
}

/** Get the active (pending or provider_responded) reschedule request for a booking */
export async function getActiveRescheduleRequest(
  bookingId: string,
): Promise<DbBookingRescheduleRequest | null> {
  const { data, error } = await supabase
    .from("booking_reschedule_requests")
    .select("*")
    .eq("booking_id", bookingId)
    .in("status", ["pending", "provider_responded"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as DbBookingRescheduleRequest | null;
}

/**
 * Active reschedule requests for many bookings at once, keyed by booking_id.
 *
 * loadBookings uses this to hydrate reschedule state, which otherwise exists
 * only in AsyncStorage — so an in-flight reschedule was invisible on a second
 * device or after clearing storage. One query rather than N.
 */
export async function getActiveRescheduleRequestsForBookings(
  bookingIds: string[],
): Promise<Record<string, DbBookingRescheduleRequest>> {
  // booking_id is a uuid column, so PostgREST casts the whole .in() list to
  // uuid — a single locally-created id (the `booking_`-prefixed ones
  // BookingContext deliberately keeps in its merge) made the query fail with
  // 22P02 for EVERY booking, not just that one. Callers read "no row" as
  // "no active request" and clear isPendingReschedule, so one un-synced local
  // booking silently wiped the pending-reschedule state off all the others.
  const uuidIds = bookingIds.filter(isUuid);
  if (uuidIds.length === 0) return {};

  const { data, error } = await supabase
    .from("booking_reschedule_requests")
    .select("*")
    .in("booking_id", uuidIds)
    .in("status", ["pending", "provider_responded"])
    .order("created_at", { ascending: false });

  // Must throw, never return {} — an empty map is indistinguishable from
  // "this booking has no active request", and callers act on that by
  // clearing local reschedule state. Swallowing a transient failure here
  // dropped the "Reschedule Pending" state off a booking whose request was
  // very much alive server-side, which then surfaced as an
  // "already in progress" rejection when the client re-requested.
  if (error) throw error;
  if (!data) return {};

  const out: Record<string, DbBookingRescheduleRequest> = {};
  for (const row of data as DbBookingRescheduleRequest[]) {
    // Newest-first, so the first row seen for a booking is the current one.
    if (!out[row.booking_id]) out[row.booking_id] = row;
  }
  return out;
}

/** Provider responds with their available slots. Routed through
 *  respond_to_reschedule_request() so the caller's provider ownership of
 *  the booking and the request's 'pending' status are re-verified
 *  server-side — RLS on booking_reschedule_requests is SELECT-only, a
 *  direct .update() can no longer write this row at all. responseNote
 *  (the "Apologise" text) is persisted so the trigger-owned notification
 *  can read it back — see supabase/fix_reschedule_flow_completion.sql. */
export async function respondToRescheduleRequest(
  bookingId: string,
  availableSlots: { date: string; times: string[] }[],
  responseNote?: string,
): Promise<void> {
  const { error } = await supabase.rpc("respond_to_reschedule_request", {
    p_booking_id: bookingId,
    p_available_slots: availableSlots,
    p_response_note: responseNote ?? null,
  });
  if (error) throw error;
}

// updateBookingDateTime() was removed here (2026-08-20) — a raw .update() on
// booking_date/booking_time/end_time with none of the reschedule-request
// approval flow, reschedule-count limit, or notice-window checks this path
// needs, and bookings' RLS has no WITH CHECK to catch that at the DB layer
// either. It was already dead (its only caller, bookingService.ts's
// rescheduleBookingInSupabase(), had zero callers itself). Use
// confirmRescheduleOwnBooking() below instead.

/** Client confirms a provider-approved reschedule slot. Routed through
 *  confirm_reschedule_own_booking() — requires an active provider_responded
 *  request server-side (a client can't invent a reschedule out of nothing),
 *  and increments the new reschedule_count / last_rescheduled_at columns
 *  that request_reschedule_own_booking()'s cooldown/cap checks read from.
 *  Supersedes a raw updateBookingDateTime() call for this path. */
export async function confirmRescheduleOwnBooking(
  bookingId: string,
  newDate: string,
  newTime: string,
  newEndTime: string,
): Promise<void> {
  const { error } = await supabase.rpc("confirm_reschedule_own_booking", {
    p_booking_id: bookingId,
    p_new_date: newDate,
    p_new_time: newTime,
    p_new_end_time: newEndTime,
  });
  if (error) throw error;
}

/** Provider initiates a reschedule by proposing new slots directly.
 *  Routed through provider_initiate_reschedule() so the caller's provider
 *  ownership of the booking is re-verified server-side (original_date/time
 *  are read from the booking row itself, not trusted from the client) —
 *  same reasoning as respondToRescheduleRequest above. */
export async function upsertProviderRescheduleRequest(params: {
  booking_id: string;
  proposed_slots: { date: string; times: string[] }[];
}): Promise<void> {
  const { error } = await supabase.rpc("provider_initiate_reschedule", {
    p_booking_id: params.booking_id,
    p_proposed_slots: params.proposed_slots,
  });
  if (error) throw error;
}

/** Provider declines a pending client reschedule request outright — no
 *  alternative slots required (distinct from respondToRescheduleRequest's
 *  "Apologise" path, which still requires >=1 proposed slot). The booking
 *  is untouched; only the request row closes. Routed through
 *  reject_reschedule_request() so provider ownership and the request's
 *  'pending' status are re-verified server-side, same pattern as every
 *  other reschedule RPC. Requires supabase/fix_reschedule_flow_completion.sql. */
export async function rejectRescheduleRequest(
  bookingId: string,
  responseNote?: string,
): Promise<void> {
  const { error } = await supabase.rpc("reject_reschedule_request", {
    p_booking_id: bookingId,
    p_response_note: responseNote ?? null,
  });
  if (error) throw error;
}

/** Client declines a provider's offered reschedule times instead of
 *  silently abandoning the screen. The booking is untouched; only the
 *  request row closes. Routed through decline_reschedule_offer() so
 *  client ownership and the request's 'provider_responded' status are
 *  re-verified server-side. Requires supabase/fix_reschedule_flow_completion.sql. */
export async function declineRescheduleOffer(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("decline_reschedule_offer", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

/** Provider proposes new days for a WHOLE group booking at once — every
 *  sibling service this provider owns in the group shifts together,
 *  preserving back-to-back order. `proposals` must be pre-computed
 *  client-side (one entry per sibling, each carrying that sibling's own
 *  shifted {date,times}[] for every candidate day) — this RPC persists them
 *  atomically, it does not compute availability itself. See
 *  AvailabilityService.findAllBackToBackSlots for the chain-fitting logic
 *  that should produce these proposals, and
 *  supabase/fix_group_booking_reschedule.sql for the RPC. All-or-nothing:
 *  every booking must belong to the caller, be in this exact group, and be
 *  confirmed, or nothing is written. */
export async function providerInitiateGroupReschedule(
  groupBookingId: string,
  proposals: {
    booking_id: string;
    available_slots: { date: string; times: string[] }[];
  }[],
): Promise<string[]> {
  const { data, error } = await supabase.rpc(
    "provider_initiate_group_reschedule",
    {
      p_group_booking_id: groupBookingId,
      p_proposals: proposals,
    },
  );
  if (error) throw error;
  return (data ?? []).map((row: { booking_id: string }) => row.booking_id);
}

/** Client confirms ONE chosen day for the whole group — every sibling moves
 *  to its own selected date/time/end_time together. `selections` must name
 *  the exact chain the client picked from the provider's proposed options
 *  (client-side, via the same AvailabilityService chain data the proposal
 *  was built from). All-or-nothing: every sibling must have an active
 *  provider-responded request owned by this client in this group, or
 *  nothing is written. See supabase/fix_group_booking_reschedule.sql. */
export async function confirmGroupReschedule(
  groupBookingId: string,
  selections: {
    booking_id: string;
    new_date: string;
    new_time: string;
    new_end_time: string;
  }[],
): Promise<string[]> {
  const { data, error } = await supabase.rpc("confirm_group_reschedule", {
    p_group_booking_id: groupBookingId,
    p_selections: selections,
  });
  if (error) throw error;
  return (data ?? []).map((row: { booking_id: string }) => row.booking_id);
}

/** Client declines the whole group's offered reschedule times at once.
 *  Bookings are untouched; only the request rows close. See
 *  supabase/fix_group_booking_reschedule.sql. */
export async function declineGroupRescheduleOffer(
  groupBookingId: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("decline_group_reschedule_offer", {
    p_group_booking_id: groupBookingId,
  });
  if (error) throw error;
  return (data ?? []).map((row: { booking_id: string }) => row.booking_id);
}

/** Send a notification to the user who made a booking (provider → user direction) */
export async function insertBookingUserNotification(params: {
  booking_id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority?: "high" | "medium" | "low";
  is_actionable?: boolean;
  provider_id?: string;
}): Promise<void> {
  const { data: booking } = await supabase
    .from("bookings")
    .select("user_id")
    .eq("id", params.booking_id)
    .single();
  if (!booking?.user_id) return;

  const { error } = await supabase.from("notifications").insert({
    user_id: booking.user_id,
    type: params.type,
    title: params.title,
    message: params.message,
    priority: params.priority ?? "medium",
    is_actionable: params.is_actionable ?? false,
    booking_id: params.booking_id,
    provider_id: params.provider_id ?? null,
    recipient_role: "client",
  });
  if (error) {
    logger.warn(
      "[insertBookingUserNotification] insert failed:",
      error.message,
    );
    throw error;
  }
}

// ── Provider Availability ─────────────────────────────────────────────────────

export async function getProviderAvailability(
  providerId: string,
): Promise<DbProviderAvailability[]> {
  const { data, error } = await supabase
    .from("provider_availability")
    .select("*")
    .eq("provider_id", providerId)
    .order("day_of_week");
  if (error) throw error;
  return data ?? [];
}

/** Return every recurring working period, ordered for direct calendar display. */
export async function getProviderAvailabilityWindows(
  providerId: string,
): Promise<DbProviderAvailabilityWindow[]> {
  const { data, error } = await supabase
    .from("provider_availability_windows")
    .select("*")
    .eq("provider_id", providerId)
    .order("day_of_week")
    .order("start_time");
  if (error) throw error;
  return (data ?? []) as DbProviderAvailabilityWindow[];
}

/** Replace a provider's full weekly schedule atomically from the UI's point of view. */
export async function replaceProviderAvailabilityWindows(
  providerId: string,
  windows: { day_of_week: number; start_time: string; end_time: string }[],
): Promise<void> {
  const { error: removeError } = await supabase
    .from("provider_availability_windows")
    .delete()
    .eq("provider_id", providerId);
  if (removeError) throw removeError;
  // Both exits invalidate: clearing every window IS a schedule change, and
  // this is the primitive every schedule write goes through, so putting it
  // here covers the callers that don't go via saveProviderWeeklySchedule.
  if (windows.length === 0) {
    invalidateAvailabilityProviderCore(providerId);
    return;
  }
  const { error } = await supabase
    .from("provider_availability_windows")
    .insert(windows.map((w) => ({ provider_id: providerId, ...w })));
  if (error) throw error;
  invalidateAvailabilityProviderCore(providerId);
}

/** Replace both legacy day rows and v2 working windows.
 *
 *  NOT atomic, deliberately. This used to call `replace_provider_weekly_schedule()`,
 *  an RPC that does both in one transaction — but that function was never
 *  applied to the live database, so every call failed with "function not found"
 *  and NO provider could save their hours at all. Since a weekly schedule is
 *  one of the three go-live gates, that also silently blocked new providers
 *  from ever publishing.
 *
 *  The RPC's migration (`20260823065212_atomic_provider_weekly_schedule.sql`)
 *  is deliberately parked pending the provider terms & policy work rather than
 *  applied piecemeal, so this goes back to the two writes the app already owns.
 *  Restore the RPC call when that migration ships — the signature is unchanged.
 *
 *  The tradeoff: a failure between the two writes leaves day rows and windows
 *  out of step. Recoverable rather than silent — both writes throw, the screen
 *  keeps its `dirty` flags and tells the provider to retry, and a retry re-sends
 *  the complete schedule, overwriting whichever half landed.
 *
 *  Days go in ONE upsert rather than a loop over seven — see the no-N+1 rule. */
export async function saveProviderWeeklySchedule(
  providerId: string,
  days: {
    day_of_week: number;
    open_time: string;
    close_time: string;
    is_closed: boolean;
  }[],
  windows: { day_of_week: number; start_time: string; end_time: string }[],
): Promise<void> {
  if (days.length > 0) {
    const { error } = await supabase.from("provider_availability").upsert(
      days.map((d) => ({ provider_id: providerId, ...d })),
      { onConflict: "provider_id,day_of_week" },
    );
    if (error) throw error;
  }
  // Windows second: the day rows are what check_and_set_provider_live() reads,
  // so if the second write fails the provider is at worst still gated the same
  // way they were before, never published against a schedule that isn't there.
  // replaceProviderAvailabilityWindows invalidates the picker's cached copy
  // of these hours on both its exits, so this provider won't be shown the
  // previous week for the rest of the TTL.
  await replaceProviderAvailabilityWindows(providerId, windows);
}

export async function getProviderAvailabilityOverrides(
  providerId: string,
  fromDate?: string,
): Promise<DbProviderAvailabilityOverride[]> {
  let query = supabase
    .from("provider_availability_overrides")
    .select("*")
    .eq("provider_id", providerId)
    .order("availability_date")
    .order("start_time");
  if (fromDate) query = query.gte("availability_date", fromDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DbProviderAvailabilityOverride[];
}

export async function addProviderAvailabilityOverride(
  providerId: string,
  override: {
    availability_date: string;
    is_closed: boolean;
    start_time?: string | null;
    end_time?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("provider_availability_overrides")
    .insert({ provider_id: providerId, ...override });
  if (error) throw error;
}

export async function removeProviderAvailabilityOverride(
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("provider_availability_overrides")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function updateProviderAutoAccept(
  providerId: string,
  autoAccept: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update({ auto_accept_bookings: autoAccept })
    .eq("id", providerId);
  if (error) throw error;
}

export async function updateProviderScheduleSettings(
  providerId: string,
  settings: {
    booking_window_days: number;
    slot_interval_mins: number;
    buffer_mins: number;
    min_booking_notice_hrs: number;
  },
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update(settings)
    .eq("id", providerId);
  if (error) throw error;
}

/** The four emergency-request opt-ins plus the bound on how far an
 *  out-of-hours request may reach. Written only by the provider's own
 *  Scheduling & Availability screen — these decide what a CLIENT is allowed
 *  to ask for, and the bookability trigger reads them straight off this row,
 *  so nothing else may set them. See
 *  supabase/migrations/20260821143821_emergency_booking_requests.sql. */
export async function updateProviderRequestSettings(
  providerId: string,
  settings: {
    allow_out_of_hours_requests: boolean;
    allow_blocked_date_requests: boolean;
    allow_short_notice_requests: boolean;
    allow_beyond_window_requests: boolean;
    /** null = any time. */
    request_window_before_mins: number | null;
    request_window_after_mins: number | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update(settings)
    .eq("id", providerId);
  if (error) throw error;
}

/** Persist cancellation notice hours to providers table (0 = anytime). */
export async function updateProviderCancellationPolicy(
  providerId: string,
  noticeHours: number,
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update({ cancellation_notice_hours: noticeHours })
    .eq("id", providerId);
  if (error) throw error;
}

/** Mirror the Automations screen settings onto the providers row so client
 *  screens and pg_cron jobs can read them (auth user_metadata cannot be). */
export async function updateProviderAutomationSettings(
  providerId: string,
  settings: NonNullable<DbProvider["automation_settings"]>,
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update({ automation_settings: settings })
    .eq("id", providerId);
  if (error) throw error;
}

/** Mirrors the precedence the display surfaces (InfoRegScreen, ProviderProfileScreen)
 *  already use: prefer the dedicated cancellation_notice_hours column (set via the
 *  Automations screen); if that's unset (0), fall back to parsing the descriptive
 *  booking_policies.cancelNotice string set during registration ('none'|'24h'|'48h'|'72h').
 *  Without this fallback, enforcement could silently ignore a policy the client was
 *  already shown on the provider's profile. */
function mapCancellationPolicyRow(
  data: {
    cancellation_notice_hours: number | null;
    booking_policies: { cancelNotice?: string } | null;
  } | null,
): number {
  const hours = data?.cancellation_notice_hours ?? 0;
  if (hours > 0) return hours;
  const noticeMap: Record<string, number> = {
    none: 0,
    "24h": 24,
    "48h": 48,
    "72h": 72,
  };
  return noticeMap[data?.booking_policies?.cancelNotice ?? "none"] ?? 0;
}

/** Fetch a provider's cancellation notice window by display name. Returns 0 (anytime) on error. */
export async function getProviderCancellationPolicy(
  displayName: string,
): Promise<number> {
  const { data } = await supabase
    .from("providers")
    .select("cancellation_notice_hours, booking_policies")
    .eq("display_name", displayName)
    .maybeSingle();
  return mapCancellationPolicyRow(data);
}

/** Cancellation policy by provider id (stable) — prefer over the display-name variant. */
export async function getProviderCancellationPolicyById(
  providerId: string,
): Promise<number> {
  const { data } = await supabase
    .from("providers")
    .select("cancellation_notice_hours, booking_policies")
    .eq("id", providerId)
    .maybeSingle();
  return mapCancellationPolicyRow(data);
}

export async function upsertProviderAvailability(
  providerId: string,
  dayOfWeek: number,
  openTime: string,
  closeTime: string,
  isClosed: boolean,
): Promise<void> {
  const { error } = await supabase.from("provider_availability").upsert(
    {
      provider_id: providerId,
      day_of_week: dayOfWeek,
      open_time: openTime,
      close_time: closeTime,
      is_closed: isClosed,
    },
    { onConflict: "provider_id,day_of_week" },
  );
  if (error) throw error;
}

export async function getProviderBlockedDates(
  providerId: string,
): Promise<DbProviderBlockedDate[]> {
  const { data, error } = await supabase
    .from("provider_blocked_dates")
    .select("*")
    .eq("provider_id", providerId)
    .order("blocked_date");
  if (error) throw error;
  return data ?? [];
}

export async function addProviderBlockedDate(
  providerId: string,
  date: string,
  reason: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("provider_blocked_dates")
    .insert({ provider_id: providerId, blocked_date: date, reason });
  if (error) throw error;
}

export async function removeProviderBlockedDate(id: string): Promise<void> {
  const { error } = await supabase
    .from("provider_blocked_dates")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// CLIENT BEAUTY PROFILE
// ─────────────────────────────────────────────────────────

export interface ClientBeautyProfile {
  // Hair
  hairType: string | null;
  scalpCondition: string | null;
  hairGoals: string[];
  treatmentHistory: string[];
  // Skin
  skinType: string | null;
  skinTone: string | null;
  skinConcerns: string[];
  sensitiveAreas: string[];
  // Nails
  nailLength: string | null;
  nailShape: string | null;
  // Lashes & Brows
  lashStyle: string | null;
  lashStatus: string | null;
  browStyle: string | null;
  browCondition: string | null;
  // Makeup
  makeupCoverage: string | null;
  makeupFinish: string | null;
  makeupEyes: string | null;
  makeupLips: string | null;
  // General
  styleVibe: string | null;
  // Health & Consent
  allergies: string[];
  medicalNotes: string | null;
  photographyConsent: boolean;
}

export async function getClientBeautyProfile(
  userId: string,
): Promise<ClientBeautyProfile> {
  const EMPTY_PROFILE: ClientBeautyProfile = {
    hairType: null,
    scalpCondition: null,
    hairGoals: [],
    treatmentHistory: [],
    skinType: null,
    skinTone: null,
    skinConcerns: [],
    sensitiveAreas: [],
    nailLength: null,
    nailShape: null,
    lashStyle: null,
    lashStatus: null,
    browStyle: null,
    browCondition: null,
    makeupCoverage: null,
    makeupFinish: null,
    makeupEyes: null,
    makeupLips: null,
    styleVibe: null,
    allergies: [],
    medicalNotes: null,
    photographyConsent: true,
  };

  // Goes through a SECURITY DEFINER RPC (not a direct table select) — it
  // only returns a row when the caller is the provider on an actual
  // booking with this client. See fix_users_table_pii_leak.sql: the users
  // table used to have a blanket USING(true) read policy that let anyone
  // pull any user's health data straight off the table.
  const { data, error } = await supabase
    .rpc("get_client_beauty_profile_for_provider", { p_client_user_id: userId })
    .maybeSingle();

  // A genuine RPC failure must not be indistinguishable from "no allergies on
  // file" — this is health/safety data, so a transient error has to surface
  // as an error, not silently read as a confirmed-clear profile. The caller
  // decides how to degrade (see CLAUDE.md).
  if (error) throw error;
  // No row = legitimately no booking relationship with this client (the RPC
  // is booking-gated) — EMPTY_PROFILE is the correct, non-error result here.
  if (!data) {
    return EMPTY_PROFILE;
  }

  const d = data as any;
  return {
    hairType: d.hair_type ?? null,
    scalpCondition: d.scalp_condition ?? null,
    hairGoals: d.hair_goals ?? [],
    treatmentHistory: d.treatment_history ?? [],
    skinType: d.skin_type ?? null,
    skinTone: d.skin_tone ?? null,
    skinConcerns: d.skin_concerns ?? [],
    sensitiveAreas: d.sensitive_areas ?? [],
    nailLength: d.nail_length ?? null,
    nailShape: d.nail_shape ?? null,
    lashStyle: d.lash_style ?? null,
    lashStatus: d.lash_status ?? null,
    browStyle: d.brow_style ?? null,
    browCondition: d.brow_condition ?? null,
    makeupCoverage: d.makeup_coverage ?? null,
    makeupFinish: d.makeup_finish ?? null,
    makeupEyes: d.makeup_eyes ?? null,
    makeupLips: d.makeup_lips ?? null,
    styleVibe: d.style_vibe ?? null,
    allergies: d.allergies ?? [],
    medicalNotes: d.medical_notes ?? null,
    photographyConsent: d.photography_consent ?? true,
  };
}

// ─────────────────────────────────────────────────────────
// INTAKE FORMS
// ─────────────────────────────────────────────────────────

export interface IntakeFormQuestion {
  id: string;
  type: "text" | "yesno" | "choice" | "policy";
  label: string;
  required: boolean;
  options?: string[];
  /** 'policy' questions only — the policy text itself (read-only body the
   *  client scrolls and acknowledges), distinct from `label` which stays a
   *  short heading ("Cancellation & Booking Policy"). Unused by every other
   *  type. */
  body?: string;
}

export interface IntakeForm {
  id: string;
  bookingId: string;
  providerId: string;
  clientUserId: string;
  title: string;
  questions: IntakeFormQuestion[];
  answers: Record<string, string> | null;
  status: "pending" | "completed";
  sentAt: string;
  completedAt: string | null;
  requiresSignature: boolean;
  clientSignature: string | null;
  libraryFormId: string | null;
}

// ── Library forms (saved to provider's form library, not yet sent) ───────────

export interface LibraryForm {
  id: string;
  providerId: string;
  title: string;
  questions: IntakeFormQuestion[];
  serviceNames: string[]; // provider's service names this form covers
  autoSend: boolean; // auto-send when matching service is booked
  requiresSignature: boolean;
  /** This form IS the provider's own Terms & Conditions — the one clients can
   *  read from the booking sheet before booking. At most one per provider
   *  (enforced by a partial unique index, not just here). */
  isTerms: boolean;
  sentCount: number;
  createdAt: string;
}

export async function getProviderFormLibrary(): Promise<LibraryForm[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];
  // Throws rather than swallowing: an empty array means "no saved forms", so
  // returning one on a failed query made the two indistinguishable. Becca's
  // pv.infopacks reads this and would tell a provider "you haven't set up any
  // forms yet" when the query had actually errored.
  const { data, error } = await supabase
    .from("provider_form_library")
    .select("*")
    .eq("provider_id", provider.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapLibraryForm);
}

/** Narrow readiness check used by the provider profile preview. */
export async function hasMyProviderTermsForm(): Promise<boolean> {
  const provider = await getMyProviderProfile();
  if (!provider) return false;
  const { data, error } = await supabase
    .from("provider_form_library")
    .select("id")
    .eq("provider_id", provider.id)
    .eq("is_terms", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** A provider's own Terms & Conditions, as a client sees them before booking.
 *
 *  Goes through the get_provider_terms RPC rather than reading
 *  provider_form_library directly: that table is owner-only by design (it also
 *  holds medical-history and patch-test forms), so the RPC is the one narrow
 *  window onto it — terms text only, and only for a live provider. Returns
 *  null when this provider hasn't written any, which is the normal case.
 *
 *  Requires supabase/migrations/20260820161251_provider_terms_and_conditions.sql
 *  to have been run.
 */
export async function getProviderTerms(
  providerId: string,
): Promise<{ title: string; body: string } | null> {
  const { data, error } = await supabase.rpc("get_provider_terms", {
    p_provider_id: providerId,
  });
  if (error) throw error;
  const row = (data as { title: string; body: string | null }[] | null)?.[0];
  if (!row?.body) return null;
  return { title: row.title, body: row.body };
}

export async function saveFormToLibrary(params: {
  title: string;
  questions: IntakeFormQuestion[];
  serviceNames: string[];
  autoSend: boolean;
  requiresSignature: boolean;
  isTerms?: boolean;
}): Promise<LibraryForm> {
  const provider = await getMyProviderProfile();
  if (!provider) throw new Error("No provider profile");
  const { data, error } = await supabase
    .from("provider_form_library")
    .insert({
      provider_id: provider.id,
      title: params.title,
      questions: params.questions,
      service_names: params.serviceNames,
      auto_send: params.autoSend,
      requires_signature: params.requiresSignature,
      is_terms: params.isTerms ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  return mapLibraryForm(data);
}

export async function updateLibraryForm(
  id: string,
  params: Partial<{
    title: string;
    questions: IntakeFormQuestion[];
    serviceNames: string[];
    autoSend: boolean;
    requiresSignature: boolean;
    isTerms: boolean;
  }>,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (params.title !== undefined) patch["title"] = params.title;
  if (params.questions !== undefined) patch["questions"] = params.questions;
  if (params.serviceNames !== undefined)
    patch["service_names"] = params.serviceNames;
  if (params.autoSend !== undefined) patch["auto_send"] = params.autoSend;
  if (params.requiresSignature !== undefined)
    patch["requires_signature"] = params.requiresSignature;
  if (params.isTerms !== undefined) patch["is_terms"] = params.isTerms;
  patch["updated_at"] = new Date().toISOString();
  const { error } = await supabase
    .from("provider_form_library")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteLibraryForm(id: string): Promise<void> {
  const { error } = await supabase
    .from("provider_form_library")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function sendLibraryFormToClient(
  libraryFormId: string,
  bookingId: string,
  clientUserId: string,
): Promise<IntakeForm> {
  const provider = await getMyProviderProfile();
  if (!provider) throw new Error("No provider profile");

  // Fetch the library form to copy its content
  const { data: lf, error: lfErr } = await supabase
    .from("provider_form_library")
    .select("*")
    .eq("id", libraryFormId)
    .single();
  if (lfErr || !lf) throw new Error("Library form not found");

  // Create the sent instance
  const { data, error } = await supabase
    .from("booking_intake_forms")
    .insert({
      booking_id: bookingId,
      provider_id: provider.id,
      client_user_id: clientUserId,
      title: lf.title,
      questions: lf.questions,
      requires_signature: lf.requires_signature,
      library_form_id: libraryFormId,
    })
    .select()
    .single();
  if (error) throw error;

  // Increment sent_count on the library form
  await supabase
    .from("provider_form_library")
    .update({ sent_count: (lf.sent_count ?? 0) + 1 })
    .eq("id", libraryFormId);

  await notifyClientIntakeFormSent(
    clientUserId,
    bookingId,
    provider.id,
    lf.title,
    provider.display_name,
  );

  return mapIntakeForm(data);
}

/** Tell the client (in-app + push via DB trigger) that a form is waiting for them.
 *  Non-fatal — the form itself is already created when this runs. */
async function notifyClientIntakeFormSent(
  clientUserId: string,
  bookingId: string,
  providerId: string,
  formTitle: string,
  providerName?: string | null,
): Promise<void> {
  try {
    let name = providerName;
    if (!name) {
      const { data } = await supabase
        .from("providers")
        .select("display_name")
        .eq("id", providerId)
        .maybeSingle();
      name = (data as any)?.display_name ?? "Your provider";
    }
    await sendProviderClientNotifications({
      recipientUserIds: [clientUserId],
      type: "intake_form_received",
      title: "Form to Complete",
      message: `${name} sent you "${formTitle}" to fill in before your appointment.`,
      priority: "high",
      isActionable: true,
      bookingId,
    });
  } catch {
    // best-effort only
  }
}

function mapLibraryForm(d: any): LibraryForm {
  return {
    id: d.id,
    providerId: d.provider_id,
    title: d.title,
    questions: d.questions ?? [],
    serviceNames: d.service_names ?? [],
    autoSend: d.auto_send ?? false,
    requiresSignature: d.requires_signature ?? false,
    isTerms: d.is_terms ?? false,
    sentCount: d.sent_count ?? 0,
    createdAt: d.created_at,
  };
}

export async function createIntakeForm(
  bookingId: string,
  providerId: string,
  clientUserId: string,
  title: string,
  questions: IntakeFormQuestion[],
): Promise<IntakeForm> {
  const { data, error } = await supabase
    .from("booking_intake_forms")
    .insert({
      booking_id: bookingId,
      provider_id: providerId,
      client_user_id: clientUserId,
      title,
      questions,
    })
    .select()
    .single();

  if (error) throw error;

  await notifyClientIntakeFormSent(clientUserId, bookingId, providerId, title);

  return mapIntakeForm(data);
}

export async function getIntakeFormByBooking(
  bookingId: string,
): Promise<IntakeForm | null> {
  const { data, error } = await supabase
    .from("booking_intake_forms")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapIntakeForm(data);
}

export async function getIntakeFormById(
  formId: string,
): Promise<IntakeForm | null> {
  const { data, error } = await supabase
    .from("booking_intake_forms")
    .select("*")
    .eq("id", formId)
    .single();

  if (error || !data) return null;
  return mapIntakeForm(data);
}

export async function submitIntakeFormAnswers(
  formId: string,
  answers: Record<string, string>,
  signature?: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    answers,
    status: "completed",
    completed_at: new Date().toISOString(),
  };
  if (signature !== undefined) patch["client_signature"] = signature;
  const { error } = await supabase
    .from("booking_intake_forms")
    .update(patch)
    .eq("id", formId);
  if (error) throw error;
  // DB trigger handle_intake_form_completed() fires on this UPDATE and notifies the provider.
}

export async function getPendingIntakeFormsForMe(): Promise<IntakeForm[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("booking_intake_forms")
    .select("*")
    .eq("client_user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []).map(mapIntakeForm);
}

export async function getMyProviderIntakeForms(): Promise<IntakeForm[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];
  const { data } = await supabase
    .from("booking_intake_forms")
    .select("*")
    .eq("provider_id", provider.id)
    .order("created_at", { ascending: false })
    .limit(15);
  return (data ?? []).map(mapIntakeForm);
}

// ─────────────────────────────────────────────────────────
// BOOKING INFO PACKS (prep/aftercare info attached to bookings —
// see supabase/info_packs_bookings.sql)
// ─────────────────────────────────────────────────────────

export interface BookingInfoPack {
  id: string;
  bookingId: string;
  infoPackId: string;
  providerId: string;
  title: string;
  service: string;
  content: string;
  viewedAt: string | null;
  createdAt: string;
}

function mapBookingInfoPack(d: any): BookingInfoPack {
  return {
    id: d.id,
    bookingId: d.booking_id,
    infoPackId: d.info_pack_id,
    providerId: d.provider_id,
    title: d.title,
    service: d.service ?? "GENERAL",
    content: d.content,
    viewedAt: d.viewed_at ?? null,
    createdAt: d.created_at,
  };
}

/** Info packs the provider attached to one booking (client view) */
export async function getInfoPacksByBooking(
  bookingId: string,
): Promise<BookingInfoPack[]> {
  const { data, error } = await supabase
    .from("booking_info_packs")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map(mapBookingInfoPack);
}

/** Mark an info pack as read — clears it from the booking's attention badge */
export async function markInfoPackViewed(packId: string): Promise<void> {
  await supabase
    .from("booking_info_packs")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", packId);
}

/** Booking ids that need the client's attention (pending intake forms +
 *  unread info packs) → drives the "!" indicator on booking cards. */
export async function getMyBookingActionItems(): Promise<
  Record<string, number>
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const counts: Record<string, number> = {};

  const [{ data: forms }, { data: packs }] = await Promise.all([
    supabase
      .from("booking_intake_forms")
      .select("booking_id")
      .eq("client_user_id", user.id)
      .eq("status", "pending"),
    supabase
      .from("booking_info_packs")
      .select("booking_id")
      .eq("client_user_id", user.id)
      .is("viewed_at", null),
  ]);

  for (const r of [...(forms ?? []), ...(packs ?? [])]) {
    counts[r.booking_id] = (counts[r.booking_id] ?? 0) + 1;
  }
  return counts;
}

// ─────────────────────────────────────────────────────────
// PROMO CODES (client redemption at checkout)
// ─────────────────────────────────────────────────────────

/** Look up a live promotion by promo code for a provider (by display name).
 *  Returns null when the code doesn't exist, is inactive, or is outside its
 *  validity window. */
export async function validatePromoCode(
  providerDisplayName: string,
  code: string,
): Promise<DbPromotion | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("display_name", providerDisplayName)
    .maybeSingle();
  if (!provider) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("promotions")
    .select("*")
    .eq("provider_id", (provider as any).id)
    .ilike("promo_code", trimmed)
    .eq("is_active", true)
    .lte("valid_from", today)
    .gte("valid_until", today)
    .limit(1)
    .maybeSingle();

  return (data as DbPromotion) ?? null;
}

// ─────────────────────────────────────────────────────────
// RESCHEDULE POLICY (client-side enforcement of provider limits)
// ─────────────────────────────────────────────────────────

export interface ProviderReschedulePolicy {
  /** null = unlimited */
  maxReschedules: number | null;
  /** hours of notice required before the appointment; 0 = same day allowed */
  rescheduleNoticeHours: number;
}

/** Parse the provider's booking_policies reschedule settings.
 *  Values come from registration: rescheduleNotice 'same_day'|'24h'|'48h'|'72h',
 *  maxReschedules '1'|'2'|'unlimited'. Missing policy = 1 reschedule, 24h notice
 *  (matches the app's historical defaults). */
function mapReschedulePolicyRow(data: any): ProviderReschedulePolicy {
  const fallback: ProviderReschedulePolicy = {
    maxReschedules: 1,
    rescheduleNoticeHours: 24,
  };
  const bp = (data as any)?.booking_policies as {
    rescheduleNotice?: string;
    maxReschedules?: string;
  } | null;
  if (!bp) return fallback;

  const max =
    bp.maxReschedules === "unlimited"
      ? null
      : parseInt(bp.maxReschedules ?? "1", 10) || 1;
  const noticeMap: Record<string, number> = {
    same_day: 0,
    "24h": 24,
    "48h": 48,
    "72h": 72,
  };
  const notice = noticeMap[bp.rescheduleNotice ?? "24h"] ?? 24;
  return { maxReschedules: max, rescheduleNoticeHours: notice };
}

export async function getProviderReschedulePolicyByDisplayName(
  displayName: string,
): Promise<ProviderReschedulePolicy> {
  const { data } = await supabase
    .from("providers")
    .select("booking_policies")
    .eq("display_name", displayName)
    .maybeSingle();
  return mapReschedulePolicyRow(data);
}

/** Reschedule policy by provider id (stable) — prefer over the display-name variant. */
export async function getProviderReschedulePolicyById(
  providerId: string,
): Promise<ProviderReschedulePolicy> {
  const { data } = await supabase
    .from("providers")
    .select("booking_policies")
    .eq("id", providerId)
    .maybeSingle();
  return mapReschedulePolicyRow(data);
}

/** The provider's full, LIVE booking_policies JSON, by provider id. Used as a
 *  fallback on BookingDetailScreen for bookings made before policy_snapshot
 *  existed (or that never captured one) — a client with no frozen snapshot
 *  still sees a policy, just the current one rather than what was true when
 *  they booked. */
export async function getProviderBookingPoliciesById(
  providerId: string,
): Promise<Record<string, unknown> | null> {
  // Throws rather than swallowing: a null return means "no policy set", and a
  // failed query returning null too made those indistinguishable. Becca's
  // pv.automations reads this to tell a provider their own deposit and
  // cancellation terms, so a swallowed error became "you haven't set any
  // booking policies yet" — a confident false statement about their business.
  const { data, error } = await supabase
    .from("providers")
    .select("booking_policies")
    .eq("id", providerId)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.booking_policies ?? null;
}

export interface ProviderBookingDetailMetadata {
  reschedulePolicy: ProviderReschedulePolicy;
  cancellationNoticeHours: number;
  bookingPolicies: Record<string, unknown> | null;
  addressPolicy: ProviderAddressPolicy | null;
}

/** All provider policy fields needed by BookingDetailScreen in one row read. */
export async function getProviderBookingDetailMetadata(params: {
  providerId?: string;
  displayName: string;
}): Promise<ProviderBookingDetailMetadata> {
  let query = supabase
    .from("providers")
    .select(
      "booking_policies, cancellation_notice_hours, business_type, address_release_policy",
    );
  query = params.providerId
    ? query.eq("id", params.providerId)
    : query.eq("display_name", params.displayName);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return {
    reschedulePolicy: mapReschedulePolicyRow(data),
    cancellationNoticeHours: mapCancellationPolicyRow(data),
    bookingPolicies:
      (data?.booking_policies as Record<string, unknown> | null) ?? null,
    addressPolicy: data
      ? {
          business_type: data.business_type,
          address_release_policy: data.address_release_policy,
        }
      : null,
  };
}

/** No-show grace period (minutes past the booked start time before "No Show"
 *  is available), mirroring provider_update_booking_status()'s server-side
 *  guard exactly (booking_policies->>'noShowGraceMinutes', missing/invalid
 *  = 0 = today's historical instant-eligible behavior). Used client-side
 *  ONLY to keep the "No Show" button's visibility consistent with what the
 *  RPC will actually accept — the RPC itself is the real enforcement. */
export async function getProviderNoShowGraceMinutes(
  providerId: string,
): Promise<number> {
  const { data } = await supabase
    .from("providers")
    .select("booking_policies")
    .eq("id", providerId)
    .maybeSingle();
  const raw = (data as any)?.booking_policies?.noShowGraceMinutes;
  const minutes = typeof raw === "string" ? parseInt(raw, 10) : raw;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

// ─────────────────────────────────────────────────────────
// PROVIDER CONTACT METHODS (for client-side contact sheet)
// ─────────────────────────────────────────────────────────

export interface ProviderContactInfo {
  preferred_contact_methods: string[];
  whatsapp_number: string | null;
  email: string | null;
  phone: string | null;
}

function mapContactRow(data: any): ProviderContactInfo | null {
  if (!data) return null;
  return {
    preferred_contact_methods: (data as any).preferred_contact_methods ?? [
      "in_app",
    ],
    whatsapp_number: (data as any).whatsapp_number ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
  };
}

export async function getProviderContactByDisplayName(
  displayName: string,
): Promise<ProviderContactInfo | null> {
  const { data } = await supabase
    .from("providers")
    .select("preferred_contact_methods, whatsapp_number, email, phone")
    .eq("display_name", displayName)
    .maybeSingle();
  return mapContactRow(data);
}

/** Provider contact info by provider id (stable) — prefer over the display-name variant. */
export async function getProviderContactById(
  providerId: string,
): Promise<ProviderContactInfo | null> {
  const { data } = await supabase
    .from("providers")
    .select("preferred_contact_methods, whatsapp_number, email, phone")
    .eq("id", providerId)
    .maybeSingle();
  return mapContactRow(data);
}

function mapIntakeForm(d: any): IntakeForm {
  return {
    id: d.id,
    bookingId: d.booking_id,
    providerId: d.provider_id,
    clientUserId: d.client_user_id,
    title: d.title,
    questions: d.questions ?? [],
    answers: d.answers ?? null,
    status: d.status,
    sentAt: d.sent_at,
    completedAt: d.completed_at ?? null,
    requiresSignature: d.requires_signature ?? false,
    clientSignature: d.client_signature ?? null,
    libraryFormId: d.library_form_id ?? null,
  };
}

// ─────────────────────────────────────────────────────────
// PROVIDER LOCATIONS — real coordinates from DB
// ─────────────────────────────────────────────────────────

export interface ProviderLocationData {
  address: string;
  coordinates: { latitude: number; longitude: number };
  phone: string;
}

/** Fetch location data for a set of providers by their display names */
export async function getProviderLocationsByDisplayNames(
  displayNames: string[],
): Promise<Record<string, ProviderLocationData>> {
  if (displayNames.length === 0) return {};

  const { data, error } = await supabase
    .from("providers")
    .select("display_name, location_text, latitude, longitude, phone")
    .in("display_name", displayNames);

  if (error || !data) return {};

  const result: Record<string, ProviderLocationData> = {};
  // display_name is NOT unique. Letting the last row win would stamp a booking
  // with the WRONG provider's address and coordinates — a silent, permanent
  // error, since these get snapshotted onto the booking. So an ambiguous name
  // resolves to nothing instead: the booking falls back to the "pending"
  // sentinel, which is recoverable where a wrong address is not. Prefer
  // getProviderLocationsByIds when the caller has provider ids.
  const ambiguous = new Set<string>();
  for (const p of data) {
    if (p.latitude == null || p.longitude == null) continue;
    if (result[p.display_name]) {
      ambiguous.add(p.display_name);
      continue;
    }
    result[p.display_name] = {
      address: p.location_text ?? ADDRESS_PENDING_PLACEHOLDER,
      coordinates: {
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
      },
      phone: p.phone ?? PHONE_PENDING_PLACEHOLDER,
    };
  }
  for (const name of ambiguous) {
    logger.warn(
      `[getProviderLocationsByDisplayNames] "${name}" matches multiple providers with coordinates — omitting rather than risk the wrong address`,
    );
    delete result[name];
  }
  return result;
}

/**
 * Location data keyed by provider id — the unambiguous form. Use this wherever
 * provider ids are available; display names are not unique (see above).
 */
export async function getProviderLocationsByIds(
  providerIds: string[],
): Promise<Record<string, ProviderLocationData>> {
  if (providerIds.length === 0) return {};

  const { data, error } = await supabase
    .from("providers")
    .select("id, location_text, latitude, longitude, phone")
    .in("id", providerIds);

  if (error || !data) return {};

  const result: Record<string, ProviderLocationData> = {};
  for (const p of data) {
    if (p.latitude == null || p.longitude == null) continue;
    result[p.id] = {
      address: p.location_text ?? ADDRESS_PENDING_PLACEHOLDER,
      coordinates: {
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
      },
      phone: p.phone ?? PHONE_PENDING_PLACEHOLDER,
    };
  }
  return result;
}

/**
 * Returns a set of display names that belong to mobile providers.
 *
 * Client-facing (Becca answers "do they travel?" from it), so it carries the
 * same has_gone_live/is_active gate as every other client-facing provider
 * query — it was the one mobile-provider lookup missing it, while the
 * checkout-side getProviderCheckoutMetadata already had it.
 */
export async function getMobileProviderDisplayNames(
  displayNames: string[],
): Promise<Set<string>> {
  if (displayNames.length === 0) return new Set();
  const { data, error } = await supabase
    .from("providers")
    .select("display_name, business_type")
    .eq("has_gone_live", true)
    .eq("is_active", true)
    .in("display_name", [...new Set(displayNames)].slice(0, 50));
  if (error || !data) return new Set();
  return new Set(
    (data as { display_name: string; business_type: string | null }[])
      .filter((p) => p.business_type === "mobile")
      .map((p) => p.display_name),
  );
}

/** Of the given provider ids, which ones require a consultation before a new client's first booking. */
export async function getConsultationRequiredProviderIds(
  providerIds: string[],
): Promise<Set<string>> {
  if (providerIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("providers")
    .select("id, consultation_required_new_clients")
    .in("id", providerIds);
  if (error || !data) return new Set();
  return new Set(
    (
      data as {
        id: string;
        consultation_required_new_clients: boolean | null;
      }[]
    )
      .filter((p) => p.consultation_required_new_clients)
      .map((p) => p.id),
  );
}

/** Of the given provider ids, which ones the current client already has a real (non-cancelled) booking with. */
export async function getProviderIdsWithBookingHistory(
  providerIds: string[],
): Promise<Set<string>> {
  if (providerIds.length === 0) return new Set();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data, error } = await supabase
    .from("bookings")
    .select("provider_id")
    .eq("user_id", user.id)
    .in("provider_id", providerIds)
    .neq("status", "cancelled");
  if (error || !data) return new Set();
  return new Set((data as { provider_id: string }[]).map((b) => b.provider_id));
}

/** Whether the current client has a real (non-cancelled) booking, of any status/date, with this specific provider. */
export async function hasBookingHistoryWithProvider(
  providerId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider_id", providerId)
    .neq("status", "cancelled")
    .limit(1);
  if (error || !data) return false;
  return data.length > 0;
}

/** Of the given service ids, which ones are consultation-type services. */
export async function getConsultationServiceIds(
  serviceIds: string[],
): Promise<Set<string>> {
  if (serviceIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("services")
    .select("id, service_type")
    .in("id", serviceIds);
  if (error || !data) return new Set();
  return new Set(
    (data as { id: string; service_type: string | null }[])
      .filter((s) => s.service_type === "consultation")
      .map((s) => s.id),
  );
}

export interface ProviderConsultationService {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  description: string;
  categoryName: string;
  imageUrl: string | null;
}

/** The provider's bookable consultation service, if they have one — used by
 *  Becca's "do I need a consultation first" answer to point at a real
 *  bookable service instead of guessing. */
export async function getProviderConsultationService(
  providerId: string,
): Promise<ProviderConsultationService | null> {
  const { data, error } = await supabase
    .from("services")
    .select(
      "id, name, price, duration_minutes, description, category_name, service_images ( url, sort_order )",
    )
    .eq("provider_id", providerId)
    .eq("service_type", "consultation")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const images = ((data as any).service_images ?? []) as {
    url: string;
    sort_order: number;
  }[];
  const firstImage = images.sort((a, b) => a.sort_order - b.sort_order)[0];
  return {
    id: data.id,
    name: data.name,
    price: Number(data.price),
    durationMinutes: data.duration_minutes,
    description: data.description ?? "",
    categoryName: data.category_name,
    imageUrl: firstImage?.url ?? null,
  };
}

// ─────────────────────────────────────────────────────────
// ADDRESS RELEASE POLICY
// ─────────────────────────────────────────────────────────

export interface ProviderAddressPolicy {
  business_type: BusinessType | null;
  address_release_policy: AddressReleasePolicy | null;
}

/**
 * The calling provider's own private street address.
 * RLS on provider_private_details scopes this to the owner — it cannot return
 * anyone else's, regardless of what id is passed anywhere else in the app.
 */
export async function getMyProviderFullAddress(): Promise<string | null> {
  const provider = await getMyProviderProfile();
  if (!provider) return null;
  const { data } = await supabase
    .from("provider_private_details")
    .select("full_address")
    .eq("provider_id", provider.id)
    .maybeSingle();
  return (
    (data as { full_address?: string | null } | null)?.full_address ?? null
  );
}

/**
 * Whether the calling provider's own private address satisfies the *same*
 * condition the server enforces before it will flip `has_gone_live` — see
 * check_and_set_provider_live(), which requires a non-blank `full_address`
 * AND real geocoded `latitude`/`longitude`.
 *
 * The go-live checklist must test exactly this, not just the address string:
 * an address saved without coordinates let the checklist tick its last box
 * and disappear while the database still refused to publish the provider,
 * leaving them with nothing on screen explaining why they weren't live.
 */
export async function hasMyProviderGoLiveAddress(
  knownProviderId?: string,
): Promise<boolean> {
  // Callers that already hold the provider row pass its id straight through —
  // re-resolving it here would mean a second auth lookup plus a second
  // providers read for a caller that fetched both a moment ago.
  let providerId = knownProviderId;
  if (!providerId) {
    const provider = await getMyProviderProfile();
    if (!provider) return false;
    providerId = provider.id;
  }
  const { data, error } = await supabase
    .from("provider_private_details")
    .select("full_address, latitude, longitude")
    .eq("provider_id", providerId)
    .maybeSingle();
  if (error) throw error;
  const row = data as {
    full_address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  return (
    !!row &&
    (row.full_address ?? "").trim() !== "" &&
    row.latitude != null &&
    row.longitude != null
  );
}

/**
 * Save the calling provider's own private street address, plus the real
 * coordinates it geocoded to (see providerRegistrationService.ts's
 * geocodeAndValidateUkAddress) — used by stamp_booking_address_snapshot() to
 * stamp a released booking's map pin with the real location instead of the
 * approximate location_text geocode. Pass null coordinates only for an
 * address being cleared, never for one that's being set.
 */
export async function setMyProviderFullAddress(
  providerId: string,
  fullAddress: string | null,
  latitude: number | null = null,
  longitude: number | null = null,
): Promise<void> {
  const { error } = await supabase.from("provider_private_details").upsert(
    {
      provider_id: providerId,
      full_address: fullAddress,
      latitude,
      longitude,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_id" },
  );
  if (error) throw error;
}

/** Client-safe: release policy by provider id (stable), no address leaked. */
export async function getProviderAddressPolicy(
  providerId: string,
): Promise<ProviderAddressPolicy | null> {
  const { data } = await supabase
    .from("providers")
    .select("business_type, address_release_policy")
    .eq("id", providerId)
    .maybeSingle();
  return data ? (data as ProviderAddressPolicy) : null;
}

/** Client-safe fallback: release policy by display name, no address leaked. */
export async function getProviderAddressPolicyByDisplayName(
  displayName: string,
): Promise<ProviderAddressPolicy | null> {
  const { data } = await supabase
    .from("providers")
    .select("business_type, address_release_policy")
    .eq("display_name", displayName)
    .maybeSingle();
  return data ? (data as ProviderAddressPolicy) : null;
}

export interface ClientBookingSummary {
  id: string;
  service_name_snapshot: string;
  booking_date: string;
  booking_time: string;
  client_address: string | null;
}

/** Client's upcoming/pending bookings with a given (mobile) provider — used to pick which booking an address applies to when sending it via chat. */
export async function getClientBookingsForAddressShare(
  providerId: string,
): Promise<ClientBookingSummary[]> {
  // The address lives in booking_client_addresses since 20260827161000 --
  // bookings.client_address is a write-only funnel and is always NULL at rest,
  // so selecting it here would hand every caller an empty field. The client
  // owns their own address row outright (policy bca_client_all), so this embed
  // resolves for the person picking which booking to send it to.
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, service_name_snapshot, booking_date, booking_time, booking_client_addresses ( address )",
    )
    .eq("provider_id", providerId)
    .in("status", ["pending", "upcoming"])
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true });
  if (error) return [];
  // booking_id is that table's PRIMARY KEY so PostgREST returns one object,
  // but a to-one embed is indistinguishable from to-many by the foreign key
  // alone -- handle both rather than guess, exactly as bookingService does.
  return (data ?? []).map((row): ClientBookingSummary => {
    const embed: unknown = row.booking_client_addresses;
    const first = Array.isArray(embed) ? (embed[0] as unknown) : embed;
    const address =
      typeof (first as { address?: unknown } | null)?.address === "string"
        ? ((first as { address: string }).address)
        : null;
    return {
      id: row.id,
      service_name_snapshot: row.service_name_snapshot,
      booking_date: row.booking_date,
      booking_time: row.booking_time,
      client_address: address,
    };
  });
}

/**
 * The address this client last gave for a mobile booking, so the checkout
 * "Confirm Your Details" step can prefill it instead of making them retype
 * their home address on every order.
 *
 * Reads the gated `client_bookings` view, not the base table — clients have no
 * direct SELECT on `bookings` (see getMyBookings). Best-effort by nature: a
 * client with no prior mobile booking simply gets an empty field.
 */
export async function getMyLastClientAddress(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("client_bookings")
    .select("client_address")
    .eq("user_id", user.id)
    .not("client_address", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.client_address as string | undefined) ?? null;
}

/** Save the address a client sends their mobile provider, for a specific booking.
 *  Routed through a SECURITY DEFINER RPC — see fix_bookings_client_update_bypass.sql.
 *  The general "clients can update their own booking row" policy was dropped, so a
 *  raw .update() here would now fail RLS. */
export async function setBookingClientAddress(
  bookingId: string,
  address: string,
): Promise<void> {
  const { error } = await supabase.rpc("set_booking_client_address", {
    p_booking_id: bookingId,
    p_address: address,
  });
  if (error) throw error;
}

/**
 * Manually release the full address for a specific booking to the client.
 * Sends exactly ONE "Address Now Available" notification — the RPC sends it
 * server-side via notify_address_released(), so every release path
 * (on_confirmation trigger, time-based cron, manual) shares one notification
 * implementation — see consolidate_address_release_notification*.sql.
 */
export async function releaseBookingAddress(bookingId: string): Promise<void> {
  // Routed through a SECURITY DEFINER RPC that can only touch
  // address_released_at — see fix_bookings_provider_update_bypass.sql and
  // consolidate_address_release_notification_manual.sql.
  const { error } = await supabase.rpc("provider_release_booking_address", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

/** Fetch the address_released_at timestamp for a booking. */
export async function getBookingAddressReleasedAt(
  bookingId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("bookings")
    .select("address_released_at")
    .eq("id", bookingId)
    .single();
  return (
    (data as { address_released_at: string | null } | null)
      ?.address_released_at ?? null
  );
}

// ─────────────────────────────────────────────────────────
// USER INTERACTIONS — analytics / personalization
// ─────────────────────────────────────────────────────────

/** Record a user interaction for the personalization algorithm */
export async function trackUserInteraction(interaction: {
  type: "view" | "search" | "favorite" | "book" | "offer_view";
  providerId?: string;
  serviceCategory?: string;
  durationSeconds?: number;
}): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("user_interactions").insert({
      user_id: user.id,
      type: interaction.type,
      provider_id: interaction.providerId ?? null,
      service_category: interaction.serviceCategory ?? null,
      duration_seconds: interaction.durationSeconds ?? null,
    });
  } catch {
    // Silent — analytics must never block the UI
  }
}

// ─────────────────────────────────────────────────────────
// PROVIDER FOLLOWS
// ─────────────────────────────────────────────────────────

/** Follow a provider */
export async function followProvider(providerId: string): Promise<void> {
  if (!UUID_RE.test(providerId)) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("provider_follows")
    .insert({ user_id: user.id, provider_id: providerId });
  if (error && error.code !== "23505") throw error;
}

/** Unfollow a provider */
export async function unfollowProvider(providerId: string): Promise<void> {
  if (!UUID_RE.test(providerId)) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("provider_follows")
    .delete()
    .eq("user_id", user.id)
    .eq("provider_id", providerId);
  if (error) throw error;
}

/** Check if the current user follows a provider */
export async function checkIsFollowing(providerId: string): Promise<boolean> {
  if (!UUID_RE.test(providerId)) return false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("provider_follows")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider_id", providerId)
    .maybeSingle();
  return !!data;
}

/**
 * Whether the current user has the "notify me" bell on for this provider —
 * distinct from checkIsFollowing: a client can follow without notifications
 * on. False (not just "not following") when there's no row at all, so
 * ProviderProfileScreen's bell can seed its initial state from one query
 * instead of two.
 */
export async function checkFollowNotifyEnabled(
  providerId: string,
): Promise<boolean> {
  if (!UUID_RE.test(providerId)) return false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("provider_follows")
    .select("notify_enabled")
    .eq("user_id", user.id)
    .eq("provider_id", providerId)
    .maybeSingle();
  return (data as { notify_enabled: boolean } | null)?.notify_enabled ?? false;
}

/**
 * Turns the "notify me about this provider's availability" bell on/off.
 * Turning on implicitly follows (upsert) if the client wasn't already —
 * the bell is a single tap, not a two-step follow-then-enable flow.
 * Turning off leaves the follow row in place (only clears the flag) so a
 * client who was following before tapping the bell doesn't get silently
 * unfollowed by turning notifications back off.
 */
export async function setProviderFollowNotify(
  providerId: string,
  enabled: boolean,
): Promise<void> {
  if (!UUID_RE.test(providerId)) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("provider_follows")
    .upsert(
      { user_id: user.id, provider_id: providerId, notify_enabled: enabled },
      { onConflict: "user_id,provider_id" },
    );
  if (error) throw error;
}

/** Get the total follower count for a specific provider (used on provider side) */
export async function getProviderFollowerCount(
  providerId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("provider_follows")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId);
  if (error) throw error;
  return count ?? 0;
}

/** Get the follower count for the currently logged-in provider */
export async function getMyFollowerCount(): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data: providerRow } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!providerRow) return 0;
  return getProviderFollowerCount(providerRow.id);
}

// ─────────────────────────────────────────────────────────
// SAVED PORTFOLIO ITEMS
// ─────────────────────────────────────────────────────────

/** Load the user's saved portfolio item IDs from Supabase */
export async function getSavedPortfolioIds(): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("users")
    .select("saved_portfolio")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return (data?.saved_portfolio as string[]) ?? [];
}

/** Save a portfolio item ID to the user's saved list */
export async function savePortfolioItemToDb(itemId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // Append the item ID to the JSONB array if not already present
  const { error } = await supabase.rpc("append_saved_portfolio_item", {
    p_user_id: user.id,
    p_item_id: itemId,
  });
  if (error) throw error;
}

/** Remove a portfolio item ID from the user's saved list */
export async function unsavePortfolioItemFromDb(itemId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.rpc("remove_saved_portfolio_item", {
    p_user_id: user.id,
    p_item_id: itemId,
  });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// NOTIFICATION PREFERENCES
// ─────────────────────────────────────────────────────────

export interface NotificationPreferences {
  bookingConfirm: boolean;
  bookingReminder: boolean;
  bookingUpdates: boolean;
  promotions: boolean;
  newProviders: boolean;
  weeklySummary: boolean;
}

const DEFAULT_NOTIF_PREFS: NotificationPreferences = {
  bookingConfirm: true,
  bookingReminder: true,
  bookingUpdates: true,
  promotions: false,
  newProviders: true,
  weeklySummary: false,
};

/** Load the user's notification preferences from Supabase */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_NOTIF_PREFS;
  const { data, error } = await supabase
    .from("users")
    .select("notification_preferences")
    .eq("id", user.id)
    .single();
  if (error) return DEFAULT_NOTIF_PREFS;
  return { ...DEFAULT_NOTIF_PREFS, ...(data?.notification_preferences ?? {}) };
}

/** Persist the user's notification preferences to Supabase */
export async function saveNotificationPreferences(
  prefs: NotificationPreferences,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("users")
    .update({ notification_preferences: prefs })
    .eq("id", user.id);
  if (error) throw error;
}

/** Count how many users have bookmarked the currently logged-in provider */
export async function getMyBookmarkCount(): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data: providerRow } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!providerRow) return 0;
  const { count, error } = await supabase
    .from("bookmarks")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerRow.id);
  if (error) throw error;
  return count ?? 0;
}

/** Update the maximum number of confirmed bookings a provider accepts per day (0 = unlimited) */
export async function updateProviderMaxBookingsPerDay(
  providerId: string,
  maxPerDay: number,
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update({ max_bookings_per_day: maxPerDay })
    .eq("id", providerId);
  if (error) throw error;
}

/**
 * Fetch a provider's auto-accept flag and daily booking cap.
 * Returns defaults (false, 0) on any error so callers can treat it as safe.
 */
export async function getProviderBookingCapSettings(
  providerId: string,
): Promise<{ auto_accept: boolean; max_per_day: number }> {
  const { data, error } = await supabase
    .from("providers")
    .select("auto_accept_bookings, max_bookings_per_day")
    .eq("id", providerId)
    .single();
  if (error || !data) return { auto_accept: false, max_per_day: 0 };
  return {
    auto_accept: (data as any).auto_accept_bookings ?? false,
    max_per_day: (data as any).max_bookings_per_day ?? 0,
  };
}

/**
 * Batched form of getProviderBookingCapSettings, keyed by provider id.
 * Providers not returned (deleted/RLS) are omitted — callers should fall
 * back to the same {auto_accept: false, max_per_day: 0} default.
 */
export async function getProviderBookingCapSettingsForProviders(
  providerIds: string[],
): Promise<Record<string, { auto_accept: boolean; max_per_day: number }>> {
  if (providerIds.length === 0) return {};

  const { data, error } = await supabase
    .from("providers")
    .select("id, auto_accept_bookings, max_bookings_per_day")
    .in("id", providerIds);

  if (error || !data) return {};

  const result: Record<string, { auto_accept: boolean; max_per_day: number }> =
    {};
  for (const p of data as any[]) {
    result[p.id] = {
      auto_accept: p.auto_accept_bookings ?? false,
      max_per_day: p.max_bookings_per_day ?? 0,
    };
  }
  return result;
}

/**
 * Count non-cancelled, non-no_show bookings for a provider on a given date.
 * Used to enforce max_bookings_per_day.
 */
export async function countProviderBookingsOnDate(
  providerId: string,
  date: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId)
    .eq("booking_date", date)
    .not("status", "in", '("cancelled","no_show")');
  if (error) throw error;
  return count ?? 0;
}

/**
 * Batched form of countProviderBookingsOnDate for multiple (providerId, date)
 * pairs at once — one query per unique date rather than one per cart item,
 * since Supabase can't OR-combine per-pair filters in a single round trip.
 * Keyed by `${providerId}|${date}`.
 */
export async function countProviderBookingsOnDates(
  pairs: { providerId: string; date: string }[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (pairs.length === 0) return result;

  const uniqueDates = [...new Set(pairs.map((p) => p.date))];
  const uniqueProviderIds = [...new Set(pairs.map((p) => p.providerId))];

  const { data, error } = await supabase
    .from("bookings")
    .select("provider_id, booking_date")
    .in("provider_id", uniqueProviderIds)
    .in("booking_date", uniqueDates)
    .not("status", "in", '("cancelled","no_show")');
  if (error) throw error;

  for (const row of (data ?? []) as {
    provider_id: string;
    booking_date: string;
  }[]) {
    const key = `${row.provider_id}|${row.booking_date}`;
    result[key] = (result[key] ?? 0) + 1;
  }
  // Ensure every requested pair has a key, even with zero matches.
  for (const { providerId, date } of pairs) {
    const key = `${providerId}|${date}`;
    if (!(key in result)) result[key] = 0;
  }
  return result;
}

// ─────────────────────────────────────────────────────────
// DEPOSIT POLICIES
// ─────────────────────────────────────────────────────────

export interface ProviderDepositPolicy {
  depositType: "percentage" | "fixed";
  depositAmount: number;
  depositAvailable: boolean;
  /** Provider requires the deposit — client has no "pay in full" choice.
   *  Only meaningful when depositAvailable is true. */
  depositOnly: boolean;
}

type ProviderCheckoutMetadata = {
  depositPolicies: Record<string, ProviderDepositPolicy>;
  mobileProviderNames: Set<string>;
};

/** Cart-facing provider metadata in one query rather than one request per concern. */
export async function getProviderCheckoutMetadata(
  displayNames: string[],
): Promise<ProviderCheckoutMetadata> {
  if (displayNames.length === 0) {
    return { depositPolicies: {}, mobileProviderNames: new Set() };
  }

  const { data, error } = await supabase
    .from("providers")
    .select("display_name, booking_policies, business_type")
    .eq("has_gone_live", true)
    .eq("is_active", true)
    .in("display_name", [...new Set(displayNames)].slice(0, 50));
  if (error) throw error;

  const depositPolicies: Record<string, ProviderDepositPolicy> = {};
  const mobileProviderNames = new Set<string>();
  for (const provider of data ?? []) {
    if (provider.business_type === "mobile") {
      mobileProviderNames.add(provider.display_name);
    }
    const policies = provider.booking_policies as {
      depositMode?: string;
      depositRequired?: boolean;
      depositOnly?: boolean;
      depositType?: string;
      depositAmount?: string;
    } | null;
    const mode = resolveDepositMode(policies);
    if (mode === "full_only") {
      depositPolicies[provider.display_name] = {
        depositType: "percentage",
        depositAmount: 0,
        depositAvailable: false,
        depositOnly: false,
      };
    } else if (mode && policies?.depositAmount) {
      const amount = Number(policies.depositAmount);
      depositPolicies[provider.display_name] = {
        depositType: policies.depositType === "fixed" ? "fixed" : "percentage",
        depositAmount: amount > 0 ? amount : 20,
        depositAvailable: true,
        depositOnly: mode === "deposit_required",
      };
    } else {
      depositPolicies[provider.display_name] = {
        depositType: "percentage",
        depositAmount: 20,
        depositAvailable: true,
        depositOnly: false,
      };
    }
  }
  return { depositPolicies, mobileProviderNames };
}

/** Fetch deposit policies for multiple providers by display name (batch). Falls back to 20% default if no policy set. */
export async function getProviderDepositPoliciesByDisplayNames(
  displayNames: string[],
): Promise<Record<string, ProviderDepositPolicy>> {
  if (displayNames.length === 0) return {};

  const { data, error } = await supabase
    .from("providers")
    .select("display_name, booking_policies")
    .in("display_name", displayNames);

  if (error || !data) return {};

  const defaultPolicy: ProviderDepositPolicy = {
    depositType: "percentage",
    depositAmount: 20,
    depositAvailable: true,
    depositOnly: false,
  };
  const result: Record<string, ProviderDepositPolicy> = {};

  for (const p of data) {
    const policies = p.booking_policies as {
      depositMode?: string;
      depositRequired?: boolean;
      depositOnly?: boolean;
      depositType?: string;
      depositAmount?: string;
      depositNote?: string;
    } | null;

    // Shared with PaymentsScreen so the provider editor and the client
    // booking sheet can never disagree about what a stored blob means.
    const mode = resolveDepositMode(policies);

    // Provider explicitly turned deposits OFF → client pays in full, no
    // deposit option in the cart. (Previously this switch was ignored and
    // any leftover amount kept the deposit option alive.)
    if (mode === "full_only") {
      result[p.display_name] = {
        depositType: "percentage",
        depositAmount: 0,
        depositAvailable: false,
        depositOnly: false,
      };
    } else if (mode && policies?.depositAmount) {
      const depositType: "percentage" | "fixed" =
        policies.depositType === "fixed" ? "fixed" : "percentage";
      const depositAmount = Number(policies.depositAmount);
      result[p.display_name] = {
        depositType,
        depositAmount: depositAmount > 0 ? depositAmount : 20,
        depositAvailable: true,
        // 'client_choice' is the state the booking sheet could always render
        // but no provider control could ever produce: both buttons, shown
        // side by side, because the provider chose to offer both.
        depositOnly: mode === "deposit_required",
      };
    } else {
      // No deposit policy saved at all. Left as the historical 20%-both-options
      // default rather than silently switching live profiles to full-only —
      // note that 20% is a figure the provider never set, so a provider who
      // has never opened Payments is quoting a deposit they didn't choose.
      result[p.display_name] = { ...defaultPolicy };
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────
// SCHEDULING CONSTRAINTS
// ─────────────────────────────────────────────────────────

/**
 * Fetch the scheduling constraints configured by a provider.
 * Returns sensible defaults when the provider is not found.
 */
export async function getProviderSchedulingConstraints(
  providerIdOrDisplayName: string,
): Promise<{
  bookingWindowDays: number;
  minBookingNoticeHrs: number;
}> {
  // Prefer the real UUID when the caller has one — exact display_name
  // matching is fragile (case, punctuation, a provider renaming their
  // business) and silently returns nothing, which looks identical to a
  // provider with no constraints set instead of a failed lookup.
  const query = supabase
    .from("providers")
    .select("booking_window_days, min_booking_notice_hrs");
  const { data } = UUID_RE.test(providerIdOrDisplayName)
    ? await query.eq("id", providerIdOrDisplayName).maybeSingle()
    : await query.eq("display_name", providerIdOrDisplayName).maybeSingle();
  return {
    bookingWindowDays: (data as any)?.booking_window_days ?? 60,
    minBookingNoticeHrs: (data as any)?.min_booking_notice_hrs ?? 0,
  };
}

// ─────────────────────────────────────────────────────────
// USERS — profile reads
// ─────────────────────────────────────────────────────────

/** Fetch the full users row by ID. Returns null on PGRST116 (row missing); throws on other errors. */
export async function getUserProfileById(
  userId: string,
): Promise<DbUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as DbUser;
}

/** Fetch name, phone, and dob for a user — for the account-info edit screen */
export async function getUserBasicInfo(userId: string): Promise<{
  name: string | null;
  phone: string | null;
  dob: string | null;
} | null> {
  const { data, error } = await supabase
    .from("users")
    .select("name, phone, dob")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data as {
    name: string | null;
    phone: string | null;
    dob: string | null;
  };
}

/** Fetch business_name and business_email for a user */
export async function getUserBusinessInfo(userId: string): Promise<{
  business_name: string | null;
  business_email: string | null;
} | null> {
  const { data, error } = await supabase
    .from("users")
    .select("business_name, business_email")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data as {
    business_name: string | null;
    business_email: string | null;
  };
}

/**
 * Fetch the signup-time contact fields that a first-time provider profile
 * save should prefill instead of asking for again (InfoRegScreen.tsx) — name,
 * business name/email/phone, instagram, website. These were already
 * collected and saved to `users` during the 5-step signup flow
 * (EmailVerificationScreen.tsx), but the providers row doesn't exist until
 * InfoRegScreen's first save, so without this the form starts blank and the
 * provider ends up retyping data they already gave.
 */
export async function getUserSignupPrefillInfo(userId: string): Promise<{
  name: string | null;
  phone: string | null;
  business_name: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_type: string | null;
  instagram: string | null;
  website: string | null;
  service_interests: string[] | null;
  service_locations: string[] | null;
  team_size: string | null;
  accessibility_notes: string | null;
  languages_spoken: string[] | null;
  specialties: string[] | null;
  price_range: string | null;
  preferred_contact_methods: string[] | null;
  preferred_payment_methods: string[] | null;
} | null> {
  const { data, error } = await supabase
    .from("users")
    .select(
      "name, phone, business_name, business_email, business_phone, business_type, instagram, website, " +
        "service_interests, service_locations, team_size, accessibility_notes, languages_spoken, specialties, " +
        "price_range, preferred_contact_methods, preferred_payment_methods",
    )
    .eq("id", userId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as unknown as {
    name: string | null;
    phone: string | null;
    business_name: string | null;
    business_email: string | null;
    business_phone: string | null;
    business_type: string | null;
    instagram: string | null;
    website: string | null;
    service_interests: string[] | null;
    service_locations: string[] | null;
    team_size: string | null;
    accessibility_notes: string | null;
    languages_spoken: string[] | null;
    specialties: string[] | null;
    price_range: string | null;
    preferred_contact_methods: string[] | null;
    preferred_payment_methods: string[] | null;
  };
}

/** Fetch the name field from the users table (distinct from providers.display_name) */
export async function getUserDisplayName(
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  return (data as { name: string | null } | null)?.name ?? null;
}

// ─────────────────────────────────────────────────────────
// USERS — profile writes
// ─────────────────────────────────────────────────────────

/** Upgrade a user account to provider role, writing business info alongside */
export async function upgradeUserToProvider(
  userId: string,
  businessName: string,
  businessEmail: string,
  extras?: {
    businessPhone?: string;
    instagram?: string;
    tiktok?: string;
    website?: string;
    businessType?: string;
    dobDay?: string;
    dobMonth?: string;
    dobYear?: string;
    serviceInterests?: string[];
    serviceLocations?: string[];
    priceRange?: string;
    teamSize?: string;
    preferredContactMethods?: string[];
    accessibilityNotes?: string;
    languagesSpoken?: string[];
    specialties?: string[];
    preferredPaymentMethods?: string[];
    referralSource?: string;
  },
): Promise<void> {
  const dob =
    extras?.dobDay && extras?.dobMonth && extras?.dobYear
      ? `${extras.dobYear}-${extras.dobMonth.padStart(2, "0")}-${extras.dobDay.padStart(2, "0")}`
      : null;
  const { error } = await supabase
    .from("users")
    .update({
      role: "provider",
      business_name: businessName,
      business_email: businessEmail,
      ...(extras?.businessPhone
        ? { business_phone: extras.businessPhone }
        : {}),
      ...(extras?.instagram ? { instagram: extras.instagram } : {}),
      ...(extras?.tiktok ? { tiktok: extras.tiktok } : {}),
      ...(extras?.website ? { website: extras.website } : {}),
      ...(extras?.businessType ? { business_type: extras.businessType } : {}),
      ...(dob ? { dob } : {}),
      ...(extras?.serviceInterests?.length
        ? { service_interests: extras.serviceInterests }
        : {}),
      ...(extras?.serviceLocations?.length
        ? { service_locations: extras.serviceLocations }
        : {}),
      ...(extras?.teamSize ? { team_size: extras.teamSize } : {}),
      ...(extras?.accessibilityNotes
        ? { accessibility_notes: extras.accessibilityNotes }
        : {}),
      ...(extras?.languagesSpoken?.length
        ? { languages_spoken: extras.languagesSpoken }
        : {}),
      ...(extras?.specialties?.length
        ? { specialties: extras.specialties }
        : {}),
      ...(extras?.referralSource
        ? { referral_source: extras.referralSource }
        : {}),
      ...(extras?.priceRange ? { price_range: extras.priceRange } : {}),
      ...(extras?.preferredContactMethods?.length
        ? { preferred_contact_methods: extras.preferredContactMethods }
        : {}),
      ...(extras?.preferredPaymentMethods?.length
        ? { preferred_payment_methods: extras.preferredPaymentMethods }
        : {}),
    })
    .eq("id", userId);
  if (error) throw error;

  // price_range/preferred_contact_methods are staged on `users` above (their
  // permanent home is `providers`.price_tier/preferred_contact_methods, see
  // supabase/provider_signup_business_fields.sql), so InfoRegScreen's own
  // first-save prefill is the primary path for both once a providers row
  // exists. This best-effort write additionally covers the one case that
  // isn't a "brand new, no providers row yet" upgrade: a provider who
  // already has a providers row (e.g. re-running the switch flow, or a
  // dual-hat account) sees these take effect immediately rather than
  // waiting on their next InfoRegScreen save.
  if (
    extras?.priceRange ||
    extras?.preferredContactMethods?.length ||
    extras?.preferredPaymentMethods?.length
  ) {
    const { error: providerRowError } = await supabase
      .from("providers")
      .update({
        ...(extras?.priceRange ? { price_tier: extras.priceRange } : {}),
        ...(extras?.preferredContactMethods?.length
          ? { preferred_contact_methods: extras.preferredContactMethods }
          : {}),
        ...(extras?.preferredPaymentMethods?.length
          ? { preferred_payment_methods: extras.preferredPaymentMethods }
          : {}),
      })
      .eq("user_id", userId);
    if (providerRowError)
      logger.warn(
        "[upgradeUserToProvider] providers-row best-effort write failed:",
        providerRowError.message,
      );
  }

  // Keep auth metadata's `role` in step with users.role. It's only a mirror —
  // users.role stays the source of truth — but AuthContext falls back to
  // metadata when the profile fetch fails, and a stale 'user' there would
  // restore a provider into the client hat. Best-effort: the row write above is
  // what actually matters, so a metadata failure must not fail the upgrade.
  const { error: metaError } = await supabase.auth.updateUser({
    data: { role: "provider" },
  });
  if (metaError)
    logger.warn(
      "[upgradeUserToProvider] auth metadata role sync failed:",
      metaError.message,
    );
}

/** Persist the client beauty/health/preference profile for an account being upgraded to dual-role */
export async function updateClientProfileData(
  userId: string,
  data: {
    dob: string;
    hairType: string;
    skinType: string;
    skinConcerns: string[];
    styleVibe: string;
    allergies: string[];
    treatmentHistory: string[];
    medicalNotes: string;
    photographyConsent: boolean;
    serviceInterests: string[];
    serviceLocations: string[];
    maintenanceFrequency: string;
    referralSource: string;
  },
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({
      dob: data.dob,
      hair_type: data.hairType || null,
      skin_type: data.skinType || null,
      skin_concerns: data.skinConcerns,
      style_vibe: data.styleVibe || null,
      allergies: data.allergies,
      treatment_history: data.treatmentHistory,
      medical_notes: data.medicalNotes || null,
      photography_consent: data.photographyConsent,
      service_interests: data.serviceInterests,
      service_locations: data.serviceLocations,
      maintenance_frequency: data.maintenanceFrequency || null,
      referral_source: data.referralSource || null,
    })
    .eq("id", userId);
  if (error) throw error;
}

/** Update name and phone — called from AuthContext so in-memory user stays fresh */
/**
 * Update the contact details a user can edit about themselves.
 *
 * Only the keys actually passed are written, so a caller that has no notion of
 * a client address (the provider account-info screen) can't blank out one the
 * client saved from checkout.
 */
export async function updateUserContactDetails(
  userId: string,
  details: {
    name?: string;
    phone?: string;
    clientAddress?: string | null;
    clientArea?: string | null;
  },
): Promise<void> {
  const patch: {
    name?: string;
    phone?: string;
    client_address?: string | null;
    client_area?: string | null;
  } = {};
  if (details.name !== undefined) patch.name = details.name;
  if (details.phone !== undefined) patch.phone = details.phone;
  if (details.clientAddress !== undefined)
    patch.client_address = details.clientAddress;
  if (details.clientArea !== undefined) patch.client_area = details.clientArea;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("users").update(patch).eq("id", userId);
  if (error) throw error;
}

/** Update the date-of-birth field for a user */
export async function updateUserDob(
  userId: string,
  dob: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ dob: dob || null })
    .eq("id", userId);
  if (error) throw error;
}

/** Update business_name and business_email on the users row */
export async function updateUserBusinessInfo(
  userId: string,
  businessName: string | null,
  businessEmail: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ business_name: businessName, business_email: businessEmail })
    .eq("id", userId);
  if (error) throw error;
}

/** Sync beauty profile fields to the users table so providers can read them */
export async function upsertUserBeautyProfile(
  userId: string,
  data: {
    hair_type?: string | null;
    skin_type?: string | null;
    skin_tone?: string | null;
    allergies?: string[];
    skin_concerns?: string[];
    sensitive_areas?: string[];
    style_vibe?: string | null;
    medical_notes?: string | null;
    photography_consent?: boolean;
    treatment_history?: string[];
    makeup_coverage?: string | null;
    makeup_finish?: string | null;
    makeup_eyes?: string | null;
    makeup_lips?: string | null;
    nail_length?: string | null;
    nail_shape?: string | null;
    lash_style?: string | null;
    lash_status?: string | null;
    brow_style?: string | null;
    brow_condition?: string | null;
    scalp_condition?: string | null;
    hair_goals?: string[];
    service_interests?: string[];
    gender?: string | null;
    has_kids?: boolean | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .upsert({ id: userId, ...data }, { onConflict: "id" });
  if (error) throw error;
}

export interface UserBeautyProfileRow {
  hair_type: string | null;
  scalp_condition: string | null;
  hair_goals: string[];
  treatment_history: string[];
  skin_type: string | null;
  skin_tone: string | null;
  skin_concerns: string[];
  sensitive_areas: string[];
  nail_length: string | null;
  nail_shape: string | null;
  lash_style: string | null;
  lash_status: string | null;
  brow_style: string | null;
  brow_condition: string | null;
  makeup_coverage: string | null;
  makeup_finish: string | null;
  makeup_eyes: string | null;
  makeup_lips: string | null;
  style_vibe: string | null;
  service_interests: string[];
  gender: string | null;
  has_kids: boolean | null;
  allergies: string[];
  medical_notes: string | null;
  photography_consent: boolean;
}

/** Current client's canonical beauty/health profile with an explicit projection. */
export async function getUserBeautyProfile(
  userId: string,
): Promise<UserBeautyProfileRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select(
      "hair_type, scalp_condition, hair_goals, treatment_history, skin_type, skin_tone, skin_concerns, sensitive_areas, nail_length, nail_shape, lash_style, lash_status, brow_style, brow_condition, makeup_coverage, makeup_finish, makeup_eyes, makeup_lips, style_vibe, service_interests, gender, has_kids, allergies, medical_notes, photography_consent",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as UserBeautyProfileRow | null;
}

/** Upsert the full user profile row immediately after email OTP verification */
export async function upsertUserAfterVerification(data: {
  id: string;
  email: string;
  name: string;
  phone: string;
  dob: string | null;
  role: string;
  login_method: string;
  service_interests: string[];
  business_name: string | null;
  business_email: string | null;
  business_phone: string | null;
  instagram: string | null;
  tiktok: string | null;
  website: string | null;
  hair_type: string | null;
  skin_type: string | null;
  allergies: string[];
  skin_concerns: string[];
  style_vibe: string | null;
  treatment_history: string[];
  medical_notes: string | null;
  photography_consent: boolean;
  service_locations: string[];
  maintenance_frequency: string | null;
  referral_source: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from("users")
    .upsert(data, { onConflict: "id" });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// PROVIDERS — additional reads
// ─────────────────────────────────────────────────────────

/** Fetch the provider's DB id for a given auth user id.
 * No has_gone_live filter — provider reading their own record. */
export async function getProviderIdForUserId(
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

/** Fetch branding fields for the provider owned by the given user (Branding screen).
 * No has_gone_live filter — provider reading their own record. */
export async function getProviderBrandingByUserId(userId: string): Promise<{
  id: string;
  gradient: string[] | null;
  accent_color: string | null;
  background_image_url: string | null;
  profile_theme: string | null;
} | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("id, gradient, accent_color, background_image_url, profile_theme")
    .eq("user_id", userId)
    .single();
  if (error) return null;
  return data as {
    id: string;
    gradient: string[] | null;
    accent_color: string | null;
    background_image_url: string | null;
    profile_theme: string | null;
  };
}

/** Current provider's branding without a screen-level auth round trip. */
export async function getMyProviderBranding(): Promise<
  | (NonNullable<Awaited<ReturnType<typeof getProviderBrandingByUserId>>> & {
      userId: string;
    })
  | null
> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) return null;
  const branding = await getProviderBrandingByUserId(user.id);
  return branding ? { ...branding, userId: user.id } : null;
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
  } = await supabase.auth.getUser();
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

/** Fetch service_category for the provider owned by a given user.
 * No has_gone_live filter — provider reading their own record. */
export async function getProviderServiceCategoryByUserId(
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("providers")
    .select("service_category")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.service_category ?? null;
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

// ─────────────────────────────────────────────────────────
// PROVIDERS — additional writes
// ─────────────────────────────────────────────────────────

/** Persist provider branding choices (gradient, accent colour, background, theme key) */
export async function updateProviderBranding(
  providerId: string,
  data: {
    gradient: string[];
    accent_color: string;
    background_image_url: string | null;
    profile_theme: string;
  },
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update(data)
    .eq("id", providerId);
  if (error) throw error;
}

/** Update provider contact details. Only the fields present in patch are changed. */
export async function updateProviderContactDetails(
  providerId: string,
  patch: {
    /**
     * The provider's public business name. Changeable, but not again for 14
     * days — enforced by the providers_display_name_cooldown trigger (see
     * supabase/migrations/20260820191958_provider_display_name_change_cooldown.sql),
     * NOT by whichever screen happens to be writing. A change inside the
     * window throws with a plain-English message naming the date it reopens;
     * surface that message rather than a generic one.
     */
    display_name?: string;
    email?: string | null;
    whatsapp_number?: string | null;
    preferred_contact_methods?: string[] | null;
    online_consultations_available?: boolean;
    consultation_required_new_clients?: boolean;
    external_booking_url?: string | null;
    instagram?: string | null;
    website?: string | null;
    price_tier?: "budget" | "mid" | "premium" | "luxury" | null;
    accessibility_notes?: string | null;
    languages_spoken?: string[] | null;
    // Mirrors the live CHECK constraint providers_team_size_check
    // ('solo' | 'small_team' | 'large_team'). Clear with null — an empty string
    // violates the constraint and the update throws.
    team_size?: "solo" | "small_team" | "large_team" | null;
    // Canonical lowercase values only ('card' | 'cash' | 'bank_transfer'), for
    // the same reason preferred_contact_methods is lowercase — capitalized
    // variants desynced this table once already. This is a stated preference
    // shown on the profile; it does NOT mean the app collects, tracks or
    // attests to any off-app payment.
    preferred_payment_methods?: string[] | null;
    // ── Practice details ──────────────────────────────────────────────────
    // Promoted out of device-local AsyncStorage ('@provider_extras') by
    // supabase/provider_practice_details_columns.sql. Mirror the live CHECK
    // constraints exactly — clear with null, never '' (an empty string fails
    // the constraint and the update throws, the same trap as team_size above).
    //
    // is_insured_self_declared / dbs_checked_self_declared are provider
    // SELF-ATTESTATIONS. Cerviced does not verify either — never surface them
    // to clients as platform-verified credentials.
    patch_test_policy?:
      | "always"
      | "new_clients"
      | "optional"
      | "not_needed"
      | null;
    qualifications?: string | null;
    is_insured_self_declared?: boolean;
    dbs_checked_self_declared?: boolean;
    travel_radius?: string | null;
    // Cities covered, from src/constants/ukCities.ts — the same list the
    // client Search "City" filter reads, so anything selected here is
    // immediately filterable by clients.
    service_locations?: string[] | null;
    clientele?: string[] | null;
    // Provider-level hair types catered to (HAIR_TYPES vocabulary). Empty/null
    // = caters to all, same semantics as services.hair_types_suitable, so an
    // untouched value is a valid answer rather than an incomplete profile.
    hair_types_catered?: string[] | null;
    availability_windows?: string[] | null;
    accepts_new_clients?: "yes" | "waitlist" | "no" | null;
    walk_ins_welcome?: boolean;
    group_bookings_available?: boolean;
    style_tags?: string[] | null;
    products_used?: string | null;
    vegan_cruelty_free?: boolean;
    // Editable from BusinessInfoScreen, locked in InfoReg post-first-save. Decides whether
    // a private address is required and drives address-release timing below.
    // Write these two together: business_type gates which address_release_policy
    // values are valid, so changing the type alone can leave a stale timing the
    // new type never offers. See reconcileAddressReleasePolicy in
    // src/features/business-details/options.ts.
    business_type?: BusinessType | null;
    address_release_policy?: AddressReleasePolicy | null;
    years_experience?: number | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update(patch)
    .eq("id", providerId);
  if (error) throw error;
}

/** Fetch just the specialty list for a provider (settings screen prefill) */
export async function getProviderSpecialties(
  providerId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("provider_specialties")
    .select("specialty")
    .eq("provider_id", providerId);
  if (error) throw error;
  return (data ?? []).map((row) => row.specialty as string);
}

/**
 * Replace the full specialty set for the calling provider (not a merge).
 * Goes through a SECURITY DEFINER RPC (not a client-side delete+insert) so
 * the swap is one transaction — a plain two-step delete-then-insert would
 * leave a provider with zero specialties if the insert failed after the
 * delete had already committed.
 */
export async function replaceMyProviderSpecialties(
  specialties: string[],
): Promise<void> {
  const { error } = await supabase.rpc("replace_my_provider_specialties", {
    p_specialties: specialties,
  });
  if (error) throw error;
}

export interface ProviderMessageTemplate {
  id: string;
  label: string;
  content: string;
  sort_order: number;
}

/** Provider-only templates: never exposed to clients or included in chats. */
export async function getMyProviderMessageTemplates(): Promise<
  ProviderMessageTemplate[]
> {
  const { data, error } = await supabase
    .from("provider_message_templates")
    .select("id, label, content, sort_order")
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as ProviderMessageTemplate[];
}

/** Replaces the caller's private template set atomically in the database. */
export async function replaceMyProviderMessageTemplates(
  templates: Pick<ProviderMessageTemplate, "label" | "content">[],
): Promise<void> {
  const { error } = await supabase.rpc(
    "replace_my_provider_message_templates",
    {
      p_templates: templates.map((template) => ({
        label: template.label.trim(),
        content: template.content.trim(),
      })),
    },
  );
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// BOOKINGS — additional queries
// ─────────────────────────────────────────────────────────

/** Fetch a single booking with its add-ons by ID — provider booking detail screen */
export async function getBookingWithAddOnsById(
  bookingId: string,
): Promise<BookingWithAddOns | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, add_ons: booking_add_ons(*)")
    .eq("id", bookingId)
    .single();
  if (error) return null;
  return data as BookingWithAddOns;
}

/** Return only the user_id for a booking — avoids fetching the full row when only identity is needed */
export async function getBookingUserId(
  bookingId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("bookings")
    .select("user_id")
    .eq("id", bookingId)
    .single();
  return (data as any)?.user_id ?? null;
}

/** Insert a booking directly without overlap/availability validation.
 *  Used for provider-initiated waitlist invites where the provider has explicitly chosen a slot.
 *
 *  `end_time` is required, not optional. This function used to omit it
 *  entirely, so every waitlist-invite booking landed with a NULL end — which
 *  left the row with no length the DB overlap constraint could measure, no
 *  duration in the app, and an unresolvable block on the provider's day. */
export async function insertDirectBooking(data: {
  user_id: string;
  provider_id: string;
  service_id: string | null;
  status: string;
  booking_date: string;
  booking_time: string;
  end_time: string;
  payment_type: string;
  base_price: number;
  add_ons_total: number;
  service_charge: number;
  deposit_amount: number;
  amount_paid: number;
  remaining_balance: number;
  payment_status: string;
  is_group_booking: boolean;
  group_booking_count: number;
  provider_name_snapshot?: string;
  service_name_snapshot?: string;
}): Promise<void> {
  const { error } = await supabase.from("bookings").insert(data);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// SERVICES — additional queries
// ─────────────────────────────────────────────────────────

export interface RebookableService {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  categoryName: string;
  /**
   * Provider slug and display name. The cart needs BOTH: CartScreen's provider
   * logo opens the profile via providerSlug, and shows an error alert when it is
   * missing — so a rebooked cart item without a slug has an untappable logo.
   */
  providerSlug: string;
  providerDisplayName: string;
  /** Live add-ons for this service, at today's prices. */
  addOns: { id: string; name: string; price: number }[];
}

/**
 * Re-resolve a past booking's service against live data, for "Book Again".
 *
 * Rebooking used to copy the booking's snapshot straight into the cart with a
 * synthetic id (`rebook_<timestamp>`) and the ORIGINAL price — so a client could
 * re-book a deleted service, or at a price the provider had since changed, with
 * no real service_id attached. This returns the current row so the caller can
 * rebook at today's price or explain why it isn't possible.
 *
 * Returns null when the provider is no longer live/active or the service is gone.
 */
/** Resolve real `services.id` UUIDs for a provider's services by name.
 *
 *  Cart items store whatever id the screen that added them happened to have —
 *  usually the real UUID (`service.dbId`), but rebook/legacy paths can carry a
 *  local numeric or synthetic id instead. Writing that to `bookings.service_id`
 *  is impossible (it's a uuid FK), so those bookings used to land with a NULL
 *  service link: no per-service duration/buffer lookup, no waitlist matching,
 *  no per-service reporting. Resolving by name recovers the link instead of
 *  dropping it silently.
 *
 *  One query per provider (`.in()` over the names), never one per cart item. */
export async function getServiceIdsByNames(
  providerId: string,
  serviceNames: string[],
): Promise<Record<string, string>> {
  if (serviceNames.length === 0) return {};
  const { data, error } = await supabase
    .from("services")
    .select("id, name")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .in("name", serviceNames);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) out[row.name as string] = row.id as string;
  return out;
}

export async function getRebookableService(
  providerId: string,
  serviceName: string,
): Promise<RebookableService | null> {
  // has_gone_live + is_active: never let a client re-book into a provider who
  // has taken their profile down (see the client-facing query rule at the top).
  const { data: provider } = await supabase
    .from("providers")
    .select("id, slug, display_name")
    .eq("id", providerId)
    .eq("is_active", true)
    .eq("has_gone_live", true)
    .maybeSingle();
  if (!provider) return null;

  const { data } = await supabase
    .from("services")
    .select(
      "id, name, price, duration_minutes, category_name, service_add_ons ( id, name, price, is_active )",
    )
    .eq("provider_id", providerId)
    .eq("name", serviceName)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    price: Number(data.price),
    durationMinutes: Number(data.duration_minutes),
    categoryName: data.category_name,
    providerSlug: provider.slug,
    providerDisplayName: provider.display_name,
    addOns: ((data as any).service_add_ons ?? [])
      .filter((a: any) => a.is_active)
      .map((a: any) => ({ id: a.id, name: a.name, price: Number(a.price) })),
  };
}

/** Batched safety-flag lookup for checkout — one .in() query for every
 *  service in the cart, not a per-item fetch. Drives the "safety
 *  acknowledgement" gate in CartScreen: services with patch_test_required
 *  or is_pregnancy_safe=false need the client to confirm they've seen that
 *  before prepare_checkout will accept the booking (see
 *  supabase/migrations/20260817085443_safety_acknowledgement_checkout.sql). */
export async function getServiceSafetyFlags(
  serviceIds: string[],
): Promise<
  Map<string, { patchTestRequired: boolean; isPregnancySafe: boolean }>
> {
  const map = new Map<
    string,
    { patchTestRequired: boolean; isPregnancySafe: boolean }
  >();
  if (serviceIds.length === 0) return map;
  const { data, error } = await supabase
    .from("services")
    .select("id, patch_test_required, is_pregnancy_safe")
    .in("id", [...new Set(serviceIds)]);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.id, {
      patchTestRequired: !!row.patch_test_required,
      isPregnancySafe: row.is_pregnancy_safe !== false,
    });
  }
  return map;
}

/** Fetch the price for a single service by ID */
/** Price AND length of a service, together — the two things anyone creating
 *  a booking from a service id needs. Read as one row rather than a price
 *  lookup on its own: a booking written without a duration has no `end_time`,
 *  and a booking with no `end_time` can't be overlap-checked by the DB
 *  constraint, doesn't render a length in the app, and shows up as an
 *  unresolvable block on the provider's day. */
export async function getServiceBookingDefaults(
  serviceId: string,
): Promise<{ price: number; durationMinutes: number }> {
  const { data, error } = await supabase
    .from("services")
    .select("price, duration_minutes")
    .eq("id", serviceId)
    .maybeSingle();
  if (error) throw error;
  const row = data as {
    price?: number | null;
    duration_minutes?: number | null;
  } | null;
  return {
    price: Number(row?.price ?? 0),
    durationMinutes: Number(row?.duration_minutes ?? 0),
  };
}

/** Length in minutes for a set of services, in one query. Used to recover the
 *  real duration of bookings written before `end_time` was populated, without
 *  a per-row lookup. Services that no longer exist are simply absent. */
export async function getServiceDurationsByIds(
  serviceIds: readonly string[],
): Promise<Map<string, number>> {
  const distinct = Array.from(new Set(serviceIds));
  if (distinct.length === 0) return new Map();
  const { data, error } = await supabase
    .from("services")
    .select("id, duration_minutes")
    .in("id", distinct);
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of (data ?? []) as {
    id: string;
    duration_minutes: number | null;
  }[]) {
    if (row.duration_minutes != null)
      map.set(row.id, Number(row.duration_minutes));
  }
  return map;
}

/** Count the number of active services for a provider — drives the setup-status indicator */
export async function countProviderServices(
  providerId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("services")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId);
  if (error) throw error;
  return count ?? 0;
}

// ─────────────────────────────────────────────────────────
// NOTIFICATIONS — delete
// ─────────────────────────────────────────────────────────

/** Permanently delete a notification row (swipe-to-delete in NotificationsScreen).
 *  Routed through delete_own_notification() — notifications has no client-side
 *  DELETE policy, so a plain .delete() silently matches zero rows. */
export async function deleteNotification(
  notificationId: string,
): Promise<void> {
  const { error } = await supabase.rpc("delete_own_notification", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// INFO PACKS (provider-level reference packs, not booking instances)
// ─────────────────────────────────────────────────────────

export interface ProviderInfoPackRow {
  id: string;
  provider_id: string;
  title: string;
  service: string;
  service_names: string[];
  content: string;
  created_at: string;
}

/** Fetch all info packs for a provider (keyed by provider user_id, not provider row id) */
export async function getProviderInfoPacksByUserId(
  providerUserId: string,
): Promise<ProviderInfoPackRow[]> {
  const { data, error } = await supabase
    .from("info_packs")
    .select("*")
    .eq("provider_id", providerUserId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProviderInfoPackRow[];
}

/** Create a new info pack */
export async function createInfoPack(data: {
  provider_id: string;
  title: string;
  service: string;
  service_names: string[];
  content: string;
}): Promise<ProviderInfoPackRow> {
  const { data: row, error } = await supabase
    .from("info_packs")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return row as ProviderInfoPackRow;
}

/** Delete an info pack by id */
export async function deleteInfoPack(id: string): Promise<void> {
  const { error } = await supabase.from("info_packs").delete().eq("id", id);
  if (error) throw error;
}

/** Manually attach an info pack to a specific booking and notify the client. */
export async function attachInfoPackToBooking(
  bookingId: string,
  infoPackId: string,
): Promise<void> {
  const { error } = await supabase.rpc("attach_info_pack_to_booking", {
    p_booking_id: bookingId,
    p_info_pack_id: infoPackId,
  });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// PROVIDER CONVERSATIONS & MESSAGES
// ─────────────────────────────────────────────────────────

export interface DbProviderMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: "user" | "provider";
  content: string;
  created_at: string;
  read_at: string | null;
}

/** Find an existing conversation or create one. Returns the conversation ID. */
export async function getOrCreateConversation(
  providerId: string,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc(
    "get_or_create_provider_conversation",
    {
      p_provider_id: providerId,
      p_user_id: userId,
    },
  );
  if (error || !data) throw error ?? new Error("Could not create conversation");
  return data as string;
}

/** Clear the provider's unread badge for a conversation */
export async function markConversationReadByProvider(
  conversationId: string,
): Promise<void> {
  const { error } = await supabase.rpc("mark_conversation_read_by_provider", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
}

/** Clear the client/user's unread badge for a conversation */
export async function markConversationReadByUser(
  conversationId: string,
): Promise<void> {
  const { error } = await supabase.rpc("mark_conversation_read_by_user", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
}

/** Fetch the most recent bounded message window, returned oldest first. */
export async function getConversationMessages(
  conversationId: string,
  limit = 200,
): Promise<DbProviderMessage[]> {
  const { data, error } = await supabase
    .from("provider_messages")
    .select("id, conversation_id, sender_id, sender_type, content, created_at, read_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(Math.trunc(limit), 1), 200));
  if (error) throw error;
  return ((data ?? []) as DbProviderMessage[]).reverse();
}

/** Realtime inserts for one conversation; caller owns cleanup. */
export function subscribeToConversationMessages(
  conversationId: string,
  onInsert: (message: DbProviderMessage) => void,
): () => void {
  const channel = supabase
    .channel(`conversation-messages-${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "provider_messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onInsert(payload.new as DbProviderMessage),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Insert a new message into a conversation */
export async function sendProviderMessage(params: {
  conversationId: string;
  /** Retained for existing call sites; the database derives the real sender. */
  senderId: string;
  senderType: "provider" | "user";
  content: string;
}): Promise<DbProviderMessage> {
  const { data, error } = await supabase
    .rpc("send_provider_conversation_message", {
      p_conversation_id: params.conversationId,
      p_content: params.content,
    })
    .single();
  if (error) throw error;
  return data as DbProviderMessage;
}

/** Update the inbox preview after a message has been accepted by RLS. The
 * database RPC independently verifies that the caller is the stated sender. */
export async function updateConversationLastMessage(params: {
  conversationId: string;
  message: string;
  senderType: "provider" | "user";
}): Promise<void> {
  // Kept as a compatibility no-op while older screens transition. The send
  // RPC above updates the preview and recipient unread counter atomically.
  void params;
}

/** Send a provider reply and update the conversation's last-message preview
 *  in one call — the same two-step sequence ProviderConversationScreen uses
 *  (insert, then the non-fatal update_conversation_last_message RPC), bundled
 *  here so callers like the inbox quick-reply don't need a raw supabase.rpc()
 *  of their own. */
export async function sendConversationQuickReply(params: {
  conversationId: string;
  senderId: string;
  content: string;
}): Promise<DbProviderMessage> {
  const inserted = await sendProviderMessage({
    conversationId: params.conversationId,
    senderId: params.senderId,
    senderType: "provider",
    content: params.content,
  });
  updateConversationLastMessage({
    conversationId: params.conversationId,
    message: params.content,
    senderType: "provider",
  }).catch(() => {});
  return inserted;
}

// ─────────────────────────────────────────────────────────
// CLAIMABLE PROVIDER PROFILES
//   Search/preview for the pre-signup "claim your business" flow — see
//   providerClaimService.ts and src/screens/auth/ClaimProviderScreen.tsx.
//   Everything else about the claim flow (OTP send, claim_provider_profile
//   RPC) goes through Edge Functions / .rpc(), not this file.
// ─────────────────────────────────────────────────────────

export interface UnclaimedProviderSearchRow {
  id: string;
  display_name: string;
  service_category: string;
  location_text: string | null;
  logo_url: string | null;
  scraped_fields: string[];
}

/**
 * Search unclaimed (is_claimed = false), scraped provider listings by
 * business name or location text.
 *
 * Unclaimed rows (is_claimed = false) are always has_gone_live = false by
 * construction — they've never been onboarded. This intentionally skips
 * the has_gone_live filter used elsewhere, scoped narrowly to pre-signup
 * claim discovery, not general client browse. The real safety gate here is
 * `is_claimed = false`, not RLS — has_gone_live has no RLS backing
 * anywhere in this schema.
 */
export async function searchUnclaimedProviders(
  query: string,
): Promise<UnclaimedProviderSearchRow[]> {
  const safeQuery = sanitizeIlikeTerm(query.trim());
  if (safeQuery.length < 2) return [];
  const { data, error } = await supabase
    .from("providers")
    .select(
      "id, display_name, service_category, location_text, logo_url, scraped_fields",
    )
    .eq("is_claimed", false)
    .or(
      `display_name.ilike.%${safeQuery}%,location_text.ilike.%${safeQuery}%`,
    )
    .limit(20);

  if (error) throw error;
  return data ?? [];
}

export interface UnclaimedProviderDetailRow extends UnclaimedProviderSearchRow {
  about_text: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  website: string | null;
}

/**
 * Fuller row for the claim preview step, once one search result has been
 * picked. Same is_claimed = false gate as searchUnclaimedProviders above —
 * see that function's comment for why has_gone_live isn't checked here.
 */
export async function getUnclaimedProviderDetail(
  id: string,
): Promise<UnclaimedProviderDetailRow | null> {
  const { data, error } = await supabase
    .from("providers")
    .select(
      "id, display_name, service_category, location_text, logo_url, scraped_fields, about_text, phone, email, instagram, website",
    )
    .eq("id", id)
    .eq("is_claimed", false)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────
// BECCA — chat sessions & messages
// ─────────────────────────────────────────────────────────
// Every query here is scoped by `hat`. A user with both hats has two separate
// assistants answering from different data, so their histories are separate
// lists — a provider must never see their client-side chats in their business
// history, and clearing one hat must never touch the other.

export type BeccaChatHat = "client" | "provider";

export interface DbBeccaSession {
  id: string;
  title: string;
  preview: string;
  hat: BeccaChatHat;
  created_at: string;
  updated_at: string;
}

export interface DbBeccaMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  image_uri: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Most recent chat sessions for one user, for one hat only. */
export async function getBeccaSessions(
  userId: string,
  hat: BeccaChatHat,
): Promise<DbBeccaSession[]> {
  const { data, error } = await supabase
    .from("becca_chat_sessions")
    .select("id, title, preview, hat, created_at, updated_at")
    .eq("user_id", userId)
    .eq("hat", hat)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as DbBeccaSession[];
}

/** All messages in one session, oldest first. */
export async function getBeccaMessages(
  sessionId: string,
): Promise<DbBeccaMessage[]> {
  const { data, error } = await supabase
    .from("becca_chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DbBeccaMessage[];
}

/** Create a chat session stamped with the hat that opened it. */
export async function createBeccaSession(
  userId: string,
  title: string,
  preview: string,
  hat: BeccaChatHat,
): Promise<string> {
  const { data, error } = await supabase
    .from("becca_chat_sessions")
    .insert({ user_id: userId, title, preview, hat })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Update a session's title/preview and bump its updated_at. */
export async function updateBeccaSession(
  sessionId: string,
  title: string,
  preview: string,
): Promise<void> {
  const { error } = await supabase
    .from("becca_chat_sessions")
    .update({ title, preview, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}

/** Insert or update a single message. */
export async function upsertBeccaMessage(row: DbBeccaMessage): Promise<void> {
  const { error } = await supabase.from("becca_chat_messages").upsert(row);
  if (error) throw error;
}

/** Delete one session. Messages cascade via becca_chat_messages' FK. */
export async function deleteBeccaSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("becca_chat_sessions")
    .delete()
    .eq("id", sessionId);
  if (error) throw error;
}

/** Delete every session for ONE hat only — never the other hat's history. */
export async function clearBeccaSessions(
  userId: string,
  hat: BeccaChatHat,
): Promise<void> {
  const { error } = await supabase
    .from("becca_chat_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("hat", hat);
  if (error) throw error;
}

/**
 * Write the current user's Expo push token, but only when it actually changed.
 *
 * `registerForPushNotifications` runs on every app foreground (see AuthContext)
 * so the token can self-heal after an APNs-key rotation. Writing unconditionally
 * meant ~3.2k UPDATEs against a handful of rows, all but a few of them no-ops
 * that still cost a row version, a WAL record and autovacuum work. Reading first
 * is cheaper than the write it avoids.
 *
 * Returns true if a write actually happened.
 */
export async function setPushTokenIfChanged(
  userId: string,
  token: string | null,
): Promise<boolean> {
  const { data, error: readError } = await supabase
    .from("users")
    .select("push_token")
    .eq("id", userId)
    .maybeSingle();

  if (readError) throw readError;
  if (data?.push_token === token) return false;

  const { error: writeError } = await supabase
    .from("users")
    .update({ push_token: token })
    .eq("id", userId);

  if (writeError) throw writeError;
  return true;
}

// ── Edge Function and claim adapters ───────────────────────────────────────
// These small, typed adapters keep the shared Supabase client out of feature
// services. Feature services remain responsible for their UX fallback policy.

export async function requestProviderClaimVerification(
  providerId: string,
): Promise<{ maskedEmail: string }> {
  const { data, error } = await supabase.functions.invoke('request-claim-verification', {
    body: { providerId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  if (typeof data?.maskedEmail !== 'string') throw new Error('Invalid verification response.');
  return { maskedEmail: data.maskedEmail };
}

export async function claimUnclaimedProviderProfile(
  providerId: string,
  code: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('claim_provider_profile', {
    p_provider_id: providerId,
    p_claim_token: code,
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Invalid claim response.');
  return data;
}

export type AccountEmailKind = 'client_welcome' | 'provider_welcome';

/**
 * Sends the signed-in user their welcome email. The caller names only WHICH
 * welcome it is — the template, the recipient and the name on it are all
 * resolved server-side, so nothing about our outgoing mail is decided on the
 * device. See supabase/functions/send-account-email/index.ts.
 *
 * There is deliberately no generic "send this html to this address" function
 * any more: that was an open relay on the cerviced.co sending domain.
 */
export async function invokeSendAccountEmail(kind: AccountEmailKind): Promise<void> {
  const { error } = await supabase.functions.invoke('send-account-email', {
    body: { kind },
  });
  if (error) throw error;
}

export interface SupportRequestInput {
  category: string;
  description: string;
  platform: string;
  appVersion: string;
  activeMode: string;
}

export interface SupportRequestResult {
  /** Human-quotable reference, e.g. 1042 — shown to the reporter as "#1042". */
  ticketNumber: number;
  /** False when the report was stored but the support email didn't go out. */
  notified: boolean;
}

/**
 * Files the in-app "Report a Problem" form. The report is stored as a
 * support_requests row server-side and the support inbox is notified of it;
 * the recipient is hardcoded and the reporter's identity, hat and business
 * name are all read server-side, never taken from this payload — see
 * supabase/functions/send-support-request/index.ts.
 *
 * `notified: false` means the row was saved but the email failed. That is a
 * delivery problem, not a lost report, so callers should not present it as a
 * failure to the reporter.
 */
export async function invokeSendSupportRequest(
  input: SupportRequestInput,
): Promise<SupportRequestResult> {
  const { data, error } = await supabase.functions.invoke('send-support-request', {
    body: input,
  });

  if (error) {
    // The function's 4xx bodies are written for people to read ("You've sent a
    // lot of reports in the last hour…"). supabase-js hides the response body
    // behind a generic FunctionsHttpError, so lift it out — but only for 4xx.
    // A 5xx body can carry a raw upstream error, which must not reach a user.
    const res = (error as { context?: Response }).context;
    if (res && res.status >= 400 && res.status < 500) {
      const body = await res.json().catch(() => null) as { error?: unknown } | null;
      if (typeof body?.error === 'string' && body.error) throw new Error(body.error);
    }
    throw error;
  }

  const result = data as { ticketNumber?: unknown; notified?: unknown } | null;
  if (typeof result?.ticketNumber !== 'number') {
    throw new Error('Support request returned no ticket number.');
  }
  return { ticketNumber: result.ticketNumber, notified: result.notified !== false };
}

export interface PostcodeLookupAddressRow {
  address: string;
  id?: string;
  latitude?: number;
  longitude?: number;
}

export async function lookupPostcodeAddresses(postcode: string): Promise<PostcodeLookupAddressRow[]> {
  const { data, error } = await supabase.functions.invoke('find-address-by-postcode', {
    body: { postcode },
  });
  if (error) throw error;
  if (!Array.isArray(data?.addresses)) throw new Error('Invalid address lookup response.');
  return data.addresses as PostcodeLookupAddressRow[];
}

export async function lookupPostcodeAddress(addressId: string): Promise<PostcodeLookupAddressRow> {
  const { data, error } = await supabase.functions.invoke('find-address-by-postcode', {
    body: { addressId },
  });
  if (error) throw error;
  const address = data?.address;
  if (
    !address || typeof address.formatted !== 'string'
    || typeof address.latitude !== 'number' || typeof address.longitude !== 'number'
  ) {
    throw new Error('Invalid address detail response.');
  }
  return {
    address: address.formatted,
    latitude: address.latitude,
    longitude: address.longitude,
  };
}

export async function createCheckoutPaymentIntent(
  checkoutBatchId: string,
  currency: string,
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: { checkoutBatchId, currency },
  });
  if (error) throw error;
  if (typeof data?.clientSecret !== 'string' || typeof data?.paymentIntentId !== 'string') {
    throw new Error('Payment could not be started. Please try again.');
  }
  return { clientSecret: data.clientSecret, paymentIntentId: data.paymentIntentId };
}

export async function finalizeCheckoutPaymentIntent(
  checkoutBatchId: string,
  paymentIntentId: string,
  action: 'capture' | 'cancel',
): Promise<void> {
  const { error } = await supabase.functions.invoke('finalize-payment-intent', {
    body: { checkoutBatchId, paymentIntentId, action },
  });
  if (error) throw error;
}

export async function invokeBeccaAi(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("becca-ai", { body });
  if (error) throw error;
  return data;
}

export async function extractProviderProfileFromUrl(
  url: string,
  sourceType: string,
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("extract-provider-profile", {
    body: { url, sourceType },
  });
  if (error) throw error;
  return data;
}

// ── Provider registration persistence ──────────────────────────────────────

export async function uploadPublicStorageObject(
  bucket: string,
  storagePath: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

export async function removeStorageObjects(bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) throw error;
}

export async function getProviderLogoUrlByUserId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("logo_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.logo_url ?? null;
}

export async function getProviderRegistrationCore(userId: string): Promise<{
  id: string;
  automation_settings: DbProvider["automation_settings"];
} | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("id, automation_settings")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; automation_settings: DbProvider["automation_settings"] } | null;
}

export async function updateProviderRegistrationRow(
  providerId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("providers").update(payload).eq("id", providerId);
  if (error) throw error;
}

export async function providerSlugExists(slug: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("providers")
    .select("id")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function insertProviderRegistrationRow(
  payload: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await supabase
    .from("providers")
    .insert(payload as never)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function promoteUserToProvider(userId: string): Promise<void> {
  const { error } = await supabase.from("users").update({ role: "provider" }).eq("id", userId);
  if (error) throw error;
}

export async function replaceProviderServiceCatalog(
  providerId: string,
  services: Record<string, unknown>[],
): Promise<void> {
  const { error } = await supabase.rpc("replace_provider_services", {
    p_provider_id: providerId,
    p_services: services,
  });
  if (error) throw error;
}

export async function getProviderRegistrationRecord(userId: string): Promise<DbProvider | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProviderRegistrationDetails(providerId: string): Promise<{
  fullAddress: string;
  services: unknown[];
}> {
  const [privateDetails, services] = await Promise.all([
    supabase
      .from("provider_private_details")
      .select("full_address")
      .eq("provider_id", providerId)
      .maybeSingle(),
    supabase
      .from("services")
      .select(`
        id,
        category_name,
        category_description,
        name,
        description,
        price,
        duration_minutes,
        buffer_before_mins,
        buffer_after_mins,
        sort_order,
        tags,
        technique_tags,
        outcome_tags,
        occasion_tags,
        trend_names,
        is_pregnancy_safe,
        patch_test_required,
        min_age,
        contraindications,
        aftercare_notes,
        service_type,
        hair_types_suitable,
        service_images ( url, sort_order ),
        service_add_ons ( name, price )
      `)
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  if (privateDetails.error) throw privateDetails.error;
  if (services.error) throw services.error;
  return {
    fullAddress: privateDetails.data?.full_address ?? "",
    services: services.data ?? [],
  };
}

export async function saveProviderBookingPolicies(
  userId: string,
  policies: Record<string, unknown>,
): Promise<boolean> {
  const { data, error: selectError } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!data) return false;
  const { error } = await supabase
    .from("providers")
    .update({ booking_policies: policies })
    .eq("id", data.id);
  if (error) throw error;
  return true;
}

export async function getProviderBookingPolicies(
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("booking_policies")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.booking_policies as Record<string, unknown> | null) ?? null;
}
